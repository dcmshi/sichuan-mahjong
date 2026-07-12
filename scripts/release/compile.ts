#!/usr/bin/env bun
/**
 * Bun compile pipeline — produces standalone binaries for each platform.
 * Run: bun run scripts/release/compile.ts
 *
 * Prereqs (build these first):
 *   pnpm --filter @sichuan-mahjong/engine build
 *   pnpm --filter @sichuan-mahjong/client build
 *
 * The binary is compiled from the Bun-only entry packages/server/src/binary.ts,
 * which bakes in the built client SPA (via a generated module) so the standalone
 * binary serves the UI without a client dir on disk. (A20)
 *
 * node:sqlite (a Node built-in) is NOT available in Bun, so persistence is
 * disabled inside the binary — the server loads it lazily and logs
 * "persistence disabled" instead of crashing (A17). Games run but aren't saved.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const REPO = join(import.meta.dir, '../..');
const OUT_DIR = join(REPO, 'dist-bin');
mkdirSync(OUT_DIR, { recursive: true });

const ENTRY = join(REPO, 'packages/server/src/binary.ts');
const CLIENT_DIST = join(REPO, 'packages/client/dist');
const ENGINE_DIST = join(REPO, 'packages/engine/dist');

if (!existsSync(CLIENT_DIST)) {
  console.error('Build the client first: pnpm --filter @sichuan-mahjong/client build');
  process.exit(1);
}
if (!existsSync(ENGINE_DIST)) {
  console.error('Build the engine first: pnpm --filter @sichuan-mahjong/engine build');
  process.exit(1);
}

// Embed the built client SPA into the (Bun-only) binary entry.
console.log('Generating embedded client…');
await $`node ${join(REPO, 'scripts/release/gen-embedded-client.mjs')}`;

const TARGETS: Array<{ target: string; outFile: string }> = [
  { target: 'bun-macos-arm64', outFile: 'sichuan-mahjong-macos-arm64' },
  { target: 'bun-macos-x64', outFile: 'sichuan-mahjong-macos-x64' },
  { target: 'bun-linux-arm64', outFile: 'sichuan-mahjong-linux-arm64' },
  { target: 'bun-linux-x64', outFile: 'sichuan-mahjong-linux-x64' },
  { target: 'bun-windows-x64', outFile: 'sichuan-mahjong-windows-x64.exe' },
];

for (const { target, outFile } of TARGETS) {
  const out = join(OUT_DIR, outFile);
  console.log(`Building ${target} → ${outFile}`);
  try {
    await $`bun build ${ENTRY} --compile --target=${target} --outfile=${out}`;
    console.log(`  ✓ ${outFile}`);
  } catch (err) {
    console.error(`  ✗ ${target} failed:`, err);
  }
}

console.log('\nDone. Binaries in dist-bin/');
