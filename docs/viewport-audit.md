# Mobile viewport audit — where the board runs off a phone

**Measured:** 2026-08-01 · `main` @ `aa3c47f`
**Method:** Chromium via Playwright device profiles; `document.documentElement.scrollHeight`
vs `window.innerHeight`, CSS px. Screens driven through a real practice game.
**Also:** [viewport-audit.html](./viewport-audit.html) — same content, with the
overflow drawn as bars. This file is the one to read if you are reviewing.

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

---

## What needs a decision

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
