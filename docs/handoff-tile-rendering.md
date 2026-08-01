# Handoff — tile rendering

The tiles are drawn as **CSS + a glyph-only SVG**, not as the original 3D art. This
is the state of that, what has been measured, what has been tried and rejected, and
where the knobs are. Pick it up from here without re-deriving any of it.

**Start with the sandbox** — `scripts/tiles/sandbox.html`. Open the file directly in
a browser; no build, no server, no game:

```sh
start scripts/tiles/sandbox.html     # Windows
open  scripts/tiles/sandbox.html     # macOS
```

It links the app's real `packages/client/src/index.css` by relative path, so the loop
is: edit `.tile-cell`, refresh. Every size the app actually uses is on the page, each
next to the untouched original, plus flush runs, a wrapping tray, a meld, a solo tile,
backs, the tightest glyphs, and the marked/last-discard states. The bottom of the page
prints what the CSS resolved to, so it can't disagree with a stale comment.

`pnpm tiles:sandbox` renders the same page headless to `scripts/tiles/sandbox.png`
(gitignored) for a shareable artifact or a before/after pair. It exits non-zero if the
stylesheet didn't load or an SVG 404s — otherwise you get a confidently wrong picture.

---

## Why CSS at all

Each source SVG in `packages/client/public/tiles/` is a complete 3D tile with its own
bevelled sides, outline and drop shadow. Two of them flush against each other show
**two** bevels and two outlines where a real run of tiles shows one shared edge, so a
dense hand read as a stack of separately-lit objects. The density pass (R7) split it:

- `scripts/tiles/measure-glyphs.mjs` measures each glyph's bounding box in a real
  browser — `svg.getBBox()` on the **root**, because per-element boxes are in that
  element's own space and the pin dots sit inside nested transformed groups.
  Writes `scripts/tiles/glyph-boxes.json`.
- `scripts/tiles/flatten-tiles.mjs` strips the tile body by element id and reframes
  the viewBox on that measured box, writing `tiles/flat/*.svg` — glyph only, 210×227.
- `.tile-cell` in `index.css` draws the body, so one CSS change restyles every tile.

The payoff was width: the glyph gets the whole cell instead of the ~75% the 3D frame
left it. On a 320px phone the hand went 19.1px → 22.7px per tile against a ~24px
readability floor. **Anything that shrinks the glyph is spending that back**, which is
the single constraint to keep in mind.

A client test fails if `tiles/flat/` drifts from what the scripts produce, so rerun
both after touching either script and commit the output.

---

## What the art actually does — measured, not guessed

Layer insets from each edge of the 210×255 box, measured through the `g4630` matrix
(per-element `getBBox` would miss that transform):

| Layer | Fill | top | right | bottom | left |
|---|---|---|---|---|---|
| `rect4031` outline | — | 0 | 0 | 0 | 0.1% |
| `rect3767` side | `#005f00` | 5% | 5.5% | 12.9% | 20.6% |
| `rect3861` plate | `#cddacd` | 10.8% | 15.4% | 7.1% | 13.4% |
| `rect3765` | `#fff` | 16.7% | 17.8% | 5.1% | 8.7% |
| `rect3008` face | `#d0e4cc`→`#fbffec` | 20.6% | 22.5% | 5.1% | 6.3% |

Three things fall out of that, and they drive the whole design:

1. **The tile is lit from the bottom-left.** Green reaches the top and right edges
   only — never the bottom or left, which show plate and outline. So the bottom is a
   thin edge, not the deep green front edge R7 originally gave it.
2. **A bevel on top+right can't double up between flush neighbours**, because a
   tile's right side meets the next tile's bare face. Left+right is what doubled.
3. **The corner radius is ~38 units** — the outline path turns on cubics spanning
   36–41 — which is 18.1% of the width, 14.9% of the height.

The gloss is three elements the flatten script strips: `path3932` (hard dot),
`path3882` (soft blob), `path3936` (blurred diagonal streak, `#fff` → transparent).
Measured at inset top 8.8% / right 8.2%, they sit on the **shoulder**, not on the
ivory — which is what makes a highlight read as a glazed edge catching light rather
than a stain on the face.

---

## Where the knobs are

All in `packages/client/src/index.css`, as named custom properties on `.tile-cell`
(named because Biome reflows a six-layer `background` shorthand and drags inline
comments into the middle of the declaration):

| Property | Now | What it is |
|---|---|---|
| `--tile-face` | edge at 95.2% | face gradient, ending in the thin bottom edge |
| `--tile-top` | 9.5% of height | top band: outline → side → plate → white |
| `--tile-side` | 14% of width | right band, same order, face outwards |
| `--tile-gloss-dot` / `-blob` / `-streak` | — | the art's specular cluster |
| `--tile-outline` | `inset 0 0 0 1px` | `rect4031`, tracing the silhouette |
| `border-radius` | `18.1% / 14.9%` | the art's corner, proportional |
| `.tile-glyph` height | 95% | the face area the glyph is centred in |

Two traps in that file:

- **Every rule that sets `box-shadow` on a cell must re-list `--tile-outline`** —
  box-shadow doesn't merge across rules. That's `.tile-solo`, both keyframes of
  `tile-cell-pulse`, and the reduced-motion resting state. Miss one and the
  silhouette silently vanishes in that state only.
- **`border-radius` is two values on purpose.** A single percentage gives an
  elliptical corner on a 210×255 box; a fixed `rem` reads as a tile at the 56px well
  size and as a blob at the 23px hand size.

---

## Settled, with the reason — don't re-litigate without one

- **Every tile gets the same bevel** — hand, meld, tray, picker, well. Showing the
  full side only where nothing abuts the tile is more literally correct and was
  tried; it made one tile look like two depending on where it sat, and a wrapping
  tray can't express "last in a wrapped row" in CSS to opt in.
- **Bands are sized by the glyphs, not by the art.** 9.5% and 14%, against the art's
  20.6% and 22.5%. The glyphs' own margins inside their frames are 8.4% top and 16%
  a side (`glyph-boxes.json`), so that is exactly where a wider band starts eating
  ink. The art's literal proportions were built and rejected: they need the glyph
  inset, which takes it back to roughly what the 3D art gave it before R7, and it is
  visibly worse at 23px. **If you widen a band, check `pin-3`, `sou-1`, `pin-9`,
  `pin-7`, `pin-8`, `sou-9` first** — they are the tight ones, and they're all on the
  sandbox page for that reason.
- **The outline is what makes the corner read.** An ivory corner against green felt
  is a low-contrast transition; the radius was already the art's and still read flat
  until `rect4031` was reproduced. 1px, not the art's 2.4% — box-shadow spread takes
  no percentage, and 2.4% would be 0.6px in a hand tile.
- **Every tile on the board is flat.** The old "a singleton should look like a
  singleton" rule is gone: the well's last discard on the 3D art read as glossier
  than its neighbours, which is what started this. `solo` gives a lone flat tile the
  lift `.tile-run` would otherwise provide.
- **The overlapped hand-count stack keeps the 3D backs** (`HandCountChip`).
  Overlapped flat backs merge into one green slab.
- **`flatten-tiles.mjs` splits the flat back's edge at 243**, matching the faces. A
  back covers the whole cell, so a mismatch shows in a tray and on a concealed kong.

---

## Known gaps, if you want somewhere to start

Visible in the sandbox at 96px, comparing the CSS face with the art:

- **The art's body is chunkier.** Its green side and outline are both wider than
  ours, so the art reads as a heavier object. Closing that means either eating glyph
  width or finding a way to fake depth without spending the face — a gradient on the
  glyph's own margin, say, rather than a wider opaque band.
- **The art's face is more inset**, giving it a visible white/plate step between the
  green and the ivory. We compress that step into ~1.5% and it mostly disappears at
  hand size.
- **Backs are plain.** They carry no top/right band — green on green would barely
  show — so a back beside faces is flatter than its neighbours. Whether that matters
  is a judgement call; a concealed kong is four of them in a row.
- **The specular is static.** The art's is a blurred filter; ours is three gradient
  stops, which is cruder under close inspection at 96px and indistinguishable at 32.

---

## Verifying a change

The sandbox catches everything visual. Before committing:

```sh
pnpm lint && pnpm typecheck && pnpm test         # 305 unit tests
pnpm tiles:sandbox                               # exits non-zero if CSS/SVGs broke
```

Then, only if you changed a layout box rather than a paint:

```sh
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm e2e                                         # 12 tests, needs port 8080 free
pnpm shots                                       # regenerates docs/*.png
```

Paint-only changes (gradients, shadows, radius) move no boxes, so the layout guards
can't see them — which is exactly why the sandbox exists. Two guards *do* constrain
what you may animate near a tile, though: `e2e/viewport.spec.ts` asserts no tile's box
escapes its `.discard-tray`, sampling every ~130ms for 90s, and `ui-clicks.spec.ts`
fails on horizontal document scroll. Animate in an overlay or on opacity, never with
a transform on a tray tile.

**Restart the server after any client rebuild.** `@fastify/static` is registered with
`wildcard: false`, so the asset list is snapshotted at boot and a fresh bundle 404s
into the SPA fallback — the page then dies with a MIME-type error on a `text/html`
module script. This cost time more than once; the sandbox sidesteps it entirely.
