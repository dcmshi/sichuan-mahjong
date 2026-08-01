// Derives the flat tile faces in packages/client/public/tiles/flat/ from the 3D
// ones beside them. Run: node scripts/tiles/flatten-tiles.mjs
//
// Each source SVG is a complete 3D tile — dark body, green bevelled side, ivory
// face, lighting highlights — so two of them placed edge to edge show two
// adjacent bevels instead of the single shared edge a real run of tiles has. The
// flat variants carry the glyph alone and let the run's container draw the face,
// the rounded outer corners and one shadow for the whole strip.
//
// The glyph can't be isolated by keeping one subtree: man and sou tiles draw it
// as anonymous <path> siblings of the body group, but pin tiles draw their dots
// as id'd paths inside groups (pin-9 has 52). So the body is removed by id
// instead, which is safe because all 27 faces share it exactly.
//
// Output is committed; rerun this when the source art changes (as with
// scripts/icons/). Sources are Wikimedia Commons CC BY-SA 4.0 — see
// packages/client/public/tiles/credits.json. These derivatives inherit that
// licence.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('../../packages/client/public/tiles/', import.meta.url));
const OUT_DIR = `${SRC_DIR}flat/`;

/**
 * The 3D treatment, by id. The five rects are the body stack from back to front
 * (dark body, green side, two inner plates, ivory face); `rect3008_1_` is the
 * face's own gradient and `filter3970-5` the blur, both dead once their only user
 * is gone; the three paths are the corner lighting highlights. `path3936` is a
 * group, the rest are single elements.
 */
export const STRIP_IDS = [
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

/** A source face SVG with its 3D treatment removed, glyph and viewBox intact. */
export function flattenSvg(svg) {
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

/**
 * The tile back has its own structure rather than the shared body stack, so its
 * flat form is authored: the felt green face full-bleed, with the top-edge
 * highlight kept so a run of backs still reads as tiles rather than one slab.
 * Colours are lifted from back.svg.
 */
const FLAT_BACK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 255">' +
  '<path d="M0 0h210v255H0z" style="fill:#147e48"/>' +
  '<path d="M0 0h210v14H0z" opacity=".6" style="fill:#1a8c50"/>' +
  '</svg>';

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const faces = readdirSync(SRC_DIR)
    .filter(f => /^(man|pin|sou)-[1-9]\.svg$/.test(f))
    .sort();

  for (const file of faces) {
    const src = readFileSync(SRC_DIR + file, 'utf8');
    const flat = flattenSvg(src);
    for (const id of STRIP_IDS) {
      if (flat.includes(`id="${id}"`)) throw new Error(`${file}: ${id} survived the strip`);
    }
    if (!flat.includes('<path')) throw new Error(`${file}: no glyph left after the strip`);
    const viewBox = /viewBox="[^"]*"/.exec(src)?.[0];
    if (!viewBox || !flat.includes(viewBox)) throw new Error(`${file}: viewBox lost`);
    writeFileSync(OUT_DIR + file, flat);
    console.log(`wrote flat/${file} (${src.length} → ${flat.length} bytes)`);
  }

  writeFileSync(`${OUT_DIR}back.svg`, FLAT_BACK);
  console.log(`wrote flat/back.svg (authored, ${FLAT_BACK.length} bytes)`);
  console.log(`${faces.length + 1} flat assets`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
