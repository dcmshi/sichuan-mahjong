# Mobile performance: draw step & discard selection

**Status: shipped as N47 (2026-08-19)** — everything below except §4, the PNG
pipeline, which is gated on the re-measure in step 4 of the order of work.

An investigation into the two interactions reported as laggy on phones: the
**draw step** (a server view push lands and your hand gains a tile / your turn
begins) and **selecting a discard** (tapping a hand tile to raise it, tapping
again to confirm). Everything below was read out of the client code; line
references are to `packages/client/src` unless noted.

Prior measurement context: the codebase already quotes 126–236ms to a painted
modal for a *single local* state toggle at 4× CPU throttle on a 390px viewport
(see comments in `Tile.tsx` and `Game.tsx`, N38). The draw and tap paths below
do strictly more work than that toggle.

## What actually happens on each interaction

### Draw step (one server push)

1. `ws/client.ts` parses the message → `store/index.ts` `handleServerMsg` sets
   `view`, `lastEvents`, `history`, `botPace` — one `set`, but **every
   component subscribed to `view` or taking it as a prop re-renders**.
2. `Game.tsx` `PlayPhase` re-renders. The four zones are `memo`'d, but their
   `view` prop is a **fresh object identity on every push**, so memo never
   bites for pushes — `OpponentTop`, both `OpponentSide`s, `OwnZone`,
   `PlayTopBar`, `EventFeed`, `WallDiagram`, `ClaimFlight`, `DiceOverlay` all
   re-render on every draw. Memoisation only protects them from *local* state
   (opening a pile), not from the steady-state update path.
3. `OwnZone` then renders **twice**: once from the push, and again from
   `useEffect([handKey]) → setHandOrder(reconcileHandOrder(...))`
   (`OwnZone.tsx:134-136`). Every draw is two full OwnZone renders.
4. Each OwnZone render reconciles a framer-motion `Reorder.Group` of 13–14
   `Reorder.Item`s, each a `motion.li` containing a `motion.div` tile. This is
   the heaviest React subtree on the board by a wide margin.

### Discard select (one tap)

1. `Reorder.Item` sees `pointerdown` (framer attaches drag listeners to every
   item; the code comments note it preventDefaults and eats click/tap).
2. `pointerup` → `handleTileTap` → `setSelectedTile` → **full OwnZone
   re-render**, again reconciling all 13–14 Reorder.Items.
3. Every hand tile passes `selected={...}`, which makes **all 14 of them
   `motion.div`s with spring transitions** (`Tile.tsx:121` — passing `selected`
   at all opts into the animated branch). Framer updates animation state for
   all 14 to lift one.
4. The lift also flips `.is-selected`, whose visual is
   `filter: drop-shadow(...) drop-shadow(...)` with
   `transition: filter 0.15s ease` (`index.css:59,62-64`). Animating `filter`
   is not compositable — it re-rasterises the SVG face every frame for 150ms,
   and the lapped layout (art is 129% of its box, `index.css:128-136`) makes
   the repaint region wider than the tile.
5. On the confirming tap, `boxOf(source)` calls `getBoundingClientRect()` in
   the pointerup handler (`OwnZone.tsx:275`), forcing a synchronous layout
   flush inside the input path.

## Ranked bottlenecks

### 1. `Reorder.Group`/`Reorder.Item` cost on every render — biggest lever

Thirteen-plus framer-motion Reorder.Items re-reconcile on every draw (twice),
every tap, every armed-tile change. Reorder keeps per-item layout bookkeeping
and each item is a full motion component. On a 4×-throttled phone this is very
plausibly the dominant main-thread cost in both interactions.

- **Extract a memoised `HandTile` row component** (props: `id`, `selected`,
  `discardable`, `kongMarked` — all primitives) so a tap re-renders one item,
  not fourteen.
- **Make the lift CSS, not framer**: `transform: translateY(-10px)` with
  `transition: transform` is compositable and free compared to a spring-driven
  motion value. `Tile.tsx`'s own comment says framer "is only earning its keep
  on a tile that lifts or answers a gesture" — but in the hand *every* tile
  qualifies, so the hand is 14 motion components at all times. A CSS lift
  keeps the visual and drops the runtime cost. (Careful: `Tile.tsx:118-121`
  notes swapping element type mid-lift remounts the tile — a pure-CSS lift
  sidesteps this entirely.)
- Keep `Reorder` only for drag; if drag-reorder is rarely used, a lighter
  DnD path (or pointer-based manual reorder) would remove the per-item drag
  listeners entirely.

### 2. Double render per draw (`handOrder` effect)

`OwnZone.tsx:134-136` reconciles hand order in an effect, so each push renders
OwnZone, then re-renders it with the reconciled order. Use the
set-state-during-render derived-state pattern instead:

```tsx
const [prevKey, setPrevKey] = useState(handKey);
if (prevKey !== handKey) {
  setPrevKey(handKey);
  setHandOrder(prev => reconcileHandOrder(prev, hand));
}
```

React re-renders immediately without committing the first pass — one commit
per draw instead of two, and no visible intermediate frame. Same result, half
the Reorder reconciliations on the draw path.

### 3. Non-compositable infinite animations running during both interactions

Two CSS animations run **exactly when the player is drawing and choosing**:

- `.hand-your-turn::after` pulses an inset `box-shadow` over the whole hand
  block, forever (`index.css:824-842`). Box-shadow animation repaints the
  entire hand region — 14 lapped SVG tiles — every frame. It starts the moment
  your draw lands.
- `.tile-last-discard .tile-face` pulses `filter` (two drop-shadows) forever
  (`index.css:66-78`). Filter animation re-rasterises the SVG every frame.

Both should animate `opacity` of a pre-drawn glow layer instead (two stacked
shadows crossfading, or an `::after` ring fading in/out), which the compositor
handles off the main thread. This is the cheapest change with the broadest
effect: it lowers baseline paint cost for the whole round, not just one
gesture.

Related: `.tile-face`'s blanket `transition: filter 0.15s ease`
(`index.css:59`) means *every* filter change on any tile animates by
re-rasterisation. Scope the transition to hover-only contexts or drop it.

### 4. SVG rasterisation under filters

~80 tile `<img>`s per board, each a 3–9KB SVG. Cached decodes help, but every
`drop-shadow` forces a re-raster of the source at that size rather than a
bitmap blit. Trays and the wall keep per-tile shadows (runs already drop
theirs, `index.css:169-171`).

- Cheapest: accept the run-level shadow in trays too.
- Bigger win, more work: pre-rasterise tiles to PNG/WebP at the 3–4 sizes the
  board actually draws (`--tile-w` = 1.5/2/2.5/3/3.5rem plus the hand's flex
  sizes) in a build script under `scripts/tiles/`, and serve those. Mobile
  GPUs blit PNGs far cheaper than they re-raster SVGs under filters. Verify
  against `docs/handoff-tile-rendering.md` before touching the art.

### 5. Forced synchronous layout in the tap path

`boxOf()` (`getBoundingClientRect`) is called in the pointerup handler on the
confirming tap (`OwnZone.tsx:275`) and again in the layout effect for the
tray landing (`OwnZone.tsx:170-172`). The tray-side one is already well-placed
(`useLayoutEffect`, before paint). The tap-side one can be captured lazily —
e.g. measure from the ref map (`tileEls`) in the same layout effect that
already runs when the discard comes back, or at pointerdown — so the input
handler never forces layout.

### 6. Unstable `ref` callback on every Reorder.Item

`OwnZone.tsx:547-550` passes an inline `ref={(el) => ...}`; a new function
identity each render makes React detach/reattach the ref on **every** OwnZone
render (null call + set call per item). Cheap individually, but it's 28 ref
calls per render on the hottest component, and ref churn on motion components
can trigger extra measurement. A stable `useCallback` (or a small
`HandTile` wrapper owning its own ref registration) removes it.

### 7. WallDiagram re-render per push

`WallDiagram` recomputes `wallSlots` (56 slots) and renders 56 divs with fresh
inline `style` objects on every push (`Game.tsx:402`). The `TileBack`s are
memoised so they skip, but the divs don't. Memoising the slot computation on
`state` (or wrapping `WallDiagram` in `memo` keyed on `remaining` + `state`)
takes it off the per-draw path entirely — its inputs change at most once per
draw.

### Not bottlenecks (checked, fine)

- **Sound** (`useSound.ts`): one shared AudioContext, short oscillator blips.
  Negligible.
- **WS/parse**: one view push per action; JSON is small. The server's
  `broadcastViews` sends one message per action per player — no redundant
  client work.
- **`kongOffers`/`legalDiscards`/`riverCells`**: O(hand) pure functions, run
  per push but trivially cheap.
- **ClaimPanel 50ms interval**: only during claim windows, updates one div's
  width.
- **`DiceOverlay`**: gated on `diceKey`, shows once per round.
- **`EventFeed`/`ClaimFlight` effects** keyed on `lastEvents` run per push but
  early-return on empty batches.

## Suggested order of work

1. `.hand-your-turn` and `.tile-pulse` → opacity-based (§3). Small, isolated,
   no component changes.
2. Memoised `HandTile` + CSS-transform lift (§1), set-state-during-render for
   `handOrder` (§2), stable ref (§6). This is the core of both reported
   interactions.
3. Move `boxOf` off the tap handler (§5); memoise `WallDiagram` (§7).
4. Re-measure at 4× throttle on a 390px viewport (the setup the N38 comments
   used): tap → painted lift, and push → painted hand. Only then consider the
   PNG pipeline (§4).

## How to verify

- Chrome DevTools Performance tab, 4× CPU throttle, 390×844: record one draw
  and one tap-to-lift; look at long tasks and dropped frames around
  `Reorder.Group` render and `filter` paint.
- React Profiler on the same gestures: before §1–2, one tap should show all 14
  Reorder.Items rendering; after, one.
- `e2e/viewport.spec.ts` must stay green: it asserts tray-tile geometry and
  samples every ~130ms, so any lift/lap regression is caught there. The
  layout probe (`scripts/screenshots/layout-probe.mjs`) guards the well.
