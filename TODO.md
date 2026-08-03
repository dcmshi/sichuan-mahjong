# TODO

What is actually open. Everything closed — the phase log, the six audit passes
(A1–A40), the frontend pass (F1–F25), the viewport work (R1–R7), the tile
rendering change, the hosting work — is in
[docs/history.md](./docs/history.md), newest first, each entry with the diagnosis
that made it worth writing down.

Deferrals are also recorded as O1–O5 in
[ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).
O5 — per-IP limits keyed to a Cloudflare edge address rather than to the player —
is a **tested, accepted** trade-off rather than an open task; it is listed there
so it isn't rediscovered as a bug.

---

## Open

- [ ] **O3 — a central discard pool.** Show every discard in the middle, mark the
  last one, and show each player's void suit.

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
  declaration is already drawn above their own pile. **Still a fallback; the
  per-seat trays are staying.**

- [x] **N1 — animate a claimed tile from the discard to the meld.** *(Done — ClaimFlight, an overlay; see the commit for why it cannot be the tray tile.)* A pung or
  kong currently happens by the board simply being different on the next view:
  the tile leaves someone's tray and appears in a meld with nothing connecting
  the two. The discard path already does this well (`takeoff` in `OwnZone`), so
  the pattern exists.

  **The trap is `viewport.spec.ts`.** It asserts no `.tile` inside a
  `.discard-tray` ever has a box outside that tray's, sampling every ~130ms for
  90s across two viewports — so **a transform on the tray tile will fail CI**,
  and it will fail it intermittently, which is the worst way to find out. The
  animation has to run in an overlay above the board, with the tray tile hidden
  or left in place beneath it. `MotionConfig reducedMotion="user"` already
  covers the accessibility side.

  Sizeable part is not the motion, it is getting the source and destination
  rectangles: the tile starts in another seat's tray (`OpponentSide` /
  `OpponentTop`, which cap at 6 and 9 tiles) and lands in that seat's meld row.
  Both need to report their geometry to a shared overlay. **Medium.**

- [x] **N2 — roll the dice, and mean it.** *(Done — `dice.ts` in the engine, the
  ⚀ overlay in the client; see [docs/history.md](./docs/history.md).)* Novikov specifies this precisely
  (PDF §"Before the deal starts"): East rolls two dice, the **sum** picks whose
  wall is dismantled — counted counterclockwise from East, so 5/9 → East,
  2/6/10 → South, 3/7/11 → West, 4/8/12 → North — and the **lower die** is the
  "indent", counted from the right end of that wall to the break point. One
  roll, both answers. Worked examples in the PDF.

  The engine does none of it: `createGame` calls `buildWall(seed)` and deals
  13 tiles each from index 0, with `dealer` a plain parameter defaulting to
  seat 0.

  **The thing that makes this cheap is that breaking the wall elsewhere is a
  rotation of an already-uniform shuffle, so it changes no distribution and no
  fairness** — it is ritual that players can see, and it costs nothing to make
  real rather than decorative. The actual cost is test churn: applying the
  rotation changes which tiles a given seed deals, so **the canned replay corpus
  has to be regenerated**. Do that deliberately, not as a surprise.

  Dice must come from `rng.ts` like all engine randomness, or replays stop
  reproducing.

  **Decided (2026-08-02): the modern convention — everyone rolls, highest is
  East; then East rolls again to pick the wall.** Two throws, both with two
  dice. The second throw is Novikov's, read as his worked examples read it: sum
  picks whose wall, lower die is the indent. The first throw is the part that is
  not in his text, and is what the sources below call standard practice.

  Still to decide when it is built: **what a tie does** (re-roll among the tied
  players is the usual answer, and it has to terminate — cap it and fall back to
  seat order), and whether the seating throw is **on by default or a host toggle**.
  The wall throw is the ruleset and should just be on.

  **Fact-checked: there is no seating roll in this ruleset.** The PDF describes
  exactly one throw — East's two dice for the wall break — and never says how
  East is chosen; §"preparatory phase" starts with East already established.
  "one die" and "a die" appear nowhere in the document. Deciding turn order by a
  roll is real mahjong practice and common in other variants, but here it would
  be an **addition beyond Novikov**, so it belongs where 換三張 already sits: a
  host toggle, off by default.

  **Cross-checked against outside sources, and it is two dice everywhere, never
  one.** Chinese Classical (Four Winds rule collection) seats players in two
  stages: one player throws *two* dice and counts counterclockwise to find a
  temporary East, then a second throw picks who draws first from a row of wind
  tiles, and the drawn winds are the real seats. Modern simplified play collapses
  that to "everyone rolls, highest is East". No source describes a single die for
  turn order.

  **And it is two dice for the wall break in Chinese Classical too — thrown by
  two different people.** East throws and counts counterclockwise to name a
  player; *that* player throws again and the two sums are added. Which is almost
  certainly what Novikov's otherwise baffling clause means when it says
  "5 or 9 indicate East as the second player to throw dice" — it is naming the
  second thrower. **But his three worked examples derive both the wall and the
  indent from the first roll alone, and never mention a second.** The examples
  are unambiguous and the prose is not, so implement the examples and record the
  discrepancy here rather than splitting the difference. `createGame` already takes `dealer` and
  `startNextRound` rotates it after, so the mechanism is cheap; it is the
  ruleset claim that needs to stay honest.

- [x] **N3 — a "what can I win with" section in How to play.** *(Done — three
  drawn example hands under "Winning Hand" and the complete fan table under
  "Scoring", each guarded by a test.)* The help covers
  the flow but never states the shape of a winning hand: four sets plus a pair,
  seven pairs, and which of the ten fan combinations are reachable given the
  void suit. Pure content plus `Tile` to draw examples — no engine, no state.

  Three catalogs move together (the parity test enforces it), and the Chinese
  needs a speaker rather than a gloss. **Small, but the writing is the job.**

  **The premise above was half wrong, and that changed the shape of the fix.**
  `htp.winning.body` already stated both shapes in prose, and `htp.scoring.body`
  already listed five fans — so a new section would have been the *fourth*
  restatement of how a hand wins. What was actually missing was the picture and
  the other five fans. So the examples sit under the prose that already states
  the rule, the table replaced the partial "Notable fans" list, and no heading
  was added.

  Two things are guarded rather than eyeballed. `isWinningHand` is run against
  every drawn example, because a help screen confidently showing a hand that does
  not win is the one failure a screenshot cannot catch. And `HELP_FAN_ORDER` is
  asserted equal to the keys of the engine's own `COMPATIBILITY` table, with the
  fan values read out of it rather than restated — so a fan added to the scorer
  fails the test until the help learns about it.

- [x] **N4 — put animation pace in the player's hands.** *(Done — `prefs.ts` +
  the ⚙ menu; see [docs/history.md](./docs/history.md) for why the gear replaced
  the sound button rather than joining it.)* Play already reads fast, and
  N1 adds motion to it. Two lobby settings, riding on `startGame.rules` beside
  `botSpeed` and narrowed in `ws.ts` the same way:

  - **Skip animations** — a boolean, default **false**. Distinct from
    `prefers-reduced-motion`, which is already honoured globally via
    `MotionConfig reducedMotion="user"`: that is an OS-level accessibility
    signal, this is a table preference, and conflating them would let one player's
    taste override another's access need.
  - **Animation speed** — slow / medium / fast, default **medium**. Today's
    durations become **fast** (`DISCARD_FLIGHT_MS` 280, `FLIGHT_MS` 420,
    `HU_CELEBRATION_MS` 1200), so the default gets slower than it is now.

  **This is a client preference, not a rule** — unlike `botSpeed`, which is a
  `GameRoom` field because it paces the server. Nothing here reaches the engine,
  so it changes no replay.

  **Settled: per-player, in localStorage beside the language and sound toggles.**
  The animation is *local rendering only* — every client gets the same `claimed`
  event and draws its own copy over a board that has already updated underneath,
  so one player watching a slow flight while another watches a fast one desyncs
  nothing and blocks nobody. That also makes it the cheaper build: no protocol
  field, no `ws.ts` narrowing, no room field for a value the server never reads.

  Nothing about this touches the lobby. **Small.**

- [x] **N5 — let the pace change once the game has started.** *(Done — a host-only
  Bot pace section in the play screen's ⚙ menu, on a new `setBotSpeed` message.
  `--bot-delay` still outranks it.)* Bot pace is already
  a host setting in the lobby (slow 1800 / normal 900 / fast 400, on
  `startGame.rules.botSpeed`, narrowed by `botSpeedFrom` in `ws.ts`) — but it is
  chosen once and then fixed for the match. The table that picks Normal and finds
  it slow on round three has no way to say so without ending the match.

  Unlike N4 this **is** genuinely global and has to stay server-side: bots move on
  the server and everyone watches the same moves land at the same moment.

  The mechanism is already most of the way there. `botSpeed` is a `GameRoom`
  field rather than `GameConfig` precisely because it changes no rule and a replay
  of the same seed is identical at any value, so it can be reassigned mid-match
  without touching state or the snapshot. What is missing is a `ClientMsg` to
  carry it, host-only enforcement at the WS boundary beside the other host
  actions, and a control somewhere in the play screen.

  Two things to keep: `--bot-delay` / `SM_BOT_DELAY_MS` must still **outrank** the
  new message, or a host who picks Slow puts the Playwright suite at 1.8s a move;
  and the value needs the same `botSpeedFrom` narrowing, since it would be a new
  thing a client can assert. **Small-medium.**

- [x] **N6 — let the host set the claim window.** *(Done — a quick / normal /
  relaxed preset on `startGame.rules`, mapped by `claimWindowMsFrom` in `ws.ts`.
  Guarded through to `GameState.config`, because that hop can fail silently.)*
  How long you get to answer a
  discard with Pung, Kong or Hu is fixed at **10s** (`GameConfig.claimWindowMs`).
  It has already moved twice — 3s, then 6s, then 10s — which is the tell that
  there is no single right number: a table of beginners wants longer, and four
  people who know the game want the pause gone.

  **Not the same thing as N4, and it cannot be per-player.** N4 is local
  rendering — every client draws its own copy of an animation over a board that
  has already updated, so one player watching a slow flight blocks nobody. The
  claim window is a **deadline in engine state** that the whole table waits on:
  play does not advance until it resolves. One window, one value, everybody's.
  So it belongs beside `botSpeed` as a lobby setting.

  **Nearly all of it is already built.** `claimWindowMs` lives in `GameConfig`,
  `views.ts` projects `config` whole into `PlayerView`, and `ClaimPanel` already
  takes `windowMs` as a prop — driving the countdown bar, the seconds-left
  readout and F25's clock-skew range check off it. The server has simply never
  set it, inheriting `DEFAULT_CONFIG`. So the work is a lobby control, a field on
  `startGame.rules`, narrowing in `ws.ts`, and the existing `Partial<GameConfig>`
  argument `createRoom` already takes. **No client countdown change at all.**

  **Narrow it to presets, not a number.** `houseRules()` must not accept a free
  integer off the wire: `claimWindowMs: 86400000` freezes a table until the room
  sweeps, and `0` closes the window before a human can see it. Take a
  `'quick' | 'normal' | 'relaxed'` enum the way `botSpeedFrom` takes `botSpeed`,
  map it server-side to 5000 / 10000 / 20000, and fall back to normal for
  anything unrecognised.

  **Unlike `botSpeed` this one *is* a `GameConfig` field**, so it lands in
  `GameState` and in the snapshot. That is fine for a lobby setting — it changes
  no tile and no legal action — but it is why this should **not** be folded into
  N5's mid-match control: reassigning a room field is not the same as mutating
  engine config underneath a live game. **Small.**

- [x] **N7 — the turn indicator is invisible on a 320px phone.** *(Done with N13
  — the language switch moved into the ⚙ menu, freeing the 122px, and the
  indicator is `flex-1` so it claims it. Guarded on rendered width, which is the
  only thing that was ever wrong.)* Found while
  measuring the top bar for N4, and **pre-existing** — N4 swapped one 40px
  control for another and changed the arithmetic not at all.

  Measured in the running app at 320×568, mid-play:

  | | width |
  |---|---|
  | bar `clientWidth` / `scrollWidth` | 320 / **323** |
  | `Wall: 55` | 41 |
  | **turn indicator** | **0** |
  | icon cluster | 254 |

  The cluster is `flex-shrink-0` and the indicator is the only `min-w-0 truncate`
  child, so it absorbs the entire shortfall and truncates to nothing. "Your turn"
  — reasonably the most important text on the screen — is simply not rendered on
  the smallest supported phone, and the row still overflows by 3px after eating
  all of it.

  **No guard catches this.** `viewport.spec.ts` watches vertical overflow of
  `.board-felt` and tray clipping; `ui-clicks.spec.ts` fails on document-level
  sideways scroll, which a 3px overflow inside a clipped row never causes. Both
  pass today.

  The cluster is where the width is: `LangSwitch` alone is **122px** — three
  40px buttons for a control most players touch once. Making it a single button
  that cycles, or folding it into the ⚙ menu N4 just added, recovers ~80px on
  its own. Whichever way it goes, the fix wants a guard asserting the indicator
  has non-zero width, or it comes back. **Small.**

- [x] **N8 — the claim panel covers the hand you need to see.** *(Done — the bar
  stays `fixed` and the board pads by its measured height; guarded in
  `viewport.spec.ts`.)* When a discard opened
  a claim window, the Pung / Kong / Hu / Pass bar was `fixed bottom-0` and your
  hand is the bottom-most row, so the bar sat on top of it for the whole
  10-second window — while whether to pung is a judgement about the hand it was
  covering.

  **My first diagnosis was wrong and is worth recording as such.** I measured the
  hand's layout box ending exactly where the bar began and concluded the tiles
  must be *painting* past their box because of `.tile-lap`. They are not: the
  CSS gives `.tile-lap .tile-face` `width: 129.032%` but `height: 100%`, and with
  the art's 210:255 ratio that fits the box exactly — measured, the face box and
  the tile box are identical (514..550). The 21px I attributed to overhang was
  `Reorder.Item`'s layout animation: sampled as the bar appears, the `li` reads
  at 513..555 while its own `ul` is at 419..465, because Framer is still moving
  it from where it used to sit. **Any measurement of the hand has to settle
  first**, or it reports a frame that is already gone.

  The real cause was ordinary: the hand's container ran to the viewport bottom
  (462..568) and the fixed bar covered 525..568, because a fixed element reserves
  no space. The bar stays `fixed` and the board pads by the bar's *measured*
  height while a window is open — padding an `h-dvh` border-box element reduces
  its content height, so the `flex-1 min-h-0` middle row gives the space back.
  Putting the bar in flow (`sticky`) was tried first and **CI rejected it**: it
  covered nothing but added a row to a column that already fits exactly on a
  320px phone, so the vertical-overflow guard failed. It passed locally three
  times and failed on CI, which has less slack.

  Measured after: settled claim windows show zero tiles under the bar and no
  board overflow, over three consecutive full-suite runs. The guard was verified
  by removing the padding — it reports all 13 hand tiles under the bar on both
  viewports — and it polls to a stable pair rather than sleeping, because a fixed
  wait long enough on one machine is short on another and the guard then fails
  intermittently.

- [x] **N9 — the lobby offers bot pace at a table with no bots.** *(Done — the
  group greys out and says why once all four seats hold humans; an empty seat
  keeps it live, since it can still take a bot.)* Reported
  2026-08-02. `HostSetup.tsx` renders the slow/normal/fast selector
  unconditionally, so a host filling all four seats with people is still asked
  how fast the bots should play. It changes nothing — `botSpeed` only paces
  `GameRoom`'s bot driver — so it is a control that reads as broken rather than
  one that misbehaves.

  Disable it (or drop it) when `lobbyPlayers` holds four humans. Disabled rather
  than hidden is the better default: a seat can be kicked and refilled with a
  bot at any point before Start, and a control that appears and vanishes as
  seats change is worse than one that greys out. The value still rides on
  `startGame.rules.botSpeed` either way, so nothing server-side changes — and
  `botSpeedFrom` already narrows whatever arrives.

  Worth pairing with **N5**, which adds a mid-match pace control: that one wants
  the same "are there any bots" test, and neither should be reachable at a table
  of four people. **Small.**

- [ ] **N19 — a hard bot, so the ladder has three rungs.** Requested 2026-08-02.
  There are two: `botTurnAction` / `botClaimAction` (easy) and
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
    caps at `fanCap` 3 and the fan list is reachable from `scoring.ts`, so a bot
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
  separate. **Medium-large** — this is the only item on this list that is real
  gameplay work rather than plumbing or layout.

- [x] **N20 — turn on the repository's sponsor button.** *(Done — `.github/FUNDING.yml`
  pointing at the profile, plus a Sponsorship section in the README saying what it
  does and does not cover.)* Requested 2026-08-02.
  GitHub Sponsors is already live on the `dcmshi` *profile*; a
  **`.github/FUNDING.yml`** puts the Sponsor button on this repository too, and
  the file is the only thing standing between the two.

  It is one file and no code: `github: dcmshi` is the whole of it, and GitHub
  reads the same keys for the other platforms if any are ever added. Nothing in
  the build, the release binary or the deployment touches `.github/`, so this
  cannot break anything that ships.

  **Two things to decide rather than assume**, which is why this is filed instead
  of done: whether the button should point at the personal profile or at a
  project-specific tier, and whether a `FUNDING.yml` sits right beside
  [LICENSE](./LICENSE)'s CC-BY-SA obligation for the tile art — the art is
  somebody else's work under a share-alike licence, so a funding button on the
  repository that ships it is worth a deliberate answer rather than a default
  one. Mention the tile authors in the sponsor blurb if the answer is yes.
  **Small.**

  **Both answered.** The profile, not a project tier — there are no tiers to point
  at, and inventing them would promise a fulfilment story this repo does not have.
  And yes, it sits right beside the CC-BY-SA obligation: a funding button neither
  restricts redistribution nor discharges attribution, so it conflicts with nothing.
  What it *could* do is imply the art is ours, so the answer is stated rather than
  assumed — `FUNDING.yml` carries the reasoning as a comment, and the README gained
  a **Sponsorship** section saying sponsorship supports the code and not the
  artwork, pointing at `credits.json` for anyone wanting to support the art itself.
  There is no free-text field in `FUNDING.yml`, which is why the note lives in the
  README rather than "in the blurb".

- [x] **N21 — check the round's *payments* against sources other than the PDF.**
  *(Done — [docs/audit-payments.md](./docs/audit-payments.md). Every payment rule
  confirmed; the one real divergence is the fan cap, which N27 then exposed. Two
  comprehension bugs found and fixed.)*
  Reported 2026-08-02: a player at a real table said a hand was settled wrong, and
  on being asked, **it was the payment that was disputed rather than the fan.**
  That narrows this a long way — the fan calculation and the payment matrix are
  separate rules, and only the second is in question.

  **Start here: a winner stops paying for the rest of the round.** Every payment
  loop in `actions.ts` skips `status === 'hu'`, which is Bloody Rules — the round
  continues past the first Hu and whoever has won sits out. The consequence is
  that *the same hand is worth less the later it lands*: a self-drawn 8-point hand
  collects 27 if nobody has won yet and 18 if one player has. That is the single
  most surprising number on the round-end screen and the likeliest thing to be
  reported as wrong, whether or not it is.

  **This is a research task with a code deliverable, not a bug fix.** Nothing here
  is known to be wrong. The engine encodes Novikov's Table 4 and Table 9
  ([ARCHITECTURE.md §5.8](./ARCHITECTURE.md)), and the compatibility matrix is
  already property-tested for self-consistency and symmetry. What has never been
  done is checking our *reading* against an independent one.

  **Where our reading of the payments is a choice rather than a derivation.**
  The shortlist, in the order worth checking:

  - **A seat that has won pays nothing more** (above). Some readings keep them
    paying, or have them pay a reduced share.
  - **Self-draw takes `handValue + 1` from each; a discard win takes `handValue`
    from the discarder alone.** Two asymmetries in one rule — the `+ 1`, and the
    fact that a discard win collects from one seat rather than three. An 8-point
    hand is 27 self-drawn and 8 off a discard, which is a big enough gap that
    getting either half wrong would be noticed immediately.
  - **Kong payments: concealed 2 from each, exposed 2 from the discarder,
    promoted 1 from each.** Plus the shoot-after-kong refund, which returns the
    discarder's most recent kong group — an unusual rule, and one that makes a
    round-end column look wrong if you are not expecting it.
  - **False Hu is a flat 8 to each opponent**, deliberately not scaled by
    `fanCap` (an earlier version scaled it; §5.9 records the fix).
  - **Wall-end bu-ting payouts use TMV**, the theoretical max of a ready hand,
    which is a computed number no player can check by eye.
  - **`fanCap: 3`**, so no hand value exceeds 8. Several Sichuan variants cap at
    4 or 5, which changes every payment above it. Cheapest thing to rule out.

  **Method.** Work each disputed case as a worked example against at least two
  outside sources — the secondary list in
  [ARCHITECTURE.md §14](./ARCHITECTURE.md#14-references) is the starting set, and
  [themahjong.guide](https://themahjong.guide/) is now beside the PDF. Record the
  disagreements in `docs/` with a decision per item: match the source, or keep
  ours and say why. A divergence that is *deliberate* is not a bug, but an
  undocumented one is.

  **The unit tests are done, and are the place to put the answers.** Two files,
  both added 2026-08-02, both driving `applyAction` rather than restating
  arithmetic:

  - **`packages/engine/tests/payments.test.ts`** — every settlement path with all
    four seats' net movement asserted: self-draw, self-draw with a seat already
    out, discard win, the three kong subtypes, and the false-Hu penalty. This is
    the file the report is about.
  - **`packages/engine/tests/scoring-cases.test.ts`** — worked hands stated in
    readable form with their fan and their points, so the other half of a dispute
    can be checked too.

  Both pin *current* behaviour. That is the point: none of it is known to be
  wrong, so the tests exist to make a future change visible and to give the
  research something concrete to disagree with. When a case is settled against an
  outside source, it becomes a line in one of those files. **Medium.**

  **Done, and the engine was right about every payment.** Three outside sources
  against Novikov's Tables 5–7: a tournament ruleset, a commercial payout table,
  and Chinese-language summaries of 血战到底. Findings, each with its decision, in
  [docs/audit-payments.md](./docs/audit-payments.md). Two worth repeating here:

  **The one divergence is not a payment — it is `fanCap`.** Novikov states the cap
  as a *variant*: "Typical value of that limit is 3 (as in MIL's version of rules)
  or 4 (as played in Russia and on the MahjongSoft site)", and his own Table 5 is
  drawn at 4. We ship 3 and never surface it, so a table playing the 4-fan variant
  sees every capped hand pay exactly half. **That is the best fit for the original
  report**, and N27 turned it into a lobby control (2026-08-03).

  **The kong amounts had one dissenting source and it lost 3–1.** A commercial
  payout table gives 1 point for every kong type; Novikov, the tournament rules and
  the Chinese sources all give concealed 2 from each, melded-from-a-discard 2 from
  the discarder, promoted 1 from each. Ours matches the three.

  Two comprehension bugs turned up and were fixed in the same pass, neither of
  which changes a payment but both of which change what a player is told one *was*:
  the Chinese round-end screen labelled the point value as 番数 ("number of fan"),
  so a 4-point hand read as 4 fan and would convert to 16; and "You won this round!"
  rendered the moment you Hu, when the round is not over, you have not necessarily
  won, and the hand's value went unsaid.

- [x] **N22 — the wall diagram walks the ring against the turn order.** *(Done —
  and it was worse than filed: the dice were naming the wrong seat's wall. Two
  tests broke, no seeded deal did.)* Found
  while building N14, and deliberately *not* fixed there. The engine dismantles
  walls in increasing seat order (`breakOffset = wallSeat * 27 + …`, then forward
  through the array), while `nextActiveSeat` advances the turn by `(from + 3) % 4`
  — decreasing seat order. So on screen the wall opens up one way round the table
  and play travels the other.

  At a real table both go the same way. N14 made the diagram read the engine
  faithfully, which was the right call for that item — the alternative was a
  diagram that shows something the engine is not doing — but it means the
  discrepancy is now visible rather than hidden behind a fixed corner.

  **It changes no distribution**: the wall is a uniform shuffle and the break is a
  rotation of it, so reversing the direction is ritual, not fairness. The cost is
  the same one N2 paid — **the canned replay corpus has to be regenerated**,
  because it changes which tiles a given seed deals. That is the whole reason this
  is filed rather than done. **Small, with a deliberate test churn.**

  **The item understated it, and the corpus fear was wrong.**

  It is not only the diagram. `throwForWall` computed `wallSeat` as
  `(dealer + step) % 4`, stepping *clockwise*, so for a sum of 2 — which the PDF
  tabulates as South — it named the seat to East's **left**. South is the seat to
  East's right, because that is who plays next: `nextActiveSeat` is
  `(from + 3) % 4` and the client seats `seat + 3` on the viewer's right. So the
  dice were naming the wrong wall for 2/6/10 and 4/8/12, with West at step 2
  unaffected — which is why it read as a diagram problem. Fixed to
  `(dealer - step + 4) % 4`.

  A third thing fell out of the same sentence: the overlay rendered
  `wind.${wallSeat}` — the **absolute** seat index as a wind — so it was correct
  only when the dealer happened to be seat 0, and East rotates every round. It is
  `windOfSeat(wallSeat, dealer)` now, a pure exported helper, because the browser
  reaches the wrong-looking case by luck.

  The array mapping is the part the item described. Quarter `q` now belongs to seat
  `(4 - q) % 4`, so consuming the array forwards travels counterclockwise; the
  client half is a sign flip in `wallHead` and `[2,1,0,3]` in `ringSlot`, with the
  reversed side pair moving from bottom/left to top/right so the ring stays closed.

  **No replay corpus needed regenerating.** `replay.test.ts` builds synthetic
  states with `wall = [0..107]` and never calls `createGame`, so nothing there
  depends on a seeded deal. Exactly two tests failed — the sum→seat table and the
  break-quarter invariant — and both were *stating the old direction*, which is
  what they were for. The e2e suite's fixed seed still produces a round the
  viewport guard can use.

  The diagram test that should have caught this was restating
  `wallSeat * 27 + (27 - indent * 2)` inline and asserting a ring quarter, so it
  agreed with a copy of the formula rather than with the board. It now drives
  `throwForWall` directly and asserts the head lands on `sideOfSeat` of the seat
  the dice named — which is the property, and which fails on either half of the
  mapping alone.

- [ ] **N23 — French, Spanish and Japanese.** Requested 2026-08-02. The catalog is
  three languages today (`en`, `zh-Hans`, `zh-Hant`) and the machinery is already
  language-agnostic: `Lang` is a union, `LANGS` drives the switch, and
  `catalog.test.ts` enforces key parity across every entry. Adding a language is a
  new `Dict` and a `LANGS` row — no component changes at all.

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
  - **A speaker has to review each one.** [N12](#open) is the standing reminder
    that this catalog is user-facing text in a game people play together — a
    machine-translated 定缺 that reads as "missing suit" would be worse than
    English.

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

- [x] **N24 — the ⚙ menu says the bots are on Normal whatever the lobby chose.**
  *(Done — `botPace` rides on every view push, the menu reads it, and a pinned
  process greys the control and says so. Verified in a browser at both settings.)*
  Reported 2026-08-03: practice set to **slow**, and the play screen's ⚙ shows
  **normal** highlighted.

  **It is the display, not the setting.** Traced the whole path and the pace is
  honoured end to end: `PracticeSetup` sends `rules.botSpeed`
  (`PracticeSetup.tsx:111`), `ws.ts:416` narrows it through `botSpeedFrom` into
  `createRoom`, and `room.ts:316` schedules every bot turn at
  `botPaceMs(this.botSpeed)`. The bots really are slow. What is wrong is one line
  in the menu:

  ```ts
  const [botSpeed, setBotSpeed] = useState<BotSpeed>('normal');  // SettingsMenu.tsx:44
  ```

  Local component state, seeded with the literal `'normal'` and never reconciled
  with the table. It is right only by coincidence, and it resets to `'normal'` on
  every remount — so it also lies after a reconnect, and it lies to a host who
  changed the pace mid-match and reopened the menu.

  **The reason it was built that way is that the client has no way to know.**
  `botSpeed` is a `GameRoom` field rather than `GameConfig` (deliberately — N5
  explains why: it changes no rule and no replay), so it is in neither
  `GameState` nor `PlayerView`, and no `ServerMsg` carries it. Grep confirms
  `botSpeed` appears nowhere in `views.ts`, `state.ts`, or the client store.

  **The server half already exists and is unused.** `GameRoom.getBotSpeed()`
  (`room.ts:827`) was written for exactly this — its comment says "so a joining or
  reconnecting client can show the right one" — and it has **no callers anywhere**.
  So the fix is to put the value on the wire and read it, not to invent a
  mechanism.

  Two ways, and the first is the recommendation:

  - **Add it to the `lobby`/`view` push.** A field on `ServerMsg` and a store
    slot. Says nothing about rules, so it does not touch `views.ts`'s redaction
    contract — but it is a new projected value, which means it needs the decision
    §5.2 requires anyway (it is public: everyone at the table watches the same
    moves land at the same pace).
  - Echo it back on the `setBotSpeed` reply only. Cheaper, and still wrong on
    join and on reconnect — which is half the reported cases.

  **The third lie to fix while in there:** `--bot-delay` / `SM_BOT_DELAY_MS`
  outranks the lobby and the menu both, so on a pinned process the menu shows a
  pace the server is ignoring entirely. Whatever field carries the value should
  carry the *effective* one, or the control should say it has been overridden.

  Testable without a DOM once the value is on the wire — a store slot is exactly
  the shape the client tests can reach. **Small.**

  **Built as the first option, plus a push the item did not anticipate.**
  `botPace: { speed, pinned }` is a sibling of `view` on the `view` message rather
  than a field on `PlayerView`, since the pace is not in `GameState` for there to
  be anything to project. It rides on **every** push because `sendViewTo` is also
  what a reconnecting socket receives first — so there is no join / start / repace
  trigger to remember and no way for it to drift.

  What the item missed: `setBotSpeed` sent nothing back, so with the local copy
  gone the host would tap and see nothing change until the next bot moved — up to
  1.8s on slow, the setting most likely to be being reached for. It now
  re-broadcasts views, measured at 68ms to reflect in the browser.

  `botPaceControl` is a pure exported helper because **no automated test reaches
  this control rendered honestly**: client tests have no DOM, and the Playwright
  suite runs the server with `--bot-delay 150`, so every e2e run sees only the
  pinned branch. That blind spot is how the hardcoded literal shipped.

- [x] **N25 — the dice overlay parks over the board for the rest of the round.**
  *(Done — the stage timers live in a ref and are cancelled on unmount only, and
  `ui-clicks.spec.ts` now asserts the overlay appears and then clears.)*
  Found 2026-08-03 while verifying N24 in a browser, and **not fixed there** — it
  is a different component with its own history, and it deserves its own change.

  Reproduced on a built client at 390×844: declare your void suit promptly and the
  seating-roll overlay stays up — `bg-black/55 backdrop-blur-sm` over the whole
  board — for the rest of the round. Measured still present at t+3s, t+8s and
  t+20s after reaching the play phase, having taken 155ms to get there.

  **The cause is the dependency array, and the comment directly above it already
  describes this exact failure from a previous round of it.** `DiceOverlay`'s
  effect has `isDealStart` (`phase === 'huan' || phase === 'voidDeclare'`) in its
  deps. When the phase advances to `play`, React runs the previous effect's
  cleanup — **which clears the two stage timers** — then re-enters the body and
  returns at `if (skip || !isDealStart) return`. `stage` is left non-null with
  nothing remaining to set it to null. The earlier fix made every dep a primitive
  so a new `view.dice` reference could not tear the timers down; this is the same
  teardown arriving through a primitive that legitimately changes mid-animation.

  Two stages at 900+900ms scaled by the animation pace is 3.6s at medium, so any
  player who declares faster than that hits it — which is most of them.

  **Recommendation: move the timer handles into a ref and clear them on unmount
  only.** Re-running the arming effect stays harmless, because `shown.current ===
  key` already guards it; what must not happen is a phase change cancelling
  timers that are mid-flight. Dropping `isDealStart` from the deps would also work
  but needs a lint suppression, and the suppression is the thing that hides this
  class of bug.

  **Why nothing caught it.** The overlay is `pointer-events-none`, so it blocks no
  tap and every e2e spec still passes with it sitting there. `viewport.spec.ts`
  watches `.board-felt` overflow and tray clipping, neither of which a
  `fixed inset-0` overlay affects. A guard wants to assert the overlay is *gone* a
  known time after the deal — which is a state assertion, not a layout one.
  **Small, and worth a guard.**

  **Built as recommended.** The handles moved into a ref cleared on unmount only,
  so re-running the arming effect can no longer cancel a reveal in flight;
  `shown.current === key` was already the guard against arming twice. Arming a new
  deal clears the previous handles, which is also what stops the list growing by
  two a round. Dropping `isDealStart` from the deps would have worked too, but it
  needs a lint suppression, and a suppression is what hides this class of bug.

  The guard is in `ui-clicks.spec.ts`, which already declared its void suit
  immediately and so already reproduced it. It asserts the overlay is **visible at
  the deal** before asserting it clears: "the overlay is gone" passes just as well
  when the overlay never appeared, and this repo has been bitten by a guard that
  could not reach its own case. `data-dice-overlay` is what it reads.

  Verified in a browser at 390×844: overlay up at the void screen, play reached in
  908ms, still present at t+3s (correct — two stages at the medium pace is 5.4s),
  gone by t+6s, board clear.

- [ ] **N26 - the round-end rows label every seat with the wrong wind.** Found
  2026-08-03 while verifying N16, and the third sighting of one mistake.

  `RoundEndRow.tsx` renders the seat's wind from `player.seat`, and the ledger
  lines render the other party's from `l.other`. Both read the **absolute seat
  index** as a wind, so seat 0 is always labelled East - correct only when the
  dealer happens to be seat 0, and `startNextRound` rotates the dealer every
  round. Reproduced at round end: "You" at seat 0 was labelled East in a round
  whose East the dice had given to someone else.

  N22 fixed exactly this in `DiceOverlay` with `windOfSeat(seat, dealer)`, and
  winds run *against* the seat index because play travels counterclockwise. The
  helper already exists; what is missing here is the dealer.

  **`RoundResult` does not carry it.** `buildRoundResult` in `room.ts` returns
  `{ roundIndex, players }`, so the round-end screen has no way to compute a wind -
  which is presumably why it reached for the seat index. So this is a field on
  `RoundResult` plus the existing helper, and `windOfSeat` wants to move out of
  `DiceOverlay` to somewhere both screens can reach.

  **Surveyed, and it is nine call sites, not two.** Every one reads an absolute
  seat index:

  - `RoundEndRow.tsx` (the seat, and each ledger line's other party),
    `RoundEnd.tsx`, `MatchEnd.tsx`, `Spectate.tsx` (twice) - all in or after a
    game, all wrong whenever the dealer is not seat 0, which is three rounds in
    four.
  - `HostSetup.tsx` and `Lobby.tsx` label the four empty chairs. **These are a
    different question**: there is no dealer before the game starts, so the label
    there is a seat name rather than a wind. Leaving them as-is is defensible, but
    then a player sees "South" against a chair in the lobby and "South" against a
    different seat in play. Decide it once and write down which.

  So the shape is: `dealer` on `RoundResult` (and the winds in play can come off
  `PlayerView.dealer`, which is already projected), one shared helper, and a
  decision about the lobby. **Small-medium** - the sweep is what makes it more
  than the one-line fix it looks like.
- [x] **N30 - the void screen chooses your first discard for you.** *(Done — tap
  the tile, not the button; `voidChoice` in `voidSelection.ts` is what refuses to
  submit a held suit with no tile named. Verified in a browser: the tapped tile is
  the one set aside, and the first of the suit stays in hand.)* Reported
  2026-08-03: the player should pick which tile goes first, "since discard order
  might matter here".

  **It does, and the screen already sends a specific tile without asking.**
  `declareVoid` carries `firstDiscard: TileId | null`, and the engine holds that
  exact tile out of the hand as `pendingFirstDiscard` — it is set aside face down at
  the declaration and flipped as your opening play (A35). `VoidDeclarePhase.submit`
  fills it with `counts[chosenSuit][0]`: **the first tile of that suit in whatever
  order the hand happens to be in.** So the one discard the player is told they do
  not get to choose is in fact chosen, silently, by sort order.

  It matters because a first discard is a real decision. It is the tile three
  opponents get their first claim window on, and which void tile you shed first is
  exactly the kind of choice the rest of the game lets you make. `9 man` and `2 man`
  are not interchangeable openings.

  **The shape asked for:** tap the tile, not the button. The tapped tile lifts
  slightly, and its whole suit still marks the way it does today — so the tap says
  both "this suit" and "this tile first" in one gesture. **Keep the three buttons as
  a summary** rather than the control: they carry the per-suit counts, which is the
  comparison the screen exists to support, and losing that would trade one problem
  for another.

  Two things to get right rather than assume. `data-void-tile` is what
  `e2e/*.spec.ts` counts marked tiles with, and the buttons currently *are* the
  selection mechanism there — check which specs drive this screen before changing
  what a tap does. And a suit you hold none of has no tile to tap, which is the
  `usedIndicator` case: the button has to stay tappable on its own for that, so the
  two paths are "tap a tile" and "tap an empty suit", not one replacing the other.
  **Small-medium.**

  **Both landed as filed, and the two null cases are the whole of it.** `voidChoice`
  returns `ready` with `firstDiscard: null` only for a suit you hold none of — the
  same distinction the engine enforces as `void_indicator_not_allowed` (A36), which
  is why it is a pure function with a test rather than a `??` in the component. The
  buttons stayed live: they carry the per-suit counts, and they are the only way to
  reach the indicator case.

  **Amended the same day, on report: the suit button alone submits again**, taking
  the first tile of the suit as the default. This over-corrected — the bug was that
  `counts[suit][0]` was chosen where nothing on screen named it, so the fix that
  mattered was making the choice *visible*, not compulsory, and forcing a tap cost
  the two-tap path for the player who does not care which void tile leads. The
  screen now marks and names whichever tile `firstDiscard` holds, so a default looks
  exactly like a pick and tapping another replaces it. `needTile` is gone.

  The picked tile takes amber and **stops pulsing** instead of gaining a second
  ring; the suit's pulse means "all of these go", and two rings on one tile would
  have said neither. The lift is on the wrapper, not the `Tile`, because
  `.tile-mark-flash` draws its ring on that box and a tile lifting out of its own
  mark reads as broken. `pt-2` on the row is what keeps an 8px transform inside a
  scroller.

  **The e2e spec was the trap the item predicted.** `ui-clicks.spec.ts` clicked a
  suit button and went straight for `/Void /i`, which no longer exists until a tile
  is tapped — so it now taps a marked tile in between and asserts exactly one
  `data-void-first`. `__e2e.voidSubmit()` sends the action directly and needed no
  change, which is also why the three specs that use it never covered this.

- [ ] **N31 - the lobby's Start button is below the fold, and N27 pushed it
  further.** Measured 2026-08-03 while verifying N27: on a 390x844 phone the
  primary action sits at **y=1044** in a 1180px-tall document. It was already off
  screen before the fan-limit row - roughly y=944 - so this is not a regression, but
  it is now 200px down rather than 100.

  `HostSetup`'s lobby is `min-h-dvh flex flex-col`, so the page grows and the
  document scrolls: nothing is clipped and the button is reachable. It is simply not
  *visible*, and a host who has just filled four seats has no on-screen way to know
  the game can start.

  **The fix already exists one screen over.** R3 solved exactly this on `RoundEnd`
  with a `sticky bottom-0` block, full-bleed via a negative margin cancelling the
  root padding, and a felt gradient so the scrolled content fades rather than
  clipping hard. Copy that shape rather than inventing one.

  Worth folding in while there: the share-URL and watch-link blocks are ~290px of
  the scroll, and they matter most in the first few seconds and never again. **Small.**

- [x] **N32 — the right-hand seat's tiles face away from the table.** *(Done —
  `.tiles-face-left` is the other quarter turn for the right column, and the across
  seat is turned all the way round, which reverses an N10 decision on purpose. See
  [docs/history.md](./docs/history.md).)* Reported
  2026-08-03: "the top of the tile is facing the right of the screen but it should
  face towards the center", for the seat to your right — the East chair as a player
  looking at the board names it — covering both their discard pile and the void
  declaration set above it.

  **Reproduced, and it is one hard-coded sign.** N10 turned the side seats' tiles a
  quarter turn, and `.tile-sideways .tile-face` does it with a single
  `rotate(90deg)` that **both** columns share. Measured on a 390px phone mid-play,
  the two side trays report an identical `matrix(0, 1, -1, 0, …)`: the left tray at
  x 8–64 and the right tray at x 326–382, turned the same way. That matrix sends the
  tile's top edge to the screen's **right** in both.

  Which is correct for exactly one of them. A discard's top points away from its
  owner and toward the middle of the table — that is what your own upright pile
  does. The left seat sits with the middle to its right, so top-facing-right is
  right; the right seat sits with the middle to its *left*, so it is drawn facing
  off the edge of the screen. The bug reads as "the tiles are turned" rather than
  "one column is mirrored", which is why it was reported as the whole seat.

  **The fix is a per-side sign and nothing else.** `rotate(-90deg)` for the right
  column: a 255×210 box occupies the same landscape footprint turned either way, so
  `getBoundingClientRect` reports the same rectangle and `viewport.spec.ts`'s tray
  geometry is untouched. `OpponentSide` already takes `side`, so the prop exists —
  what does not exist is a way for `Tile` to say *which* quarter turn, since
  `sideways` is a boolean. Widening it to `sideways?: 'cw' | 'ccw'` or adding a
  class on the run are both fine; the run is the cheaper one, since the whole column
  turns together.

  **Decide the pile's growth direction in the same change**, or this comes back as
  a second report. N10 reversed the *across* pile so it grows the way theirs does,
  and deliberately left the side columns growing downward without checking whether
  down is that seat's forward. Whichever way it goes, say so in the comment: the
  reversal is order only and never a 180° turn, because these are face up so that
  you can read them. **Small.**

  **The second half of the report is what made the across seat move too**, and it
  overturns the sentence above: "have the north/bot3 position facing in/upside
  down". N10's reason for stopping at a mirrored order — that these are face up so
  you can read them — was sound and the report still came, because a seat facing
  you whose tiles face you back is the same one-viewpoint board the order fixed
  half of. **N33 is what paid for it**: the readability that argument protected is
  now a tap away. So the across tray takes one 180° rotation, which turns order,
  lap direction and bleed together and makes the explicit `.reverse()` redundant.

  **Growth direction settled as no change.** Both side columns still grow downward:
  N10's reversal was right for a horizontal run of readable faces, which shows its
  own direction, and a column of sideways tiles does not — reversing only the right
  one would make the two side seats disagree more visibly than either agrees with
  its owner.

- [x] **N33 — tap a seat's pile to see all of it.** *(Done — `DiscardPileModal`,
  opened from all four trays including your own; `usePileTap` is what stops the
  tiles' own long press from opening it too.)* Requested 2026-08-03: tapping
  another player's discard pile opens a modal titled with their name showing every
  tile they have discarded, and a second tap dismisses it.

  **The information is already being withheld, which is what makes this worth
  building.** The side trays draw the last **10** and the across tray the last
  **9**, each with a `+N` counter for the rest (R1 capped them for height; the
  counter exists because silently dropping the earliest discards hid what a player
  needs to read a hand). A full pile runs to 20-odd tiles. So the modal is where the
  cap stops costing anything, rather than a new view of data already on screen.

  **No redaction question** — `PublicPlayer.discards` is the whole array and
  `views.ts` already projects it to every seat. One thing to carry over though:
  `firstDiscardIsVoid` says whether `discards[0]` is the tile that seat declared,
  and the tray marks it and holds it out above the pile. The modal has to mark it
  too, or the one tile in the list that means something different looks like an
  ordinary discard.

  **Two traps, both already paid for once.** `viewport.spec.ts` asserts no `.tile`
  inside a `.discard-tray` ever has a box outside that tray's, sampling for 90s
  across five viewports — so the modal must render **outside** the tray subtree and
  must not transform tray tiles, the same constraint that made N1's claim animation
  an overlay. And tray tiles are already `interactive`: they attach `useLongPress`,
  so a long press opens the 2× tile preview today. A pile-level tap handler has to
  cooperate with that rather than race it — `pointerHandledRef` is the existing
  seam.

  Worth settling before building: whether **your own** pile opens too (the request
  says another player's, but a control that works on three of four seats reads as
  broken); whether the modal draws the tiles **upright**, since in a list they are
  being read rather than placed on a table; and whether `Spectate.tsx` gets it,
  which is where the shelved spectator-parity items already sit. It also inherits
  the shelved modal focus-trapping gap in
  [frontend_todo.md](./frontend_todo.md). **Small-medium.**

  **All three answered.** Your own pile opens too — it is the one uncapped tray,
  but a control that works on three seats of four reads as broken, and that tray
  falls back on an internal scroll when the board runs short. The tiles are drawn
  **upright and unlapped** at `md`, because a lap is what a pile on a table looks
  like and these are being read. `Spectate.tsx` does **not** get it, and not for
  the shelved-parity reason: it already draws every discard uncapped, so there is
  nothing withheld to open. It takes `splitPile` and nothing else.

  Both traps were real. The modal renders from `PlayPhase`, never inside a tray.
  And a press long enough to open the 2× preview still ends in a `click` on the way
  back up — `usePileTap` swallows that one on the same `LONG_PRESS_MS` threshold,
  and consumes the suppression rather than leaving it standing.

- [x] **N34 — one name per suit, and it is the character on the tile.** *(Done —
  the glyph plus its pinyin, everywhere; the `.full` form keeps the English gloss.)*
  Reported 2026-08-03 against N30's own confirm button: "Void Man / 7 of Characters
  goes out first" reads awkwardly.

  It named one suit twice, differently — `void.confirm` read `suit.man` ("Man")
  and `tile.label` read `tile.man` ("Characters") — and **neither was the character
  printed on the tile being named**.

  **Man / Pin / Sou are gone rather than kept beside the pinyin**, which is where
  the first cut left them. They are not readings of these characters at all but
  Japanese (manzu / pinzu / souzu), borrowed into English mahjong writing from a
  different game. So `suit.*` and `tile.*` are `万 Wàn` / `饼 Bǐng` / `条 Tiáo`, and
  they come back with the Japanese catalog in **N23** — which is also where the
  question of whether `suit.*.full`'s glyph-plus-romanisation suits a reader who
  reads the glyph directly already sits. A test asserts "Man" appears in none of
  the three keys, so a revert is visible rather than quiet.

  `suit.*.full` keeps the plain-English gloss — `万 Wàn (Characters)` — which is not
  the Japanese part and is the only thing left saying what a suit depicts. It is
  what the void screen's three big buttons draw: the one place with room, and the
  screen where you are choosing a suit rather than reading one back.

---

## Shelved, with reasons

- **A real landscape layout for phones** (R4 Phase 2). Reasons recorded in
  [docs/viewport-audit.md](./docs/viewport-audit.md); landscape shows a
  rotate-to-portrait prompt during play instead.

- **The last three frontend-audit items** (2026-08-02), 17 of 20 having shipped.
  Keyboard hand reordering, modal focus trapping, and spectator parity for
  sound / move history / How-to-play. None is user-facing breakage, which is why
  they are the ones left; each with its reasoning at the top of
  [frontend_todo.md](./frontend_todo.md).
