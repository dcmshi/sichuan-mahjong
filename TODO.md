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

- [ ] **N2 — roll the dice, and mean it.** Novikov specifies this precisely
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

- [ ] **N4 — put animation pace in the host's hands.** Play already reads fast, and
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

  **Per-player or host-set?** Worth settling before building, because the two
  cost different amounts. The animation is *local rendering only*: every client
  gets the same `claimed` event and draws its own copy over a board that has
  already updated underneath, so one player watching a slow flight while another
  watches a fast one desyncs nothing and blocks nobody.

  That makes **per-player the cheaper option as well as the more flexible one** —
  localStorage beside the language and sound toggles, which are already exactly
  this shape, and no protocol change, no `ws.ts` narrowing, no room field. A
  host-set version needs all three for a value the server never reads.

  **`botSpeed` is genuinely different and should stay global**: bots move on the
  server, everyone watches the same moves land at the same moment, and a per-
  player value there would be meaningless. That is the distinction — server-
  driven pace is shared, local rendering is not.

  Small either way.

---

## Shelved, with reasons

- **A real landscape layout for phones** (R4 Phase 2). Reasons recorded in
  [docs/viewport-audit.md](./docs/viewport-audit.md); landscape shows a
  rotate-to-portrait prompt during play instead.
