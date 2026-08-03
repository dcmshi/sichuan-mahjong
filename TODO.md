# TODO

What is actually open. **Everything closed lives in
[docs/history.md](./docs/history.md)**, newest first, each entry with the diagnosis
that made it worth writing down — the phase log, the six audit passes (A1–A40), the
frontend pass (F1–F25), the viewport work (R1–R7), the tile rendering change, the
hosting work (C1–C10), and the feature run N1–N34.

Deferrals are also recorded as O1–O5 in
[ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).
O5 — per-IP limits keyed to a Cloudflare edge address rather than to the player —
is a **tested, accepted** trade-off rather than an open task; it is listed there
so it isn't rediscovered as a bug.

---

## Open

Two items. **N19 is gameplay work; N26 is a sweep.**

N23 (French, Spanish, Japanese), N31 (the lobby's Start button) and N35 (the
support/source links) all shipped 2026-08-03, each written up in
[docs/history.md](./docs/history.md). **O3 was closed the same day without being
built** — it is under Shelved below, with the reasoning in ARCHITECTURE §12.

N23 left one thing open that is not a task: the four Japanese terms it had to
coin, because Sichuan has them and riichi does not — 欠け色, 金鉤釣, 槓上放銃,
花豚 — **want a native speaker's eye**. The borrowed ones do not.

### N19 — a hard bot, so the ladder has three rungs

Requested 2026-08-02. There are two: `botTurnAction` / `botClaimAction` (easy) and
`botTurnActionMedium` / `botClaimActionMedium`, dispatched by a **boolean** —
`room.ts:665` and `:687` both read `difficulty === 'medium'` and pick one of two
functions. That is the first thing this changes: a third level wants a lookup,
not a second ternary.

**What medium already does, so hard has somewhere to go.** Medium picks its
discard by `ukeireAfterDiscard` over `visibleTileTypes` — it counts what it can
see and keeps the tile that leaves the most winning tiles live — and it checks
`anyOpponentTenpai` before feeding a discard. Easy uses `connectScore`, a local
shape heuristic with no notion of what anyone else holds.

So hard is not "medium with better numbers"; the honest gaps are:

- **Fan-aware play.** Nothing in either bot targets a *scoring* hand. Sichuan
  caps at `fanCap` and the fan list is reachable from `scoring.ts`, so a bot
  that steers toward a payable hand instead of merely a winning one is the
  biggest single step.
- **Discard reading per opponent.** `visibleTileTypes` is a flat count; it does
  not attribute discards to seats, so it cannot infer a void suit even though
  every player declares one and flips it. That is free information the bots
  ignore.
- **Claim discipline.** `shouldPung` is a local test. Punging costs tempo and
  reveals shape, and a hard bot should sometimes decline.

**Two constraints.** The engine stays pure and bots live in the server, so
nothing here may reach into `packages/engine` for state it isn't given — and
`bot-smoke.test.ts` plays 100 bot-vs-bot games asserting no rule violations and a
balanced ledger, so a third level needs its own pass through that or it can
violate rules that no other test would catch.

Also worth deciding: whether hard should be **slower to decide**. Bot pace is the
host's (`botSpeed`), and a bot that thinks visibly longer reads as stronger — but
conflating strength with pace would take the host's setting away. Keep them
separate. **Medium-large.**

### N26 — the round-end rows label every seat with the wrong wind

Found 2026-08-03 while verifying N16, and the third sighting of one mistake.

`RoundEndRow.tsx` renders the seat's wind from `player.seat`, and the ledger
lines render the other party's from `l.other`. Both read the **absolute seat
index** as a wind, so seat 0 is always labelled East — correct only when the
dealer happens to be seat 0, and `startNextRound` rotates the dealer every
round. Reproduced at round end: "You" at seat 0 was labelled East in a round
whose East the dice had given to someone else.

N22 fixed exactly this in `DiceOverlay` with `windOfSeat(seat, dealer)`, and
winds run *against* the seat index because play travels counterclockwise. The
helper already exists; what is missing here is the dealer.

**`RoundResult` does not carry it.** `buildRoundResult` in `room.ts` returns
`{ roundIndex, players }`, so the round-end screen has no way to compute a wind —
which is presumably why it reached for the seat index. So this is a field on
`RoundResult` plus the existing helper, and `windOfSeat` wants to move out of
`DiceOverlay` to somewhere both screens can reach.

**Surveyed, and it is nine call sites, not two.** Every one reads an absolute
seat index:

- `RoundEndRow.tsx` (the seat, and each ledger line's other party),
  `RoundEnd.tsx`, `MatchEnd.tsx`, `Spectate.tsx` (twice) — all in or after a
  game, all wrong whenever the dealer is not seat 0, which is three rounds in
  four.
- `HostSetup.tsx` and `Lobby.tsx` label the four empty chairs. **These are a
  different question**: there is no dealer before the game starts, so the label
  there is a seat name rather than a wind. Leaving them as-is is defensible, but
  then a player sees "South" against a chair in the lobby and "South" against a
  different seat in play. Decide it once and write down which.

So the shape is: `dealer` on `RoundResult` (and the winds in play can come off
`PlayerView.dealer`, which is already projected), one shared helper, and a
decision about the lobby. **Small-medium** — the sweep is what makes it more
than the one-line fix it looks like.

---

## Shelved, with reasons

- **A central discard pool** (O3) — closed as **won't do**, 2026-08-03. It was
  three wishes in one, and two of them shipped by other means: N33 made every
  seat's full pile one tap away, so the trays' 10-a-side cap costs nothing, and
  `firstDiscardIsVoid` puts each seat's declaration above its own pile. The third
  was the layout motivation — an empty middle — and the well now holds the wall
  diagram, the last discard and the history control. What is left would be a
  fourth route to information already reachable by two, competing for the fullest
  part of the board. Reasoning in
  [ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).
  Reopen only if the per-seat trays are themselves being reconsidered.

- **A real landscape layout for phones** (R4 Phase 2). Reasons recorded in
  [docs/viewport-audit.md](./docs/viewport-audit.md); landscape shows a
  rotate-to-portrait prompt during play instead.

- **The last three frontend-audit items** (2026-08-02), 17 of 20 having shipped.
  Keyboard hand reordering, modal focus trapping, and spectator parity for
  sound / move history / How-to-play. None is user-facing breakage, which is why
  they are the ones left; each with its reasoning at the top of
  [docs/frontend-audit.md](./docs/frontend-audit.md).
