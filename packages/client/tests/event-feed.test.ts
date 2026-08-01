import type { GameEvent, HuRecord, Seat } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { feedLineFor, soundForEvent } from '../src/components/EventFeed.js';
import { catalog } from '../src/i18n/index.js';

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
    const events: GameEvent[] = [
      { e: 'claimed', seat: OPP, kind: 'pung', tile: 4 },
      { e: 'claimed', seat: OPP, kind: 'kong', tile: 4 },
      { e: 'kongDeclared', seat: OPP, subtype: 'concealed', tile: null },
      { e: 'hu', seat: OPP, record: huRecord },
    ];
    for (const e of events) {
      const line = feedLineFor(e);
      if (line) expect(catalog.en[line.key], line.key).toBeDefined();
    }
  });
});
