// Copy the built client SPA into the server package so it ships with the npm
// package (files: ["dist"]). Run after building both the server (tsc → dist/)
// and the client (vite → ../client/dist). Invoked from `prepack`. (A6)
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'client', 'dist');
const dest = join(here, '..', 'dist', 'client');

if (!existsSync(src)) {
  console.error(`[bundle-client] client build not found at ${src}`);
  console.error('Build it first: pnpm --filter @sichuan-mahjong/client build');
  process.exit(1);
}

// Clear the destination first: cpSync merges, so a re-bundle would otherwise leave
// stale hashed assets behind (e.g. a prior e2e build's chunk shipping alongside the
// production one).
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`[bundle-client] copied ${src} → ${dest}`);
