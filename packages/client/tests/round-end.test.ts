import type { LedgerEntry } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { type Lang, catalog, translate } from '../src/i18n/index.js';
import { formatFan, ledgerLines } from '../src/roundEnd.js';

const bound = (lang: Lang) => (key: string, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

describe('fan formatting (§12.11)', () => {
  it('localizes the fan name and shows a multiplier only when > 1', () => {
    expect(formatFan({ fan: 'AllPungs', count: 1 }, bound('en'))).toBe('All Pungs');
    expect(formatFan({ fan: 'AllPungs', count: 2 }, bound('en'))).toBe('All Pungs ×2');
    expect(formatFan({ fan: 'AllPungs', count: 1 }, bound('zh-Hans'))).toBe('碰碰胡');
  });
});

describe('ledger lines', () => {
  const ledger: LedgerEntry[] = [
    { reason: 'hu', from: 0, to: 1, amount: 4, detail: null },
    { reason: 'kong', from: 2, to: 0, amount: 2, detail: 'concealed' },
    { reason: 'voidPenalty', from: 0, to: null, amount: 48, detail: null },
  ];

  it('signs each amount from the seat’s own perspective', () => {
    expect(ledgerLines(ledger, 0)).toEqual([
      { key: 'ledger.hu', detail: null, other: 1, amount: -4 },
      { key: 'ledger.kong', detail: 'ledgerDetail.concealed', other: 2, amount: 2 },
      { key: 'ledger.voidPenalty', detail: null, other: null, amount: -48 },
    ]);
  });

  it('shows the same entry with the opposite sign to the other seat', () => {
    expect(ledgerLines(ledger, 1)).toEqual([
      { key: 'ledger.hu', detail: null, other: 0, amount: 4 },
    ]);
  });

  it('signed amounts sum to the seat’s score delta', () => {
    const total = ledgerLines(ledger, 0).reduce((s, l) => s + l.amount, 0);
    expect(total).toBe(-50);
  });

  it('every key it can emit exists in the catalog', () => {
    for (const line of ledgerLines(ledger, 0)) {
      expect(catalog.en[line.key], line.key).toBeDefined();
      if (line.detail) expect(catalog.en[line.detail], line.detail).toBeDefined();
    }
  });

  it('localizes every qualifier the engine can attach', () => {
    // kongPayment subtypes and kongRefund reasons — the full set of `detail`
    // values, which used to render as raw English identifiers in all languages.
    const details = [
      'concealed',
      'exposed',
      'promoted',
      'robbed',
      'shootAfterKong',
      'wallEnd',
      'falseHu',
    ];
    for (const d of details) {
      const [line] = ledgerLines([{ reason: 'kong', from: 0, to: 1, amount: 2, detail: d }], 0);
      expect(line?.detail).toBe(`ledgerDetail.${d}`);
      for (const lang of ['en', 'zh-Hans', 'zh-Hant'] as const) {
        expect(catalog[lang][`ledgerDetail.${d}`], `${lang} ${d}`).toBeDefined();
      }
    }
  });
});
