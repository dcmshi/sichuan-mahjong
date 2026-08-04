# Layout investigation — the play screen's vertical budget

**Measured:** 2026-08-03, from `main` @ `c54e567` forward.
**Method:** Chromium via Playwright at four real phone sizes, driven through real
practice rounds to a mid-round state **with melds on the table** — the worst case,
because a meld chip is another 45px out of a budget that is already gone. All
figures are rendered `getBoundingClientRect` in CSS px.

Screenshots are in `prototype-shots/` at the repo root, one labelled directory per
run — see its README. `before/` is committed `main`; the `after-*` runs are the
prototype at each stage.

> **Status: complete, uncommitted.** All nine viewports pass at their worst case,
> 320×568 through 1024×1366.
>
> - **§1–§2** — the diagnosis: the board fits everywhere and divides its height
>   badly, which no existing guard could see.
> - **§10** — what fixed it on phones.
> - **§11** — what fixed it on tablets, which was the opposite defect.
> - **§5, §7, §10.7, §11.2** — four things measured and **rejected**, kept so they
>   are not retried: the structural corner reserve, the 320px arithmetic, the wall
>   lap/box change, and scaling the wall on tablets.
>
> Screenshots per run in `prototype-shots/` — see its README. Two items are left
> open at the end of §12.

---

## 1. The question, and why the existing guard never asked it

`docs/viewport-audit.md` asked *"does the board fit?"* and got 0 everywhere.
`e2e/viewport.spec.ts` asserts the same thing and is green on every viewport. Both
are true and neither is the problem.

The problem is **how the height is divided**. The board is a vertical stack, and
only one of its rows is `flex-1`:

| Row | Behaviour |
|---|---|
| Top bar | content-sized, 40px |
| Across seat | **content-sized, a constant 227px on every phone** |
| Middle row (side seats + well) | **`flex-1 min-h-0` — the only one** |
| Your discards | content-sized, 110px |
| Your hand | content-sized, ~110px |

So the middle row absorbs 100% of any shortfall, and the two side columns absorb
it with it.

### The baseline, measured

| Viewport | Across row | Middle row | Side tile height |
|---|---|---|---|
| 320×568 | 227 | **80** | **3.8px** |
| 360×640 | 227 | **147** | 3.8–10.3px |
| 375×667 | 227 | **173** | 6.4–14.5px |
| 390×844 | 227 | 348 | 32px |
| 430×932 | 227 | 431 | 32px |

A tray tile is a flex item, and its art is sized off `--tile-w` rather than off its
box — so the box shrinks and the art does not. At 3.8px of box under 32px of art
the overlap is **92%**, and the pile draws as a stack of black outlines with the
art spilling over the well and the "Your discards" label. That is
`prototype-shots/before/320x568-iphone-se1.png`.

The across seat's 227px decomposes as name 21 + chip 39 + melds 47 + tray 49 +
declaration 39, plus gaps and `py-2`. Nothing in it is waste; it is upright tiles
stacked in five rows.

---

## 2. What the corners are worth

The across zone's content is **240px wide on every viewport** — it is centred, so
the rest is genuinely empty. But the *per-row* figures matter more than that
total, and they are very different (320×568):

| Across zone row | Height | Content | Free per corner |
|---|---|---|---|
| Name + hand count | 45px | 115px | **91px** |
| Melds | 43px | 84px | **106px** |
| River | 48px | 230px | **33px** |

A side column is 80px. So the top ~88px of that zone has more corner space than a
side column needs, and only its river row is tight. That is the whole reason the
structural option looked cheap — and, as §5 shows, the reason it was not.

---

## 3. What other mahjong does

The physical convention, and what every riichi client draws, is a **river six
tiles wide that wraps to a new row** — [riichi.wiki/Kawa](https://riichi.wiki/Kawa),
[majandofu](https://majandofu.com/en-mahjong-beginner-rule). Not one long line.

That is directly load-bearing here. Six sideways tiles lapped at 22.5% stand
`32 + 5 × 24.8 = 156px` and each column is 38.9px wide, so **two columns are
77.7px in an 80px side column** — twelve discards in the height of six. One line
of twelve would be 305px, which no phone in the audit has.

It is close to what this app drew before N10, which replaced it for reasons about
*facing* and *ragged wrapping*, not about the six.

---

## 4. The four options, and what each was worth

1. **Compact the across row.** Name beside hand count, declaration into the head
   of the river instead of a row of its own. **227 → 160px, on every viewport, at
   no cost to any seat.**
2. **Side hand-count chip horizontal.** 71px → 39px. Costs the edge-on
   orientation N10 chose deliberately. **+32px.**
3. **River wraps at six.** Twelve discards in the height of six. Doubles density;
   creates no space.
4. **Side columns span the across band.** +227px to the side columns, paid for by
   narrowing the across zone.

### 1 + 2 + 3, measured

| Viewport | Across row | Middle row | Side tile height |
|---|---|---|---|
| 320×568 | 227 → **160** | 80 → **147** | 3.8 → **8.5 / 16.7px** |
| 375×667 | 227 → **160** | 173 → **239** | 6.4/14.5 → **24 / 32px** |

375 and up essentially solved. 320 much better and still squashed.

---

## 5. Why option 4 was built and then taken back out

Built as a reserve — the side columns as siblings of a middle column holding the
across zone and the well. It works on its own terms:
**side tiles 32px at both 320 and 375**, 11 and 8 discards visible, no tile
outside its tray, board still fits.

Two bugs the measurement caught on the way, both worth recording:

- The side trays lost `.discard-tray.tile-run-v`'s symmetric padding when
  `tile-run-v` moved onto the inner river columns. With the default 16.8px of
  horizontal padding the second column drew **outside** the tray — the exact
  thing `viewport.spec.ts` asserts against. Now `.discard-tray-v`.
- The `+N` label is in flow, and two river columns are 77.7px of an 80px box, so
  it pushed the second column out too. It is absolutely positioned now.
- (Separately: the Pung/Kong badge is `absolute -bottom-1`, so it hung 4px into
  the first discard. The meld row reserves that 4px.)

**But it moved the squash rather than removing it.** The across seat's river runs
horizontally, so width is *its* scarce axis, and reserving 160px of corners takes
it:

| Viewport | Across zone width | Across art width |
|---|---|---|
| 320×568 | 128px | **15.9px** |
| 375×667 | 183px | **23.8px** |

The audit's own readability floor is ~24px. The across seat's tray went from
correct to visibly undersized, which is why the option was taken back out.
**A side column may not reach above the well's top edge.**

---

## 6. Where it stands

Reverted to the across zone at full width, with 1 + 2 + 3 kept, plus two
alignment fixes:

- **All three opponent names on one line.** Once the columns moved they staggered
  by ~20px, because the across name is centred against its 39px hand-count row
  while the side names were bare 21px chips at the top. The side names now centre
  in a matching row.
- **"Your discards" flush on its tray's top-left corner.** It was a full-width
  child while the tray was `mx-auto`, and it sat above the *declaration* rather
  than above the tray — two rows from the thing it names. Measured `dx = 0`,
  `gap = 0`.

Final measurements:

| Viewport | Across art | Side tile height | Bot 2/4 label vs well top | Board |
|---|---|---|---|---|
| 320×568 | 32px | **6.0 / 13.4px** | +18px (below) | fits |
| 375×667 | 32px | **20 / 28.8px** | +18px (below) | fits |
| 390×844 | 32px | **32 / 32px** | +18px (below) | fits |

**390 and up is correct. 375 is marginal. 320 is still wrong.**

---

## 7. The arithmetic that says why 320 cannot be satisfied as specified

A 320×568 viewport has 568px. Fixed, non-negotiable rows:

```
top bar          40
your discards   103
your hand       103
claim spacer      8
                ---
                254   leaving 314px
```

That 314px must hold the across seat's whole zone **and** the two side seats'
zones **and** the well. The across zone is 160px after every compaction found so
far, leaving **154px** for a side column — which must fit a name (39), a
hand-count chip (39), a meld row (49) and a river. That is 127px of overhead
before a single discard, and one river column at full size needs 156px.

So on a 320px phone, with the constraint that a side column may not rise above the
well's top edge, **there is no arrangement in which all three opponents' rivers
are readable.** Something has to give, and the candidates are:

- **Let the side seats' rivers be smaller than full size on 320 only** — a
  deliberate scale-down (`--tile-w` at, say, 24px in that column) rather than the
  uncontrolled flex squash. Every tile stays proportional and the lap stays on the
  body band; they are just small.
- **Drop the side seats' meld chips to a count** ("2 melds") — worth 49px, at the
  cost of not seeing *which* tile they locked away.
- **Let the side columns rise above the well after all**, and cap the across
  river to what its narrowed width holds (four at 320, six at 375) with `+N` and
  tap-to-open. This is option 4 plus the fix it needed; it was rejected on the
  across seat's appearance, not on its arithmetic.
- **Accept 320 as degraded** and treat 375 as the floor. 320×568 is an iPhone SE
  1st/2nd gen in a browser tab; installed as a PWA the same device is taller.

None of these is a measurement question. All four are yours.

---

## 8. Still open from this investigation

- **N39** — a tray tile's box shrinks and its art does not. Everything above is
  downstream of it. The proper fix is to fit the count to the measured height,
  which needs a height that doesn't move when the count changes: the tray is
  content-sized, so dropping a tile frees the space that let you drop it. Measure
  the *row* instead.
- The across seat's river has the same defect on the horizontal axis; it only
  shows once its width is constrained, which is why nothing had seen it before §5.

---

## 9. Second pass — code verification, and the levers §7 missed

**Verified:** 2026-08-04, by reading the client source on the working tree (the
§6 final state). Every load-bearing claim in §1–§5 checks out:

- The middle row is the only `flex-1 min-h-0` row in the stack
  (`packages/client/src/screens/Game.tsx:389`); every other row is content-sized.
- Side columns are `w-20 flex-shrink-0` (`Game.tsx:390, 450`); the across zone is
  the compacted 160px variant (`Game.tsx:380-382`).
- N39's mechanism is exactly as described: a tray tile is a flex item whose only
  content is `position: absolute`, so it contributes nothing to min-content size
  and collapses under `flex-shrink: 1` while the art draws at `--tile-w`
  (`packages/client/src/index.css:192-208, 239-241`). Its horizontal twin sits at
  `index.css:128-145`.
- `+N`, tap-to-open (`usePileTap` + `DiscardPileModal`, caps 12 side / 9 across),
  and the river-wrap-at-six all exist as §3–§5 say.

Three corrections to §7's arithmetic, all in the direction of *more* headroom
than the doc credits:

1. **The "claim spacer 8" row does not exist.** `ClaimPanel` is `fixed` and
   reserves zero height outside a claim window (`ClaimPanel.tsx:98-101`); the
   `paddingBottom: claimBarHeight` on the root only applies while a claim is open
   (`Game.tsx:366-368`). The real fixed budget at 320×568 is 246px, not 254px.
2. **"Your discards" was built to give height back.** Its tray already carries
   `min-h-0 overflow-y-auto` with a comment saying it is designed to scroll
   internally (`OwnZone.tsx:399-405, 463`) — but the lever never engages because
   `OwnZone` is content-sized in the parent stack. Making that zone shrinkable
   (or capping it to one river row) is an unlisted lever worth roughly one river
   row (~39–49px) on 320, at the cost of scrolling your own discards there.
3. **"Your hand" is not a constant 103px.** Hand tiles are width-derived
   (`flex-1 min-w-0 max-w-[42px]`, lap aspect-ratio for height —
   `OwnZone.tsx:548`), so the row self-compresses on narrow phones. §7's 254px
   overstates the floor; the true shortfall at 320 is smaller than computed,
   though the conclusion (no full-size arrangement fits) still stands.

### The cheap version of §7's first candidate

The doc's "deliberate scale-down" option is cheaper than §7 implies, and needs
no measurement code: `--tile-w` is an inherited custom property consumed by the
sideways tile's box, its art, *and* both lap margins
(`index.css:144, 193-194, 205-206, 240, 278`). A single declaration —

```css
@media (max-height: 700px) {
  .discard-tray-v { --tile-w: 1.5rem; }
}
```

— shrinks side-tray tiles proportionally (box, art, and lap stay coherent), in
pure CSS, gated by the same `max-height: 700px` block that already swaps
`.void-hand-tile` and `.last-discard-tile` down to 2.5rem (`index.css:398-411,
528-543`). At `--tile-w: 1.5rem` a river column is 117px instead of 156px —
inside the 154px the §7 arithmetic leaves at 320×568, *before* spending levers
2–3 above. This is also the correct N39 fix on the vertical axis (proportional
shrink instead of box-only squash), though not on the across axis.

### Other things worth knowing before choosing

- **Landscape is already out of scope.** `RotateOverlay` covers the whole board
  at `(orientation: landscape) and (max-height: 480px)` (`index.css:557-564`),
  so nothing here needs to work for rotated phones.
- **`OwnZone` has more conditional rows than §7 budgets for** — meld row,
  furiten badge, Hu/Kong buttons, flip row (`OwnZone.tsx:321-395`) — each
  content-sized. The worst case at 320 is worse than the measured worst case if
  you have melds *and* pending buttons.
- **Nothing measures tray or row heights yet** (no `ResizeObserver`, one
  `useLayoutEffect` in `ClaimPanel` measuring its own bar). §8's "measure the
  row" fix for N39 would be new code, but `ClaimPanel`'s `onHeight` callback is
  a ready-made pattern for it.
- **Across and side seats are separate components** (`OpponentTop.tsx` /
  `OpponentSide.tsx`) with near-duplicate cap/head/cells arithmetic — relevant
  only in that any per-seat sizing fix must be made twice, or the duplication
  factored out first.

**Bottom line:** the investigation is on the right track and its conclusion
(something must give at 320) survives verification. But the menu in §7 is
ordered wrong: the `--tile-w` media-query override is a ~5-line CSS change that
likely clears 320 on its own, and the "your discards" internal-scroll lever is
already half-built. Try those two before the structural candidates.

---

## 10. Third pass — the row-inlining, and the `--tile-w` override tried

**Measured:** 2026-08-04, each viewport driven to a mid-round worst case with two
seats melded. Screenshots in `prototype-shots/after/`.

Two more compactions, then §9's `--tile-w` lever. **All nine viewports now pass.**

### 10.1 Three rows became one, twice

- **The across seat's name, hand count and melds share one row.** Stacked they
  were 21 + 39 + 47 = 107px; side by side they are 47px, the height of the tallest
  of the three, and nothing is crowded because the row is 296–406px wide and the
  name and count take ~125 of it. The melds keep the horizontal scroller R6 gave
  them, so four of them scroll rather than wrap — they just start sooner.
- **The side seats' name and hand count share one 21px row**, via a new
  `HandCountChip orientation="count"` that draws the number and no backs. That is
  a smaller step than it looks: the component's whole premise is that an
  opponent's hand is public *only* as a count (`PublicPlayer.handCount`), so the
  backs were always decoration rather than information. In an 80px column they
  cost 39px of height and ~40px of width. The across seat still draws its own,
  where there is room.
- **The side seats' meld chips are sideways**, the way their discards already lie:
  same art in a landscape box, so 32px instead of 38.9px, and two of them are
  77.7px which still fits the 80px width. The Pung/Kong badge stays upright — it
  is read, not placed on a table.

Across zone: **227 → 160 → 117px.** The middle row at 320×568 goes 80 → 154 →
**196px**.

### 10.2 The `--tile-w` override, and the reason §9's version of it does nothing

§9 is right that this is the honest fix on the vertical axis, and right about why:
`--tile-w` feeds the box, the art, and both lap margins, so overriding it moves
all of them together and the lap stays exactly on the 22.5% band instead of eating
into the face.

**But the selector it proposes has no effect.** `.discard-tray-v { --tile-w }` sets
an *inherited* value, and `.tile-sm` declares `--tile-w` **on the tile itself** —
a declaration on the element always wins over an inherited one, whatever the
ancestor selector's specificity. Applied that way the tiles stayed squashed at
24.1px box under 32px art, a 30% effective lap. It has to be
`.discard-tray-v .tile-sm`.

`max-height: 600px`, not §9's 700px: after 10.1 a 375×667 phone draws full-size
tiles with room to spare, and shrinking tiles that already fit would spend the
readability floor for nothing.

### 10.3 Result — every viewport, worst case

`box` is the layout box, `art` the drawn tile. For the vertical lap they must
agree; where they do not, the box was squashed and the lap is eating ink. **The
across seat's box is 0.775 of its art by design** — that is `.tile-lap`, whose box
is the pitch — which is why an earlier version of this probe wrongly flagged every
viewport.

| Viewport | Across art | Left box/art | Right box/art | Lap L/R | Board |
|---|---|---|---|---|---|
| 320×568 | 32 | **22.6 / 24** | **24 / 24** | 24% / 22% | fits |
| 360×640 | 32 | 32 / 32 | 32 / 32 | 22% / 22% | fits |
| 375×667 | 32 | 32 / 32 | 32 / 32 | 22% / 22% | fits |
| 390×664 | 32 | 32 / 32 | 32 / 32 | 22% / 22% | fits |
| 390×844 | 32 | 32 / 32 | 32 / 32 | 22% / 22% | fits |
| 414×896 | 32 | 32 / 32 | 32 / 32 | 22% / 22% | fits |
| 430×932 | 32 | 32 / 32 | 32 / 32 | 22% / 22% | fits |
| 768×1024 | 32 | 32 / 32 | 32 / 32 | 22% / 22% | fits |
| 810×1080 | 32 | 32 / 32 | 32 / 32 | 22% / 22% | fits |

Every viewport: `overflow: 0`, no tile drawing outside its tray, 9 across and
11 / 8 in the side rivers. **320×568 is the only one that shrinks**, to the 24px
floor by design rather than by squash, and its residual 1.4px of box-vs-art (24%
lap against a 22.5% band) is the last of the flex squash rather than a new fault.

### 10.4 What of §9's other levers was not needed

- **"Your discards" internal scroll** — not spent. 10.1 freed enough that the row
  never had to become shrinkable, so your own discards still never scroll.
- **Side meld chips → a count** — not spent. Turning them sideways was worth
  enough on its own, and it keeps *which* tile each seat locked away.
- **§9's correction that the claim spacer does not exist** is right in the sense
  that it reserves nothing during normal play; the probe still reads an 8px row
  there, which is `px-3 py-1` on the kong-button wrapper rather than the panel.
  Immaterial either way.

### 10.5 A regression the row-inlining introduced, and the fix

**The side seats hung from the top of their band instead of sitting in it.** When
the columns gained `pt-2` to line their name rows up with the across seat's, they
kept `h-full` with no `justify`, so their content stacked from the top. That is
invisible on a short phone, where the content fills the column — and wrong on
anything tall: an iPad's middle row is 676px against ~200px of content, so both
side seats sat stranded above a mostly empty well while the across seat stayed at
the top of the screen. Three seats round a table read as a row of three headers.

`justify-center` on the column, and the vertical padding dropped — centring makes
the alignment fall out of the arithmetic, and on a 320px phone those 8px were the
difference between a 24px river tile and a squashed 21.3px one. Measured, every
viewport: side content equidistant from the band's top and bottom (`0/0` at 320
where it fills, `220/220` on an iPad Air).

**320×568 now draws its side rivers at 24 / 24 — box and art in agreement, zero
squash.** Every other viewport is 32 / 32.

### 10.6 How much room the well actually has

The question "is there enough centre space to spend on a taller across zone?" has
a number now. `free` is the well's height less the wall diagram's:

| Viewport | Well | Wall | Free |
|---|---|---|---|
| 320×568 | 196 | 123 | **74** |
| 360×640 | 264 | 161 | 103 |
| 375×667 | 289 | 176 | 114 |
| 390×664 | 285 | 190 | 95 |
| 390×844 | 465 | 190 | **275** |
| 414×896 | 514 | 213 | **301** |
| 430×932 | 548 | 228 | **320** |
| 768×1024 | 620 | 352 | **268** |
| 810×1080 | 676 | 352 | **324** |

So: **plenty from 390×844 up, almost none below it.** Anything that spends well
space to un-compact the across zone — its melds on their own line, its declaration
back above its tray — has to be conditional on height, and would land as a
`min-height` media query for the meld row (CSS, cheap) plus a `matchMedia` hook for
the declaration (new machinery: the declaration is a river cell now, so moving it
is a DOM change rather than a style). Note the wall diagram is
`position: absolute`, so shrinking *it* frees no layout height at all — only the
well's own content box does.

### 10.7 The wall: lapping harder and closing the corners cannot both be had

Tried, measured, reverted. Recorded so it is not retried.

The wall stacks lap at 22.5% — the body band, same as the hand and the trays. The
ask was to lap harder so only each tile's near edge and bevel show (a packed wall
rather than a row of separate tiles) **and** to close the whitespace at the four
corners where one wall ends and the next begins.

**Those pull opposite ways, and the three constants in `WallDiagram` are coupled.**
A harder lap shortens a wall — `LENGTH = TILE × (7 − 6 × LAP)` — which pushes its
ends *away* from the corner, widening exactly the gap the second half of the ask
wants closed. Closing it again means growing `TILE`: the frame closes near
`TILE = 12.5` at 22.5%, and near `TILE = 15` at 50%.

And that is where it fails. A wall's *depth* is its tile's cross-axis size plus the
stacking rise, so bigger tiles make thicker walls — and thickness is subtracted
from the frame's interior **twice**. Measured at `LAP = 0.5, TILE = 15, RISE = 0.36`
on a 390×844 phone:

| | Interior (clear middle) | Wall tile | Corner gap |
|---|---|---|---|
| Shipping (`LAP` 0.225, `TILE` 10.6) | **143px** | 15.2px | 1.7% |
| Harder lap, corners closed | **126px** | 23.5px | 3.2% |

The tiles do get 41% bigger and the wall does read as packed. But the top wall
then paints across the "Last discard" label, because the well's centre content is
laid out in flow at the centre of the well — which is where the frame's interior
is.

**Shrinking the square does not pay for it either, and this is the part worth
keeping:** the frame's interior *is* the well's centre. Taking
`.wall-diagram { width }` from 96% to 70% dropped the clear interior from 143px to
92px and put **21 wall cells under the discard tile at 320×568** (0 before and
after). The corner whitespace is real, but it sits inside a box that is
`position: absolute; z-index: -1` — nothing else can be moved into it, so closing
it buys no space and costs the middle.

A middle ground exists if the packed look matters more than the corners:
`LAP = 0.35, TILE = 12.5` keeps 138px of interior and clears the label, at a
corner gap of 5.8% instead of 1.7%. Reverted rather than shipped because it makes
the corners *worse*, which was half of what was asked for.

---

## 11. Tablets never scaled up — three phone-era caps

Everything above is about the board not fitting. This is the opposite defect, and
it had gone unmeasured because nothing overflows: **on a tablet the board stayed
phone-sized and the well absorbed the difference.** Reported by eye — "the discard
tile sizes get smaller while the inner box area just gets larger, wouldn't that
give us more room for the hands?" — and the answer was yes.

Three hard caps, all correct for a 320px phone, none of which ever lifted:

| | Cap | Effect at 1024×1366 |
|---|---|---|
| Hand tile | `max-w-[42px]` | 42px tiles, **420px of the hand's own row unused** |
| Tray tile | `.tile-sm` = 2rem | 32px discards, at every size |
| Wall frame | `min(96%, 22rem)` | 352px frame in an 832px well — 42% of it |

Two of those three were worth lifting. The wall was not — see §11.2.

Measured before, on the prototype as of §10:

| Viewport | Hand box/art | Hand slack | Tray art | Wall |
|---|---|---|---|---|
| 390×844 | 26 / 33.6 | 9 | 32 | 190 |
| 430×932 | 28.9 / 37.3 | 9 | 32 | 228 |
| 768×1024 | **42** / 54.2 | **164** | 32 | **352** |
| 810×1080 | **42** / 54.2 | **206** | 32 | **352** |
| 1024×1366 | **42** / 54.2 | **420** | 32 | **352** |

The slack column is the tell: from 768 up the hand row has room it refuses to use,
because `flex-1` distributes width and then `max-w` throws it away.

### 11.1 What changed

All on Tailwind's `md`/`lg` breakpoints (768 and 1024), which is exactly where the
slack appears. Every rule **lifts a ceiling** — the phone values are untouched, so
nothing below 768 moves at all.

- **Hand** `max-w-[42px] md:max-w-[60px] lg:max-w-[72px]`. Still a cap: thirteen
  tiles sharing a 1024px row would draw 78px each, bigger than the round-end
  reveal.
- **Trays** `--tile-w` to 2.5rem at `md`, 3rem at `lg`, on `.discard-tray .tile-sm`
  and `.discard-tray-v .tile-sm`. **The side columns have to widen with it** —
  `w-20 md:w-28 lg:w-32` in `Game.tsx` and `OpponentSide.tsx` — because a river
  column is `--tile-w × 255/210`, so two are 97px at 2.5rem and 117px at 3rem,
  both past a phone column's 80px. It comes out of the well, which has 400px+ of
  spare width there.
- **Last discard** to 5rem at `md`, 6.5rem at `lg`. It is the tile a claim is
  decided on, so it should be the biggest thing on the board — which it stopped
  being the moment the hand reached 72px and it stayed at 56.

### 11.2 The wall frame does *not* scale, and that is the interesting one

It was lifted too at first — 22rem → 30rem at `md`, 36rem at `lg` — on the
reasoning that a 352px frame in an 832px well looks like the table shrinking as
the screen grows. Reverted, because that reasoning optimises the wrong thing.

**The frame is a gauge.** Its 56 cells are identical face-down backs carrying one
fact between them — how much wall is left — and it is drawn behind everything at
`z-index: -1` with `pointer-events: none`. A tablet's extra pixels spent on it make
the *background* louder while the hand and the discards are what a player reads.
Scaled up it also read as the most prominent thing in the well, competing with the
discard at its centre.

So the rule this pass settles: **extra space goes to what carries information, in
proportion to how much it carries.** Hand and own discards first (13 tiles you act
on, and the furiten record), then the opponents' rivers, then the last discard
(one tile, but the one a claim turns on). The wall stays a texture at every size.

A side effect worth having: leaving the frame at 352px gives the well back
77–128px of free height on tablets (231px at 768, 282px at 810, against 103/154px
with the frame scaled), which is room the next thing to want it can have.

### Result

| Viewport | Hand box/art | Hand slack | Tray art | Last discard | Wall |
|---|---|---|---|---|---|
| 320×568 | 21 / 27.2 | 9 | 32 (side 24) | 40 | 123 |
| 390×844 | 26 / 33.6 | 9 | 32 | 56 | 190 |
| 430×932 | 28.9 / 37.3 | 9 | 32 | 56 | 228 |
| 768×1024 | **53** / 68.4 | **9** | **40** | **80** | 352 |
| 810×1080 | **56** / 72.3 | **9** | **40** | **80** | 352 |
| 1024×1366 | **71.3** / 92 | **9** | **48** | **104** | 352 |

Phone rows are byte-identical to before. Every viewport passes the whole probe —
no overflow, no tile outside its tray, nothing under the readability floor, no wall
cell under the discard — and `pnpm e2e` is 12/12.

---

## 12. Where the tablet pass stopped

**Accepted, in the working tree and unverified only by a human eye:**

| | § |
|---|---|
| River wraps at six, two columns a side seat | 10.1, 3 |
| Across row compacted 227 → 117px (name + count + melds inline) | 10.1 |
| Side seats' name + count on one row (`HandCountChip orientation="count"`) | 10.1 |
| Side meld chips sideways | 10.1 |
| `--tile-w` proportional shrink below 600px tall | 10.2 |
| Side seats centred in their band, padding dropped | 10.5 |
| "Your discards" flush on its tray's top-left | 10.5 |
| Hand, tray and last-discard caps lifted on tablets | 11.1 |

**Rejected, with the measurement that killed each:**

| | Why | § |
|---|---|---|
| Side columns spanning the across band | Moved the squash to the across seat's axis (15.9px art at 320) | 5 |
| Wall lapped harder with corners closed | Thicker walls; interior 143 → 126px, top wall over the label | 10.7 |
| Wall frame shrunk to 70% | Interior 143 → 92px; 21 cells under the discard | 10.7 |
| Wall frame scaled up on tablets | Spends a tablet's pixels on a gauge drawn behind everything | 11.2 |

**Still open, both design calls rather than measurements:**

1. **A middle-ground wall lap** — `LAP = 0.35, TILE = 12.5` keeps 138px of interior
   and clears the label, at a corner gap of 5.8% instead of 1.7%. Two lines. Only
   worth it if the packed look matters more than the corners.
2. **Bot 3 un-compacted on tall screens** — its melds on their own line is a
   `min-height` media query; its declaration back above its tray needs a
   `matchMedia` hook, which the client has none of yet. Worth it only above
   390×844, where §10.6 measured 275–324px of free well.

**And one thing to do before committing:** `prototype-shots/` is ~10MB of PNGs
across six labelled runs. Keep `before/` and the last `after-*` for the record and
drop the intermediates, or drop the directory once it has been reviewed — the
findings are in this file, and the probe regenerates the images on demand.

**N39 is still the root cause** of everything in §1–§10: a tray tile's box shrinks
under `flex-shrink` while its art stays sized off `--tile-w`. §10.2 mitigates it
proportionally rather than fixing it. The fix is to compute the count from a height
that does not move when the count changes — the *row*, not the content-sized tray.

---

## 13. Fourth pass — the player's declaration joins their river (N40)

Phones only, at the owner's direction: *"our players are mostly on phone so let's
focus on that."*

### 13.1 The declaration was the last seat drawing it outside the tray

N38 moved the void declaration into the river for all three opponents and left the
player's own where N37 had put it — a centred row above the tray. So one seat of
four drew it differently, and that row cost the play column **~34px**: a 32px `sm`
tile plus `pt-0.5`.

It is the player's *first discard*. It now heads their river like everyone else's,
keeping the white glow that marks it as the one public statement. Nothing new was
needed for the lap: `.tile-lap .tile-void-discard { z-index: 2 }` has lifted a
declaration above the tile lapping it since N38, and this is the tray that rule was
written for.

Two things that had to hold and do. The discard-flight effect measures
`trayRef.current?.lastElementChild` to find where a tile in flight should land — the
declaration is *first*, so the last child is still the newest ordinary discard, and
the comment claiming as much is now true rather than stale. And a seat that declared
a suit it held none of never sets `firstDiscardIsVoid`, so `splitPile` returns no
head and the river is unchanged.

### 13.2 The side rivers already ran oldest-outward — now measured, not assumed

The ask was that Bot 2 and Bot 4 put their oldest column nearest the screen edge.
They already did, but nothing asserted it, and the two seats reach it by different
means — the left one by DOM order in a plain row, the right one by `flex-row-reverse`
— so it was exactly the kind of pairing that half-breaks silently. The probe now
reads it off the rendered boxes:

```
river=oldest-outer,oldest-outer      # all nine viewports
```

`riverEnds` compares the first and last `.tile-run-v` against the edge that tray sits
on, and flags `side river runs newest-outward`.

What *is* asymmetric between the two seats is the direction each column runs — the
left river downward, the right upward. That is N36 and it is load-bearing: the 22.5%
body band the lap hides sits on the art's right edge, which `rotate(90deg)` puts at
the bottom of the on-screen tile and `rotate(-90deg)` at the top. Running them the
same way laps one seat's tiles over ink. It is also correct from each seat's own
chair: sit at the right of a table facing the middle and the screen's bottom edge is
on your left, so that seat's river grows upward.

### 13.3 The freed height, and what it will not buy

`sideSlack` — the side column's height less its content, `gap-1` included — is the
new number, and it says where the 34px went:

| Viewport | side box/art | sideSlack | wellFree |
|---|---|---|---|
| 320×568 | 24/24 | 41 / 87 | 114 |
| 375×667 | 32/32 | 94 / 140 | 154 |
| 390×844 | 32/32 | 270 / 316 | 315 |
| 430×932 | 32/32 | 353 / 399 | 361 |

Mainstream phones already draw full-size river tiles, so on those the 34px became
slack. Only **320×568** is below the `max-height: 600px` shrink — every other phone
in the set is ≥640 tall — so that rule governs the iPhone SE 1st gen and nothing
else.

The obvious spend was to drop the shrink there and let the SE draw 32px tiles like
every other phone. Built, probed, reverted:

```
320x568   side=32/32   slack=2/48    ✅      # fits the state the probe reaches…
```

**2px.** A side meld chip is ~40px wide in an 80px column, so chips wrap two to a
row and a seat holding 3–4 melds takes a second ~46px row. The probe's worst case
carries one meld row; the tail carries two, and at 32px that tail overflows by ~44px
— N39 at full strength, a column of black outlines. At 24px the same tail overflows
by ~5px, which is a graze rather than a collapse.

So the shrink stays, and the honest way to read the win is on the tail rather than
the common case: **the SE's 4-meld worst case went from roughly −39px to −5px**,
because the 34px landed in the column that had none to spare.

Raising the tile size at 320 needs the meld row to stop being able to double. A
single non-wrapping scroller, as the across seat has, would cap it at one row and
make full-size SE tiles fit — with 2px to spare, which is too thin to ship without
also taking a size step down. Left open rather than guessed at.

### 13.4 Verification

`n40-declaration-in-tray/` is the current state, nine viewports, all ✅: no vertical
overflow, no tile outside its tray, no wall cell under the last discard, `box == art`
everywhere, and `oldest-outer` on both side seats. Typecheck clean; 222 client tests
and 620 overall passing; `pnpm lint` clean. `try-no-shrink-slack/` is the reverted
experiment, kept as the evidence for §13.3.

---

## 14. Fifth pass — the centre of the table (N41)

A design pass rather than a fitting one, and the only one in this document that
started from *looking* instead of from a measurement. Everything in §1–§13 asked
"does it fit". This asks what the board's most valuable area is spent on.

### 14.1 The hierarchy was upside down

The last discard is the one object on the board that stops play and asks a
question: every claim in the game turns on it, and the claim window is the only
moment where reading a single tile fast has a cost attached. It was drawn at
**2.5rem — 40px — on every phone 700px tall or shorter**, which is most of them,
against a hand tile's 42px cap.

So the tile a claim is decided on was the same size as one of the thirteen you are
merely holding, and it carried a caption naming it. Meanwhile the wall frame — 56
identical face-down backs carrying one fact between them, drawn at `z-index: -1`
(§11.2) — was the largest object in the well.

That inverts §11.2's own rule. *Extra space goes to what carries information, in
proportion to how much it carries.* The rule had been applied to the gauge and
never to the thing the gauge sits behind.

### 14.2 The caption paid for the tile

`play.lastDiscard` is now `sr-only`. The tile is alone at the centre of the wall's
mouth, amber-glowing, and scales in as it lands — three signals that all say
"this is the tile just thrown", so a fourth in words was repetition, and it
occupied the one spot on the board the eye reaches first.

That is 16px of text and a 4px gap. The tile grew by 16–24px. **The group's
footprint is within ~4px of what it was**, so nothing below had to move: this is a
reallocation inside the well, not a claim on anyone else's height.

### 14.3 The rungs belong on width, and the first attempt put them on height

The ceiling is physical rather than typographic: the frame's interior is where a
thrown tile lands on a table, so the tile grows until it would touch a wall and
stops. `overDiscard` in the probe counts wall cells intersecting the tile's box and
is the guard.

The first ladder reused the existing `max-height: 700px` breakpoint and the probe
rejected it immediately:

```
320x568   ❌ 14 WALL CELLS UNDER DISCARD
390x844   ❌  7 WALL CELLS UNDER DISCARD     # 5rem
414x896   ✅                                # 5rem, 24 more px of width
```

390×844 is a *tall* phone — 315px of free well, the most of any phone in the set —
and it failed where a shorter 414×896 passed. The mouth is as wide as the well, and
the well is `viewport − two 80px side columns − the gaps`; its height is whatever
flex leaves over. Width was the only axis that ever mattered. The height rung is
gone with the caption that made the group tall, and the probe reads no vertical
overflow at any size.

| Width | Tile | Was |
|---|---|---|
| < 360 | 2.5rem | 2.5rem |
| ≥ 360 | 3.5rem | 2.5rem |
| ≥ 390 | 4.5rem | 2.5rem |
| ≥ 414 | 5rem | 3.5rem |
| ≥ 768 | 6rem | 5rem |
| ≥ 1024 | 7.5rem | 6.5rem |

### 14.4 The void label was pushing the hero off-centre

With the ladder fixed, 320×568 still failed — by **0.3px**, five top-wall cells
grazed by the tile's top edge. Not a rounding artefact worth a tolerance: a real
composition fault the tight viewport exposed first.

`Void: 条 Tiáo` was a sibling of the tile inside the well's `justify-center`
column, so its ~20px pushed the tile 10px above the well's centre. The wall frame
is centred on that same axis, so the one tile that should sit dead centre in the
mouth was riding up into the top wall on every viewport — 320×568 was just the
only one where the mouth was tight enough to prove it.

It is now pinned `bottom-1 left-2`, which also reads better: it is ambient chrome,
a standing reminder of your own declaration, and it now pairs with the history
button in the opposite corner. **The well's corners hold chrome and its centre
holds the live tile.** `max-w-[60%] truncate` keeps the two apart at 320.

### 14.5 What was considered and not built

- **The claim countdown as a ring on the tile itself.** On a table the clock *is*
  the tile sitting there unclaimed, and it would fold two elements into one. It
  touches the claim flow and `viewport.spec.ts`'s claim-bar guard, which is more
  than a layout pass should move. Worth doing on its own.
- **Filling the well's dead height.** 315px of free well at 390×844 is the largest
  single void on the board, and it cannot be spent from inside: the frame is
  width-bound at `min(96%, 22rem)`, and every tile in the middle row is width-bound
  too. Spending it means changing how the three rows divide the screen, not
  changing anything in the well. Open.

### 14.6 Verification

`n41-centre-composed/`, nine viewports, all ✅ — no vertical overflow, no tile
outside its tray, **no wall cell under the discard**, `box == art` everywhere, and
`oldest-outer` on both side seats. Typecheck clean; 620 unit tests; lint clean.
`n41-centre-hierarchy/` and `n41-width-rungs/` are the two rejected ladders, kept
as the evidence for §14.3.

`pnpm e2e` **12/12**, batched across N40 and N41 — including the `se-portrait`
vertical-overflow guard and the four `ui-clicks` viewports, which is the coverage
that matters for a change inside the well. A local pass is weak evidence for the
layout guards (CI has less slack), so poll the run after pushing.

---

## 15. Sixth pass — the declaration stands out of the lap, and both rivers read (N42)

### 15.1 The declaration is set apart, not stacked on top

It was lapped like any other discard and given `z-index: 2` so the neighbour's
22.5% bleed did not eat its glow. That is a fix for the symptom: it reads as one
tile lying *on top of* the pile rather than as the pile's first tile, set apart.

The bleed is cancelled instead. The tile after the declaration takes a positive
margin in place of the negative one, so a hair of felt shows between them:

| Lap | Rule |
|---|---|
| Horizontal (own tray, across) | `.tile-lap .tile-void-discard + .tile { margin-left: calc(var(--tile-w) * 0.225 + 0.15rem) }` |
| Vertical, left seat | `.tile-lap-v .tile-void-discard + .tile-sideways { margin-top: 0.15rem }` |
| Vertical, right seat | `.tile-lap-v-up .tile-sideways + .tile-void-discard { margin-bottom: 0.15rem }` |

The right seat's selector is inverted because its column is fed newest-first
(§15.3), which makes the declaration that column's *last* child.

`0.225 × --tile-w` and not `29.032%`: the art's overhang is a percentage of the
**pitch**, and `--tile-w` is the whole tile. Same length, two different bases —
the kind of pair that looks interchangeable and is not.

### 15.2 A ring, because the box is finally the tile

`.tile-mark` has carried a comment since the void screen shipped: *the void screen
spaces its tiles, so the box here is the whole tile, not a pitch*. That is exactly
why a tray declaration could never have one — a ring on a pitch-wide box sits
narrow and offset, which is why it got a soft `drop-shadow` glow instead.

Standing it out of the lap removes that constraint, so the declaration is now
marked the way the void screen marks a tile: a 2px white ring on an `inset: 0`
pseudo-element, `border-radius` matched to the art's corner. Three rules make the
box the tile — `aspect-ratio: 210/255`, `width: var(--tile-w)`, and the art's
`margin-left: 0` — and they have to change together or the tile draws pitch-tall.

The corner radius swaps by orientation (`18.1% / 14.9%` upright, `14.9% / 18.1%`
sideways): a turned tile's box is 255×210, and one value would give an ellipse on
whichever it did not suit.

**The well's "Void: 万 Wàn" line is gone with it.** The ringed tile at the head of
your own river names the suit by showing it, in the place a table makes the
statement. One case loses it: a seat that declared a suit it held none of never
flips a declaration, so `firstDiscardIsVoid` stays false and no tile is drawn.

### 15.3 Both rivers now read the way text does

The right seat's oldest tile sat **bottom-right** — mirrored on both axes — so a
glance that starts where reading starts landed on its newest column. Both rivers
now run oldest at the top-left, growing down then right.

The mirror was not decoration, and this is the trap worth remembering:
`.tile-lap-v-up` is `column-reverse`, and that is what puts the later sibling
*above* its neighbour — the only paint order that covers the 22.5% band rather
than the ink once `.tiles-face-left` turns the art the other way (N36). **The
direction is load-bearing; the order it implied was not.** Feeding that column
newest-first inverts the visual order back to reading order and leaves every lap
byte-for-byte where it was. No z-index, no second lap rule.

Two smaller things fell out of it:

- `flex-row-reverse` is gone from the tray, so columns run oldest-leftmost for
  both seats. This **supersedes** the earlier "oldest nearest the border" rule
  (§13.2) for the right seat, where border and reading order point opposite ways.
- `justify-end` on the right seat's column. `column-reverse` puts main-start at
  the bottom, so a *partial* column packed from the tray's floor while the left
  seat's grew from its ceiling. The first probe pass missed this — the oldest cell
  was correctly top-left, so the reading check passed while the newest column
  visibly hung. `riverEnds` now also requires every column to share a top.

### 15.4 One back beside the count

`×10` beside a name is a number with no noun — it could as easily be a score or a
seat. A single 0.75rem back says *tiles* in the width of a glyph, on the same row
as the name, so the trays keep every pixel N38 won them.

It cost the name 15px of an 80px row and truncated "Bot 2" to "Bo…" — **N7's shape
for the fourth time**: a `flex-shrink-0` control beside one shrinkable sibling,
nothing erroring, the text simply rendered narrower than it needs. Found by
looking at a screenshot, again, not by a guard. The row's `gap-1` → `gap-0.5` and
the name pill's `px-2` → `px-1.5` give back 5px without touching a glyph.

### 15.5 A guard that caught only itself

The first probe run after this flagged `across squashed 32/32` on all nine
viewports. It was measuring `t.querySelector('.tile')` — which is now the
declaration, the one tile in a tray deliberately built with a whole-tile box
rather than a pitch. `:not(.tile-void-discard)` fixes the measurement; the layout
was never wrong. Worth recording because the flag was unanimous and looked like a
real regression.

### 15.6 Verification

`n42-river-reading-order/`, nine viewports, all ✅ — `river=reading,reading`
everywhere, no vertical overflow, no tile outside its tray, no wall cell under the
discard, `box == art` on every ordinary tray tile. The flush gaps cost the side
columns ~8px of slack (41/87 → 33/79 at 320×568), which the budget carries.
Typecheck clean; 620 unit tests; lint clean; `pnpm e2e` **12/12**.

`n42-flush-declaration/` is the run with the false `across squashed` flag and
`n42-flush-declaration-v2/` the same build measured correctly; `n42-name-fit/` is
the one with "Bo…" truncated. All three kept as evidence.

---

## 16. Seventh pass — the across seat, and a declaration that was not there (N43)

Three reports, one measurable, one not, and one that turned out to be an engine
bug rather than a layout one.

### 16.1 Measure first: where each declaration actually sits

Two of the four trays reach their order through a rotation or a mirroring, so
"which end is the declaration at" cannot be read off the DOM. `declPos` in the
probe reports it from rendered boxes, per tray, as a corner:

```
before   decl=flat:RB, side:LT, side:LT, flat:LB
after    decl=flat:LB, side:LT, side:LT, flat:LB
```

That settled two of the three reports at once. **The across seat was genuinely
wrong** — declaration at the far right, its river reading right-to-left. **Both
side seats already measured `LT`** on all nine viewports, so whatever was showing
a side declaration in a bottom row was not this build; the most likely cause is a
server still serving the bundle it booted with, which is the `@fastify/static`
trap in CLAUDE.md.

`T`/`B` is only meaningful for the side trays. A one-row tray has vertical padding
symmetric about its tile, so the fraction is exactly 0.5 and lands on `B` — which
is why both `flat` entries read `B` in a correct build.

### 16.2 The across seat: reverse the cells, keep the turn

Its tray is `rotate-180` (N32), which is what makes those tiles face their owner.
A rotation reverses what it contains, so age order in the DOM came out
right-to-left on screen.

Feeding the cells newest-first lets the rotation put them back — **the same trick
the right-hand seat uses for its `column-reverse` (§15.3), and for the same
reason: the turn is load-bearing, the order it implies is not.**

The lap survives untouched, which is worth spelling out because it looks like it
should not. Each tile's art is right-aligned in its box and hangs `bleed` to the
left; the rotation maps that overhang to the right, so a tile still covers exactly
the 22.5% body band of its neighbour — only *which* neighbour changes. Verified in
the screenshot rather than argued: no ink is covered at any size.

Two consequences: `+N` moves to the end of the DOM (the rotation puts it on the
left, which is the old end), and the declaration becomes the tray's *last* child,
so `.tile-lap .tile-void-discard + .tile` no longer matches it. Its gap comes from
a `margin-left` on the declaration itself — pre-rotation that is the side facing
the run, post-rotation it is the gap on its right. Where the declaration leads
instead, that margin is 2.4px at the start of a run, which nothing can see.

### 16.3 The ghost — and the engine bug under it

The ask was a faint tile for the case where a seat declares a void suit it holds
none of, so nothing is ever set aside and the river never states the declaration.
Chasing the second half of it — *"or if it gets punged/konged"* — turned up
something worse.

`takeClaimedDiscard` splices a claimed tile out of its owner's pond (A15). And
`firstDiscardIsVoid` was derived as:

```ts
!p.usedIndicator && p.pendingFirstDiscard === null && p.discards.length > 0
```

which says nothing about *which* tile — it points at `discards[0]`. So a
declaration that gets punged or konged does not merely vanish: the seat's **next**
discard is promoted into their public declaration and rings for the rest of the
round. Wrong information about a public fact, and it survives to the round end.

`PlayerState.voidDiscardTile` records the tile at the flip and is never cleared,
so the flag can mean what it says:

```ts
firstDiscardIsVoid: p.voidDiscardTile !== null && p.discards[0] === p.voidDiscardTile
```

No new field crosses the view boundary, so there is no redaction decision — the
declaration was already public through `discards[0]`, and this only stops it being
claimed by a tile that is not it. Guarded in
`packages/engine/tests/first-discard.test.ts`.

With that correct, both of the user's cases collapse into one client condition:
**no declaration in the river and a void suit is known.** Rank 1 of the suit at
`opacity: 0.3`, ringed, at the head of the river — it stands for the suit, not for
a tile that was thrown, and the transparency is what stops it being read as one.

Your own zone only. `voidedSuit` is yours to know; an opponent's is public solely
through the tile they flipped (A40), so once that tile is claimed away there is
honestly nothing left to draw for them.

### 16.4 Verification

`n43-across-reading-order/`, nine viewports, all ✅ — `decl` reads `L` for all four
trays, `river=reading,reading`, no overflow, no tile outside its tray, no wall cell
under the discard.

The ghost needs a state the fixed seed does not produce, so it was verified by
forcing the condition on, shooting, and reverting: `tmp-ghost-forced/` is that
build, and the faint 1-sou at the head of "Your discards" is what it draws. The
committed condition is `!head && voidedSuit !== null`.

Typecheck clean; **621 unit tests** (232 engine, 222 client, 167 server — one new,
for the claimed declaration); lint clean; `pnpm e2e` **12/12**.

---

## 17. Eighth pass — every river is your own, turned to its chair (N44)

N42 and N43 both got this wrong, in the same way and for the same reason: they put
all four rivers in the **viewer's** reading order. A table does not work that way.
Each seat lays tiles out from their own chair, and what you see is that layout
rotated into their position.

### 17.1 The rule, and every axis that follows from it

Yours runs left-to-right and wraps downward — **along your right hand, then toward
you.** Rotate it into the other three chairs:

| seat | faces | a row runs | rows wrap | so the oldest tile is |
|---|---|---|---|---|
| you | up | → rightward | ↓ toward you | top-left |
| left | right | ↓ downward | ← leftward | top of the **rightmost** row |
| right | left | ↑ upward | → rightward | bottom of the **leftmost** row |
| across | down | ← leftward | ↑ upward | the **right** end |

Two separate mistakes had been sitting on top of each other. N42/N43 imposed the
viewer's reading order on all four. And *before* those, the wrap direction was on
the wrong sides — the left seat grew rightward and the right seat leftward, when a
river grows toward its owner. Reverting N42/N43 alone would not have fixed it;
the left seat needed a `flex-row-reverse` it had never had.

**Which axis was ever free is the part worth keeping.** A row's *direction* is
fixed by the art and always was: `rotate(90deg)` puts the body band at the bottom
of the left seat's tiles so its rows must run down, `rotate(-90deg)` puts it at the
top of the right seat's so theirs must run up (N36). Both already did. Only the
*wrap* was free, and it is one `flex-row-reverse`. Three passes were spent
mirroring cell arrays that never needed mirroring.

The across seat, likewise, is just its own age order under a 180° tray — which is
what it had before N43 reversed it. It never wraps (`TOP_TRAY_CAP` is 9 in a
full-width zone), so the "rows stack upward" half of the rule has nothing to act
on there.

### 17.2 The probe reads corners now, not order

`riverEnds` used to assert "oldest is top-left" for both side seats, which is
exactly the wrong assertion. It now reads the corner of `data-river-first` and
checks it against the chair: `RT` for the left seat, `LB` for the right. `declPos`
does the same for all four trays. A green run reads:

```
decl=flat:RB, side:RT, side:LB, flat:LB    river=seated,seated
```

The `B` on the two `flat` entries is not a finding — a one-row tray has vertical
padding symmetric about its tile, so the fraction is exactly 0.5 and lands on `B`.

### 17.3 Making the probe fast, and the four ways it lied first

The sweep ran ~2 minutes. It now runs in **~40s**, and the speed was never the
interesting part — four of the five changes were correctness.

- **Wait on the phase, not the clock.** `waitForTimeout(3200)` then `(2200)` were
  sized for the dice animation plus three bots declaring at 150ms. `getPhase()` is
  what the app is actually waiting on.
- **Three viewports at once.** Not nine: each opens a practice room, and the
  server has a concurrent-games ceiling and a per-IP limit that nine lobbies walk
  into.
- **`--bot-delay 120`, not 0.** Zero was tried. The board then moves faster than
  the probe can photograph it and every shot came back as the next round.
- **Wait for the deal's dice to clear.** This is the one that mattered. The
  overlay is `pointer-events-none` and *the game plays on underneath it*, so the
  phase says nothing about whether it is up — the two fixed sleeps had been
  paying for it without ever saying so. Removing them produced nine shots of a
  live board under a seating roll, and the measurements were all green, because
  the board behind the overlay was real. N25 found the same thing about the e2e
  specs: the assertion has to be that it is *gone*.
- **One "board at rest" predicate before shooting.** No dice overlay, no tile in
  flight, and the last discard's transform back at rest. That last clause is not
  cosmetic: the discard enters at `scale: 1.4`, a scale moves
  `getBoundingClientRect`, and measured mid-entrance it reported **14 wall cells
  under the discard** on three viewports — a real number about a frame that
  existed for 300ms. `offsetWidth` ignores transforms, so comparing the two is an
  exact test for "scale is 1".

The two flight overlays now carry `data-tile-flight` rather than being found by
their Tailwind classes, per the rule in CLAUDE.md that a class rename has broken
four projects over.

**The general lesson, which cost four spoiled runs:** a probe that waits is a
probe waiting for the round to end. Every wait here is now either a wait on a
condition the app publishes, or bounded and justified.

### 17.4 Verification

`n44-final/`, nine viewports, all ✅ — `decl=flat:RB,side:RT,side:LB,flat:LB` and
`river=seated,seated` everywhere, no overflow, no tile outside its tray, no wall
cell under the discard. Confirmed by eye at 375×667: the across seat's declaration
at its right end, the left seat's at the top of its rightmost column, the right
seat's at the bottom of its leftmost, yours at the left.

`n44-seated-rivers/` through `n44-seated-rivers-final2/` are the six spoiled runs,
kept because each one names a different way this probe could lie.
