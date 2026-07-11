#!/usr/bin/env bun
/**
 * Bun compile pipeline — produces standalone binaries for each platform.
 * Run: bun run scripts/release/compile.ts
 *
 * Requires Bun 1.1+ installed on the build machine.
 * The compiled binary embeds the entire server dist, including node_modules.
 * node:sqlite (Node built-in) is NOT available in Bun — the server falls back
 * gracefully when the DB write fails, so this is acceptable for the binary.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const OUT_DIR = join(import.meta.dir, '../../dist-bin');
mkdirSync(OUT_DIR, { recursive: true });

const ENTRY = join(import.meta.dir, '../../packages/server/dist/main.js');

if (!existsSync(ENTRY)) {
  console.error('Build server first: pnpm --filter @sichuan-mahjong/server build');
  process.exit(1);
}

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
