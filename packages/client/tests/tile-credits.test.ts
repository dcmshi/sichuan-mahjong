import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * LICENSE §2 claims per-file attribution for every tile the app ships, and the
 * release binary embeds all of them (§3), so a tile added without a credits
 * entry would make that claim false in a compiled artifact. This is the guard:
 * the directory listing and credits.json have to agree, in both directions.
 */
const tilesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tiles');

type Credits = {
  license: string;
  licenseUrl: string;
  files: Array<{ file: string; author: string }>;
};

const credits = JSON.parse(readFileSync(join(tilesDir, 'credits.json'), 'utf8')) as Credits;
const shipped = readdirSync(tilesDir)
  .filter(f => f.endsWith('.svg'))
  .sort();

describe('tile credits', () => {
  it('credits every SVG that ships, and credits nothing that does not', () => {
    expect(credits.files.map(f => f.file).sort()).toEqual(shipped);
  });

  it('ships the 27 suit tiles plus the back', () => {
    expect(shipped).toHaveLength(28);
  });

  it('names an author for each file', () => {
    for (const entry of credits.files) {
      expect(entry.author, entry.file).toBeTruthy();
    }
  });

  it('states the licence and its URI', () => {
    expect(credits.license).toBe('CC BY-SA 4.0');
    expect(credits.licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
  });
});
