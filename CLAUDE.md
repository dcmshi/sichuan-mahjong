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

# Regenerate the flat tile faces (only if the source art in public/tiles/ changes).
# Measure first — it needs the Playwright chromium — then flatten; a client test
# fails if the committed output drifts from what these produce.
node scripts/tiles/measure-glyphs.mjs
node scripts/tiles/flatten-tiles.mjs

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
  tiles/         flat tile faces: measure-glyphs.mjs (needs chromium) → flatten-tiles.mjs
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

**Tiles are drawn flush**, from glyph-only faces derived out of the CC BY-SA art
by `scripts/tiles/` (measure, then flatten — the frame is centred on each glyph's
measured box). Everything on the board uses them — see "One tile face everywhere"
below. Regenerate with `node scripts/tiles/measure-glyphs.mjs`
then `node scripts/tiles/flatten-tiles.mjs`; a client test fails if the committed
output drifts from what the scripts produce.

**Bots pause 700ms a move** (2026-08-01), not the old 150 — a circuit used to
resolve inside a second. `--bot-delay <ms>` retunes it; `SM_BOT_DELAY_MS` is the
seam the vitest and Playwright configs use to pin the old pace, since whole-round
suites assert nothing about timing. The 🗒 control in the play well opens the
round's move history, which is what the transient event feed can't be.

**One tile face everywhere** (2026-08-01). Every tile on the board is flat,
including the well's last discard, which was the last one drawn from the 3D art
and read as glossier beside the hand. `solo` gives a flat tile with nothing flush
beside it the lift `.tile-run` would otherwise provide. Only the overlapped
hand-count stack keeps 3D backs — flat backs overlapped merge into one slab.

**`.tile-cell` rebuilds the art's body in CSS** — the source layers' own order
(outline → `#005f00` side → `#cddacd` plate → white → face) on the **top and
right**, plus the art's top-right specular. Those are the two sides the art shows
(it is lit from the bottom-left, so its green never reaches the bottom or left
edge) and the two that *can't* double up between flush neighbours, unlike
left+right. Compressed from the measured 20.6%/22.5% insets so it fits inside the
glyphs' existing margins and no glyph shrinks; measurements in
[TODO.md](./TODO.md).

- The **right side shows only when exposed** — `.tile-solo`, or a `.tile-run`'s
  last child, via `--tile-side`. Everything else gets a hairline seam, the one
  shared edge two flush tiles show. Trays keep the seam throughout on purpose: a
  wrapping tray's `:last-child` sits mid-block when the last row is partial.
- The **corner radius is proportional** (`10.5% / 8.6%`), because a fixed rem that
  reads as a tile at 64px is a blob at the 23px hand size.
- Layers are **named custom properties**: Biome reflows a six-layer `background`
  and drags inline comments into the middle of the declaration.
- The flat back's front edge (`flatten-tiles.mjs`) splits at **243**, matching the
  faces — a back covers the whole cell, so a mismatch shows in trays and kongs.

**Open** (see the last section of [TODO.md](./TODO.md)): a central discard pool is
held as a fallback, and needs a deliberate reveal for opponents' void suits — A40
just stopped those leaking through the event log, so they are genuinely private
now. The release binary embedding the tile SVGs still contradicts the licence note
in [ARCHITECTURE.md §13](./ARCHITECTURE.md#13-license--credits).

A real landscape layout for phones (R4 Phase 2 in
[docs/viewport-audit.md](./docs/viewport-audit.md)) stays shelved with its reasons
recorded there; landscape shows a rotate-to-portrait prompt during play.

**Running it locally:** the server snapshots its static asset list at boot, so
restart it after any client rebuild or the new bundle 404s into the SPA fallback.
