import type { GameAction, PlayerView, Seat, Tile, TileType } from '@sichuan-mahjong/engine';
import { tileFromType, tileToType } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { catalog, translate } from '../src/i18n/index.js';
import type { Lang } from '../src/i18n/index.js';
import { kongOffers, kongTileTypes } from '../src/kongOffers.js';

/**
 * What the kong button says, and about which tile. (N28)
 *
 * The button read `Kong M3 (promoted)`: a tile code no other screen uses, and the
 * *name* of the subtype rather than any account of what tapping it does. There is
 * no DOM in the client suite, so the mapping from a legal action to a named tile
 * and a consequence lives here.
 */

const M = (r: number): TileType => r - 1;
const kong = (tile: Tile, subtype: 'concealed' | 'promoted' | 'postponed'): GameAction => ({
  t: 'declareKongOnTurn',
  seat: 0 as Seat,
  tile,
  subtype,
});

const viewWith = (actions: GameAction[]) => ({ yourLegalActions: actions }) as PlayerView;

describe('kongOffers', () => {
  it('reads the action tile as a Tile, not a TileId', () => {
    // `a.tile` is {suit, rank}. Read as an id it produced `undefined` and crashed
    // the app whenever a kong was offered, which is why this is pinned.
    const offers = kongOffers(viewWith([kong({ suit: 'man', rank: 3 }, 'promoted')]));
    expect(offers).toHaveLength(1);
    expect(offers[0]!.type).toBe(tileToType({ suit: 'man', rank: 3 }));
    expect(tileFromType(offers[0]!.type)).toEqual({ suit: 'man', rank: 3 });
  });

  it('gives an id of that type, so the button can draw the tile', () => {
    for (const rank of [1, 5, 9] as const) {
      const offers = kongOffers(viewWith([kong({ suit: 'sou', rank }, 'concealed')]));
      const id = offers[0]!.tileId;
      expect(Math.floor(id / 4), `sou-${rank}`).toBe(offers[0]!.type);
    }
  });

  it('ignores every other legal action', () => {
    const actions: GameAction[] = [
      { t: 'discard', seat: 0 as Seat, tile: 4 },
      kong({ suit: 'pin', rank: 2 }, 'concealed'),
      { t: 'declareHuOnDraw', seat: 0 as Seat },
    ];
    expect(kongOffers(viewWith(actions)).map(o => o.type)).toEqual([
      tileToType({ suit: 'pin', rank: 2 }),
    ]);
  });

  it('keys each subtype to its own hint', () => {
    const subtypes = ['concealed', 'promoted', 'postponed'] as const;
    const offers = kongOffers(
      viewWith(subtypes.map((s, i) => kong({ suit: 'man', rank: (i + 1) as 1 | 2 | 3 }, s))),
    );
    expect(offers.map(o => o.hintKey)).toEqual([
      'play.kong.hint.concealed',
      'play.kong.hint.promoted',
      'play.kong.hint.postponed',
    ]);
  });

  it('is empty with no kong on offer, which is what hides the row', () => {
    expect(kongOffers(viewWith([{ t: 'discard', seat: 0 as Seat, tile: 1 }]))).toEqual([]);
  });
});

describe('kongTileTypes', () => {
  it('collects the types the hand should mark', () => {
    const offers = kongOffers(
      viewWith([
        kong({ suit: 'man', rank: 3 }, 'promoted'),
        kong({ suit: 'sou', rank: 7 }, 'concealed'),
      ]),
    );
    const marked = kongTileTypes(offers);
    expect(marked.has(M(3))).toBe(true);
    expect(marked.has(tileToType({ suit: 'sou', rank: 7 }))).toBe(true);
    expect(marked.has(M(4)), 'nothing else').toBe(false);
  });
});

describe('the strings the button renders', () => {
  it('has a hint for every subtype in all three languages', () => {
    for (const lang of ['en', 'zh-Hans', 'zh-Hant'] as Lang[]) {
      for (const s of ['concealed', 'promoted', 'postponed']) {
        expect(catalog[lang][`play.kong.hint.${s}`], `${lang} ${s}`).toBeTruthy();
        expect(catalog[lang][`kong.${s}`], `${lang} kong.${s}`).toBeTruthy();
      }
    }
  });

  // The bug that started this: `M3` in an English-only shorthand, in a `{label}`
  // slot the Chinese catalogs also filled. The label now comes from `tileLabel`,
  // which is translated — so the button must have no untranslated leftovers.
  it('leaves nothing unsubstituted in any language', () => {
    for (const lang of ['en', 'zh-Hans', 'zh-Hant'] as Lang[]) {
      const out = translate(lang, 'play.kong', {
        subtype: translate(lang, 'kong.promoted'),
        label: translate(lang, 'tile.label', { rank: 3, suit: translate(lang, 'tile.man') }),
      });
      expect(out, lang).not.toContain('{');
      expect(out, `${lang} names the tile in words`).not.toMatch(/\bM3\b/);
    }
  });

  // Only one of promoted and postponed pays, and only one can be robbed. Two
  // identical-looking buttons where that is the difference is the whole item.
  it('says postponed pays nothing and promoted can be robbed', () => {
    expect(translate('en', 'play.kong.hint.postponed')).toContain('nothing');
    expect(translate('en', 'play.kong.hint.promoted')).toContain('Hu');
    expect(translate('zh-Hans', 'play.kong.hint.postponed')).toContain('不计分');
    expect(translate('zh-Hans', 'play.kong.hint.promoted')).toContain('抢杠');
  });
});
