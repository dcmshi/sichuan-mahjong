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

- [ ] **N10 — the board is drawn from one viewpoint, not from the table's
  centre.** Reported 2026-08-02. Two related faults, both of which make the
  board read as four copies of *your* view rather than one table seen from your
  seat.

  **Side seats draw their tiles upright, in a scroll box.**
  `OpponentSide.tsx:90` is `flex flex-wrap content-start w-20 overflow-y-auto`,
  capped at 6 tiles. Three things wrong at once: the tiles face the wrong way for
  those seats, they *wrap* into a ragged block rather than reading as a pile, and
  the whole thing is a **scroll region** — which is why it reads as clutter
  rather than as someone's discards. A scrollbar over six tiles is a layout that
  ran out of room and said so.

  Rotating them addresses all three. At a real table those players' tiles face
  sideways, and a rotated tile is wider than it is tall — so a run of them costs
  the column far less *height*, which is the budget that is actually tight. That
  matters because the side columns are what set the middle row's height, and R2.3
  already had to shrink them once to let `flex-1 min-h-0` pay off. Enough
  recovered height may remove the need to wrap, scroll, or cap at 6 at all.

  **The across seat's discards run the same way yours do.**
  `OpponentTop.tsx:71` renders `pileDiscards.slice(-9)` left to right, exactly
  like your own tray. At a table, North's pile grows away from the centre from
  *their* point of view, which from yours means it should mirror: **first
  discard nearest the centre, the tray extending outward.** Today the two piles
  read in the same direction, so the newest tile is on opposite sides depending
  on whose pile you are looking at — the kind of thing that is never noticed
  consciously and quietly makes the board harder to read.

  Same fix for the side seats once they rotate: the pile should grow away from
  the centre for its owner.

  **Traps.** `viewport.spec.ts` asserts no `.discard-tray` tile draws outside
  its tray box and that no tray overlaps `.play-well` — rotation changes every
  one of those boxes, which is exactly what that guard exists for. And
  `.tile-lap` laps tiles horizontally by 22.5% of the *art's* width; under
  rotation the lap axis rotates with it, so read
  [docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md) before
  assuming the lap still works. The caps (6 side, 9 across) exist for space and
  are rendered with a "+N more" indicator rather than silently truncated;
  rotation may free enough room to raise them. **Medium.**

- [x] **N11 — pre-select a discard while you wait, and back out if a claim
  appears.** *(Done — `armedDiscard.ts` decides, `OwnZone` carries it out. It
  fires only on a turn that offers nothing else, and says why when it doesn't.)*
  Requested 2026-08-02. Today the hand is inert until it is your
  turn: `OwnZone.tsx:192` clears `selectedTile` whenever `canDiscard` goes
  false, so three bot turns pass with nothing to do but watch. Let a player
  arm a tile early; play it the moment it becomes legal.

  **It fits Sichuan especially well.** `voidDiscardRule: 'strict'` means that
  until your void suit is gone your legal discards are *only* void-suit tiles —
  the decision is already made, so the taps are pure latency. That is the case
  worth optimising, more than the general one.

  **Nothing goes on the wire early.** Arming is local state; the existing
  `sendAction` fires only once the action is legal, so `ws.ts` needs no new
  message and no new validation. It is a client affordance over rules that
  already exist.

  **The cancel is the point, and it is the part to get right.** If a claim
  window opens where you could Pung, Kong or Hu, firing the armed discard would
  silently spend a claim you would have taken — the worst possible outcome,
  because it happens without you touching anything. Disarm whenever
  `yourLegalActions` contains a claim, and say so on screen rather than just
  going quiet.

  **A second case to decide, which the request does not cover:** you draw a tile
  before you discard, and an armed discard commits you *before* you see the
  draw. Sometimes that is exactly what you want; sometimes the draw is the tile
  that changes your mind. Recommend disarming on any self-draw that is itself a
  legal discard, and keeping the arm only through turns where nothing you drew
  could matter — or, simpler and more honest, arm-to-highlight and still require
  the confirming tap, so the saving is the decision rather than the action.
  Worth trying the aggressive version first and seeing whether it ever bites.

  **Traps.** `selectedTile` must survive view pushes instead of being cleared by
  the `canDiscard` effect, but must still clear when the tile leaves the hand —
  the hand reconciles on `handKey`, so hook the same signal. Needs a
  fired-once guard like `ClaimPanel`'s `sent`, or a slow connection re-arms and
  discards twice. And the mandatory first-discard flip (A35) is not a discard:
  on that turn there is nothing to arm. **Small-medium.**

  **Built aggressive, but with one condition on firing: the turn must offer
  nothing else.** The item recommends trying the aggressive version and seeing
  whether it bites — it bites, and the worst bite is not the claim window this
  item already names. The server draws for you, so by the time a discard is legal
  the drawn tile is *already in hand and already in `yourLegalActions`*: an
  unconditional auto-fire would throw away a self-drawn winning tile before you
  were ever shown it. So `armedDiscardOutcome` stands down on `declareHuOnDraw`,
  `declareHeavenly` and `declareKongOnTurn` as well as on any claim, and the
  status line says which. What is left firing automatically is the case the item
  identified as pure latency: a strict void discard with no decision in it.

  `armedTile` is its own state rather than a flag on `selectedTile`, because that
  one is cleared by the `canDiscard` effect — the exact condition an armed tile
  exists to survive. Clearing it on arm is also the fired-once guard.

  **Verified in the running app, both ways**, because the two paths that matter
  are ones a unit test can only assert about a hand-built view: two automatic
  discards (the tile left the hand, the tray grew, no tap, no error toast) and one
  stand-down on a real claim window. The unit tests cover the eleven verdicts,
  including the drawn-winning-tile case that a played round reaches only by luck.

- [x] **N12 — the event feed keeps its old language after a switch.** *(Done —
  the feed stores `{ id, key, seat }` and calls `t` in the JSX, as `PlayHistory`
  already did.)* Reported
  2026-08-02. "X ponged" and "X declared Hu!" stay in whatever language they
  were announced in; only lines added *after* the switch use the new one.

  **The cause is one word in a type.** `EventFeed` holds
  `useState<{ id: number; text: string }[]>` and fills it with
  `tr(line.key, …)` at announce time (`EventFeed.tsx`), so the translation is
  baked into state and nothing re-runs when `lang` changes.

  **The fix already exists twice over in this codebase.** `PlayHistory` keeps
  `{ key, seat, tile }` and translates at render — which is why the move history
  *does* switch language mid-round — and the store's own comment on `history`
  says why: "Raw events, not formatted lines: the store has no translator, and a
  player switching language mid-round should see the whole list switch with
  them." The feed is the one place that didn't follow it. Store
  `{ id, key, seat }` and call `t` in the JSX.

  **Testable without a DOM**, unlike most feed behaviour: `feedLineFor` is
  already exported and already returns `{ key, seat }`. The gap is only that the
  component throws that structure away, so a test asserting the stored shape
  carries no rendered text is enough. **Small.**

- [x] **N13 — whose turn it is deserves more than 10px of text.** *(Done with N7
  — a filled amber pill in the bar, plus a pulsing inset ring on the hand block,
  which is the recommendation below. Stands down during a claim window so two
  amber prompts never compete.)* Reported
  2026-08-02. The only indication is `t('play.yourTurn')` in the top bar, in the
  `text-xs` row, coloured amber (`PlayTopBar.tsx:50`). Nothing else on the board
  changes: `isMyTurn` in `OwnZone` gates which buttons exist and whether tiles
  carry `data-discardable`, but it lights nothing up. On a phone, at the top of
  the screen, while you are looking at your hand at the bottom, it is easy to
  miss that you are the one holding the game up.

  Candidates, cheapest first: a ring or glow on the hand row itself, which is
  where the player is already looking and where the action has to be taken; the
  amber pulse the claim bar already uses, so the two read as the same family; or
  a brief centre-screen cue at turn start, which is the most obvious and the most
  intrusive. The hand-row treatment is the recommendation — it puts the signal
  where the decision is.

  **Fix it together with [N7](#open)**, which is the same indicator being
  clipped to zero width on a 320px phone. N7 is "you cannot see it", this is
  "seeing it is not enough"; fixing either alone leaves the other, and both want
  the same measurement pass. Whatever lands needs a guard that the cue is
  actually present when `view.turn === you`, since the current one is a colour
  swap that no test asserts. **Small-medium.**

- [x] **N14 — the wall empties from the same corner whatever the dice said.**
  *(Done — the head comes from `breakOffset`, the walk is a real ring, and
  `wallDrawn` carries both open ends. Verified in a played round: the gap opened
  at ring 20 and wrapped through the right wall into the bottom one.)*
  Reported 2026-08-02. N2 made the break real in the engine, and the diagram does
  not read it: the throw picks a wall and an indent, the tiles come off from
  there, but on screen the run always starts at the top-left.

  **The cause is one index.** `wallStacks` (`WallDiagram.tsx:53`) computes
  `throughThisStack = i * 2 + 2` from stack **0**, so stack 0 always empties
  first, and `wallSlots` places stack 0 at `side === 0, i === 0` — the left end
  of the top wall. Nothing in either function takes the break as an argument.

  **The answer is already on the wire.** `PlayerView.dice` is projected
  unredacted on purpose (`views.ts:89` — "dice are thrown face-up on a table"),
  carrying `wallSeat`, `indent` and `breakOffset`. No protocol change, no engine
  change; the diagram just has to be told where to start.

  **Three mappings make this more than passing an offset**, and they are the
  reason to think before coding:

  - **Absolute seat to screen side.** `wallSeat` is a `Seat`; the diagram's four
    sides are screen-relative. `projectView` orders `others` counterclockwise
    from the viewer (`views.ts:292`), which is how `relSeat` works, but there is
    no exported seat-to-side helper — the client would compute
    `(wallSeat - you + 4) % 4` itself.
  - **108 stacks of wall against 28 stacks of diagram.** `breakOffset` indexes
    the 108-tile array; the diagram is 7 stacks a side because 4 × 7 × 2 = 56 is
    what the deal *leaves*, not what the wall *was*. So the break cannot be a
    slot index — it maps proportionally, or the head is placed per-wall from
    `wallSeat` + `indent` and the arc walked from there.
  - **The walk is four runs, not a ring.** `wallSlots` goes top left-to-right,
    right top-to-bottom, bottom **left-to-right**, left top-to-bottom — so it
    already jumps from the bottom-right corner back to the bottom-left. That is
    invisible while the head is fixed at a corner; it stops being invisible the
    moment the head moves and the run has to wrap.

  **And the same function gets the other end wrong, which is worth fixing in the
  same pass.** `wallRemaining` is `kongDrawIndex - drawIndex + 1`
  (`views.ts:317`), and `kongDrawIndex` starts at 107 and *decrements*
  (`actions.ts:781`): kong replacements come off the **tail**, walking back
  toward the break from the other side. A real wall empties from both ends
  inward. The diagram collapses both into one count and takes it all off one
  corner, so a round with two kongs draws a wall that is wrong at both ends. The
  fix wants `drawIndex` and `kongDrawIndex` rather than the single total —
  which does mean a new projected field, and is the one part of this that
  touches `views.ts`.

  **Testable without a DOM**, which is why it is cheap to get right:
  `wallStacks` and `wallSlots` are exported for exactly that and
  `packages/client/tests/wall-diagram.test.ts` already asserts on them. A test
  that the same `remaining` puts the gap in different places for different
  `wallSeat`/`indent` values is the whole guard.

  **Recommendation: place the head per-wall from `wallSeat` and `indent`, make
  the walk a real ring first, and take the two-ended fix with it.** Polish, so
  it can wait — but it is polish that makes N2's dice mean something on screen,
  which is the only place a player can see them. **Small-medium.**

  **Built as recommended, with one simplification.** The head is not derived from
  `wallSeat` and `indent` separately — `breakOffset` already carries both, so
  `wallHead` maps it proportionally onto the 28-stack ring and rotates by the
  viewer's seat in one expression. That covers all three mappings the item
  listed: the seat-to-side rotation falls out of the same subtraction, and the
  108-to-56 scale difference is the proportion.

  The ring is genuinely closed now. The old walk ran top left-to-right, right
  top-to-bottom, bottom **left-to-right**, left top-to-bottom, so it jumped from
  the bottom-right corner back to the bottom-left. Bottom and left are reversed,
  which makes each side's exit corner the next side's entry.

  The other end went with it: `wallDrawn: { head, tail }` is projected into both
  views, so the diagram opens a second gap behind the break as kong replacements
  come off `kongDrawIndex`. **The engine test asserts the hop into the view, not
  only the sums** — a projected field that never arrives would just leave the
  diagram drawing the old way, silently, which is the N6 lesson.

  **Found on the way, and filed rather than fixed: [N22](#open).** With the head
  pinned to a corner it was invisible that the engine walks the walls in the
  opposite direction to the turn order.

- [x] **N15 — "You rolls for the wall break".** *(Done — both dice stages now go
  through one `throwerKey` helper, unit-tested, because the browser reaches the
  second-person case only a quarter of the time.)* Reported 2026-08-02. The dice
  overlay's wall stage is `t('dice.wallTitle', { name: nameOf(view.dealer) })`
  (`DiceOverlay.tsx:147`), and `nameOf` returns the string "You" for your own
  seat — so whenever you are East the sentence takes a second-person subject with
  a third-person verb.

  **The fix already exists 11 lines above it.** The seating stage hit exactly this
  and was fixed at the time: `view.dealer === view.you.seat` picks
  `dice.youAreEast` rather than substituting a name into `dice.isEast`, and the
  comment there says why — "Your own case needs its own sentence, not a name
  substituted into someone else's". The wall stage was missed.

  So: a `dice.wallTitleYou` in all three catalogs ("You roll for the wall break")
  and the same ternary. The Chinese is unaffected — 掷骰 takes no agreement — but
  the catalogs move together, so all three get the key.

  Not practice-specific, though that is where it shows up most: East comes from
  the seating throw and then rotates each round, so any table hits it whenever
  the local player is dealer. **Small.**

- [ ] **N16 — group a winning hand into the sets that won it.** Requested
  2026-08-02. The round-end reveal draws a winner's concealed tiles as one flush
  run with the declared melds beside it and the winning tile ringed
  (`RoundEndRow.tsx:76`), so the hand is all *there* but you still have to parse
  it yourself to see why it wins. Showing it as four sets plus a pair says how.

  **The engine already decomposes it.** `findAllWinningShapes(tiles, melds,
  voidedSuit)` returns `WinShape[]`, and both `SetShape` and `WinShape` are
  exported from `hand.ts` — `{ kind: 'chow' | 'pung' | 'kong' }` and
  `{ kind: 'standard', sets, pair }` / `{ kind: 'sevenPairs', pairs }`. So this is
  a rendering task over an existing pure function, not new engine work. Seven
  pairs falls out for free, which is the case that most needs it.

  **The trap is that a hand parses more than one way, and the scored shape is not
  recorded.** `findAllWinningShapes` returns *every* decomposition — 111222333 is
  three pungs or three chows — and `scoring.ts:163` iterates all of them and keeps
  the best-scoring one. But `HuRecord` carries `fans`, `handValue`, `winningTile`
  and `subtype`, and **not the shape those fans came from**. Pick a different
  decomposition in the UI and the breakdown will contradict the fan list printed
  directly beneath it, which is worse than not grouping at all.

  Two ways out, and the second is the recommendation:

  - Re-run the same selection in the client. No protocol change, but it duplicates
    the tie-break in `scoring.ts` and the two will drift.
  - **Put the chosen shape on `HuRecord`.** Scoring already has it in hand at the
    moment it picks the winner, so it is a field, not a computation. This is the
    honest one: the reveal should show the shape that *was scored*, not a shape
    that also happens to win.

  If the shape goes on `HuRecord` it needs a redaction decision like everything
  else reaching a client (**[ARCHITECTURE.md §5.2]**) — it is public, since it
  describes a hand that has just been revealed to the table — and it lands in the
  snapshot, so old saved games will not have it. The renderer must therefore treat
  it as optional and fall back to today's flat run.

  Also worth deciding: whether to group **non-winning** hands. The request says
  "any finished hands", but a losing hand has no decomposition — that is what
  makes it losing — so there is nothing to group. Winners only. **Medium.**

- [x] **N17 — practice mode takes no settings at all.** *(Done — a "Bot settings"
  disclosure on the landing screen carrying pace and level, remembered in
  `prefs.ts`; practice now sends `rules.botSpeed`.)* Requested 2026-08-02.
  "Practice (vs Bots)" goes straight from tap to deal: `startPractice` in
  `Landing.tsx:84` posts a lobby, fires three `addBot{difficulty:'easy'}`, and
  sends a bare `sendAction({ t: 'startGame' })` with **no `rules` at all**
  (`Landing.tsx:104`). So practice silently takes every default — easy bots,
  normal pace, the default claim window, no 換三張 — and a solo player has no way
  to change any of it without hosting a lobby and inviting nobody.

  Bot pace is the one asked for, and it is the one that bites: practice is where
  you are learning, which is exactly when 900ms a move is too fast to follow.

  **Nothing server-side needs to change.** `botSpeed` already rides on
  `startGame.rules` and is narrowed by `botSpeedFrom`; practice just isn't sending
  it. Same for `claimWindow` (N6, shipped) and `huanSanZhang` — all three are
  already accepted on that message, so this is a client screen and one object
  literal.

  **The shape is the question, not the plumbing.** Practice's whole appeal is one
  tap, and a settings form in front of it spends that. Recommend a disclosure —
  the button stays, with a small "Settings" affordance beside it that reveals pace
  (and later the rest) and remembers the choice in `prefs.ts` beside the animation
  prefs, so it is a once-ever decision rather than a prompt every session.

  Note the interaction with the harness: `--bot-delay` / `SM_BOT_DELAY_MS`
  **outrank** anything on `startGame.rules`, which is what keeps the Playwright
  suites fast. A practice pace setting must not change that precedence.
  **Small-medium.**

  **The disclosure was the wrong shape, and a real user proved it (2026-08-02).**
  The recommendation above — keep the one tap, hide the settings behind a small
  affordance — shipped as a centred 12px underlined link between the Practice
  button and "Watch a Game". That put it in the same visual class as
  "About & Credits" at the foot of the page. The first person to go looking for
  the feature did not find it and reported it as never deployed; it was deployed,
  and the bundle on the live URL contained every string. **An affordance nobody
  finds has failed, whatever the code does.**

  It is now `screens/PracticeSetup.tsx`, a screen of its own reached from the
  Practice button, matching the flow Host already had. Each of the three bots
  carries its own level rather than one shared one — three easy opponents is the
  ladder that teaches least — so `PracticePrefs.botLevel` became `botLevels`, and
  `parsePracticePrefs` reads the old single-level shape as three of that level,
  because the key is already on real devices and a pref that fails to parse
  resets a choice without saying so.

- [x] **N18 — bot difficulty is one setting for the whole table.** *(Done — per-seat
  "+ Easy"/"+ Medium", a level picker on each seated bot, and `addBot` now names
  its seat. Fixed a latent bug on the way: the per-row buttons filled whichever
  seat was open first.)* Requested
  2026-08-02. The lobby has a single easy/medium selector and it applies to
  whichever bot is added next: `HostSetup` sends
  `addBot{difficulty: botLevel}` per empty seat, so filling three seats with the
  selector on Easy gives three easy bots. Setting it per seat would let a table
  mix — one medium opponent among two easy ones, which is a better practice
  ladder than all-or-nothing.

  **The protocol already carries it per bot.** `addBot` takes
  `difficulty: 'easy' | 'medium'` on each message and `RoomSlot.difficulty` is
  already per seat — the room stores it per slot and `bot.ts` reads it per slot.
  So the server side is done; what is missing is a per-seat control in the lobby
  instead of one shared selector, and a way to change a seat's level after the bot
  is added (today that means kick and re-add).

  Worth doing with **N17**, which wants the same choice available from practice:
  three bots at one level is precisely the case where mixing is interesting, and
  both changes are about the same screen's worth of controls. A third level is
  **N19**, and this item should not wait for it. **Small-medium.**

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

- [ ] **N21 — check the round's *payments* against sources other than the PDF.**
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

- [ ] **N22 — the wall diagram walks the ring against the turn order.** Found
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
  all (`tile.man` is "Characters" in English and 万 in both Chinese catalogs —
  Japanese would presumably want 萬子, French probably keeps the Chinese
  character); and whether `suit.*.full`, which currently pairs the glyph with a
  romanisation, is right for a Japanese reader who reads the glyph directly.

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
