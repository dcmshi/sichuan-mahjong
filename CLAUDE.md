# CLAUDE.md — Sichuan Mahjong

Web-based 4-player Sichuan ("Bloody Rules") mahjong. Mobile-first PWA.
Host runs on their own machine; friends join over LAN or Tailscale.

Full architecture, rules, and design decisions: see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Tech stack

| Package | Purpose |
|---|---|
| `packages/engine` | Pure rules engine. Zero deps. |
| `packages/server` | Fastify HTTP+WS, bots, SQLite, networking (`sichuan-mahjong`) |
| `packages/client` | React 18, Vite, Tailwind, Zustand, Framer Motion |

Runtime: Node 22 LTS. Tooling: Biome, Vitest, fast-check, Playwright.

---

## Dev commands

```bash
pnpm install
pnpm --filter @sichuan-mahjong/engine build  # required before typecheck
pnpm typecheck
pnpm lint
pnpm test                                    # Vitest (engine + server)
pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm --filter sichuan-mahjong start          # run server (serves built client)
pnpm e2e                                     # Playwright (needs built server+client)
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

## Intentional v1 deferrals

All engine/server/client/bot/scoring work is complete. The items below are
deliberate v1 scope cuts, not unfinished work — see [ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).

- Host shutdown midgame (server dies with host)
- i18n (English only)
- Spectators (architecture allows; not built)
- Tailscale node-sharing automation (manual via admin console)
