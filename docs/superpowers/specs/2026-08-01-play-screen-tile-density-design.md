# Play-screen tile density — flush tiles, north/south overlap, vertical side trays

**Date:** 2026-08-01 · **Status:** approved, ready to implement
**Follows:** R6 in [../../viewport-audit.md](../../viewport-audit.md)

Answers the audit's open question 3 — *"the smallest phones still need ~130px;
which reduction is least costly to the read of the board?"* — and fixes a clipping
bug found while measuring.

---

## Measured starting point

iPhone SE (Playwright's `devices['iPhone SE']`, **320×568**) against the real app,
mid-round:

| Thing | Measured |
|---|---|
| Hand tile | **19.1 × 23.1px** |
| Hand row | 296px wide, 13 tiles, `gap-1` × 12 = **48px of gaps (16%)** |
| Own discard tray | box 296 × 48.4, 32px tiles, **8 per row** |
| Left side tray | box **80 × 54.4**, `scrollWidth` 110 — **one tile cut in half** |
| Right side tray | box **211.6 × 39.1**, `scrollWidth` 212 — **132px wider than its column** |
| Across zone | 171px without melds, 217.8px with one meld row |
| Middle row / well | 145.6px |
| Side column content | 161px |
| Hand-count chip | ~61px (three `sm` backs, 38.7px tall, `-mt-7` = −28px overlap) |

Two of those are defects, not tuning:

- **The hand is below the readable floor.** The audit records "below roughly 24px
  wide the suit markings stop being readable". The hand is at 19.1px — and it is
  the only thing on the screen the player taps.
- **The right side tray escapes its column.** The left column is a plain block, so
  `max-w-full` resolves to its 80px. The right one is `flex justify-end`, so
  `OpponentSide` sizes to min-content instead and the tray becomes 211.6px,
  spilling 132px leftward across the well. In `docs/screenshot.png` the row of
  tiles under "Last discard" that reads as part of the middle area is the right
  opponent's discard tray.

---

## Changes

### 1. Hand-count backs overlap horizontally at north only

`HandCountChip` gains `orientation: 'horizontal' | 'vertical'`.

- **North (across)** — `horizontal`, backs overlapped `-ml-7`. The chip becomes
  exactly one tile tall: **61px → 39px, −22px in the across zone.** It also reads
  truer, since that is how a hand faces you from across a table.
- **East and west (sides)** — `vertical`, unchanged. Those hands face you edge-on,
  and an 80px column has no room for a horizontal run anyway.

The side columns sit inside the flexible middle row, so shrinking them relieves
layout pressure but frees no budget. Only the across zone's −22px is height.

### 2. Side discard trays grow downward, fully visible

Today: a single horizontal `flex-nowrap overflow-x-auto` row in an 80px column,
which cuts a tile in half on the left and escapes the column on the right.

After: a **2-wide wrapping grid that scrolls internally** — `flex-1 min-h-0
overflow-y-auto` inside the column, two flush 32px tiles fitting the 80px column
exactly. Nothing is ever cut mid-tile, it shows as many rows as the middle row can
afford, and it can never set the row's height. That is the same mechanism as R6's
own tray and the tray's existing horizontal scroll, so the screen keeps one
pattern rather than gaining a third.

Rejected: a 1-wide column (half the information in the same height) and a
vertically *overlapped* stack (hides which tiles they are, which is the entire
reason they are on screen).

`Game.tsx`'s right column wrapper drops `flex justify-end` so both sides resolve
`max-w-full` against the same 80px.

### 3. True flush tiles

`gap-1` comes off the hand and `gap-0.5` off the trays and melds. The hand row
goes to `px-2`.

| | Now | After |
|---|---|---|
| Hand tile @ 320px | 19.1px | **23.4px** |
| Hand tile @ 390px | 24.5px | **28.8px** |
| Tray tiles per row @ 320px | 8 | **9** |

Removing the gap alone is not "flush like in real life": each SVG is a complete 3D
tile with its own bevelled sides, so two touching tiles show two adjacent bevels
rather than one shared edge. The tile chrome therefore moves out of the asset and
onto the run.

**Asset derivation.** `public/tiles/*.svg` are Wikimedia Commons, **CC BY-SA 4.0**
(Cangjie6; Jerry Crimson Mann; Dewclouds), recorded in `credits.json` and shown in
`/about`. Deriving is permitted with attribution and share-alike, and is preferred
over sourcing a new set: no second licence to diligence, no visual mismatch, and
the credits block already exists.

All 27 faces share one body stack — `rect4031` (dark body), `rect3767`
(`#005f00` side), `rect3861`, `rect3765`, `rect3008` (ivory face gradient), inside
`g3062`, then the glyph paths — verified across all 27, same wrapper transform.
Only `pin-1.svg` differs in viewBox origin, which an id-based edit does not touch.

`scripts/tiles/flatten.ts` reads each face and writes `public/tiles/flat/<name>.svg`
holding the glyph alone: the four body rects and the three 3D highlight paths
(`path3932`, `path3936`, `path3882`) are dropped, the viewBox and the glyph's
existing inset are kept, so each flat face is a glyph correctly padded inside a
210×255 cell. Output is committed, and the script is rerun when the source art
changes — the same arrangement as `scripts/icons/`.

**Two flush forms, because the contexts differ.**

- **Hand and melds are single non-wrapping runs**, so they get a `TileRun`: one
  container drawing the ivory gradient, rounded *outer* corners, one drop shadow,
  and hairline `divide-x` between cells, each cell holding a flat glyph. Square
  interior joins with rounded ends — the real-table run. A selected tile lifting
  out of the strip is then exactly the physical gesture.
- **Discard trays wrap**, so one strip would break at row ends. They keep their
  existing inset `.discard-tray` frame with flush flat faces and a per-tile
  hairline right edge, which survives wrapping.
- **Singletons keep the 3D art** — the well's last discard, the long-press
  preview, the first-discard flip panel. A lone tile should look like a lone tile.

`credits.json` gains a note that the flat set is our derivative of those files;
`/about` keeps the same attribution.

---

## Budget at 320×568

Computed from the measured components above, for the full-round state that R6 had
to absorb:

| | Change |
|---|---|
| Across zone — chip goes horizontal | **−22px** |
| Own tray — 3 rows at 8/row → 2 rows at 9/row, gaps gone | **−53px** |
| Hand row — taller tiles | **+5px** |
| **Net** | **≈ −70px** |

On top of R6's ~60px. To be re-measured after implementation rather than asserted;
every estimate in this audit's history has come in worse than predicted.

---

## Testing

- **Height** is already guarded by R6's peak-sampled overflow assertion.
- **The clipping bug needs its own assertion or it silently returns.** In
  `e2e/viewport.spec.ts`: no tray's `scrollWidth` exceeds its `clientWidth`, and no
  tile's bounding box escapes its tray's. Both fail today, on both side columns.
- **The derivation gets a unit test**, since the client suite has no DOM: every
  generated flat SVG parses, retains glyph paths, and contains none of the seven
  stripped ids.
- `docs/*.png` are regenerated at the end — this change genuinely alters what they
  show.

## Out of scope

- Side opponents' **melds** are still not rendered at all (`OpponentSide` draws a
  name, count chip and tray only). Worth its own item; the ~70px here plus R6's
  ~60px is what would pay for it.
- Tray tile size stays 32px. The freed width was banked as fewer rows, not spent
  on bigger tray tiles.
- Sourcing a different tile set. Only if the derived faces look wrong.
