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

Five items. **N19 is the only one that is gameplay work** rather than plumbing,
layout or research.

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

### N23 — French, Spanish and Japanese

Requested 2026-08-02. The catalog is three languages today (`en`, `zh-Hans`,
`zh-Hant`) and the machinery is already language-agnostic: `Lang` is a union,
`LANGS` drives the switch, and `catalog.test.ts` enforces key parity across every
entry. Adding a language is a new `Dict` and a `LANGS` row — no component changes
at all.

**The work is the writing, not the plumbing**, and there is more of it than the
key count suggests:

- **~330 keys**, of which `help.ts` is the long-form half — the whole of How to
  Play plus the About screen. That part needs prose, not glossing.
- **The tile and rule vocabulary has no settled translation in any of the
  three.** 碰 / 杠 / 胡 / 定缺 / 清一色 are the words the game is played in; French,
  Spanish and Japanese mahjong communities each borrow differently, and
  Japanese has its *own* established riichi vocabulary (ポン, カン, 和了) whose
  terms mean subtly different things in a Sichuan ruleset. Picking "the riichi
  word" is a decision with a wrong answer, not a lookup.
- **A speaker has to review each one.** N12 (the feed that stored sentences
  instead of keys) is the standing reminder that this catalog is user-facing text
  in a game people play together — a machine-translated 定缺 that reads as
  "missing suit" would be worse than English.

**Two things to settle before starting.** Whether the tile *names* localise at
all (`tile.man` is `万 Wàn` in English and 万 in both Chinese catalogs — Japanese
would presumably want 萬子, French probably keeps the Chinese character); and
whether `suit.*.full`, which pairs the glyph with a romanisation, is right for a
Japanese reader who reads the glyph directly.

**Man / Pin / Sou come back here, and nowhere else.** N34 took them out of the
English catalog because they are manzu / pinzu / souzu — Japanese, borrowed into
English mahjong writing from a different game — and replaced them with pinyin.
They are the right words for a Japanese catalog, which is the point: this is the
language where the established vocabulary is already Japanese and where picking
"the riichi word" is a decision with a wrong answer rather than a lookup.

**Cheap to guard, once written.** `catalog.test.ts` already fails on any missing
or extra key, and `help-examples.test.ts` and `dice-overlay.test.ts` assert that
specific keys resolve in every language — so a new catalog is caught the moment
it is incomplete rather than at runtime. Extend the language lists in those
tests along with `Lang`. **Medium-large, and mostly not a coding task.**

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

### N31 — the lobby's Start button is below the fold

Measured 2026-08-03 while verifying N27: on a 390×844 phone the primary action
sits at **y=1044** in a 1180px-tall document. It was already off screen before
the fan-limit row — roughly y=944 — so this is not a regression, but it is now
200px down rather than 100.

`HostSetup`'s lobby is `min-h-dvh flex flex-col`, so the page grows and the
document scrolls: nothing is clipped and the button is reachable. It is simply not
*visible*, and a host who has just filled four seats has no on-screen way to know
the game can start.

**The fix already exists one screen over.** R3 solved exactly this on `RoundEnd`
with a `sticky bottom-0` block, full-bleed via a negative margin cancelling the
root padding, and a felt gradient so the scrolled content fades rather than
clipping hard. Copy that shape rather than inventing one.

Worth folding in while there: the share-URL and watch-link blocks are ~290px of
the scroll, and they matter most in the first few seconds and never again.
**Small.**

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
