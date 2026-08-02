# CLAUDE.md — Sichuan Mahjong

Web-based 4-player Sichuan ("Bloody Rules") mahjong. Mobile-first PWA.
Host runs on their own machine; friends join over LAN or Tailscale.

---

## Where things are documented

Keep this file short. New documentation goes in one of these instead:

| File | Holds | Write here when… |
|---|---|---|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Types, engine API, full ruleset, protocol, persistence, networking, testing strategy | …you change behavior, a type, or a rule |
| **[TODO.md](./TODO.md)** | Phase history + audit backlog (A1–A40, F1–F25), each item with diagnosis and fix | …you fix a bug or close an audit item |
| **[README.md](./README.md)** | User-facing: install, host/join, CLI flags | …you change the CLI or the player-facing flow |
| **[docs/viewport-audit.md](./docs/viewport-audit.md)** | Measured mobile viewport overflow + the open layout questions | …you change the play or round-end layout |
| **[docs/handoff-2026-08-01.md](./docs/handoff-2026-08-01.md)** | Where the layout/density work stands, decisions already settled, the four open ones, and the traps that cost time | …you are picking this up cold, or before a compaction |
| **[docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md)** | How tiles are drawn (the art, lapped), its measured layer geometry, every knob, the four things easy to get wrong | …you are changing how a tile looks |
| `SBR_ENG_part_1.pdf` | Novikov, *Sichuan Mahjong? It's that simple!* — the canonical ruleset | (read-only; extract with `pdftotext` when a rule is in question) |

---

## Tech stack

| Package | Purpose |
|---|---|
| `packages/engine` | Pure rules engine (`@sichuan-mahjong/engine`). Zero deps. |
| `packages/server` | Fastify HTTP+WS, bots, persistence (`node:sqlite`), networking (`sichuan-mahjong`) |
| `packages/client` | React 18, Vite, Tailwind, Zustand, Framer Motion (`@sichuan-mahjong/client`) |

Runtime: Node 22 LTS. Tooling: Biome (lint enforced in CI), Vitest, fast-check, Playwright.

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
# (Playwright starts the server itself from packages/server/dist/main.js):
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
```

---

## Key files

```
packages/engine/src/
  tiles.ts       tile encoding (TileId 0..107, TileType 0..26)
  rng.ts         xoshiro128** seedable PRNG — the only source of randomness
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
  store/         Zustand store (mirrors PlayerView)
  session.ts     seat token in localStorage — what makes "Rejoin" work
  ws/client.ts   WsClient singleton + sendAction
e2e/
  game.spec.ts   full bot round      } chromium only (drive the game via __e2e)
  match.spec.ts  2-round match       }
  house-rules.spec.ts  the host's 換三張 toggle — the only spec that reaches huan
  viewport.spec.ts     vertical-overflow + tray-clipping guard on a 320×568 phone
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
  the component calls — that's why `tileLabel`, `feedLineFor`, `joinErrorForStatus`
  and the claim-countdown maths are exported. Add UI logic the same way.
- **Screenshots are generated, not taken.** `docs/*.png` come from `pnpm shots`;
  regenerate them rather than hand-capturing, or they drift out of date again.

---

## Status

All v1 work, six full-repo audit passes (A1–A40, the last found 2026-08-01), a
frontend/design pass (F1–F25), round-end hand reveals with a fan/penalty
breakdown (2026-07-31), and the mobile viewport work R1–R7 (2026-08-01) are
complete. Per-item history is in [TODO.md](./TODO.md); the deferral record is
[ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).

**換三張 is opt-in, and off by default** (2026-08-01) — it is not in Novikov's
ruleset, which deals straight into the void declaration. The host turns it on in
the lobby; the choice rides on `startGame.rules` and is narrowed by `houseRules()`
in `ws.ts`. Practice mode therefore never shows the huan phase, which is why
`e2e/house-rules.spec.ts` exists — it is the only spec that reaches that screen.

**Bot pace is the host's, from the lobby** (2026-08-02) — slow 1800 / normal 900
/ fast 400, against the old flat 150 at which a circuit resolved inside a second.
It rides on `startGame.rules.botSpeed`, is narrowed by `botSpeedFrom` in `ws.ts`,
and is a `GameRoom` field rather than `GameConfig`: it changes no rule and a
replay of the same seed is identical at any value. `--bot-delay <ms>` and the
`SM_BOT_DELAY_MS` seam pin the process and **outrank the lobby**, which is what
keeps whole-round suites fast. The claim window is 10s, up from 3 — it closes as
soon as every eligible seat has acted, so the deadline is a backstop, not a pace.
The 🗒 control in the play well opens the round's move history, which is what the
transient event feed can't be.

**Tiles are the untouched art, and a run laps** (2026-08-01). Each source SVG is a
complete 3D tile, so two of them edge to edge show two bevels where a real run
shows one shared edge. Rather than strip the body and rebuild it in CSS — which is
what `tiles/flat/` and `.tile-cell` did until now — every tile in a `.tile-lap`
container is drawn 29% wider than its layout box and anchored right, so it bleeds
left over the tile before it and DOM order paints it on top. Full detail in
[docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md).

- **The overlap is 22.5% of the art's width, which is exactly the body band** —
  measured in from the right edge: outline to 5.5%, green to 15.4%, plate and
  white to 22.5%, face after that. The widest glyph (`pin-3`) ends at 75.9%, so
  the lap never touches ink. A band drawn in CSS came out of the face; this one
  comes out of the neighbour, which is why the same 299px hand went 23.0px →
  29.0px a tile.
- **The box is the pitch, not the tile.** `aspect-ratio: 162.75 / 255` and an art
  width of `129.032%`, both from the one constant 0.775. A fixed-size tile shrinks
  its box so the art keeps its size (`--tile-w`, not Tailwind's `w-*`, because CSS
  can't scale a width it didn't set); the hand's `fill` tiles do the opposite and
  let the art grow into the row.
- **A lifted tile needs a `z-index`**, or its neighbour paints across the lift, and
  the **first tile of every wrapped row bleeds left**, which is what the trays'
  asymmetric padding holds. Both are on the sandbox page.
- The **corner radius is proportional** (`18.1% / 14.9%`, measured off the art's
  outline cubics). Only `.tile-mark` needs it now — the void screen spaces its
  tiles, so the ring wraps a whole tile rather than a pitch.

**The board reads itself back** (2026-08-02). The middle of the well holds the
**wall**, drawn as four walls two tiles high — seven stacks a side, flush and
lapped, so 4 × 7 × 2 = 56 is exactly what the deal leaves and the diagram *is* the
wall. Emptied slots stay drawn and go dark; a bar that only shrinks gives you
nothing to measure against. It is a square that fits the well (198×401 on one
phone, 128×61 on a short one), absolutely positioned behind the contents so it
costs no height. Each seat's **void declaration** sits above their pile with a
white glow, since it is the one public statement of what they declared —
`PublicPlayer.firstDiscardIsVoid` is derived, and **false until the flip**, which
is when a real table learns it. Every zone centres on its content: the hand, the
melds, and the trays, each of which is now drawn round its pile rather than across
the screen.

**Open** (see the last section of [TODO.md](./TODO.md)): a central discard pool is
still held as a fallback. Its redaction question is answered — `firstDiscardIsVoid`
is the deliberate reveal it needed — but the middle is no longer the empty space
that motivated it.

**The binary embeds the tile art on purpose now** (2026-08-02). §13 used to forbid
merging the CC-BY-SA SVGs into compiled output while the Bun binary did exactly
that, so the rule was what was wrong. [LICENSE](./LICENSE) §3 states a binary as a
combined work carrying both licences, and `--credits` puts the attribution inside
the executable so it can't be separated from the art it covers. Adding a tile
without a `credits.json` entry now fails a test in both packages.

A real landscape layout for phones (R4 Phase 2 in
[docs/viewport-audit.md](./docs/viewport-audit.md)) stays shelved with its reasons
recorded there; landscape shows a rotate-to-portrait prompt during play.

**Running it locally:** the server snapshots its static asset list at boot, so
restart it after any client rebuild or the new bundle 404s into the SPA fallback.
