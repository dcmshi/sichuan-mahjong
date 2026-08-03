import { tileToType } from '@sichuan-mahjong/engine';
import type { Rank, Suit, TileId } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { LANGS, translate } from '../src/i18n/index.js';
import { handBySuit, voidChoice } from '../src/voidSelection.js';

/** First copy of a tile, e.g. `tile('man', 3)`. */
function tile(suit: Suit, rank: Rank): TileId {
  return tileToType({ suit, rank }) * 4;
}

describe('handBySuit', () => {
  it('splits the hand and keeps hand order within each suit', () => {
    const hand = [tile('sou', 9), tile('man', 3), tile('pin', 5), tile('man', 1)];
    const counts = handBySuit(hand);
    expect(counts.man).toEqual([tile('man', 3), tile('man', 1)]);
    expect(counts.pin).toEqual([tile('pin', 5)]);
    expect(counts.sou).toEqual([tile('sou', 9)]);
  });
});

describe('voidChoice', () => {
  const hand = [tile('man', 3), tile('man', 9), tile('pin', 5)];
  const counts = handBySuit(hand);

  it('is not submittable before a suit is chosen', () => {
    expect(voidChoice(counts, null, null)).toEqual({ kind: 'noSuit' });
  });

  // Choosing a suit is enough: the first of it in hand order is the default, and
  // the screen marks and names whichever tile this returns. N30's bug was that
  // the same default was computed inside `submit`, where nothing showed it.
  it('defaults to the first tile of the suit, so the suit button alone submits', () => {
    expect(voidChoice(counts, 'man', null)).toEqual({
      kind: 'ready',
      suit: 'man',
      firstDiscard: tile('man', 3),
    });
  });

  it('submits the tile that was tapped, not the first of the suit', () => {
    expect(voidChoice(counts, 'man', tile('man', 9))).toEqual({
      kind: 'ready',
      suit: 'man',
      firstDiscard: tile('man', 9),
    });
  });

  // A36: null is the indicator, and claiming it while holding the suit keeps a
  // tile that should have been separated. The two null cases are not the same.
  it('submits null only for a suit the hand has none of', () => {
    expect(voidChoice(counts, 'sou', null)).toEqual({
      kind: 'ready',
      suit: 'sou',
      firstDiscard: null,
    });
  });

  it('ignores a tile left over from a suit no longer chosen', () => {
    expect(voidChoice(counts, 'pin', tile('man', 3))).toEqual({
      kind: 'ready',
      suit: 'pin',
      firstDiscard: tile('pin', 5),
    });
  });

  it('ignores a pick that is not in the hand at all', () => {
    expect(voidChoice(counts, 'man', tile('man', 1))).toEqual({
      kind: 'ready',
      suit: 'man',
      firstDiscard: tile('man', 3),
    });
  });
});

describe('the void screen strings', () => {
  it('resolves in every language, with the tile substituted', () => {
    for (const lang of LANGS) {
      for (const key of ['void.hint', 'void.yourHand', 'void.indicator'] as const) {
        expect(translate(lang.code, key), `${lang.code} ${key}`).not.toContain('{');
      }
      const line = translate(lang.code, 'void.firstDiscard', { tile: '3 man' });
      expect(line, lang.code).toContain('3 man');
      expect(line, lang.code).not.toContain('{');
    }
  });
});
