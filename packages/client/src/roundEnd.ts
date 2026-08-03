import type {
  FanEntry,
  HuRecord,
  LedgerEntry,
  RoundResult,
  Seat,
  TileId,
} from '@sichuan-mahjong/engine';
import { tileTypeOf } from '@sichuan-mahjong/engine';
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
 * The winning tile, when the hand on screen has to draw it itself.
 *
 * A tile claimed off a discard never enters `hand`: the engine scores with it
 * but leaves it in the discarder's pile, because moving it would double-count
 * it against the 108-tile conservation property. So a discard win's `hand` is
 * one tile short of a winning shape, and drawing only `hand` showed 13 tiles
 * that plainly do not win — which reads as the engine having accepted an
 * invalid Hu. A self-drawn winner already holds the tile, hence the byDiscard
 * test rather than an unconditional append.
 *
 * Takes anything carrying a `HuRecord`, not just a `RoundPlayer`: the round-end
 * reveal was fixed for this and the play screen was not, so from declaring Hu on
 * a discard until the round actually ended — many turns, while you sit out — your
 * own hand showed the same 13 tiles under a banner saying it was complete.
 * `PlayerView.you` carries both fields this reads. (N29)
 */
export function separateWinningTile(player: { hu: HuRecord | null }): TileId | null {
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

/** One group of a decomposed winning hand, as the reveal draws it. */
export type HandGroup = {
  kind: 'chow' | 'pung' | 'kong' | 'pair' | 'rest';
  tiles: TileId[];
};

/**
 * A winner's concealed tiles, split into the sets that won. (N16)
 *
 * Returns null when there is nothing to group — a non-winner, or a `HuRecord`
 * with no `shape`. That second case is not hypothetical: the field is optional
 * because a snapshot saved before it existed has no shape, and because
 * `views.ts` redacts it from other seats mid-round. **The caller must fall back
 * to the flat run**, which is what the reveal drew before this existed.
 *
 * `shape.sets` leads with the declared melds, in `melds` order, because that is
 * what `findAllWinningShapes` builds — and the reveal draws those separately
 * through `MeldDisplay`, so that many are skipped here.
 *
 * The winning tile is grouped with the set it completed rather than set apart:
 * on a discard win it is not in `hand` at all (see `separateWinningTile`), so it
 * is added to the pool first and then falls wherever the shape puts it. Which
 * set it lands in is the thing a player is trying to see.
 *
 * Anything the shape does not account for is returned as a trailing `rest`
 * group. That should be empty, and a test says so — but dropping tiles silently
 * would draw a hand with fewer tiles than the player held, which is exactly the
 * failure `revealedTileCount` exists to catch elsewhere.
 */
export function groupWinningHand(player: RoundPlayer): HandGroup[] | null {
  const shape = player.hu?.shape;
  if (shape === undefined) return null;

  const separate = separateWinningTile(player);
  const pool = new Map<number, TileId[]>();
  for (const id of separate === null ? player.hand : [...player.hand, separate]) {
    const type = tileTypeOf(id);
    const bucket = pool.get(type);
    if (bucket) bucket.push(id);
    else pool.set(type, [id]);
  }

  /** Pulls one tile of `type`, or nothing if the pool has run dry. */
  const take = (type: number): TileId[] => {
    const bucket = pool.get(type);
    const id = bucket?.pop();
    return id === undefined ? [] : [id];
  };

  const groups: HandGroup[] = [];
  if (shape.kind === 'sevenPairs') {
    for (const type of shape.pairs) {
      groups.push({ kind: 'pair', tiles: [...take(type), ...take(type)] });
    }
  } else {
    for (const set of shape.sets.slice(player.melds.length)) {
      if (set.kind === 'chow') {
        groups.push({ kind: 'chow', tiles: set.types.flatMap(take) });
      } else {
        const n = set.kind === 'kong' ? 4 : 3;
        groups.push({
          kind: set.kind,
          tiles: Array.from({ length: n }, () => take(set.type)).flat(),
        });
      }
    }
    groups.push({ kind: 'pair', tiles: [...take(shape.pair), ...take(shape.pair)] });
  }

  const rest = [...pool.values()].flat();
  if (rest.length > 0) groups.push({ kind: 'rest', tiles: rest });
  return groups.filter(g => g.tiles.length > 0);
}
