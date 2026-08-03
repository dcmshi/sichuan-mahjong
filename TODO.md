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

Four items. **N19 is the only one that is gameplay work** rather than plumbing,
layout or research.

N23 (French, Spanish, Japanese) and N31 (the lobby's Start button) closed
2026-08-03 — both in [docs/history.md](./docs/history.md). N23 left one thing
open that is not a task: the four Japanese terms it had to coin, because Sichuan
has them and riichi does not — 欠け色, 金鉤釣, 槓上放銃, 花豚 — **want a native
speaker's eye**. The borrowed ones do not.

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

### N35 — a support link and a source link on the landing screen

Requested 2026-08-03, pointing at the same change in the Set repo
([`4e6f8dc`](https://github.com/dcmshi/set-game/commit/4e6f8dc6478963650e937afeb3668532f54e95a1)):
a subtle secondary link row under the button stack, one link to
`https://github.com/sponsors/dcmshi` and one to the repository, separated by a
`·` and styled well below the primary actions so it competes with nothing.

**Here it goes on `screens/Landing.tsx`**, which already has the right visual
class to join: "About & Credits" is a 12px underlined link at the bottom, and
N17 is the standing lesson that this screen's secondary row is where a player
does or does not find something. So the row belongs *beside* that link rather
than as a fourth button.

**Two things this repo has that Set did not.** N20 already shipped
`.github/FUNDING.yml` and a README **Sponsorship** section, and both say the
same careful thing: sponsorship supports the code and **not the tile artwork**,
which is somebody else's work under CC-BY-SA with `credits.json` as the
attribution. A one-word "Support" link on the landing screen makes a claim the
README then has to qualify — so either the link text carries it, or it points
somewhere that does. The About & Credits screen already holds the attribution
and is one tap away, which is probably the answer.

And the catalogs: two new keys × the six languages N23 shipped (en, zh-Hans,
zh-Hant, fr, es, ja), all enforced by `catalog.test.ts`. Set's commit carries the
wording for five of them and is the model for the sixth. **Small.**

### O3 — a central discard pool

Show every discard in the middle, mark the last one, and show each player's void
suit.

**The redaction question it needed is answered and shipped.**
`PublicPlayer.firstDiscardIsVoid` says whether a seat's `discards[0]` is the
tile they declared, and is false until that seat flips it — which is when a
real table learns it, and is the deliberate reveal A40 said this needed rather
than a field that happens to be on the wire. The PDF edge case falls out of the
same derivation: a player may declare a suit they hold none of, a card indicator
stands in, and no tile ever reveals it (`usedIndicator`).

What is left is the layout, and it got *harder* rather than easier. The middle
of the well now holds the wall diagram, the last discard and the history
control, so the empty space that motivated a central pool is gone. Each seat's
declaration is already drawn above their own pile, and N33 made every pile
openable in full with a tap. **Still a fallback; the per-seat trays are staying.**

---

## Shelved, with reasons

- **A real landscape layout for phones** (R4 Phase 2). Reasons recorded in
  [docs/viewport-audit.md](./docs/viewport-audit.md); landscape shows a
  rotate-to-portrait prompt during play instead.

- **The last three frontend-audit items** (2026-08-02), 17 of 20 having shipped.
  Keyboard hand reordering, modal focus trapping, and spectator parity for
  sound / move history / How-to-play. None is user-facing breakage, which is why
  they are the ones left; each with its reasoning at the top of
  [docs/frontend-audit.md](./docs/frontend-audit.md).
