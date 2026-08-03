import type { TileId } from '@sichuan-mahjong/engine';
import { tileToType } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { tileLabel } from '../src/components/Tile.js';
import { type Lang, translate } from '../src/i18n/index.js';

const bound = (lang: Lang) => (key: string, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

const idOf = (suit: 'man' | 'pin' | 'sou', rank: number) =>
  (tileToType({ suit, rank: rank as 1 }) * 4) as TileId;

describe('tile accessible names (F16)', () => {
  // The glyph is part of the English name, not a translation of it (N34): the
  // screen used to call one suit "Man" in one sentence and "Characters" in the
  // next, and neither was the character printed on the tile being named.
  it('reads as a localized name, not the internal id', () => {
    expect(tileLabel(idOf('man', 3), bound('en'))).toBe('3 of 万 Man');
    expect(tileLabel(idOf('pin', 7), bound('en'))).toBe('7 of 饼 Pin');
    expect(tileLabel(idOf('sou', 1), bound('en'))).toBe('1 of 条 Sou');
  });

  it('follows the selected language', () => {
    expect(tileLabel(idOf('man', 3), bound('zh-Hans'))).toBe('3万');
    expect(tileLabel(idOf('man', 3), bound('zh-Hant'))).toBe('3萬');
  });
});
