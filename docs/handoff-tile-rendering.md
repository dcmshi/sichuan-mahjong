# Handoff — tile rendering

Tiles are the **untouched 3D art**, and a run of them **laps**: each tile is drawn
wider than its layout box and anchored to the box's right, so it bleeds left over
the tile before it and hides that tile's bevelled side. One shared edge per join,
which is what a real run of tiles shows, without redrawing anything.

**Start with the sandbox** — `scripts/tiles/sandbox.html`. Open the file directly
in a browser; no build, no server, no game:

```sh
start scripts/tiles/sandbox.html     # Windows
open  scripts/tiles/sandbox.html     # macOS
```

It links the app's real `packages/client/src/index.css` and puts the app's own
classes on every tile, so it draws what the app draws and the loop is: edit,
refresh. On the page: solo tiles and lapped runs at every size the app uses, the
seam at 96px, a wrapping tray, a meld, a selected tile, backs, the tightest glyphs,
and the marked and last-discard states. The bottom prints what the CSS resolved to,
so it can't disagree with a stale comment.

`pnpm tiles:sandbox` renders the same page headless to `scripts/tiles/sandbox.png`
(gitignored). It exits non-zero if the art isn't coming out wider than its box —
i.e. if the stylesheet didn't load — because an unstyled run still looks plausible
in a screenshot.

---

## Why the lap works: the art measured

Layer insets from each edge of the 210×255 box, measured through the `g4630`
matrix (per-element `getBBox` would miss that transform):

| Layer | Fill | top | right | bottom | left |
|---|---|---|---|---|---|
| `rect4031` outline | — | 0 | 0 | 0 | 0.1% |
| `rect3767` side | `#005f00` | 5% | 5.5% | 12.9% | 20.6% |
| `rect3861` plate | `#cddacd` | 10.8% | 15.4% | 7.1% | 13.4% |
| `rect3765` | `#fff` | 16.7% | 17.8% | 5.1% | 8.7% |
| `rect3008` face | `#d0e4cc`→`#fbffec` | 20.6% | 22.5% | 5.1% | 6.3% |

Reading the right column downward: outline to 5.5%, green to 15.4%, plate and
white to 22.5%, face after that. **So the rightmost 22.5% of the art is body and
never ink** — that is the overlap, and it is why the lap costs nothing. The widest
glyph, `pin-3`, ends at 75.9% of the tile, clearing it by 1.6%. Anything past ~24%
starts eating the symbol.

Two more things fall out of the table:

- **The tile is lit from the bottom-left.** Green reaches the top and right edges
  only. So lapping leftward hides the side that has the bevel and leaves the top
  band showing, which is what a row of real tiles looks like — nothing is above
  them. The bottom and left are a thin plate-and-outline edge, and the left edge is
  what becomes the seam between two lapped tiles.
- **The corner radius is ~38 units** — the outline path turns on cubics spanning
  36–41 — which is 18.1% of the width, 14.9% of the height. `.tile-mark` still
  needs that, since the void screen spaces its tiles rather than lapping them.

---

## The knobs

All in `packages/client/src/index.css`. The whole scheme is one constant, 0.775,
appearing three ways:

| Property | Value | What it is |
|---|---|---|
| `.tile-lap .tile` `aspect-ratio` | `162.75 / 255` | 210 × 0.775 — the box is the **pitch**, not the tile |
| `.tile-lap .tile-face` `width` | `129.032%` | 1 ÷ 0.775 — the art |
| `.tile-lap .tile-face` `margin-left` | `-29.032%` | what anchors it right, so it bleeds left |
| `.tile-lap .tile-sized` `width` | `calc(var(--tile-w) * 0.775)` | a fixed-size tile keeps its art size; the box shrinks |
| `.tile-run` / `.discard-tray` `padding-left` | `0.58rem` / `0.88rem` | the first tile's bleed |

Percentages throughout, because the hand's tiles are flex-sized and no length is
known in CSS. That is also why sizes are `--tile-w` on `.tile-sm`/`-md`/`-lg`/`-xl`
rather than Tailwind's `w-*`: a lapped run has to scale a width down to the pitch,
and CSS can't scale a width it didn't set.

A container opts in by carrying `.tile-lap` — `TileRun` adds it, and so do the four
discard trays, the two concealed-hand rows, and the discard in flight. Solo tiles
(the well, the picker, the void screen, `PlayHistory`, `MeldChip`) don't, so their
box is the whole tile.

---

## The things that are easy to get wrong

The first two cost a full e2e run each. The rest were found in the sandbox, and are
on its page so they stay found.

- **The art stays in flow.** Positioning it absolutely is the obvious way to make
  it overflow its box, and it collapses the hand to nothing: the art is the only
  thing in that chain with an intrinsic size, and `.tile-run` is `inline-flex`, so
  shrink-to-fit had nothing left to measure and the run came out the width of its
  own padding. Hence `margin-left: -29.032%`, and `flex: none` — as a flex item a
  width over 100% is a base size the container would otherwise shrink back.
- **Tailwind's preflight caps images at `max-width: 100%`.** It silently clamps the
  art back to its own box, so the lap disappears while every other number still
  reads correctly. `.tile-lap .tile-face` sets `max-width: none`.
- **A lifted tile needs a `z-index`.** DOM order paints the neighbour on top, so a
  selected tile that only rises reads as sliding *behind* the hand. Same for the
  pulsing last discard, whose glow would be half-covered.
- **The first tile of every *wrapped* row bleeds.** A tray's second row starts a
  fifth of a tile outside the tray without the container's left padding. That is
  what `.discard-tray`'s asymmetric padding is for; it is not a style choice.
- **Fixed-size tiles must shrink their box, not grow their art.** Without
  `.tile-lap .tile-sized`, a `w-8` tray tile draws 29% larger and its rows 29%
  taller — the vertical budget R1–R7 spent itself on. The hand is the opposite case
  and wants the growth: its tiles are `fill`, so the row sets the pitch and the art
  grows into it, which is where the +26% glyph size comes from.
- **A run carries one shadow, a tray keeps per-tile ones.** Inside `.tile-run` the
  per-tile `drop-shadow` falls on the neighbour lapping it, so `.tile-run
  .tile-face` turns it off. `.tile.is-selected .tile-face` outranks that rule, so a
  lifted tile still lights up — check that if you touch the selector.

---

## What this replaced

The previous pass stripped each tile's body out of the SVG (`scripts/tiles/`:
measure the glyph, reframe the viewBox on it) and rebuilt it in CSS as a six-layer
gradient stack on `.tile-cell`. It worked, but it was a reconstruction: the art's
body is chunkier, its face more inset, its specular a blurred filter rather than
three gradient stops, and every band it drew came out of the face. The lap pays for
its band with the neighbour instead, so the same 299px hand went from 23.0px to
29.0px a tile.

`scripts/tiles/measure-glyphs.mjs` and `glyph-boxes.json` survive as the
measurement of where ink sits inside each frame, which is the evidence for the
22.5% constant. Nothing generates assets any more.

Settled, with the reason — don't re-litigate without one:

- **Every tile in a run laps, including the first and last.** Showing a full side
  only where nothing abuts the tile is more literally correct and was tried in the
  flat era; it made one tile look like two depending on where it sat, and a
  wrapping tray can't express "last in a wrapped row" in CSS to opt in.
- **The overlap is 22.5%, not more.** It is the exact width of the body band. If
  you widen it, check `pin-3`, `sou-1`, `pin-9`, `pin-7`, `pin-8`, `sou-9` first —
  they are the tight ones, and they're on the sandbox page for that reason.
- **The seam is the art's own black left edge**, 6.3% of the tile width. It is
  heavier than the 1px outline the flat cell drew, and at 96px it reads as a black
  gutter; at hand size it reads as a firm separator. This was looked at and chosen.

---

## Verifying a change

```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm tiles:sandbox                               # exits non-zero if the CSS broke
```

Then, if you changed a layout box rather than a paint — and the lap *is* a layout
box, so most changes here qualify:

```sh
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm e2e                                         # needs port 8080 free
pnpm shots                                       # regenerates docs/*.png
```

Two guards constrain what you may do near a tile: `e2e/viewport.spec.ts` asserts no
tile's box escapes its `.discard-tray`, sampling every ~130ms for 90s, and
`ui-clicks.spec.ts` fails on horizontal document scroll. The lap changes both the
box and the drawn extent, so run them.

**Restart the server after any client rebuild.** `@fastify/static` is registered
with `wildcard: false`, so the asset list is snapshotted at boot and a fresh bundle
404s into the SPA fallback — the page then dies with a MIME-type error on a
`text/html` module script. The sandbox sidesteps this entirely.
