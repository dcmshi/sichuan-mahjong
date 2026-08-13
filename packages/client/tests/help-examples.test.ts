import { COMPATIBILITY, isWinningHand } from '@sichuan-mahjong/engine';
import type { FanType } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { HELP_FAN_ORDER, SHAPE_EXAMPLES, helpFanRows } from '../src/helpExamples.js';
import { LANGS, catalog, translate } from '../src/i18n/index.js';

// The one failure mode a screenshot cannot catch: a help screen confidently
// drawing a hand that does not actually win. (N3)
describe('How to Play winning examples', () => {
  for (const ex of SHAPE_EXAMPLES) {
    const tiles = ex.groups.flat();

    it(`${ex.key} is a hand the engine calls a win`, () => {
      expect(tiles).toHaveLength(14);
      // No melds: everything drawn is concealed, which is what makes seven pairs
      // legal in the same list as the other two.
      expect(isWinningHand(tiles, [], ex.voided)).not.toBeNull();
    });

    it(`${ex.key} uses no tile twice`, () => {
      expect(new Set(tiles).size).toBe(tiles.length);
    });
  }

  it('the standard example decomposes as four sets plus a pair', () => {
    const ex = SHAPE_EXAMPLES.find(e => e.key === 'standard')!;
    expect(ex.groups.map(g => g.length)).toEqual([3, 3, 3, 3, 2]);
  });

  it('the seven-pairs example is seven pairs', () => {
    const ex = SHAPE_EXAMPLES.find(e => e.key === 'sevenPairs')!;
    expect(ex.groups).toHaveLength(7);
    expect(ex.groups.every(g => g.length === 2)).toBe(true);
  });

  it('the full-flush example holds one suit', () => {
    const ex = SHAPE_EXAMPLES.find(e => e.key === 'fullFlush')!;
    const suits = new Set(ex.groups.flat().map(id => Math.floor(id / 36)));
    expect(suits.size).toBe(1);
  });
});

describe('How to Play fan table', () => {
  it('lists every fan the scorer can award, exactly once', () => {
    const engineFans = Object.keys(COMPATIBILITY) as FanType[];
    expect([...HELP_FAN_ORDER].sort()).toEqual([...engineFans].sort());
  });

  it('quotes the engine values rather than its own', () => {
    for (const row of helpFanRows()) {
      expect(row.fanValue).toBe(COMPATIBILITY[row.fan].fanValue);
      expect(row.selfMax).toBe(COMPATIBILITY[row.fan].selfMax);
    }
  });

  it('has a note for every fan in every language', () => {
    for (const lang of LANGS.map(l => l.code)) {
      for (const fan of HELP_FAN_ORDER) {
        expect(catalog[lang][`htp.fan.${fan}`], `${lang} htp.fan.${fan}`).toBeTruthy();
      }
    }
  });

  it('has a caption for every drawn example in every language', () => {
    for (const lang of LANGS.map(l => l.code)) {
      for (const ex of SHAPE_EXAMPLES) {
        expect(catalog[lang][`htp.shape.${ex.key}`], `${lang} htp.shape.${ex.key}`).toBeTruthy();
      }
    }
  });

  // The fan limit is a house rule now (N27), so the two strings that state it have
  // to take it as a substitution. Both said "3" and "8" in prose in all three
  // languages, and a 4-fan table would have read a confident wrong number — the
  // same failure `HELP_FAN_ORDER` exists to prevent one row further down.
  it('states the fan cap as a substitution rather than a number', () => {
    for (const lang of LANGS.map(l => l.code)) {
      for (const key of ['htp.fan.cap', 'htp.scoring.body']) {
        const s = catalog[lang][key]!;
        expect(s, `${lang} ${key} cap`).toContain('{cap}');
        expect(s, `${lang} ${key} max`).toContain('{max}');
      }
    }
  });

  it('renders both documented caps from the same string', () => {
    for (const cap of [3, 4]) {
      const out = translate('en', 'htp.fan.cap', { cap, max: 2 ** cap });
      expect(out).toContain(`cap at ${cap}`);
      expect(out).toContain(`${2 ** cap} points`);
      expect(out, 'nothing left unsubstituted').not.toContain('{');
    }
  });
});
