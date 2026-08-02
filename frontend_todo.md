# Frontend TODO

Findings from a frontend / UI-UX audit of `packages/client` (2026-08-02).
Grouped by severity; each entry names the file and the diagnosis. This is an
audit log, not a commitment — triage before picking up. Already-tracked items
(landscape layout R4 Phase 2, central discard pool O3) live in
[TODO.md](./TODO.md) and are not repeated here.

---

## High — user-facing broken or misleading behaviour

- [x] **Practice button re-enables before the game starts.**
  `screens/Landing.tsx:100` — `setPracticeLoading(false)` runs in `finally`
  immediately after `connectGame` returns, i.e. before the socket opens or
  `joined` arrives. The button is live again while the lobby is still being
  created, so a second tap POSTs `/api/lobby` again and starts a second game.
  Keep it disabled until `joined` (or a timeout).

- [ ] **"Hard" bot is actually "medium".** `screens/HostSetup.tsx:173` —
  `botLevel` is typed `'easy' | 'medium'` but the medium button renders
  `t('host.hard')`. Either the label oversells the difficulty or the key is
  wrong; players will read "Hard" and get medium.

- [ ] **Match totals show after round 1, duplicating "This Round".**
  `screens/RoundEnd.tsx:54` — the comment says "if multiple rounds played" but
  the guard is `Object.keys(matchScores).length > 0`, which is true after the
  first round. A one-round match shows the same numbers twice, in two sections
  sorted differently. Gate on `countedRounds.length > 1` (or round index > 0).

- [ ] **Stale `landing.hostHint` copy.** `i18n/index.ts:35` —
  "Host runs the server on their machine. Friends connect over LAN or
  Tailscale." The app is now a hosted service (canonical URL in
  `index.html`, `docs/design-hosted-server.md`); the landing page tells new
  players something that is no longer how the default deployment works.

## Medium — UX gaps and silent failures

- [ ] **No "copied" feedback on Copy buttons.** `screens/HostSetup.tsx:103` —
  `copyText` has a solid legacy fallback, but the button gives no confirmation;
  on a phone the user cannot tell anything happened. Swap the label to
  "Copied ✓" for ~2s.

- [ ] **Selected hand tile stays lifted after the turn passes.**
  `components/OwnZone.tsx:93` — `selectedTile` is only cleared on discard.
  If a claim window opens or the turn moves on while a tile is selected, the
  tile stays raised and the "Tap again to discard" hint stays up, even though
  tapping now does nothing (`handleTileTap` returns early). Clear
  `selectedTile` when `canDiscard` goes false, and set `aria-pressed` on the
  selected tile.

- [ ] **Dimmed wrong-suit tiles in Huan are still tappable — and swallow the
  tap.** `screens/Game.tsx:89` — wrong-suit tiles render at `opacity-30` but
  the wrapper still calls `toggle`, which silently ignores them. Either make
  them truly non-interactive or give feedback; a control that responds to a
  tap with nothing reads as broken.

- [ ] **Claim panel buttons give no pressed state and can double-send.**
  `components/ClaimPanel.tsx:58` — tapping Hu/Pung/Pass sends the action but
  the panel stays fully armed until the server's next view arrives. On a slow
  connection a second tap re-sends. Disable the buttons (or the panel) on
  first tap; also no sound on own claim, unlike every other own action.

- [ ] **Spectator gets no reconnect feedback.** `screens/Spectate.tsx` — the
  play screen renders the "Reconnecting…" banner (`screens/Game.tsx:280`) but
  the spectate screen renders nothing until `ConnectionLost` fires ~47s
  later. Same gap on `RoundEnd` for non-hosts waiting on the host.

- [ ] **ConnectionLost offers only "Back to menu".**
  `components/ConnectionLost.tsx` — after the socket gives up, the one way out
  discards the session even when a saved token might still work (e.g. the
  phone was just in a tunnel). Offer "Try again" (reconnect with the stored
  session) alongside the exit.

- [ ] **Lobby has no language switch.** `screens/Lobby.tsx` — the landing,
  huan/void, and play screens all have `LangSwitch`; a player stuck waiting
  in the lobby can't change language without leaving.

- [ ] **`(you)` badge keyed off the practice name.**
  `screens/MatchEnd.tsx:56`, `components/RoundEndRow.tsx:46` —
  `player.seat === youSeat && player.name !== t('landing.practiceName')`
  suppresses the badge when the name equals the localized practice name, so a
  human actually named "You"/"你" loses their own marker. Suppressing it in
  practice mode is the goal; compare against the stored practice flag or the
  exact localized name only when this client created the practice game.

- [ ] **Spectator mode is a second-class board.** `screens/Spectate.tsx` — no
  `LangSwitch`, no sound, no move history, no HowToPlay, no match totals at
  round end (the store accumulates `matchScores` for spectators but the
  screen never shows them). The round-end reveal is there; the rest is a
  subset for no structural reason.

## Low — polish, consistency, dead code

- [ ] **Dead i18n key `end.details`.** `i18n/index.ts:165` — "Show scoring
  details" exists in all three catalogs but nothing renders it (RoundEndRow
  expands inline). Remove or wire up.

- [ ] **Landing join button shows the raw URL code.**
  `screens/Landing.tsx:141` — `landing.joinCode` renders `urlCode` as-is
  while `handleJoin` uppercases it; a lowercase `?code=ab12` shows "Join
  ab12" next to a lobby named "AB12". Also: `urlCode` is re-parsed from
  `window.location.search` on every render — read it once.

- [ ] **Form inputs use placeholders as their only labels.**
  `screens/JoinForm.tsx:70,80`, `screens/HostSetup.tsx:71`,
  `screens/SpectateForm.tsx:44` — no `<label>`/`aria-label`; placeholders
  vanish once filled and are not a WCAG label. The join-code input would also
  benefit from `autoCapitalize="characters" autoCorrect="off"
  spellCheck={false}` for mobile keyboards.

- [ ] **Modals lack dialog semantics and Escape-to-close.** HowToPlay,
  PlayHistory, the scores dropdown, ConnectionLost, and the long-press tile
  preview all overlay the app with no `role="dialog"`/`aria-modal`, no focus
  management (focus stays on whatever launched them; the background is still
  tabbable), and no Escape handler — backdrop tap is the only way out.
  RotateOverlay likewise sits over a still-focusable board.

- [ ] **Claim countdown bar is invisible to assistive tech.**
  `components/ClaimPanel.tsx:67` — a styled div with `width: %`; add
  `role="progressbar"` + `aria-valuenow` (or accept that it's decorative and
  give the panel an `aria-live` "N seconds to claim" instead).

- [ ] **Event feed is not announced.** `components/EventFeed.tsx:93` —
  transient lines appear visually only; a screen-reader user hears nothing
  when someone pongs/kongs/hus. An `aria-live="polite"` wrapper would
  announce them. (ErrorToast already does this right via `<output>`.)

- [ ] **Icon-only and decorative emoji unmarked.** 🔊/🔇 and "?" buttons have
  labels (good), but the decorative 🀄/🏆/👀/🏁 glyphs are bare text a screen
  reader will announce; add `aria-hidden`. `LangSwitch` and the sound toggle
  don't expose pressed state (`aria-pressed`).

- [ ] **Theme colour mismatch.** `index.html:6` sets `theme-color` and the SW
  background to `#0c5f57` (the felt), but Landing/Lobby/round-end screens
  paint `bg-green-900` (#14532d). The browser chrome and the page disagree on
  every non-game screen.

- [ ] **Keyboard can't reorder the hand.** `components/OwnZone.tsx:380` —
  drag-to-sort is pointer-only (Framer `Reorder`); the inner tile button
  handles Enter/Space as select/discard only. Arrow-key reordering while a
  tile has focus would close the gap.

- [ ] **Empty "Void:" line still takes layout space.**
  `screens/Game.tsx:340` — renders an empty string inside a fixed div when
  `voidedSuit` is null; on the shortest viewports every pixel in the well is
  spoken for (R1). Render nothing instead of an empty div.

- [ ] **Opponent trays cap history with no indication.**
  `components/OpponentSide.tsx:90` (`slice(-6)`), `OpponentTop.tsx:71`
  (`slice(-9)`) — deliberate for space, but there is no "…and N earlier"
  affordance; the count of hidden discards is knowable and free to show.
  (Your own tray is intentionally uncapped for furiten — opponents' early
  discards matter for reading their hand too.)

---

## What's already good (don't regress)

- Reduced-motion handling is thorough: `MotionConfig reducedMotion="user"`,
  CSS collapse in `index.css`, transform-only entrances after the F11
  invisible-screen bug.
- Error surfaces exist and are localized: `ErrorToast` with `seq` re-trigger,
  known-code catalog with server-message fallback, `ConnectionLost` after
  bounded retries, rejoin timeout with session cleanup.
- Tap targets were audited already (F15): 40px minimums on icon buttons.
- The viewport work (R1–R7) holds: `h-dvh` + `min-h-0` discipline, short-
  viewport media queries, tray guards in e2e.
- i18n has a key-parity test and `<html lang>` is applied before first paint.
- Session persistence + rejoin flow covers the mid-game refresh case (F2).
