// Rasterises packages/client/public/icon.svg into the PNG sizes a PWA install
// actually needs. iOS home-screen and several Android launchers ignore an SVG
// icon entirely, so the app used to install with a blank tile. (F18)
//
// Run: node scripts/icons/generate-icons.mjs
//
// No image dependency: the icon is a handful of primitives, so it is drawn directly and
// encoded with node:zlib. Keep the geometry here in step with icon.svg.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = fileURLToPath(new URL('../../packages/client/public/', import.meta.url));

/** Single brand color, shared with theme-color and the manifest. */
const FELT = [0x0c, 0x5f, 0x57];
const BONE = [0xfd, 0xfa, 0xf3];
const EDGE = [0xd9, 0xcf, 0xc0];
const INK = [0xb9, 0x1c, 0x1c];

/** Supersampling factor; the whole icon is drawn at N× and box-filtered down. */
const SS = 4;

function insideRoundRect(px, py, x, y, w, h, r) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/**
 * Colour of the icon at a point in the 512×512 design space, or null outside
 * the rounded background. `bleed` fills the corners too, for maskable icons
 * (the launcher applies its own mask) and for iOS, which dislikes alpha.
 */
function sample(px, py, bleed) {
  const bg = bleed || insideRoundRect(px, py, 0, 0, 512, 512, 96);
  if (!bg) return null;

  // 中, drawn as 口 plus a vertical stroke through it. Geometry mirrors
  // packages/client/public/icon.svg — see the note there about why it is
  // rectangles and not text.
  const inBox =
    insideRoundRect(px, py, 176, 180, 160, 152, 0) &&
    !insideRoundRect(px, py, 206, 210, 100, 92, 0);
  const inStem = insideRoundRect(px, py, 241, 112, 30, 288, 0);
  if (inBox || inStem) return INK;
  // 10px stroke centred on the tile outline.
  if (
    insideRoundRect(px, py, 101, 71, 310, 370, 49) &&
    !insideRoundRect(px, py, 111, 81, 290, 350, 39)
  ) {
    return EDGE;
  }
  if (insideRoundRect(px, py, 106, 76, 300, 360, 44)) return BONE;
  return FELT;
}

/** RGBA pixel buffer for the icon at `size`, with `inset` design-space padding. */
function render(size, { bleed = false, inset = 0 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = (512 - inset * 2) / (size * SS);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = inset + (x * SS + sx + 0.5) * scale;
          const py = inset + (y * SS + sy + 0.5) * scale;
          const c = sample(px, py, bleed);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      // Premultiplied average → straight alpha, so edges don't darken.
      const cov = a / (n * 255);
      rgba[i] = cov > 0 ? Math.round(r / (n * cov)) : 0;
      rgba[i + 1] = cov > 0 ? Math.round(g / (n * cov)) : 0;
      rgba[i + 2] = cov > 0 ? Math.round(b / (n * cov)) : 0;
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, opts: {} },
  { file: 'icon-512.png', size: 512, opts: {} },
  // Maskable: full bleed with the artwork inside the 80% safe zone, so a
  // launcher's circle/squircle mask never clips the tile.
  { file: 'icon-maskable-512.png', size: 512, opts: { bleed: true, inset: -52 } },
  // iOS applies its own rounding and composites on white if there's alpha.
  { file: 'apple-touch-icon.png', size: 180, opts: { bleed: true } },
];

for (const { file, size, opts } of TARGETS) {
  writeFileSync(OUT_DIR + file, encodePng(size, render(size, opts)));
  console.log(`wrote ${file} (${size}×${size})`);
}
