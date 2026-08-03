import type { PlayerView, PublicPlayer, Seat, TileId } from '@sichuan-mahjong/engine';

/** A seat's discards, split the way every tray draws them. */
export type SplitPile = {
  /** The void declaration, held out of the pile and set above it. */
  voidDiscard: TileId | null;
  /** Everything after the declaration, oldest first. */
  pile: TileId[];
};

/**
 * `firstDiscardIsVoid` is false until that seat flips the tile — which is when a
 * real table learns it — so `voidDiscard: null` means either "not flipped yet"
 * or "declared a suit they held none of", and neither is a tile to draw. Callers
 * test `pendingFirstDiscard` separately for the face-down back.
 *
 * Structurally typed rather than taking `PublicPlayer`, because the spectator
 * view has its own player type carrying the same two fields.
 */
export function splitPile(p: {
  discards: readonly TileId[];
  firstDiscardIsVoid: boolean;
}): SplitPile {
  if (!p.firstDiscardIsVoid) return { voidDiscard: null, pile: [...p.discards] };
  return { voidDiscard: p.discards[0] ?? null, pile: p.discards.slice(1) };
}

/**
 * The seat a pile was opened for. `you` and `others` are separate fields of the
 * view, and the four places that open a pile don't agree on which one they hold.
 */
export function playerAt(view: PlayerView, seat: Seat): PublicPlayer | null {
  if (view.you.seat === seat) return view.you;
  return view.others.find(o => o.seat === seat) ?? null;
}
