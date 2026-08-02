import type { FanEntry, LedgerEntry, RoundResult, Seat, TileId } from '@sichuan-mahjong/engine';
import type { useT } from './i18n/useT.js';

type Translate = ReturnType<typeof useT>;

/** One seat's entry in a finished round. */
type RoundPlayer = RoundResult['players'][number];

/** One ledger entry as the row for `seat` should read it. */
export type LedgerLine = {
  /** Catalog key for the reason. */
  key: string;
  /**
   * Catalog key for the qualifier (kong subtype, refund reason), or null when
   * the entry has none. A key rather than the raw engine identifier, which
   * would otherwise print as English in every language.
   */
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
      detail: e.detail === null ? null : `ledgerDetail.${e.detail}`,
      other: paid ? e.to : e.from,
      amount: paid ? -e.amount : e.amount,
    });
  }
  return lines;
}

/**
 * The winning tile, when the reveal has to draw it itself.
 *
 * A tile claimed off a discard never enters `hand`: the engine scores with it
 * but leaves it in the discarder's pile, because moving it would double-count
 * it against the 108-tile conservation property. So a discard win's `hand` is
 * one tile short of a winning shape, and drawing only `hand` showed 13 tiles
 * that plainly do not win — which reads as the engine having accepted an
 * invalid Hu. A self-drawn winner already holds the tile, hence the byDiscard
 * test rather than an unconditional append.
 */
export function separateWinningTile(player: RoundPlayer): TileId | null {
  if (!player.hu?.byDiscard) return null;
  return player.hu.winningTile;
}

/**
 * How many tiles a seat's reveal accounts for, melds included. A winner's must
 * be 14, plus one per kong; anything else means the reveal is drawing an
 * incomplete hand whatever the engine decided.
 */
export function revealedTileCount(player: RoundPlayer): number {
  const separate = separateWinningTile(player) === null ? 0 : 1;
  const melded = player.melds.reduce((n, m) => n + (m.kind === 'kong' ? 4 : 3), 0);
  return player.hand.length + separate + melded;
}

/** What `revealedTileCount` must equal for a winning hand. */
export function expectedWinningTileCount(player: RoundPlayer): number {
  return 14 + player.melds.filter(m => m.kind === 'kong').length;
}
