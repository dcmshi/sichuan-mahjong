import type { FanEntry, LedgerEntry, Seat } from '@sichuan-mahjong/engine';
import type { useT } from './i18n/useT.js';

type Translate = ReturnType<typeof useT>;

/** One ledger entry as the row for `seat` should read it. */
export type LedgerLine = {
  /** Catalog key for the reason. */
  key: string;
  /** Kong subtype or refund reason, for the qualifier; null when there is none. */
  detail: string | null;
  /** The seat on the other side, or null for a penalty paid to the pot. */
  other: Seat | null;
  /** Signed from this seat's perspective: negative when it paid. */
  amount: number;
};

/** "All Pungs" / "All Pungs ×2" — the multiplier only appears when it matters. */
export function formatFan(entry: FanEntry, t: Translate): string {
  const name = t(`fan.${entry.fan}`);
  return entry.count > 1 ? t('fan.multiplier', { name, n: entry.count }) : name;
}

/**
 * The ledger as one seat sees it. A redistributive entry appears in both the
 * payer's and the payee's ledger, so the sign is resolved here rather than in
 * the component.
 */
export function ledgerLines(ledger: LedgerEntry[], seat: Seat): LedgerLine[] {
  const lines: LedgerLine[] = [];
  for (const e of ledger) {
    const paid = e.from === seat;
    if (!paid && e.to !== seat) continue;
    lines.push({
      key: `ledger.${e.reason}`,
      detail: e.detail,
      other: paid ? e.to : e.from,
      amount: paid ? -e.amount : e.amount,
    });
  }
  return lines;
}
