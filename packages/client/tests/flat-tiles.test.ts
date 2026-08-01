import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs build script, no types
import { STRIP_IDS, flattenSvg } from '../../../scripts/tiles/flatten-tiles.mjs';

const TILES = fileURLToPath(new URL('../public/tiles/', import.meta.url));
const FLAT = `${TILES}flat/`;

const faces = readdirSync(TILES)
  .filter(f => /^(man|pin|sou)-[1-9]\.svg$/.test(f))
  .sort();

describe('flat tile derivation', () => {
  it('has a source face for all 27 tile types', () => {
    expect(faces).toHaveLength(27);
  });

  it('strips the 3D treatment and keeps the glyph', () => {
    for (const file of faces) {
      const flat: string = flattenSvg(readFileSync(TILES + file, 'utf8'));
      for (const id of STRIP_IDS) {
        expect(flat, `${file} still carries ${id}`).not.toContain(`id="${id}"`);
      }
      // Every glyph is at least one path; pin tiles draw their dots as many.
      expect(flat.match(/<path\b/g)?.length ?? 0, `${file} lost its glyph`).toBeGreaterThan(0);
      expect(flat, `${file} is not a well-formed svg`).toMatch(/^<svg\b[\s\S]*<\/svg>$/);
    }
  });

  it("keeps each face's viewBox, so the glyph keeps its inset in the cell", () => {
    for (const file of faces) {
      const src = readFileSync(TILES + file, 'utf8');
      const viewBox = /viewBox="[^"]*"/.exec(src)?.[0];
      expect(viewBox, `${file} has no viewBox`).toBeDefined();
      expect(flattenSvg(src)).toContain(viewBox);
    }
  });

  it('leaves no empty wrapper groups behind', () => {
    for (const file of faces) {
      expect(flattenSvg(readFileSync(TILES + file, 'utf8')), file).not.toMatch(
        /<g\b[^>]*>\s*<\/g>/,
      );
    }
  });

  // The committed output is what the app loads, so it has to match what the
  // script produces now — otherwise an edit to the source art silently ships
  // stale faces.
  it('matches the committed flat assets', () => {
    const flatFiles = readdirSync(FLAT).sort();
    expect(flatFiles).toHaveLength(faces.length + 1); // + the authored back
    expect(flatFiles).toContain('back.svg');
    for (const file of faces) {
      expect(readFileSync(FLAT + file, 'utf8'), `flat/${file} is stale`).toBe(
        flattenSvg(readFileSync(TILES + file, 'utf8')),
      );
    }
  });
});
