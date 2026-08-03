import type { GameEvent, HuRecord, Seat } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { feedLineFor, soundForEvent } from '../src/components/EventFeed.js';
import { LANGS, catalog } from '../src/i18n/index.js';

const YOU: Seat = 0;
const OPP: Seat = 2;

const huRecord = { seat: OPP } as unknown as HuRecord;

describe('event feed mapping (F7)', () => {
  it('plays sound for opponents but not for your own moves', () => {
    const theirs: GameEvent = { e: 'discarded', seat: OPP, tile: 4 };
    const yours: GameEvent = { e: 'discarded', seat: YOU, tile: 4 };

    expect(soundForEvent(theirs, YOU)).toBe('discard');
    expect(soundForEvent(yours, YOU)).toBeNull();
  });

  it('maps claims and kongs to their sounds', () => {
    expect(soundForEvent({ e: 'claimed', seat: OPP, kind: 'pung', tile: 4 }, YOU)).toBe('claim');
    expect(soundForEvent({ e: 'claimed', seat: OPP, kind: 'kong', tile: 4 }, YOU)).toBe('kong');
    expect(
      soundForEvent({ e: 'kongDeclared', seat: OPP, subtype: 'concealed', tile: null }, YOU),
    ).toBe('kong');
    expect(soundForEvent({ e: 'hu', seat: OPP, record: huRecord }, YOU)).toBe('hu');
  });

  it('announces claims, kongs and wins — and stays quiet about discards', () => {
    expect(feedLineFor({ e: 'claimed', seat: OPP, kind: 'pung', tile: 4 })).toEqual({
      key: 'event.pung',
      seat: OPP,
    });
    expect(feedLineFor({ e: 'kongDeclared', seat: OPP, subtype: 'promoted', tile: 4 })).toEqual({
      key: 'event.kong',
      seat: OPP,
    });
    expect(feedLineFor({ e: 'discarded', seat: OPP, tile: 4 })).toBeNull();
  });

  it('announces a won claim once, not twice', () => {
    // The engine emits both `hu` and `claimed{kind:'hu'}` for the same win.
    expect(feedLineFor({ e: 'hu', seat: OPP, record: huRecord })).toEqual({
      key: 'event.hu',
      seat: OPP,
    });
    expect(feedLineFor({ e: 'claimed', seat: OPP, kind: 'hu', tile: 4 })).toBeNull();
  });

  it('every key it can emit exists in the catalog', () => {
    for (const e of ANNOUNCED) {
      const line = feedLineFor(e);
      if (line) expect(catalog.en[line.key], line.key).toBeDefined();
    }
  });
});

const ANNOUNCED: GameEvent[] = [
  { e: 'claimed', seat: OPP, kind: 'pung', tile: 4 },
  { e: 'claimed', seat: OPP, kind: 'kong', tile: 4 },
  { e: 'kongDeclared', seat: OPP, subtype: 'concealed', tile: null },
  { e: 'hu', seat: OPP, record: huRecord },
];

/**
 * The feed translates at render, not at announce. `EventFeed` used to store
 * `t(key, …)` and so kept whatever language a line was announced in — while
 * `PlayHistory` and the store's `history` both keep raw events precisely so a
 * mid-round language switch takes the whole list with it. (N12)
 *
 * The component itself needs a DOM, so what is asserted here is the contract it
 * depends on: `feedLineFor` yields a key rather than a sentence, and every key
 * it can yield resolves in every language. A line that reaches state as
 * text cannot switch, whatever the render does.
 */
describe('feed lines are language-independent (N12)', () => {
  it('returns catalog keys, not formatted text', () => {
    for (const e of ANNOUNCED) {
      const line = feedLineFor(e);
      if (!line) continue;
      expect(line.key, line.key).toMatch(/^event\.[a-z]+$/);
      // A key is not a sentence: no interpolated name, no spaces.
      expect(line.key).not.toContain(' ');
    }
  });

  it('resolves in every language, so a switch has somewhere to switch to', () => {
    for (const e of ANNOUNCED) {
      const line = feedLineFor(e);
      if (!line) continue;
      for (const lang of LANGS.map(l => l.code)) {
        expect(catalog[lang][line.key], `${lang} ${line.key}`).toBeTruthy();
      }
    }
  });

  it('the languages actually differ, or nothing would be observable', () => {
    const line = feedLineFor({ e: 'hu', seat: OPP, record: huRecord });
    expect(line).not.toBeNull();
    if (!line) return;
    expect(catalog.en[line.key]).not.toBe(catalog['zh-Hans'][line.key]);
  });
});
