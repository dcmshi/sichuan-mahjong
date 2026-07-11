import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Bundle the server entry into a single self-contained dist/main.js for publishing.
// The pure-TS engine (@sichuan-mahjong/engine) is a private workspace package that
// is never published to npm, so it MUST be inlined here — otherwise `npx
// sichuan-mahjong` can't resolve it. Real npm dependencies (fastify, @fastify/*,
// multicast-dns, qrcode-terminal) stay external and are installed normally. node:
// builtins are external on the node platform automatically. (A6b)
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const entry = join(root, 'src', 'main.ts');

// The engine must be built first (esbuild resolves it via its dist exports).
const enginePkg = join(root, '..', 'engine', 'dist', 'index.js');
if (!existsSync(enginePkg)) {
  console.error('[bundle-server] engine build not found at', enginePkg);
  console.error('Build it first: pnpm --filter @sichuan-mahjong/engine build');
  process.exit(1);
}

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(root, 'dist', 'main.js'),
  // Everything a consumer installs from the registry stays external; only the
  // private engine (and anything it imports — nothing, it's zero-dep) is inlined.
  external: [
    'fastify',
    '@fastify/static',
    '@fastify/websocket',
    'multicast-dns',
    'qrcode-terminal',
  ],
  // No banner: esbuild preserves the entry file's own `#!/usr/bin/env node`
  // shebang, so adding one here would produce a second (invalid) shebang line.
  logLevel: 'info',
});

console.log('[bundle-server] wrote self-contained dist/main.js (engine inlined)');
