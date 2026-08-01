// Measures where each flattened face's glyph actually sits, and writes
// glyph-boxes.json for flatten-tiles.mjs to frame the flat cells with.
//
// Run: node scripts/tiles/measure-glyphs.mjs   (needs the Playwright chromium)
// Rerun it, then flatten-tiles.mjs, whenever the source art changes.
//
// Why a browser: an SVG glyph's bounding box is the union of bezier extrema, not
// of control points, so a from-scratch parser would either be a path library or
// be wrong by a few units in a way that shows up as an off-centre tile. The
// browser already knows. `svg.getBBox()` on the ROOT is what's needed —
// per-element getBBox is in that element's own space, and the pin dots sit inside
// nested transformed groups, so measuring them element by element put pin-1's box
// 1300 units from everyone else's.
//
// The 27 faces do not share one coordinate space: 26 use a viewBox of
// "-192 293.9 210 255" and pin-1 uses "0 0 210 255" with its content composed
// somewhere else entirely, so each file needs its own measurement.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { flattenSvg } from './flatten-tiles.mjs';

const TILES = fileURLToPath(new URL('../../packages/client/public/tiles/', import.meta.url));
const OUT = fileURLToPath(new URL('./glyph-boxes.json', import.meta.url));
const SCRATCH = fileURLToPath(new URL('./.measure.html', import.meta.url));

const faces = readdirSync(TILES)
  .filter(f => /^(man|pin|sou)-[1-9]\.svg$/.test(f))
  .sort();

writeFileSync(SCRATCH, '<!doctype html><meta charset="utf-8"><body style="margin:0"></body>');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(SCRATCH).href);

const boxes = {};
for (const file of faces) {
  boxes[file] = await page.evaluate(
    svg => {
      document.body.innerHTML = svg;
      const b = document.querySelector('svg').getBBox();
      const r = n => Math.round(n * 10) / 10;
      return { x: r(b.x), y: r(b.y), w: r(b.width), h: r(b.height) };
    },
    flattenSvg(readFileSync(TILES + file, 'utf8')),
  );
  const { x, y, w, h } = boxes[file];
  if (!(w > 0 && h > 0)) throw new Error(`${file}: measured an empty glyph box`);
  console.log(`${file.padEnd(11)} ${x} ${y} ${w}×${h}`);
}

await browser.close();
writeFileSync(OUT, `${JSON.stringify(boxes, null, 2)}\n`);
console.log(`wrote ${Object.keys(boxes).length} boxes to glyph-boxes.json`);
