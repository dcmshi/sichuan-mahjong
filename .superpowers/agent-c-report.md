# Agent C — Rotate-to-portrait overlay (R4 Phase 1)

## Task

Implement `docs/viewport-audit.md` §R4 Phase 1 only: on a landscape phone the
play screen needs ~2x the viewport height, so it's playable only by
scrolling, which moves the player's own hand off screen exactly when they
need to tap it. Show a full-screen "rotate to portrait" overlay during play
under `@media (orientation: landscape) and (max-height: 480px)`. Phase 2 (a
real landscape layout) is explicitly out of scope.

## Files touched

- **New:** `packages/client/src/components/RotateOverlay.tsx` — the overlay
  component. No props, no store dependency; visibility is 100% CSS-driven.
- `packages/client/src/screens/Game.tsx` — two-line addition: import, and
  `<RotateOverlay />` mounted as the last child of `PlayPhase`'s root div,
  right after the claim panel. Nothing else in the file touched.
- `packages/client/src/index.css` — new `.rotate-overlay` /
  `.rotate-overlay-icon` rules + `@keyframes rotate-overlay-hint`, appended
  after the existing short-viewport block.
- `packages/client/src/i18n/index.ts` — two new keys (`play.rotateTitle`,
  `play.rotateHint`) added to all three catalogs (`en`, `zh-Hans`,
  `zh-Hant`), placed after `play.scores` in each.

Did not touch `RoundEnd.tsx`, `RoundEndRow.tsx`, `MatchEnd.tsx`,
`packages/engine`, or `packages/server`, per instructions.

## Design decisions

**Where it mounts / how "during play" is enforced.** `Game.tsx`'s
dispatcher already does `if phase==='huan' return <HuanPhase/>; if
phase==='voidDeclare' return <VoidDeclarePhase/>; else return <PlayPhase/>`.
Because the store flips `screen` to `'roundEnd'` the moment the engine's
`phase` becomes `'roundEnd'` (see `packages/client/src/store/index.ts`
around the `case 'roundEnd'` handler), `PlayPhase`'s "else" branch is in
practice only ever reached while `view.phase === 'play'`. Mounting
`<RotateOverlay />` inside `PlayPhase`'s own returned JSX therefore
guarantees, for free and without any phase check inside the component
itself, that it:
- never renders during huan or void-declare (those are separate branches),
- never renders on round end / match end (those are separate top-level
  screens under `CurrentScreen` in `App.tsx`, never composed with `Game`).

**Huan / void-declare: decided NOT to add the overlay there.** The audit
measured 364px (huan) and 340px (void) against a 340px landscape viewport —
overflow of +24px and +0px, "near-fine" per the task brief, versus play's
+327px. Both screens are also single-decision, single-scroll flows (pick 3
tiles / pick a suit) with no "hand you need to keep tapping while it
scrolls away" failure mode — the trap R4 exists to close is specific to
play's ongoing back-and-forth interaction. Given that, and given the
instruction to keep this batch small and not touch what doesn't need it, I
left them alone. This was also the natural consequence of where I chose to
mount the component (see above) — I did not additionally special-case it in
the CSS or component logic.

**Round end:** unaffected by construction — a different top-level screen,
and I never touched its files.

**CSS mechanism.** `.rotate-overlay { display: none; }` by default;
`display: flex` (plus `flex-direction/align-items/justify-content`, also in
the media-query block, so Tailwind's `flex` utility is never applied to this
element and can't race the custom rule on source order) under
`@media (orientation: landscape) and (max-height: 480px)`. All other styling
(colors, spacing, position) uses ordinary Tailwind classes on the element —
those are inert while `display: none` and only matter once the query flips
it on. No JS resize listener, no `useEffect`, nothing to clean up.

**Animation.** The overlay's icon (a simple inline SVG "phone" outline) has
a looping `rotate-overlay-icon` animation that rotates it from -90deg
(sideways / landscape) to 0deg (upright / portrait) and back — a transform
only, never opacity, per the F11 constraint ("never animate opacity to zero
at rest"). The app-wide `prefers-reduced-motion: reduce` rule in `index.css`
(pre-existing, applies to `*`) already forces `animation-duration: 0.01ms`
and `animation-iteration-count: 1` globally, so reduced-motion users get a
static icon landing on the closing keyframe (rotate(-90deg)) rather than a
spinning one — no extra per-element override needed, consistent with how
the codebase already handles this (see the `.tile-last-discard` override
right above it for the *one* case that did need a special override, because
it wanted to keep a glow rather than go static).

**No tappable elements.** The overlay has no button — the only correct
action is to physically rotate the device, which the CSS media query
resolves automatically. The 40px tap-target rule is therefore not
applicable to this component; nothing on it is tappable.

## i18n keys added

```
play.rotateTitle:
  en       "Rotate to portrait"
  zh-Hans  "请切换为竖屏"
  zh-Hant  "請切換為直向"

play.rotateHint:
  en       "This screen needs more height than landscape gives it — turn your phone upright to keep your hand on screen."
  zh-Hans  "横屏画面高度不够，将手机竖起才能看到你的手牌。"
  zh-Hant  "橫向畫面高度不足，將手機直立才能看到你的手牌。"
```

`catalog.test.ts` (key-parity across all three langs) passes.

## Verification

- `pnpm --filter @sichuan-mahjong/client typecheck` — clean, no errors.
- `pnpm --filter @sichuan-mahjong/client exec vitest run` — 12 files, 44
  tests, all passing (same count as baseline; no regressions).
- `pnpm exec biome check --write packages/client` — one lint error caught on
  first pass (`lint/a11y/noSvgWithoutTitle` on the inline SVG icon) — fixed
  by moving `aria-hidden="true"` onto the `<svg>` itself instead of its
  wrapper `div`. Clean on the re-run; final `biome check` (no `--write`)
  also clean.
- Built `VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build` then
  `pnpm --filter sichuan-mahjong build` (server serves `packages/client/dist`
  in the monorepo layout, confirmed in `packages/server/src/http.ts`).
- Added two throwaway Playwright projects to
  `scripts/screenshots/playwright.config.ts` (`phone-landscape` using
  `devices['iPhone 14 landscape']`, `tablet-landscape` using
  `devices['iPad (gen 7) landscape']`, both `testMatch: /rotate-overlay/`),
  and gave the existing `phone` project `testMatch: /capture/` so it
  wouldn't also try to run the new spec. Wrote a throwaway spec that:
  1. Goes to `http://localhost:8080`, clicks "Practice (vs Bots)".
  2. Polls `getPhase()` to `'huan'`; asserts `.rotate-overlay` is hidden;
     calls `huanSubmit()`.
  3. Polls to `'voidDeclare'`; asserts `.rotate-overlay` is hidden; calls
     `voidSubmit()`.
  4. Polls to `'play'`; asserts `.rotate-overlay` is **visible** (plus the
     "Rotate to portrait" text) on `phone-landscape`, and **hidden** on
     `tablet-landscape`.
  - Ran: `pnpm exec playwright test --config scripts/screenshots/playwright.config.ts --project phone-landscape --project tablet-landscape`
  - Result: **2 passed** (both projects, ~1.2s each). Confirms: overlay
    absent during huan/void on the phone profile even though the media
    query would otherwise match there (844x340 landscape); visible and
    showing the copy during play on the phone profile; entirely absent
    (hidden via `display:none`, media query never matches 1080x810) on the
    tablet profile during play.
  - Deleted `scripts/screenshots/rotate-overlay.spec.ts` and ran
    `git checkout scripts/screenshots/playwright.config.ts` afterward, per
    instructions. Confirmed via `git status` / `git diff` that only the
    intended four files (`RotateOverlay.tsx` new, `Game.tsx`, `index.css`,
    `i18n/index.ts`) are part of this change; `playwright.config.ts` shows
    no diff from HEAD.

## Notes on concurrent work observed in the working tree

While working, `git status` showed `RoundEnd.tsx`, `MatchEnd.tsx`, and
`docs/*.png` already modified in the working tree — from the other agent
mentioned in the brief as concurrently owning the round-end screen. I did
not touch any of these, and did not run `pnpm shots` (which would have
regenerated those PNGs) — my Playwright run only exercised the
`phone-landscape` and `tablet-landscape` projects against the throwaway
spec, never the `phone`/`capture.spec.ts` project.

## Concerns / things worth a second look

- The decision to exclude huan/void-declare rests on the audit's own
  "near-fine" framing (+24px, +0px) plus the interaction-shape argument
  above. If a future audit finds either screen genuinely painful in
  landscape, the fix is one line: mount `<RotateOverlay />` inside those
  phase components too (it's already a self-contained, prop-less
  component).
- The icon's animation is a small aesthetic addition, not requested
  explicitly — easy to strip (delete the `.rotate-overlay-icon` /
  `@keyframes` rules and the two SVG lines) if a reviewer would rather have
  a static icon.
- No visual regression check beyond Playwright's `toBeVisible`/`toBeHidden`
  assertions and the design being modeled closely on
  `HuanPhase`/`VoidDeclarePhase`'s existing "waiting…" full-screen board-felt
  treatment plus `ConnectionLost.tsx`'s `fixed inset-0 z-50` structure — no
  actual screenshot was captured of the overlay itself (screenshotting was
  out of scope of the given verification steps).
