import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs build script, no types
import { STRIP_IDS, flattenSvg, reframe } from '../../../scripts/tiles/flatten-tiles.mjs';

const TILES = fileURLToPath(new URL('../public/tiles/', import.meta.url));
const FLAT = `${TILES}flat/`;
const BOXES: Record<string, { x: number; y: number; w: number; h: number }> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../scripts/tiles/glyph-boxes.json', import.meta.url)),
    'utf8',
  ),
);

const faces = readdirSync(TILES)
  .filter(f => /^(man|pin|sou)-[1-9]\.svg$/.test(f))
  .sort();

/** The committed pipeline: strip the 3D body, then frame on the glyph. */
const derive = (file: string): string =>
  reframe(flattenSvg(readFileSync(TILES + file, 'utf8')), BOXES[file]);

describe('flat tile derivation', () => {
  it('has a source face for all 27 tile types', () => {
    expect(faces).toHaveLength(27);
  });

  it('strips the 3D treatment and keeps the glyph', () => {
    for (const file of faces) {
      const flat = derive(file);
      for (const id of STRIP_IDS) {
        expect(flat, `${file} still carries ${id}`).not.toContain(`id="${id}"`);
      }
      // Every glyph is at least one path; pin tiles draw their dots as many.
      expect(flat.match(/<path\b/g)?.length ?? 0, `${file} lost its glyph`).toBeGreaterThan(0);
      expect(flat, `${file} is not a well-formed svg`).toMatch(/^<svg\b[\s\S]*<\/svg>$/);
    }
  });

  it('leaves no empty wrapper groups behind', () => {
    for (const file of faces) {
      expect(flattenSvg(readFileSync(TILES + file, 'utf8')), file).not.toMatch(
        /<g\b[^>]*>\s*<\/g>/,
      );
    }
  });

  it('has a measured glyph box for every face', () => {
    for (const file of faces) {
      const box = BOXES[file];
      if (!box) throw new Error(`${file} has no entry in glyph-boxes.json`);
      expect(box.w, `${file} has an empty glyph box`).toBeGreaterThan(0);
      expect(box.h, `${file} has an empty glyph box`).toBeGreaterThan(0);
    }
  });

  // The whole point of the reframe: the glyph's centre lands on the frame's
  // centre, so it renders centred on the face instead of wherever the 3D body
  // happened to leave it.
  it('centres each glyph in its frame', () => {
    for (const file of faces) {
      const viewBox = /viewBox="([^"]*)"/.exec(derive(file))?.[1];
      if (!viewBox) throw new Error(`${file} lost its viewBox`);
      const box = BOXES[file];
      if (!box) throw new Error(`${file} has no entry in glyph-boxes.json`);
      const [vx = 0, vy = 0, vw = 0, vh = 0] = viewBox.split(' ').map(Number);
      // Rounded to 0.1 when written, so allow that much drift on each side.
      expect(
        Math.abs(vx + vw / 2 - (box.x + box.w / 2)),
        `${file} is off-centre in x`,
      ).toBeLessThan(0.11);
      expect(
        Math.abs(vy + vh / 2 - (box.y + box.h / 2)),
        `${file} is off-centre in y`,
      ).toBeLessThan(0.11);
    }
  });

  it('frames every face identically, so relative glyph sizes survive', () => {
    const sizes = new Set(
      faces.map(f => {
        const viewBox = /viewBox="([^"]*)"/.exec(derive(f))?.[1];
        if (!viewBox) throw new Error(`${f} lost its viewBox`);
        const [, , vw = 0, vh = 0] = viewBox.split(' ').map(Number);
        return `${vw}x${vh}`;
      }),
    );
    expect([...sizes]).toEqual(['210x227']);
  });

  // The committed output is what the app loads, so it has to match what the
  // scripts produce now — otherwise an edit to the source art, or to the frame,
  // silently ships stale faces.
  it('matches the committed flat assets', () => {
    const flatFiles = readdirSync(FLAT).sort();
    expect(flatFiles).toHaveLength(faces.length + 1); // + the authored back
    expect(flatFiles).toContain('back.svg');
    for (const file of faces) {
      expect(readFileSync(FLAT + file, 'utf8'), `flat/${file} is stale`).toBe(derive(file));
    }
  });
});
