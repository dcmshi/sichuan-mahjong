# CLAUDE.md — Sichuan Mahjong

Web-based 4-player Sichuan ("Bloody Rules") mahjong. Mobile-first PWA.
Host runs on their own machine; friends join over LAN or Tailscale.

Full architecture, rules, and design decisions: see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Tech stack

| Package | Purpose |
|---|---|
| `packages/engine` | Pure rules engine. Zero deps. |
| `packages/server` | Fastify HTTP+WS, bots, persistence (`node:sqlite`), networking (`sichuan-mahjong`) |
| `packages/client` | React 18, Vite, Tailwind, Zustand, Framer Motion |

Runtime: Node 22 LTS. Tooling: Biome (lint enforced in CI), Vitest, fast-check, Playwright.

---

## Dev commands

```bash
pnpm install
pnpm --filter @sichuan-mahjong/engine build  # required before typecheck
pnpm typecheck
pnpm lint
pnpm test                                    # Vitest (engine + server + client)
pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm --filter sichuan-mahjong start          # run server (serves built client)

# e2e needs the client built with the window.__e2e helpers (VITE_E2E=1), then a built server:
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build
pnpm e2e                                     # Playwright: bot round, 2-round match, real-UI-click opening

# Release binaries (embed the client, no persistence): needs Bun; see scripts/release/compile.ts
bun run scripts/release/compile.ts
```

---

## Key files

```
packages/engine/src/
  tiles.ts       tile encoding (TileId 0..107, TileType 0..26)
  hand.ts        isWinningHand, isTenpai, ukeire
  scoring.ts     fan calc, payment matrix, TMV
  claims.ts      claim window resolution
  state.ts       GameState, PlayerState types
  actions.ts     applyAction(state, action) → ActionResult
  views.ts       projectView(state, seat) → PlayerView
  protocol.ts    ClientMsg / ServerMsg types
packages/server/src/
  room.ts        GameRoom (owns GameState, drives bots, broadcasts views)
  bot.ts         easy + medium bot heuristics
packages/client/src/
  main.tsx       window.__e2e test helpers
  store/         Zustand store (mirrors PlayerView)
  ws/client.ts   WsClient singleton + sendAction
e2e/game.spec.ts   Playwright full-round test
```

---

## Status

All v1 work and all originally-deferred features are complete — see
[ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals)
for the per-item history. Host-shutdown resume and Tailscale node-sharing
automation (the last two deferrals) are now implemented.

A full audit + hardening pass (2026-07, items A1–A20 in [TODO.md](./TODO.md)) is
also complete: WS-boundary crash hardening, several rules-engine correctness fixes,
reconnect/restore edge cases, mDNS/QR, and distribution — the npm package is now
self-contained (engine inlined, client bundled) and the Bun binaries embed the
client SPA. A third audit pass (2026-07-16, A23–A30) closed a `declareVoid`
rule-integrity hole, added multi-viewport (phone/tablet, both orientations)
Playwright coverage, and cleaned up bot/GC/info-leak smaller findings; a fourth
pass (A31–A33) redacted drawn tiles from the broadcast event stream and
hardened bot scheduling/visibility; a fifth pass (A34) fixed LAN clipboard copy
and the missing PWA icon/favicon.

A sixth pass (2026-07-25, A35–A39) found the one thing every earlier pass had
missed: **the void phase's face-down tile was charged twice**, so anyone who
separated one stood permanently a tile below the 14 a win needs and could never
Hu (and was never "ready" at wall end). Per the PDF that tile *is* the player's
first discard — it now parks in `pendingFirstDiscard` and is turned up by a new
`flipFirstDiscard` action on the player's first turn, restoring the standard
13/14 rhythm. Same pass closed the matching `declareVoid` indicator exploit
(A36), stopped the face-down tile leaking into views/clients (A37), extended the
reconnect grace to the play-phase turn owner (A38), and keyed the client's match
totals on a new `RoundResult.roundIndex` (A39). No open items.
