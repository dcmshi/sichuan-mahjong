import type { TileId } from '@sichuan-mahjong/engine';

/**
 * The player's dragged hand arrangement, carried across a server push. (A46)
 *
 * `OwnZone` lets you drag tiles to organise your hand, so the on-screen order is
 * local state — but the authoritative hand arrives fresh from the server on every
 * view. This is the reconciliation: **keep the arrangement for tiles still held,
 * drop what left, and append what arrived.**
 *
 * All three halves matter, and each covers a different way the hand changes:
 *
 * - *Kept, in `prev`'s order* — a draw must not reshuffle the twelve tiles you
 *   already sorted. This is the whole point of the local order.
 * - *Dropped* — a tile leaves by being discarded, or by being claimed out from
 *   under you when someone kongs your pung. A stale id would render a tile you
 *   no longer hold.
 * - *Appended at the end, in server order* — a drawn tile arrives where a drawn
 *   tile goes, at the right-hand end, rather than in whatever slot the sorted
 *   hand would have given it. A re-deal replaces every id at once, and falls out
 *   of the same rule: nothing is kept, so the new hand is appended whole.
 *
 * Pure, and called from an effect keyed on hand *contents* rather than on the
 * `hand` array reference — which is a fresh object on every push and would reset
 * the arrangement each time.
 */
export function reconcileHandOrder(prev: readonly TileId[], hand: readonly TileId[]): TileId[] {
  const inHand = new Set(hand);
  const kept = prev.filter(id => inHand.has(id));
  const keptSet = new Set(kept);
  return [...kept, ...hand.filter(id => !keptSet.has(id))];
}
