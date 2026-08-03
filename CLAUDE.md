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

| File | Holds | Write here when… |
|---|---|---|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Types, engine API, full ruleset, protocol, persistence, networking, testing strategy | …you change behavior, a type, or a rule |
| **[TODO.md](./TODO.md)** | What is *open* — kept short on purpose | …you open or close a piece of work |
| **[docs/history.md](./docs/history.md)** | Everything closed, newest first: the phase log, audits A1–A40 / F1–F25 / R1–R7, tiles, hosting C1–C10, features N1–N34. Each with its diagnosis | …you finish something; add a section at the top |
| **[README.md](./README.md)** | User-facing: install, host/join, CLI flags | …you change the CLI or the player-facing flow |
| **[docs/traps-and-decisions.md](./docs/traps-and-decisions.md)** | The long form of the traps below, plus decisions already settled so they are not relitigated | …you are picking this up cold, or hit a layout/CSS surprise |
| **[docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md)** | How tiles are drawn (the art, lapped), the measured layer geometry, every knob, the four things easy to get wrong | …you are changing how a tile looks |
| **[docs/viewport-audit.md](./docs/viewport-audit.md)** | Measured mobile viewport overflow, and why the landscape layout is shelved | …you change the play or round-end layout |
| **[docs/audit-payments.md](./docs/audit-payments.md)** | Every payment rule checked against three sources outside the PDF, with a decision each. The fan cap is the one divergence | …you change a payment, a fan value, or `fanCap` |
| **[docs/audit-public-deployment.md](./docs/audit-public-deployment.md)** | What a public URL exposes that a LAN never did — five findings, each reproduced against the live service | …you touch the WS boundary, the HTTP routes, or anything a stranger can reach |
| **[docs/design-hosted-server.md](./docs/design-hosted-server.md)** | The Render deployment: deploy steps, why it needs no client change, and why the hardening is *not* conditional on `--hosted` | …you are working on hosting, or on anything the tailnet used to protect |
| **[docs/frontend-audit.md](./docs/frontend-audit.md)** | The 2026-08-02 client audit: 17 of 20 shipped, the three shelved with reasons | …you pick up one of the three, or run another client sweep |
| **[LICENSE](./LICENSE)** | MIT for code, CC-BY-SA 4.0 for the tile art, and the binary as a combined work carrying both | …you add or change a tile, or change what the release build embeds |
| `SBR_ENG_part_1.pdf` | Novikov, *Sichuan Mahjong? It's that simple!* — the canonical ruleset | (read-only; extract with `pdftotext` when a rule is in question) |
| [themahjong.guide](https://themahjong.guide/) | *Mahjong: a Visual Guide* — the second reference used alongside the PDF, and **where the tile SVGs were obtained**. The licence chain is Commons/Cangjie6, evidenced per file in `credits.json` | (external; cite it beside the PDF when a rule or a tile's provenance is in question) |

---

## Dev commands

```bash
pnpm install
pnpm --filter @sichuan-mahjong/engine build  # required before typecheck/test
pnpm typecheck
pnpm lint                                    # biome check .  (pnpm format to fix)
pnpm test                                    # Vitest (engine + server + client)
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
  bot.ts         easy + medium bot heuristics
  ws.ts          WebSocket gateway (validates every inbound frame)
packages/client/src/
  main.tsx       window.__e2e test helpers (VITE_E2E builds only)
  armedDiscard.ts  fire, hold, or stand down with a reason
  voidSelection.ts suit + leading-tile choice on the void screen
  discardPile.ts   the declaration/pile split, shared by four trays and the modal
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

- **Engine stays pure.** No I/O, no deps, randomness only through `rng.ts`. Replays,
  determinism, and the fast-check property tests depend on it.
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
- **Screenshots are generated, not taken.** `docs/*.png` come from `pnpm shots`;
  regenerate them rather than hand-capturing, or they drift out of date again.

---

## Invariants and traps

The long form, with the measurements behind each, is in
[docs/traps-and-decisions.md](./docs/traps-and-decisions.md).

**Rules and pacing**

- **A wind is a distance from East, never a seat index** — `windOfSeat(seat, dealer)`,
  since East rotates every round. Play passes counterclockwise, which here means
  seat-*decreasing*: `(from + 3) % 4`, and the client seats `seat + 3` to the
  viewer's right. Getting this backwards has cost three separate bugs, and **N26
  is nine call sites still reading an absolute seat index as a wind**.
- **The dice are real, and they change which tiles a seed deals.** Both throws come
  from `rng.ts` on a stream of their own (`seed + ':dice'`), and the wall break is
  applied as a rotation of the wall array — so no distribution changes, only the
  deal. `createGame`'s `dealer` is `Seat | null`: null asks for the throw, a seat
  pins it.
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
- **Never put a Tailwind class in an e2e selector.** Add a `data-` hook instead;
  `data-discardable`, `data-void-tile`, `data-void-first`, `data-pile-modal` and
  `data-dice-overlay` all exist because a class rename silently broke four projects.
- **A `flex-shrink-0` control beside one shrinkable sibling crushes that sibling.**
  The sibling absorbs the entire shortfall while its text stays in the DOM, so
  nothing errors — it just renders at zero (N7's turn indicator) or one word per
  line (N23's French flip prompt). Give the text a `basis-*` and let the row wrap.

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

**Process**

- **Restart the server after any client rebuild.** `@fastify/static` snapshots its
  asset list at boot, so a fresh bundle 404s into the SPA fallback and the page
  dies with a MIME-type error on a `text/html` module script.
- **`games.db` accumulates rooms from every automated run, and they are restored at
  boot** — enough of them and the concurrent-games ceiling refuses new lobbies
  before you have played one. Clear it at `%APPDATA%\sichuan-mahjong\games.db`
  with the server stopped.
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

Everything through **N34** is shipped: all v1 work, six full-repo audit passes
(A1–A40), the frontend/design pass (F1–F25), the mobile viewport work (R1–R7),
the hosting work (C1–C10), and the feature run N1–N34 bar the four items below.
Per-item history, each with the diagnosis that made it worth writing down, is in
[docs/history.md](./docs/history.md), newest first. Deferrals are recorded as
O1–O5 in [ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).

**Hosting is live and the hardening is not conditional on `--hosted`.** The flag
selects a `RuntimeProfile` carrying **numbers only** — rate limits, the
concurrent-games ceiling, sweep TTLs — because a control that switches on with
`--hosted` is one you develop against with it off, and that fails open the first
time someone forgets the flag on a deploy. `trustProxy` is a hop count and stays
at **one**: Render fronts the service with Cloudflare and does not sanitise
inbound `X-Forwarded-For`, so raising it to 2 made every per-IP limit bypassable
with a header. `req.ip` is therefore an edge address rather than the player, which
is a deliberately accepted granularity cost. Free tier, so persistence stays off —
`getDb()` returns null and every caller handles it. Reasoning and measurements in
[docs/design-hosted-server.md](./docs/design-hosted-server.md).

**Open** — see [TODO.md](./TODO.md), which is only the open list: **N19** a hard
bot so the ladder has three rungs, **N26** the nine wind call sites above,
**N35** a support/source link row on the landing screen, and **O3** a central
discard pool, still held as a fallback. N19 is the only one that is gameplay work
rather than plumbing, layout or research.
