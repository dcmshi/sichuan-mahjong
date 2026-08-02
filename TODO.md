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

- [ ] **N3 — a "what can I win with" section in How to play.** The help covers
  the flow but never states the shape of a winning hand: four sets plus a pair,
  seven pairs, and which of the ten fan combinations are reachable given the
  void suit. Pure content plus `Tile` to draw examples — no engine, no state.

  Three catalogs move together (the parity test enforces it), and the Chinese
  needs a speaker rather than a gloss. **Small, but the writing is the job.**

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

- [ ] **N5 — let the pace change once the game has started.** Bot pace is already
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

- [ ] **N6 — let the host set the claim window.** How long you get to answer a
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

- [ ] **N7 — the turn indicator is invisible on a 320px phone.** Found while
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

- [ ] **N8 — the claim panel covers the hand you need to see.** Reported from
  play, 2026-08-02. When a discard opens a claim window, the Pung / Kong / Hu /
  Pass bar is `fixed bottom-0 left-0 right-0 … z-20`
  (`components/ClaimPanel.tsx:78`) and your hand is the bottom-most row of the
  play screen — so the bar lands squarely on top of it.

  **This is a decision made blind, not just an occlusion.** Claiming is
  frequently the *wrong* move: a pung can break a pair you were using, strand a
  run, or leave you unable to discard into your void suit. Those are exactly the
  judgements that need the hand on screen, and the panel hides it for the whole
  10-second window.

  **Two obvious fixes were tried and measured, and neither works. The cause is
  not the bar's positioning.** Measured live at 320×568 with a window open:

  | | top..bottom |
  |---|---|
  | claim bar | 525..568 |
  | hand container (`px-2 py-2`) | 419..**525** |
  | the hand's `ul.tile-run.tile-lap` | 471..**517** |
  | a hand `li` | 511..552 |
  | the `.tile` inside it | 511..**546** |

  The hand's *layout* box ends at 525, exactly where the bar begins — the box
  model says they do not overlap. But the tiles **paint** to 546, about 21px
  past their own container, because a tile in a `.tile-lap` run is drawn larger
  than its layout box. So the overlap is between painted ink and a correctly
  positioned bar.

  That is why both attempts failed:

  1. **Padding the scroll container** by the measured bar height moved the bar's
     top to exactly the hand container's bottom — and changed nothing visible,
     because the tiles were already overflowing that edge.
  2. **Putting the bar in flow** after the hand is where it already sits in the
     tree, and the board is `h-dvh`, so the bar lands in the same place either
     way. Visually a no-op.

  So the fix has to give the hand room for the ink it actually draws, which
  means reserving the lap overhang rather than the layout height. **Read
  [docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md) first** —
  the overhang is a consequence of the 22.5%/29% lap geometry and is
  proportional to tile size, so a hard-coded pixel padding will be wrong at
  another size. A speculative `pb-6` on the hand container was tried and did not
  move the flagged count off 13.

  **The guard to add with the fix** (written, measured, then reverted with the
  rest): sample `.claim-panel` inside the existing round loop in
  `viewport.spec.ts`, count hand tiles whose painted box intersects the bar's,
  and assert both that at least one claim window was seen — otherwise the check
  passes for free on a round that offered no claim — and that the covered count
  is zero. It reported **13 covered tiles** on both `chromium` and `se-portrait`,
  so it does catch the defect. **Medium**, and it is really a tile-geometry
  change wearing a layout bug's clothes.

- [ ] **N9 — the lobby offers bot pace at a table with no bots.** Reported
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

- [ ] **N11 — pre-select a discard while you wait, and back out if a claim
  appears.** Requested 2026-08-02. Today the hand is inert until it is your
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

- [ ] **N12 — the event feed keeps its old language after a switch.** Reported
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

- [ ] **N13 — whose turn it is deserves more than 10px of text.** Reported
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
