# Mobile viewport audit — where the board runs off a phone

**Measured:** 2026-08-01 · `main` @ `aa3c47f`
**Method:** Chromium via Playwright device profiles; `document.documentElement.scrollHeight`
vs `window.innerHeight`, CSS px. Screens driven through a real practice game.

25 screen-and-device combinations measured. **10 overflow.** No screen on any
device overflows horizontally.

---

## Measurements

Document height in CSS px; `+N` is how far past the fold. Play is the **peak
sampled every turn across a full round**, not one moment — the board grows as
the discard trays fill.

| Device | Viewport | Landing | Huan | Void | Play (peak) | Round end |
|---|---|---|---|---|---|---|
| iPhone 14 portrait | 390×664 | 664 | 664 | 664 | 698 **+34** | 826 **+162** |
| iPhone SE portrait | 375×568 | 592 **+24** | 568 | 568 | 697 **+129** | 984 **+416** |
| iPhone 14 landscape | 844×340 | 592 **+252** | 364 **+24** | 340 | 667 **+327** | 1123 **+783** |
| iPad portrait | 810×1080 | 1080 | 1080 | 1080 | 1080 | 1080 |
| iPad landscape | 1080×810 | 810 | 810 | 810 | 810 | 1020 **+210** |

Viewports are Playwright's device profiles, which model a **browser tab with its
chrome visible** — an iPhone 14 reports 390×664, not 390×844. Installed as a PWA
there is no chrome, so the real budget is taller and portrait play fits
comfortably. Don't over-correct for the tab figures.

**The iPhone SE row above is 375 wide, and Playwright's `devices['iPhone SE']` is
320.** Every figure in this document — the row budget, the R2.3 side-column
numbers, the 0px-at-peak result — was measured at 375×568 by the throwaway harness
described under [Reproducing](#reproducing). The `se-portrait` CI project uses the
device descriptor, so it asserts 55px narrower than anything here was tuned for.
That gap is what R6 fixed; read any width-sensitive number below as a 375px one.

---

## What needs a decision

*Answers proposed in [Recommendations](#recommendations) below — R1/R2 for
question 3, R3 for question 2, R4 for question 1.*

### 1. Landscape phone has no layout of its own — *highest severity*

Every screen overflows in landscape; play needs ~2× the viewport height and
round end 3.3×. This is structural, not tuning. The board is a vertical stack —
opponent across the top, two opponents down the sides, your hand at the bottom —
which is right for a tall narrow window and wrong for 844×340, where there is
width to spare and almost no height.

Landscape is currently playable only by scrolling, which moves your own hand off
screen exactly when you need to tap it.

**Question:** is landscape worth supporting? If yes it wants a genuinely
different arrangement rather than the portrait stack compressed — the wide
viewport could put all three opponents in a row across the top and pin the hand.
If no, the honest move is to detect landscape and prompt to rotate.

### 2. Round end is the worst screen on every device

It overflows on all five profiles, including iPad landscape. It stacks four
expandable result rows, then four match-total rows, then two buttons; an expanded
row shows that seat's revealed hand, fan list and itemised payments.

Scrolling a *results* screen is much more acceptable than scrolling the board, so
this may simply be fine. But the winner's row opens by default, which pushes the
buttons down: on an iPhone SE the two primary controls sit 416px below the fold.

**Question:** should the round-end actions be pinned to the bottom of the
viewport instead of sitting at the end of a long scroll? And should the winner's
detail be open on arrival, or collapsed with the scoreline first?

### 3. Portrait play fits, with nothing to spare

The board lands ~5% over an iPhone 14's viewport and ~23% over the smaller SE.
That came from replacing each side opponent's thirteen individual tile backs with
a short overlapped stack plus a count — the old version was 687px of the total on
its own (see the row budget below).

The remaining height is real content, not slack. There is no obvious next
reduction that doesn't cost information.

**Question:** the smallest phones still need ~130px. Candidates are a denser
discard tray, a shorter across-opponent zone, or folding the score strip into the
top bar. Which is least costly to the read of the board?

**Answered by R7:** all three of those, and none of them cost information. The
denser tray came from removing the gaps rather than truncating (9 tiles a row at
320px instead of 8), the shorter across zone from overlapping its hand-count stack
sideways (61px → 39px), and the score strip had already folded into the top bar in
R2.1. What measuring found was that the question's premise was incomplete: the
hand was 19.1px wide, under this document's own readability floor, so the gaps were
costing legibility as well as height.

---

## Play screen row budget

Measured on iPhone 14 (390×664), before and after the side-opponent change:

| Row | Before | After |
|---|---|---|
| Top bar | 42 | 42 |
| Score strip | 20 | 20 |
| Opponent across | 130 | 130–180 |
| **Middle row** (side opponents + well) | **687** | **237** |
| Your melds | — | 52 |
| Your discards | 119 | 119 |
| Hand + Sort | 100 | 100 |
| **Total** | **1098** | **664–698** |

The middle row's height was exactly a side opponent's hand drawn as 13 separate
tile backs. That is the whole reason the board didn't fit.

---

## Constraints a redesign has to respect

- **Your own discard tray must show the full history.** Furiten — whether you may
  win on a discard — is decided by what you have already discarded. Truncating it
  removes information the player needs to reason about their own hand.
  (`packages/client/src/screens/Game.tsx`, "Your discards")
- **Tile art is fixed-aspect SVG** (210×255, `packages/client/public/tiles/`).
  Tiles scale but can't be reproportioned, and below roughly 24px wide the suit
  markings stop being readable.
- **Tap targets are 40px minimum** across all chrome, set during the
  accessibility pass (F15). Shrinking controls to buy height would undo that.
- **Opponent hands are public only as a count.** Their concealed tiles are never
  sent to the client (`PublicPlayer.handCount`), so any representation is free to
  be as compact as it likes — it is drawing a number, not tiles. This is where the
  687px → 237px win came from and there may be more of it.
- **Entrance animations must not animate opacity.** A past bug (F11) left the
  round-end scoreboard invisible wherever the animation didn't run.
- **`prefers-reduced-motion` is honoured** (F12) — any new motion needs the same.
- **The app installs as a PWA**, so the installed viewport is taller than the
  figures above.

---

## Status

**All of R1–R7 shipped on 2026-08-01** (R1–R5 on branch `viewport-remediation`;
R6 after CI showed the R5 guard red; R7, the tile-density pass, answers question 3
below). Measured result at 375×568: the play screen's scroll container overflows by
**0px at peak across a round**, down from +129px, verified over 209 samples
spanning three rounds including 41 with the melds row present. R6 makes that hold
at 320×568 too, and bounds it by construction rather than by tuning; R7 then buys
the height back at source and takes the hand from 19.1px to 22.7px wide. Round end
still scrolls, by design, but its controls are pinned and reachable at every
scroll position. Landscape phones get a rotate prompt rather than an unusable
board. **R4 Phase 2, a real landscape layout, is shelved** — see the reasons
recorded under R4.

Two things the batch changed that are worth knowing: the landscape `ui-clicks`
e2e run now asserts the rotate overlay instead of tapping a board that R4
blocks, and `docs/round-end.png` is captured at the viewport rather than
fullPage, because fullPage renders a sticky bar floating mid-image.

---

## Recommendations

**Added:** 2026-08-01; revised the same day after measurement feedback on the
first draft. The agreed batch: **R1 paired with the extended R2.3, R3 with
winners left open, R4 Phase 1 only, R5 last** so the CI guard locks in
whatever the earlier items ship. R4 Phase 2 is explicitly out of this batch.

### R1. Play screen: fit the board to the viewport, let the well flex

The first draft of this item had the mechanism wrong, and measurement caught
it. The middle row is a horizontal flex row of three siblings — left side
column, well, right side column — so the row's height is the *max* of the
three, and the side columns set it every time: 687/687 before the
side-opponent change, 293/293 after, 281/281 on an SE (row height vs side
column, identical to the pixel). The well's own content needed 16px at the
sample caught. So flexing the middle row squeezes the well — which already
has room — and the row bottoms out at the side column regardless. **R1 only
delivers once the side columns shrink, which is R2.3's job; the two land
together or not at all.**

With that correction:

- Root becomes `h-dvh` with `overflow-y-auto` kept as a fallback, so anything
  genuinely impossible degrades to today's scrolling instead of clipping (the
  F13 fix stays honoured).
- The root stays flexbox: the middle row gets `flex-1 min-h-0`. (The first
  draft specified `minmax(0, 1fr)` — grid syntax on a flex root.)
- Inside a compressed well, the event feed drops to a single line under a
  short-viewport media query. The first draft said the feed would "scroll
  internally"; it is `pointer-events-none`, so internal scroll would be
  unreachable — one line is the honest squeeze. The last-discard tile drops
  `lg` → `md` under the same query.
- The guarantee is unchanged — hand, own discard tray, and action buttons
  unconditionally visible without scrolling — but it is R1 + R2.3 together
  that delivers it, not R1 alone.

### R2. Portrait height reclamation, cheapest first

1. **Fold the score strip into the top bar (−20px).** Replace the four-name
   strip with a single `You +12` chip in the top bar; tapping it opens the full
   four-player table as a dropdown overlay. The strip is glanceable-but-rarely-
   glanced information and the overlay keeps it one tap away. No information is
   lost and the top bar has room: the turn indicator already truncates.
2. **Across-opponent hand backs → stack + ×N chip (−~35px at full hand).** The
   side opponents already proved this: thirteen shrink-to-fit backs draw a
   number the server gives us directly (`PublicPlayer.handCount`). Use the same
   overlapped-stack-plus-count as `OpponentSide`. The F4 clipping concern
   disappears with the backs.
3. **Cap opponents' discard trays at one row — all three opponents.** The
   first draft's heading said "opponents' discard trays" but its parenthetical
   said "across opponent only"; the sides are the higher-value half and are
   included. The side trays wrap inside their 80px columns — `slice(-6)` at
   two `sm` tiles per row is three rows, ~120px — and with melds they account
   for roughly 200px of the 281px side column on an SE. That column is what
   pins the middle row's height (see R1), so capping the side trays is where
   the portrait overflow actually gets spent. All three opponent trays show
   the most recent discards in a single non-wrapping row; on a side column a
   row is two tiles, which is acceptable because the discard that drives
   claims is also rendered large in the well. Your own tray stays full and
   wrapping — furiten depends on it. If the tray cap alone doesn't shrink the
   side column enough, melds are the remaining contributor and a compact
   side-column meld display is the next lever — measure after the cap before
   reaching for it.

R2.1 and R2.2 shrink fixed rows by ~55px; R2.3 is what lets the middle row
fall. On the SE measurements the middle row carries ~265px of side-column
height above what the well needs (281 vs 16) — that is where the 129px
overflow actually lives, and the flexible well then buffers the rest.

### R3. Round end: pin the actions, trim the chrome — winners stay open

The measured worst case (SE, buttons 416px below the fold) is not a content
problem — it is that the two primary controls sit at the end of a long scroll.

- **Pin the action bar.** `sticky bottom-0` on the button block with a felt
  gradient backdrop. Reachable from any scroll position, zero content changed.
  This alone resolves question 2's first half.
- **Winners stay open.** The first draft of this item proposed arriving with
  all rows collapsed, flagged as a taste call. That reverses a deliberate,
  already-shipped decision — expandable rows with the winner open by default —
  and a reversal like that deserves its own discussion, not a ride-along in a
  viewport fix. Rejected for this batch: the pinned bar fixes reachability on
  its own, so the two were always separable.
- **Two columns from `sm` up.** The four result rows form a `grid-cols-2`;
  iPad landscape's +210 mostly disappears. Match totals likewise.
- **Trim ceremony on short viewports:** trophy `text-5xl` → `text-3xl`,
  `gap-6` → `gap-3` under a `max-height: 480px` query.

Scrolling a results screen is acceptable, per the audit — the goal here is
only that the *controls* never scroll.

### R4. Landscape phone: Phase 1 now, Phase 2 later and measured

Recommendation on question 1: **yes, support it, but in two phases.** The app
installs as a PWA where landscape is a first-class orientation, and iPad
landscape already has its own overflow above — "prompt to rotate" is a
stopping point, not an answer.

**Phase 1 — rotate prompt (tiny; in this batch).** Under
`@media (orientation: landscape) and (max-height: 480px)`, show a full-screen
"rotate to portrait" overlay during play. Honest, cheap, ends the
scroll-away-hand trap today.

**Phase 2 — a real landscape layout. SHELVED 2026-08-01.** Not scheduled. The
sketch below is kept because it is a reasonable starting point, but four things
have to be answered before anyone builds it:

1. **The budget is vertical only, and the horizontal one does not close.** The
   opponent strip puts three opponents in one row "with melds inline". Melds
   render at `sm`, so a pung is ~100px wide and a kong ~134px. Three opponents
   with two pungs each is ~600px of melds before names, turn glows and counts —
   against an 844px viewport. A kong-heavy round, where each player can hold
   four melds, runs past 1500px. `e2e/ui-clicks.spec.ts` fails on horizontal
   overflow, so this is a hard CI failure rather than a visual squeeze.
2. **16px of vertical headroom is not a margin here.** 324 against 340 is 5%,
   and every estimate in this audit has come in worse than predicted: the play
   screen was estimated at ~135px over and measured 310px, then 434px at peak,
   and R1's own stated mechanism was wrong until measured.
3. **The composition abstraction does not exist.** R2.1 extracted the zones,
   which was the prerequisite, but there is still one `PlayPhase` rendering one
   arrangement. Phase 2 means layout selection plus a second arrangement over
   shared zones, and the implementation note below rules out the shortcut.
4. **It may be unnecessary.** The manifest declares no `orientation`. Declaring
   one would stop landscape arising in an installed PWA — which is the case this
   recommendation leans on. The catch is that manifest orientation is app-wide,
   so it would also pin iPads, which measure clean in landscape today; a runtime
   `screen.orientation.lock()` gated on screen size could pin phones only, at the
   cost of a JS path and patchier support.

If it is picked up, de-risk it by building the opponent strip alone against a
kong-heavy state and measuring both axes before committing to the rest of the
layout. That strip is what the whole budget rests on and is the most likely to
break.

Sketch for 844×340:

- **Top bar (40px)** absorbs the score chip from R2.1 — it is the only chrome
  row.
- **Opponent strip (~64px):** all three opponents in one row across the top as
  compact chips — name, turn glow, ×N count, melds inline. No tile backs
  anywhere; this is the R2.2 trick applied to all three, and it is what makes
  the height budget close at all.
- **Well (~110px, flexes):** last discard + event feed centre, with the three
  opponents' single-row discard trays fanned around it — discards sit in front
  of each seat, like the real table.
- **Your zone, pinned bottom (~110px):** your melds, then your discard tray as
  one horizontally scrolling row (full history preserved; sideways scroll
  inside a tray is fine — it is not page scroll), then the hand with Sort
  inline. Hand tiles stay ≥ 40px wide, inside the F15 tap-target rule.

Budget: 40 + 64 + 110 + 110 ≈ 324 ≤ 340 — vertical only, and see point 1 above
for why the horizontal budget is the harder problem.

**Implementation note for R1, and for Phase 2 when its turn comes:** extract
the play-screen zones into components (top bar, opponent chip, well, own
zone) and compose layouts from them. The game logic, gestures, and
legal-action wiring live in the shared components; only arrangement differs.
Forking `PlayPhase` into two near-copies is the failure mode to avoid.

### R5. Guard vertical overflow in CI

`e2e/ui-clicks.spec.ts` fails on sideways scroll but nothing watches vertical,
so the next row added to the board would quietly reopen this audit. Lands last
in the batch, so it locks in whatever the earlier items actually ship.

The first draft of this item specified `scrollHeight ≤ innerHeight` on both the
play screen and round end, on an iPhone SE. Implementation found that wrong in
two ways, and the shipped guard differs:

- **Play must fit — but not measured on the document.** R1 makes the root
  `h-dvh` with `overflow-y-auto`, which moves overflow off the document and into
  the element. `documentElement.scrollHeight` becomes a constant, so the printed
  assertion would have passed no matter how badly the board overflowed. The
  guard asserts on the scroll container: `el.scrollHeight <= el.clientHeight`
  for `.board-felt`, peak-sampled across a full round.
- **Round end does not promise to fit.** This document says plainly that
  scrolling a results screen is acceptable; asserting it fits would fail by
  design. What R3 promises is that the two controls stay reachable, so that is
  what is checked — the "Next Round" button's box is inside the viewport both on
  arrival and scrolled to the bottom.

Shipped as `e2e/viewport.spec.ts` on an `se-portrait` project. Verified capable
of failing: a 160px spacer injected into the play screen produces a 98px
overflow and a named failure.

### R6. Make the play screen fit 320px, and bound it by construction

**Added and shipped 2026-08-01, after R5's guard came back red in CI** on all
three runs following it (+42px, +42px, +95px) while passing locally every time.
The guard was right; two things were wrong behind it.

The first is the width. Everything measured for R1–R5 was 375 wide (see the note
under [Measurements](#measurements)); `devices['iPhone SE']` is 320. At 320 the
own discard tray holds 8 `sm` tiles a row against 10, so a full round wraps to a
third 41px row, and the across opponent's melds — three pungs at ~300px against
296px of usable width — wrap onto a second 47px row. 41 and 41+47 are the two
CI numbers.

The second is that neither row had a height bound, so whether a CI run went red
depended on how far its random game got. The rest of the play screen had nothing
left to give: rows summed to 559 of 568 with the middle row already at 30px.

- **The own discard tray is the row that absorbs pressure.** `min-h-0` on the row
  and an internal scroll on the tray, so once the well is at zero the tray gives
  up rows rather than the container overflowing. It shows every row the viewport
  can afford and keeps the rest one scroll away, so the full-history constraint
  holds — this is truncation-free, unlike an opponent's `slice(-6)`.
- **The across opponent's melds are one scrolling row.** Same treatment as the
  tray directly below them, with `w-max mx-auto` inside the scroller so they stay
  centred while they fit; centring the scroller instead would put the leftmost
  meld permanently out of reach.
- **The guard reports the row heights it saw at the peak.** CI uploads no
  Playwright artifacts, so the number on its own left nothing to diagnose from.

Verified with the same spacer probe as R5, run against the live play screen: 200px
of injected spacer now produces 0px of overflow, with the tray shrinking 89px →
10px to pay for it. Worst-case fixed rows — opponent melds, own melds, kong
buttons, furiten badge and a full tray together — bound at ~506px against 568,
where before they reached ~627px.

### R7. Tile density — flush tiles, and stop trays drawing outside their column

**Added and shipped 2026-08-01.** R6 made the board absorb pressure; R7 removes the
pressure. Full design in
[superpowers/specs/2026-08-01-play-screen-tile-density-design.md](./superpowers/specs/2026-08-01-play-screen-tile-density-design.md).

Three changes: the across opponent's hand-count stack overlaps sideways so the chip
is one tile tall rather than three (61px → 39px, and it is how that seat's hand
actually faces you); the side trays grow downward two flush tiles wide with an
internal scroll, which also fixes the right one rendering 211.6px wide inside an
80px column; and tiles sit genuinely flush, via glyph-only faces derived from the
existing CC BY-SA set so the cell draws the shared surface instead of every tile
carrying its own bevelled sides.

Measured at 320×568: hand tile 19.1 → 22.7px wide, own tray 8 → 9 tiles a row,
side tray 211.6 → 80px with nothing clipped, across zone with melds 217.8 →
189.9px, peak fixed rows 444px of 568 at 0 overflow.

---

## Reproducing

```bash
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm shots      # regenerates docs/*.png from the running app
```

The measurement pass itself was a throwaway Playwright spec run against
`scripts/screenshots/playwright.config.ts` with extra device projects; it is not
committed. Horizontal overflow *is* guarded in CI by `e2e/ui-clicks.spec.ts`,
which performs real taps on five viewports and fails on sideways scroll.

`docs/screenshot.png` shows the current play screen on an iPhone 14, late in a
round with both discard trays full — the case that previously needed 434px of
scrolling.
