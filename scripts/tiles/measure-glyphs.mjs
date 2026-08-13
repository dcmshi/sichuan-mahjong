// Measures where each face's glyph actually sits inside its frame, and writes
// glyph-boxes.json — **the evidence the 22.5% lap rests on**, and the only
// reason this script still exists. Nothing generates assets from it any more:
// the flat faces it used to feed went away with `flatten-tiles.mjs` when the app
// switched to drawing the untouched art.
//
// Run: node scripts/tiles/measure-glyphs.mjs   (needs the Playwright chromium)
// Rerun it if the source art changes. Running it now reproduces the committed
// glyph-boxes.json byte for byte, which is how you know it still works.
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

import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

/**
 * `flattenSvg` used to live in `flatten-tiles.mjs`, which generated the flat
 * tile faces. **That file was deleted when the app switched to drawing the
 * untouched art (a3d13c1), and this import went with it — so this script has
 * thrown `ERR_MODULE_NOT_FOUND` on every run since**, while CLAUDE.md went on
 * listing it as the way to re-derive `glyph-boxes.json` if the source art
 * changes. Nothing noticed, because nothing runs it: it is the tool you reach
 * for once a year, which is exactly when a broken one costs the most. (A76)
 *
 * Inlined rather than restoring the generator, which was deleted on purpose —
 * only the *measurement* still has a job. The strip is the whole of what the
 * measurement needs: `getBBox()` on a source face measures the tile, body and
 * bevel included, and what `glyph-boxes.json` records is where the **ink** sits.
 */

/**
 * The 3D treatment, by id. The five rects are the body stack from back to front
 * (dark body, green side, two inner plates, ivory face); `rect3008_1_` is the
 * face's own gradient and `filter3970-5` the blur, both dead once their only
 * user is gone; the three paths are the corner lighting highlights. `path3936`
 * is a group, the rest are single elements.
 *
 * Removed by id rather than by keeping one subtree: man and sou tiles draw the
 * glyph as anonymous `<path>` siblings of the body group, but pin tiles draw
 * their dots as id'd paths inside groups (pin-9 has 52). All 27 faces share the
 * body exactly, so the ids are the reliable handle.
 */
const STRIP_IDS = [
  'rect4031',
  'rect3767',
  'rect3861',
  'rect3765',
  'rect3008',
  'rect3008_1_',
  'path3932',
  'path3936',
  'path3882',
  'filter3970-5',
];

/**
 * Removes the element carrying `id`, and its children if it has any. Hand-rolled
 * rather than via an XML parser to keep the repo's zero-dependency scripts: the
 * scan is quote-aware so an attribute value containing `>` can't end the tag
 * early, and it counts nested same-name tags so a `<g>` inside a `<g>` doesn't
 * close the wrong one.
 */
function removeElementById(svg, id) {
  const at = svg.indexOf(`id="${id}"`);
  if (at === -1) return svg;

  const start = svg.lastIndexOf('<', at);
  const tag = /^<([\w:-]+)/.exec(svg.slice(start))?.[1];
  if (!tag) throw new Error(`could not find the tag opening id="${id}"`);

  let openEnd = -1;
  let quote = null;
  for (let i = start; i < svg.length; i++) {
    const c = svg[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      openEnd = i;
      break;
    }
  }
  if (openEnd === -1) throw new Error(`unterminated tag for id="${id}"`);
  if (svg[openEnd - 1] === '/') return svg.slice(0, start) + svg.slice(openEnd + 1);

  const open = `<${tag}`;
  const close = `</${tag}`;
  let depth = 1;
  let cursor = openEnd + 1;
  while (depth > 0) {
    const nextOpen = svg.indexOf(open, cursor);
    const nextClose = svg.indexOf(close, cursor);
    if (nextClose === -1) throw new Error(`unclosed <${tag}> for id="${id}"`);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Only a real element start counts — `<g` also prefixes `<glyph`.
      const after = svg[nextOpen + open.length];
      if (after === ' ' || after === '>' || after === '/') depth++;
      cursor = nextOpen + open.length;
      continue;
    }
    depth--;
    cursor = svg.indexOf('>', nextClose) + 1;
  }
  return svg.slice(0, start) + svg.slice(cursor);
}

/** A source face with its 3D treatment removed: glyph and viewBox intact. */
function flattenSvg(svg) {
  let out = svg;
  for (const id of STRIP_IDS) out = removeElementById(out, id);
  // The body stack sat inside two nested wrappers, which are left holding
  // nothing. Repeated because emptying the inner one empties the outer.
  for (let before = ''; before !== out; ) {
    before = out;
    out = out.replace(/<g\b[^>]*>\s*<\/g>/g, '');
  }
  return out;
}

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
// The scratch page was left in the tree by every previous run: untracked,
// ungitignored, and one `git add -A` away from being committed. (A76)
rmSync(SCRATCH, { force: true });
writeFileSync(OUT, `${JSON.stringify(boxes, null, 2)}\n`);
console.log(`wrote ${Object.keys(boxes).length} boxes to glyph-boxes.json`);
