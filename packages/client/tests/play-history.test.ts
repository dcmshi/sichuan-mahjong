import type { GameEvent, HuRecord, Seat } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { historyRowFor, historyRows } from '../src/components/PlayHistory.js';
import { catalog } from '../src/i18n/index.js';

const YOU: Seat = 0;
const OPP: Seat = 2;

const huRecord = { seat: OPP } as unknown as HuRecord;

const items = (...events: GameEvent[]) => events.map((event, i) => ({ id: i + 1, event }));

describe('play history (O2)', () => {
  // The whole point of the panel: the transient feed drops discards on purpose,
  // and a history without them is a history of almost nothing.
  it('keeps discards, which the feed deliberately drops', () => {
    expect(historyRowFor({ e: 'discarded', seat: OPP, tile: 4 })).toEqual({
      key: 'history.discarded',
      seat: OPP,
      tile: 4,
    });
  });

  it('lists claims and kongs with the tile they took', () => {
    expect(historyRowFor({ e: 'claimed', seat: OPP, kind: 'pung', tile: 8 })).toEqual({
      key: 'event.pung',
      seat: OPP,
      tile: 8,
    });
    expect(historyRowFor({ e: 'kongDeclared', seat: OPP, subtype: 'promoted', tile: 8 })).toEqual({
      key: 'event.kong',
      seat: OPP,
      tile: 8,
    });
  });

  it('shows no tile for a concealed kong, whose rank is still secret (A27)', () => {
    expect(
      historyRowFor({ e: 'kongDeclared', seat: OPP, subtype: 'concealed', tile: null }),
    ).toEqual({ key: 'event.kong', seat: OPP, tile: null });
  });

  it('records a win once, not twice', () => {
    expect(historyRowFor({ e: 'hu', seat: OPP, record: huRecord })).toEqual({
      key: 'event.hu',
      seat: OPP,
      tile: null,
    });
    expect(historyRowFor({ e: 'claimed', seat: OPP, kind: 'hu', tile: 4 })).toBeNull();
  });

  it('leaves out draws, claim-window mechanics, and payments', () => {
    const skipped: GameEvent[] = [
      { e: 'drew', seat: YOU, tile: 12 },
      { e: 'kongReplacement', seat: YOU, tile: 12 },
      { e: 'claimWindowOpened', tile: 4, from: OPP },
      { e: 'claimWindowClosed' },
      { e: 'huPayment', from: YOU, to: OPP, amount: 4 },
      { e: 'kongRefund', from: YOU, to: OPP, amount: 2, reason: 'robbed' },
      { e: 'roundEnd', reason: 'threeHu' },
      { e: 'dealt' },
    ];
    for (const e of skipped) expect(historyRowFor(e), e.e).toBeNull();
  });

  // A40: an opponent's suit is nulled before broadcast, so a row for it would
  // either say nothing or repeat what's already under the well.
  it('leaves out void declarations', () => {
    expect(historyRowFor({ e: 'voidDeclared', seat: YOU, suit: 'man' })).toBeNull();
    expect(historyRowFor({ e: 'voidDeclared', seat: OPP, suit: null })).toBeNull();
  });

  it('orders newest first and keeps ids for React to key on', () => {
    const rows = historyRows(
      items(
        { e: 'discarded', seat: YOU, tile: 4 },
        { e: 'drew', seat: OPP, tile: null },
        { e: 'discarded', seat: OPP, tile: 8 },
      ),
    );
    expect(rows.map(r => r.tile)).toEqual([8, 4]);
    expect(rows.map(r => r.id)).toEqual([3, 1]);
  });

  it('every key it can emit exists in all three catalogs', () => {
    const events: GameEvent[] = [
      { e: 'discarded', seat: OPP, tile: 4 },
      { e: 'claimed', seat: OPP, kind: 'pung', tile: 4 },
      { e: 'claimed', seat: OPP, kind: 'kong', tile: 4 },
      { e: 'kongDeclared', seat: OPP, subtype: 'concealed', tile: null },
      { e: 'hu', seat: OPP, record: huRecord },
      { e: 'falseHu', seat: OPP },
    ];
    for (const lang of ['en', 'zh-Hans', 'zh-Hant'] as const) {
      for (const e of events) {
        const row = historyRowFor(e);
        if (row) expect(catalog[lang][row.key], `${lang} ${row.key}`).toBeDefined();
      }
      for (const key of ['history.title', 'history.empty', 'play.history']) {
        expect(catalog[lang][key], `${lang} ${key}`).toBeDefined();
      }
    }
  });
});
