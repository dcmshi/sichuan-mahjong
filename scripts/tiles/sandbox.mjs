/**
 * Renders scripts/tiles/sandbox.html headless and writes sandbox.png beside it.
 *
 *   node scripts/tiles/sandbox.mjs            → scripts/tiles/sandbox.png
 *   node scripts/tiles/sandbox.mjs before.png → a named file, for a before/after pair
 *
 * The page itself needs neither this script nor a server — open it directly and
 * refresh after editing `index.css`. This exists for a shareable artifact, and for
 * asking "did that change what I think it changed" without eyeballing two tabs.
 *
 * Needs the Playwright chromium the repo already installs for e2e.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(HERE, 'sandbox.html');
const arg = process.argv[2] ?? 'sandbox.png';
const OUT = isAbsolute(arg) ? arg : resolve(HERE, arg);

let chromium;
try {
  ({ chromium } = require('@playwright/test'));
} catch {
  console.error('Needs @playwright/test — run `pnpm install` at the repo root.');
  process.exit(1);
}

if (!existsSync(PAGE)) {
  console.error(`Missing ${PAGE}`);
  process.exit(1);
}

const browser = await chromium.launch();
// deviceScaleFactor 3, because the point is judging a 1px outline and a 3px band.
const page = await browser.newPage({
  viewport: { width: 900, height: 1200 },
  deviceScaleFactor: 3,
});

const problems = [];
page.on('console', m => {
  if (m.type() === 'error') problems.push(m.text());
});

await page.goto(pathToFileURL(PAGE).href);
await page.waitForLoadState('networkidle');

// A tile with no radius means index.css didn't load, which would otherwise be a
// silently wrong screenshot — the exact failure this script is meant to catch.
const radius = await page.evaluate(() => {
  const t = document.querySelector('.tile-cell');
  return t ? getComputedStyle(t).borderRadius : null;
});
const broken = await page.evaluate(
  () => Array.from(document.images).filter(i => !i.naturalWidth).length,
);

await page.screenshot({ path: OUT, fullPage: true });
await browser.close();

console.log(`wrote ${OUT}`);
console.log(`  border-radius: ${radius ?? '(no .tile-cell found)'}`);
console.log(`  broken images: ${broken}`);
for (const p of problems.slice(0, 5)) console.log(`  console: ${p}`);

if (!radius || radius === '0px') {
  console.error('\nindex.css did not apply — the screenshot shows unstyled tiles.');
  process.exit(1);
}
if (broken > 0) {
  console.error(`\n${broken} tile SVG(s) failed to load — check the paths in sandbox.html.`);
  process.exit(1);
}
