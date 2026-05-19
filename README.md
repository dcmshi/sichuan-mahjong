# Sichuan Mahjong

Web-based 4-player Sichuan ("Bloody Rules") mahjong. Mobile-first PWA. Host runs the server on their own machine; friends connect over LAN or Tailscale.

## Prerequisites

- Node 22+
- pnpm 10+

## Setup

```sh
pnpm install
```

## Dev commands

```sh
pnpm build          # build all packages
pnpm test           # run all tests
pnpm typecheck      # typecheck all packages
pnpm lint           # lint with Biome
pnpm format         # format with Biome

pnpm --filter @sichuan-mahjong/engine test   # engine tests only
pnpm --filter @sichuan-mahjong/client dev    # client dev server
```

## Architecture

See [CLAUDE.md](./CLAUDE.md) for the full specification.
