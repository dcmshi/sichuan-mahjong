import { tileToType } from '@sichuan-mahjong/engine';
import type { PlayerView, Rank, Suit, TileId } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { playerAt, riverCells, splitPile } from '../src/discardPile.js';
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

describe('riverCells', () => {
  const P1 = tile('pin', 1);
  const S1 = tile('sou', 1);
  // Nine distinct tiles, oldest first, for the capping cases.
  const many = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(r => tile('sou', r as Rank));

  function river(
    discards: TileId[],
    opts: { firstDiscardIsVoid?: boolean; pendingFirstDiscard?: boolean } = {},
  ) {
    return {
      discards,
      firstDiscardIsVoid: opts.firstDiscardIsVoid ?? false,
      pendingFirstDiscard: opts.pendingFirstDiscard ?? false,
    };
  }

  it('heads the river with the flipped declaration, marked', () => {
    const { cells, hidden, hasDeclaration } = riverCells(
      river([M1, M2, P5], { firstDiscardIsVoid: true }),
      9,
    );
    expect(cells).toEqual([
      { id: M1, declared: true },
      { id: M2, declared: false },
      { id: P5, declared: false },
    ]);
    expect(hidden).toBe(0);
    expect(hasDeclaration).toBe(true);
  });

  // The tile is face down until its owner flips it (A37), so the cell is there
  // and empty — a `null` the trays draw as a `TileBack`.
  it('holds a cell for a declaration that is still face down', () => {
    const { cells, hasDeclaration } = riverCells(river([M1], { pendingFirstDiscard: true }), 9);
    expect(cells[0]).toBeNull();
    expect(cells[1]).toEqual({ id: M1, declared: false });
    expect(hasDeclaration).toBe(true);
  });

  // The two ways a declaration leaves no tile: a suit the seat held none of, and
  // one that was flipped and then claimed away (A15). `OwnZone` draws a ghost off
  // this, so it has to be false rather than merely cell-less. (N43)
  it('reports no declaration when nothing was ever set aside', () => {
    expect(riverCells(river([M1, M2]), 9).hasDeclaration).toBe(false);
    expect(riverCells(river([]), 9).hasDeclaration).toBe(false);
  });

  // The rule the three trays exist to share: a cap drops the oldest *ordinary*
  // discards and never the one tile that says what this seat declared.
  it('pins the declaration and drops the oldest ordinary discards', () => {
    const discards = [P1, ...many];
    const { cells, hidden } = riverCells(river(discards, { firstDiscardIsVoid: true }), 4);
    expect(cells[0]).toEqual({ id: P1, declared: true });
    // 9 ordinary discards, 3 cells left after the pinned declaration.
    expect(cells.slice(1)).toEqual(many.slice(-3).map(id => ({ id, declared: false })));
    expect(hidden).toBe(6);
  });

  it('counts the hidden tiles that the cap dropped', () => {
    expect(riverCells(river(many), 4).hidden).toBe(5);
    expect(riverCells(river(many), 9).hidden).toBe(0);
    expect(riverCells(river(many), 20).hidden).toBe(0);
  });

  // Your own river. Furiten is decided by what you have already discarded, so it
  // never counts anything away.
  it('shows everything when uncapped', () => {
    const { cells, hidden } = riverCells(river(many), null);
    expect(cells).toHaveLength(9);
    expect(hidden).toBe(0);
  });

  // `slice(-0)` returns the whole array. No tray can reach this — the smallest
  // cap is 9 — but the helper must not carry the trap forward.
  it('shows nothing, not everything, when the cap leaves no room', () => {
    const { cells, hidden } = riverCells(river(many, { firstDiscardIsVoid: true }), 1);
    expect(cells).toEqual([{ id: many[0], declared: true }]);
    expect(hidden).toBe(8);
    expect(riverCells(river(many), 0)).toMatchObject({ cells: [], hidden: 9 });
  });

  it('does not alias the caller/`s array', () => {
    const discards = [M1, S1];
    const { cells } = riverCells(river(discards), null);
    cells.push(null);
    expect(discards).toEqual([M1, S1]);
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

  // The reading is pinyin, not the Japanese manzu / pinzu / souzu that English
  // mahjong writing borrowed — those belong to a Japanese catalog (N23).
  it('read a suit in pinyin, and gloss it in plain English on the full form', () => {
    for (const [suit, reading, gloss] of [
      ['man', 'Wàn', 'Characters'],
      ['pin', 'Bǐng', 'Dots'],
      ['sou', 'Tiáo', 'Bamboo'],
    ] as const) {
      expect(translate('en', `suit.${suit}`)).toContain(reading);
      expect(translate('en', `tile.${suit}`)).toContain(reading);
      expect(translate('en', `suit.${suit}.full`)).toContain(gloss);
    }
    for (const key of ['suit.man', 'tile.man', 'suit.man.full'] as const) {
      expect(translate('en', key), key).not.toContain('Man');
    }
  });
});
