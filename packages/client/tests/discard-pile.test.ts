import { tileToType } from '@sichuan-mahjong/engine';
import type { PlayerView, Rank, Suit, TileId } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { playerAt, splitPile } from '../src/discardPile.js';
import { LANGS, translate } from '../src/i18n/index.js';

function tile(suit: Suit, rank: Rank): TileId {
  return tileToType({ suit, rank }) * 4;
}

const M1 = tile('man', 1);
const M2 = tile('man', 2);
const P5 = tile('pin', 5);

describe('splitPile', () => {
  it('holds the declaration out of the pile once it has been flipped', () => {
    expect(splitPile({ discards: [M1, M2, P5], firstDiscardIsVoid: true })).toEqual({
      voidDiscard: M1,
      pile: [M2, P5],
    });
  });

  // `firstDiscardIsVoid` is false until the owner flips it, which is when a real
  // table learns it — so the first discard is an ordinary one until then.
  it('leaves the whole pile alone while the declaration is still face down', () => {
    expect(splitPile({ discards: [M1, M2], firstDiscardIsVoid: false })).toEqual({
      voidDiscard: null,
      pile: [M1, M2],
    });
  });

  // The indicator case: a seat that declared a suit it held none of never sets a
  // tile aside, so there is no first discard to mark.
  it('reports no declaration for an empty pile', () => {
    expect(splitPile({ discards: [], firstDiscardIsVoid: false })).toEqual({
      voidDiscard: null,
      pile: [],
    });
  });

  it('does not alias the caller/`s array', () => {
    const discards = [M1, M2];
    const { pile } = splitPile({ discards, firstDiscardIsVoid: false });
    pile.push(P5);
    expect(discards).toEqual([M1, M2]);
  });
});

describe('playerAt', () => {
  const view = {
    you: { seat: 1, name: 'Ann', discards: [M1], firstDiscardIsVoid: true },
    others: [
      { seat: 2, name: 'Bo', discards: [], firstDiscardIsVoid: false },
      { seat: 3, name: 'Cy', discards: [], firstDiscardIsVoid: false },
      { seat: 0, name: 'Di', discards: [], firstDiscardIsVoid: false },
    ],
  } as unknown as PlayerView;

  it('finds your own seat, which is not in `others`', () => {
    expect(playerAt(view, 1)?.name).toBe('Ann');
  });

  // `others` is ordered by distance from you, not by seat, so a lookup by index
  // would name the wrong player for three of the four seats.
  it('finds an opponent by seat rather than by position', () => {
    expect(playerAt(view, 0)?.name).toBe('Di');
    expect(playerAt(view, 3)?.name).toBe('Cy');
  });
});

describe('the discard-pile strings', () => {
  it('resolve in every language, with the substitutions filled', () => {
    for (const lang of LANGS) {
      for (const key of ['pile.void', 'pile.discards', 'pile.empty'] as const) {
        expect(translate(lang.code, key), `${lang.code} ${key}`).not.toContain('{');
      }
      for (const key of ['pile.title', 'pile.open'] as const) {
        const line = translate(lang.code, key, { name: 'Ann' });
        expect(line, `${lang.code} ${key}`).toContain('Ann');
        expect(line, `${lang.code} ${key}`).not.toContain('{');
      }
      expect(translate(lang.code, 'pile.count', { n: 7 }), lang.code).toContain('7');
    }
  });

  // N34: "Void Man" and "7 of Characters" named one suit two ways, and neither
  // was the character on the tile. Every English suit string carries the glyph.
  it('name a suit with its glyph in English', () => {
    for (const [suit, glyph] of [
      ['man', '万'],
      ['pin', '饼'],
      ['sou', '条'],
    ] as const) {
      expect(translate('en', `suit.${suit}`)).toContain(glyph);
      expect(translate('en', `tile.${suit}`)).toContain(glyph);
      expect(translate('en', `suit.${suit}.full`)).toContain(glyph);
    }
  });

  it('carry the pinyin on the full form, which is what the void screen draws', () => {
    expect(translate('en', 'suit.man.full')).toContain('wàn');
    expect(translate('en', 'suit.pin.full')).toContain('bǐng');
    expect(translate('en', 'suit.sou.full')).toContain('tiáo');
  });
});
