# CLAUDE.md — Sichuan Mahjong

Web-based 4-player Sichuan ("Bloody Rules") mahjong. Mobile-first PWA.
Runs three ways off one build — LAN, Tailscale, or hosted on a public URL —
because the client derives its origin and has never known a server address.
Live at `https://sichuan-mahjong.onrender.com`.

---

## Where things are documented

**Keep this file short.** It holds only what a session cannot derive from the
code: the invariants, the traps, and the routing table below. Per-item history
belongs in `docs/history.md`, not here.

**Start here**

| File | Holds | Write here when… |
|---|---|---|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | The reference — types, engine API, full ruleset, protocol, persistence, networking, testing strategy. Has a §-index at the top | …you change behavior, a type, or a rule |
| **[TODO.md](./TODO.md)** | What is *open*, and nothing else — kept short on purpose | …you open or close a piece of work |
| **[docs/history.md](./docs/history.md)** | Everything closed, newest first, each with its diagnosis: the phase log, audits **A1–A48** / **F1–F25** / **R1–R7**, hosting **C1–C10**, features **N1–N46**. **Opens with a find-an-item-by-id table** — that is how you turn a bare `(N38)` in a comment into the entry that explains it | …you finish something; add a section at the top *and* a row to that table |
| **[README.md](./README.md)** | User-facing: install, host/join, CLI flags | …you change the CLI or the player-facing flow |

**Before you touch it** — the deep dives, each written after something went wrong

| File | Holds | Read it when… |
|---|---|---|
| **[docs/traps-and-decisions.md](./docs/traps-and-decisions.md)** | The long form of the traps below, plus decisions already settled so they are not relitigated | …you are picking this up cold, or hit a layout/CSS surprise |
| **[docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md)** | How tiles are drawn (the art, lapped), the measured layer geometry, every knob, the four things easy to get wrong | …you are changing how a tile looks |
| **[docs/layout_investigation.md](./docs/layout_investigation.md)** | The N40–N44 play-screen pass: how the height divides, every rejected option with its measurement, the seated-river rule, and how the probe lies if you let it | …you change the play screen, or run `layout-probe.mjs` |
| **[docs/viewport-audit.md](./docs/viewport-audit.md)** | Measured mobile viewport overflow, and why the landscape layout is shelved | …you change the play or round-end layout |
| **[docs/design-hosted-server.md](./docs/design-hosted-server.md)** | The Render deployment: deploy steps, why it needs no client change, and why the hardening is *not* conditional on `--hosted` | …you are working on hosting, or on anything the tailnet used to protect |

**The audit record** — what was checked, what was found, and what was knowingly left

| File | Holds | Read it when… |
|---|---|---|
| **[docs/audit-refactor-and-coverage.md](./docs/audit-refactor-and-coverage.md)** | The 2026-08-04 refactor/coverage pass (A41–A48): measured coverage per package, one real bug, the dead symbols, the duplications, and why the client's 42% is not a finding | …you run `pnpm test:coverage`, or wonder what is deliberately untested |
| **[docs/audit-payments.md](./docs/audit-payments.md)** | Every payment rule checked against three sources outside the PDF, with a decision each. The fan cap is the one divergence | …you change a payment, a fan value, or `fanCap` |
| **[docs/audit-public-deployment.md](./docs/audit-public-deployment.md)** | What a public URL exposes that a LAN never did — five findings, each reproduced against the live service | …you touch the WS boundary, the HTTP routes, or anything a stranger can reach |
| **[docs/frontend-audit.md](./docs/frontend-audit.md)** | The 2026-08-02 client audit: 17 of 20 shipped, the three shelved with reasons | …you pick up one of the three, or run another client sweep |

**External and legal**

| File | Holds | |
|---|---|---|
| **[LICENSE](./LICENSE)** | MIT for code, CC-BY-SA 4.0 for the tile art, and the binary as a combined work carrying both | …you add or change a tile, or change what the release build embeds |
| `SBR_ENG_part_1.pdf` | Novikov, *Sichuan Mahjong? It's that simple!* — the canonical ruleset | read-only; extract with `pdftotext` when a rule is in question |
| [themahjong.guide](https://themahjong.guide/) | *Mahjong: a Visual Guide* — the second reference used alongside the PDF, and **where the tile SVGs were obtained**. The licence chain is Commons/Cangjie6, evidenced per file in `credits.json` | cite it beside the PDF when a rule or a tile's provenance is in question |

---

## Dev commands

```bash
pnpm install
pnpm --filter @sichuan-mahjong/engine build  # required before typecheck/test
pnpm typecheck
pnpm lint                                    # biome check .  (pnpm format to fix)
pnpm test                                    # Vitest (engine + server + client)
pnpm test:coverage                           # same, with v8 coverage per package.
# The server run reports one unhandled `Timeout calling "onTaskUpdate"` — an
# instrumentation artifact (coverage makes bot-smoke's ladder ~6x slower and the
# worker RPC gives up mid-test), not a failure. All 167 server tests still pass.
pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm --filter sichuan-mahjong start          # run server (serves built client)

# e2e needs the client built with the window.__e2e helpers, then a built server
# (Playwright starts the server itself from packages/server/dist/main.js, with
# SM_SEED set so the deal is fixed — some guards assert on what a round contains):
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build   # PowerShell: $env:VITE_E2E=1
pnpm e2e

# Regenerate the README screenshots in docs/ (needs the VITE_E2E client +
# built server above; drives the real app and writes into the repo)
pnpm shots

# Layout probe — the worst case at nine viewports, measured and shot. Needs the
# VITE_E2E client above and a server started with --bot-delay 120 (not 0: the
# board then outruns the camera). Writes prototype-shots/<label>/, never deletes.
node scripts/screenshots/layout-probe.mjs <label>

# Tile sandbox — every tile the app draws, solo and lapped, at every size it uses.
# Open the file directly: no build, no server, no game. It links the real
# index.css and uses the app's own classes, so the loop is edit-and-refresh.
# See docs/handoff-tile-rendering.md.
start scripts/tiles/sandbox.html     # macOS: open scripts/tiles/sandbox.html
pnpm tiles:sandbox                   # same page, rendered headless to a PNG

# Re-measure where the ink sits inside each frame (needs the Playwright chromium).
# Nothing generates assets from it any more — glyph-boxes.json is the evidence for
# the 22.5% overlap, so rerun it only if the source art changes.
node scripts/tiles/measure-glyphs.mjs

# Release binaries (embed the client, no persistence): needs Bun
bun run scripts/release/compile.ts

# Hosted mode, as Render runs it. PORT is read from the env; --hosted drops
# mDNS/Tailscale/QR, trusts one proxy hop, and tightens limits and sweeps.
PORT=8099 node packages/server/dist/main.js --hosted
```

---

## Key files

```
packages/engine/src/
  tiles.ts       tile encoding (TileId 0..107, TileType 0..26)
  rng.ts         xoshiro128** seedable PRNG — the only source of randomness
  dice.ts        the two throws: seating (highest is East) and the wall break
  hand.ts        isWinningHand, isTenpai, ukeire
  scoring.ts     fan calc, payment matrix, TMV
  claims.ts      claim window resolution
  state.ts       GameState, PlayerState types
  actions.ts     applyAction(state, action) → ActionResult
  views.ts       projectView(state, seat) → PlayerView (per-viewer redaction)
  protocol.ts    ClientMsg / ServerMsg types
packages/server/src/
  room.ts        GameRoom (owns GameState, drives bots, broadcasts views)
  bot.ts         easy / medium / hard bot heuristics, dispatched by BOT_PLAY
  shanten.ts     how far a hand is from a win — the gradient the engine has none of
  ws.ts          WebSocket gateway (validates every inbound frame)
packages/client/src/
  main.tsx       window.__e2e test helpers (VITE_E2E builds only)
  armedDiscard.ts  fire, hold, or stand down with a reason
  voidSelection.ts suit + leading-tile choice on the void screen
  discardPile.ts   the declaration/pile split + `riverCells`, shared by all three trays
  handOrder.ts     keep the dragged arrangement across a server push
  helpExamples.ts  the hands How to Play draws, and the fan table it reads
  screens/PracticeSetup.tsx  bot pace + a level per bot, before practice starts
  store/         Zustand store (mirrors PlayerView)
  session.ts     seat token in localStorage — what makes "Rejoin" work
  prefs.ts       per-player display prefs in localStorage (animation pace)
  ws/client.ts   WsClient singleton + sendAction
  components/DiceOverlay.tsx  the two throws, revealed at the deal
  components/WallDiagram.tsx  the wall, opened where the dice said
  components/SettingsMenu.tsx the ⚙ popover: sound, language, animation + bot pace
e2e/
  game.spec.ts   full bot round      } chromium only (drive the game via __e2e)
  match.spec.ts  2-round match       }
  house-rules.spec.ts  the host's 換三張 toggle — the only spec that reaches huan
  viewport.spec.ts     vertical-overflow, tray-clipping + claim-bar/hand overlap guard
  ui-clicks.spec.ts  real UI taps — runs on 5 viewports (phone/tablet × orientation)
scripts/
  icons/         PWA PNG generation (rerun if icon.svg changes)
  screenshots/   docs/*.png capture — `pnpm shots`, kept out of `pnpm e2e`
  tiles/         sandbox.html (open it directly) + measure-glyphs.mjs (needs chromium)
```

Full tree: [ARCHITECTURE.md §3](./ARCHITECTURE.md#3-repo-layout).

---

## Conventions

- **Engine stays pure.** No I/O, no deps, randomness only through `rng.ts`, **and
  the clock passed in rather than read** — `applyAction` and `createGame` take a
  trailing optional `now` defaulting to `Date.now()`, which is what lets
  `phase1.test.ts` assert two runs of a seed are deep-equal instead of merely
  agreeing on the outcome (A52). Replays, determinism, and the fast-check property
  tests depend on all of it.
- **Everything reaching a client goes through `views.ts`.** Any field added to
  `GameState` needs a redaction decision before it lands in `PlayerView` —
  concealed kongs, drawn tiles, and the face-down first discard are all redacted
  today, each after an audit caught the leak. **`GameEvent` is the second channel
  and needs the same decision:** events are produced once and broadcast to every
  seat, so `redactEventsFor` has to strip them per viewer. Drawn tiles (A31) and
  void declarations (A40) both leaked that way.
- **The WS boundary trusts nothing.** Inbound frames are validated in `ws.ts`;
  server-only actions (e.g. `claimWindowExpire`) are never accepted from a client.
- **Client tests run without a DOM.** There's no jsdom or testing-library, so
  anything worth asserting lives in the store, the transport, or a pure helper
  the component calls — that's why `tileLabel`, `feedLineFor`, `voidChoice`,
  `kongOffers`, `splitPile` and the claim-countdown maths are exported. Add UI
  logic the same way.
- **The board is memoised, and a stale handler silently undoes it.** `Tile`,
  `TileBack` and the four zones are `memo`, because local state in `PlayPhase`
  (opening a discard pile) would otherwise rebuild ~80 tiles before the modal
  mounted — 225ms → 96ms, measured at 4× CPU throttle. Memo on a zone only bites
  while `onOpenPile` keeps its identity, which is why those handlers are
  `useCallback` keyed on the **seat number** and not on `view`. A tile is a plain
  `<div>` unless it can lift (`selected` *passed*, whatever its value) or answer a
  gesture (`onClick`); anything else gets no framer-motion at all. (N38)
- **Screenshots are generated, not taken.** `docs/*.png` come from `pnpm shots`;
  regenerate them rather than hand-capturing, or they drift out of date again.

---

## Invariants and traps

The long form, with the measurements behind each, is in
[docs/traps-and-decisions.md](./docs/traps-and-decisions.md).

**Rules and pacing**

- **A wind is a distance from East, never a seat index** — `windOfSeat(seat, dealer)`
  in `client/src/wind.ts`, since East rotates every round. Play passes
  counterclockwise, which here means seat-*decreasing*: `(from + 3) % 4`, and the
  client seats `seat + 3` to the viewer's right. `wind.${seat}` is **never right**,
  not even when the dealer is seat 0 — the winds there are East, North, West,
  South, so two rows of four still disagree. Getting this backwards cost four
  separate bugs before N26 swept the last nine call sites.
- **A wind is per round; a chair is durable, and they are not one column.** Where
  no single round is in view — the lobby and host setup before the seating dice,
  and any match total spanning rounds — the label is `seat.0`–`seat.3`, not a wind.
  `seatLabelKey` picks, and tests `dealer == null` rather than `!dealer`, because
  seat 0 is a falsy dealer.
- **The bots are a `Record<BotDifficulty, …>` in `room.ts`, not a ternary.** Three
  rungs, and the ladder is asserted rather than assumed: `bot-smoke.test.ts` seats
  each level against the one below over 40 deals. That guard exists because N19
  found **medium losing to easy** — its ukeire signal is identically zero until the
  hand is tenpai, so it had been discarding in hand order since it shipped.
  `shanten.ts` is what both now rank by. Hard sees no more of the table than medium
  (the same `anyOpponentTenpai` peek, and nothing else); its danger read is built
  from declared void suits and per-seat discard piles, which are public.
- **The dice are real, and they change which tiles a seed deals.** Both throws come
  from `rng.ts` on a stream of their own (`seed + ':dice'`), and the wall break is
  applied as a rotation of the wall array — so no distribution changes, only the
  deal. `createGame`'s `dealer` is `Seat | null`: null asks for the throw, a seat
  pins it.
- **A rule that depends on the hand must be read from the hand, never latched.**
  Strict void-suit enforcement is "while you hold one", and it was cached in a
  `voidCleared` flag set the moment the last one left. Draw one back off the wall
  and the engine, the legal-action list *and* all three bots agreed you were free
  — so you could discard anything while holding a tile you can never win with, and
  the bots did for the rest of the round. `mustPlayVoidFirst(state, seat)` is now
  the single definition and all five callers ask it. Only a draw can re-arm it;
  claims cannot, because `canPungOnTile` / `canKongOnTile` / `canHuOnTile` all
  refuse a void-suit tile. (N46)
- **A kong's promoted/postponed subtype is derived, not read off the wire.** The
  two differ only in where the fourth tile came from, and that is worth 3 points
  — promoted collects 1 from each opponent, postponed collects nothing. The
  engine validated the exposed pung and the hand tile but took `action.subtype`
  as sent, which is the one field the "WS boundary trusts nothing" convention had
  left trusted. `promotedKongSubtype(state, tileType)` in `state.ts` is now the
  single definition and `views.ts` asks it too, so the button and the payment
  cannot disagree. **`concealed` is still a real choice** and stays on the wire.
  The same pass closed the PDF's second kong restriction, which nothing
  implemented: **no kong at all on a turn entered by a pung** — a pung is not a
  draw, and `turnEnteredByPung` reads the same `drewThisTurn` that A7 added. (A50)
- **A meld is a pung or a kong, never a chow.** Sichuan has no chow claims, so
  `Meld` is a two-way union and every meld is one tile type repeated. It carried a
  third `chow` variant until A47, which bought **seven** unreachable branches
  across `actions.ts`, `hand.ts`, `scoring.ts`, `bot.ts` and `MeldDisplay.tsx`.
  **`WinShape`'s chow in `hand.ts` is the real one** and is not the same thing: a
  *winning hand* contains runs, they just can't be claimed off a discard. Re-adding
  the meld variant for symmetry with that one is re-adding dead code.
- **換三張 is opt-in and off by default** — it is not in Novikov's ruleset, which
  deals straight into the void declaration. Practice mode therefore never reaches
  the huan phase, which is why `e2e/house-rules.spec.ts` exists.
- **Bot pace is a pace, not a rule.** A `GameRoom` field rather than `GameConfig`,
  because a replay of the same seed is identical at any value. **`--bot-delay` /
  `SM_BOT_DELAY_MS` outrank the lobby and the ⚙ menu both**, which is what keeps
  whole-round suites fast — and it is why the menu shows a `pinned` state instead
  of accepting taps the server discards.
- **The claim window *is* a `GameConfig` field**, so it lands in `GameState` and
  the snapshot. It arrives as a preset enum and **never as a raw number**: this is
  the one `rules` field where a free integer off the wire is a denial of service
  in one frame. `fanCap` is likewise a literal `3 | 4` union, being the exponent
  in `2 ** fanCap`.

**Rendering and geometry**

- **The tile art is untouched, and a run laps.** Every tile in a `.tile-lap`
  container draws 29% wider than its layout box, anchored right, so it bleeds left
  over the tile before it and DOM order paints it on top. The lap is 22.5% of the
  art's width — exactly the body band, so it never touches ink. Read
  [docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md) before
  changing how a tile looks.
- **A sideways tile carries the landscape footprint on its *box*** and rotates the
  art inside it. A tile rotated in place would measure portrait while drawing
  landscape, and `viewport.spec.ts` asserts on rendered geometry.
- **A tray tile's box shrinks and its art does not.** Tray tiles are flex items in
  a column, so a short column squeezes the box while `.tile-sideways .tile-face`
  stays sized off `--tile-w` — the art overflows, the lap eats past the body band
  into the face, and at the extreme the pile draws as a stack of black outlines.
  The cap is not what fixes this and never was: N10 raised it to ten on box
  arithmetic the art does not obey, N38 lowered it to six, and neither touched the
  squash. **N40's two-row river did** — the tray's *height* now stops at
  `RIVER_ROWS` however deep the pile gets, so `SIDE_TRAY_CAP` is free to be
  `8 × 2 = 16` and clear a whole round. What remains is a tail at 320×568, which
  has no headroom left: a seat there with a deep river *and* two melds still
  squashes. Accepted knowingly — **N39 closed won't-do** on the measurement
  ([TODO.md](./TODO.md)). **Found by regenerating a screenshot, not by a test** —
  the tray guard reads boxes, and the boxes were correct the whole time.
- **Every seat's river is *your own layout*, turned to that seat's chair — and the
  only free axis is the wrap.** Yours runs along your right hand and wraps toward
  you. Rotate that: the left seat's rows run **down** and wrap **left**, so its
  oldest tile is the top of its *rightmost* row; the right seat's run **up** and
  wrap **right**, oldest at the bottom of its *leftmost*; the across seat's run
  **left** from the right end. A row's *direction* is not a choice — the 22.5%
  body band sits at the bottom of the left seat's tiles and the top of the right
  seat's, so those rows must run down and up respectively or the lap covers ink
  (N36). **Three separate passes were spent mirroring cell arrays that never
  needed mirroring**, and two of them (N42, N43) imposed the *viewer's* reading
  order on all four seats, which is not what a table does. The wrap is one
  `flex-row-reverse`, and it was on the wrong side from the start. `declPos` and
  `riverEnds` in `scripts/screenshots/layout-probe.mjs` assert the corners.
  **The cells are `riverCells` in `discardPile.ts`** — one definition for all three
  trays since A44; only the wrap and the column chunking live in the components.
- **The two side seats face opposite ways, so they lap opposite ways** —
  `.tile-lap-v` on the left, `.tile-lap-v-up` on the right, each pairing a
  flex direction with the matching negative margin. **Neither half works alone**:
  swap one and you lap the wrong neighbour or open a gap. The geometry is in
  [docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md); what belongs
  here is that N36 covered ink on one side for a whole release and **was reported
  by eye** — the tray guard only reads boxes, and the boxes were right.
- **The tray guard constrains how anything may animate or overlay.**
  `viewport.spec.ts` asserts no `.tile` inside a `.discard-tray` ever has a box
  outside that tray's, sampling every ~130ms for 90s across five viewports. Animate
  in an overlay or on opacity, never with a transform on a tray tile; render modals
  outside the tray subtree.
- **Measure the hand only after it settles.** `Reorder.Item` animates on every
  layout change, so a `getBoundingClientRect` taken as something appears reports
  where tiles *were*. Poll until two consecutive samples agree.
- **Tailwind v4 emits `rotate-180` as the standalone `rotate` property**, not as
  `transform` — a probe reading only `getComputedStyle().transform` reports `none`
  and concludes wrongly.
- **Never put a Tailwind class in an e2e selector.** Add a `data-` hook instead —
  eleven exist (`grep -ro 'data-[a-z-]*' packages/client/src`) because a class
  rename once silently broke four projects.
- **A `flex-shrink-0` control beside one shrinkable sibling crushes that sibling.**
  The sibling absorbs the entire shortfall while its text stays in the DOM, so
  nothing errors — it just renders at zero (N7's turn indicator, and N19's lobby
  bot name the moment a third level button joined the row) or one word per line
  (N23's French flip prompt). Give the text a `basis-*` and let the row wrap.
  **Three times now, and each was found by looking rather than by a test** — the
  text is present and measurable, so nothing fails; only the box is 0px wide.

**Languages**

- **Six catalogs: `en`, `zh-Hans`, `zh-Hant`, `fr`, `es`, `ja`.** Adding one is a
  `Dict` plus a `LANGS` row — no component changes. **Everything that enumerates
  languages derives from `LANGS`**: the parity test, eleven other test loops, and
  `loadLang`'s validation. They were hard-coded literals until N23, which is the
  shape that lets a new catalog ship half-written and every guard still pass.
- **Suit names lead with the glyph, and the reading is pinyin** — `万 Wàn` — in
  every catalog but Japanese, because the character is what is printed on the tile.
  Japanese is `萬子` / `筒子` / `索子` with a katakana reading and no romanisation;
  Man / Pin / Sou belong there and nowhere else, being Japanese to begin with.

**Hosting** — the service is live at `https://sichuan-mahjong.onrender.com`;
reasoning and measurements in
[docs/design-hosted-server.md](./docs/design-hosted-server.md).

- **The hardening is *not* conditional on `--hosted`.** The flag selects a
  `RuntimeProfile` carrying **numbers only** — rate limits, the concurrent-games
  ceiling, sweep TTLs — because a control that switches *on* with `--hosted` is one
  you develop against with it off, and that fails open the first time someone
  forgets the flag on a deploy.
- **`trustProxy` is a hop count and stays at one.** Render fronts the service with
  Cloudflare and does not sanitise inbound `X-Forwarded-For`, so raising it to 2
  made every per-IP limit bypassable with a header. `req.ip` is therefore an edge
  address rather than the player — a deliberately accepted granularity cost,
  recorded as O5.
- **Free tier, so persistence stays off** — `getDb()` returns null and every caller
  handles it. Anything you add that touches the database needs the same treatment.

**Process**

- **Restart the server after any client rebuild.** `@fastify/static` snapshots its
  asset list at boot, so a fresh bundle 404s into the SPA fallback and the page
  dies with a MIME-type error on a `text/html` module script.
- **`games.db` accumulates rooms from every automated run, and they are restored at
  boot** — enough of them and the concurrent-games ceiling refuses new lobbies
  before you have played one. Clear it at `%APPDATA%\sichuan-mahjong\games.db`
  with the server stopped.
- **The deal's dice overlay is `pointer-events-none` and the game plays on
  underneath it.** No phase, screen or click failure reveals it — `getPhase()`
  reaches `play` while it is still animating — so anything that screenshots a
  board has to assert `[data-dice-overlay]` is **gone** (N25). The layout probe
  learned this the expensive way: its two fixed sleeps had been paying for the
  overlay without saying so, and replacing them with proper phase waits produced
  nine green runs of a live board photographed under a seating roll.
- **A probe that waits is a probe waiting for the round to end.** Bots keep taking
  turns, so any settle longer than a frame or two is time for the round to finish
  and re-deal. `layout-probe.mjs` waits only on conditions the app publishes, all
  bounded — and note the last discard enters at `scale: 1.4`, which moves
  `getBoundingClientRect`, so measuring mid-entrance reported 14 wall cells under
  a tile that was nowhere near them.
- **A local test pass is weak evidence for the layout guards.** R6 passed locally
  every time while failing CI three runs running; CI has less slack. Poll the run.
- **`VITE_E2E=1` builds are for tests only.** Rebuild without it before handing the
  app to a human.
- **pnpm no longer reads the `pnpm` field in `package.json`.** The security
  overrides live in `pnpm-workspace.yaml` and `packageManager` pins the toolchain —
  and the fix the error message suggests (`--no-frozen-lockfile`) would drop those
  pins rather than restore them.

---

## Status

**All v1 work is shipped**: seven full-repo audit passes (A1–A48), the
frontend/design pass (F1–F25), the mobile viewport work (R1–R7), the hosting
work (C1–C10), and the feature run N1–N46. **[TODO.md](./TODO.md) holds the
open findings of the eighth audit pass (2026-08-04, A49–A54)**. Four are closed:
A49 (the Root fan scored only inside seven pairs, halving every payment off a
standard hand that held one), A50 (a kong's subtype came off the wire, and the
payment hung off it), A51 (a fresh lobby could be handed a live room's code) and
A52 (the engine read the clock). What is left is A53 and A54: two measure-first
micro-inefficiencies, and the modulo bias in `nextInt`.

This section deliberately does not list what shipped — that is
[docs/history.md](./docs/history.md), newest first, **with a find-an-item-by-id
table at the top**: see a bare `(N38)` in a comment and that table says which
entry writes it up. Deferrals are O1–O5 in
[ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).

Two recent passes are worth knowing before you touch the code they cover, because
each left an invariant above rather than just a fix:

- **N40–N44**, the phone-first play-screen pass — nine viewports, measured with
  `scripts/screenshots/layout-probe.mjs`. Full record in
  [docs/layout_investigation.md](./docs/layout_investigation.md).
- **A41–A48**, the refactor/coverage pass. One real bug (a host restart killed
  every spectator link), one gap that mattered more than its size (**nothing
  anywhere tested a host-privilege gate**, and there was no bug behind it — which
  is why it survived six audits), and the river's cell construction unified after
  three passes had each got a different seat wrong.
  [docs/audit-refactor-and-coverage.md](./docs/audit-refactor-and-coverage.md)
