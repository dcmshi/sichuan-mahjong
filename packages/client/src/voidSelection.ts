import { tileFromType, tileTypeOf } from '@sichuan-mahjong/engine';
import type { Suit, TileId } from '@sichuan-mahjong/engine';

export type SuitTiles = Record<Suit, TileId[]>;

/** The hand split by suit, in hand order. */
export function handBySuit(hand: readonly TileId[]): SuitTiles {
  const out: SuitTiles = { man: [], pin: [], sou: [] };
  for (const id of hand) out[tileFromType(tileTypeOf(id)).suit].push(id);
  return out;
}

export type VoidChoice =
  /** No suit chosen yet. */
  { kind: 'noSuit' } | { kind: 'ready'; suit: Suit; firstDiscard: TileId | null };

/**
 * What the void screen may submit for the current selection.
 *
 * **Choosing a suit is enough**, and the first tile of it in hand order is the
 * default. N30 made naming a tile compulsory, which cost the two-tap path for the
 * player who does not care which of their void tiles leads; the fix it was after
 * is that the choice be *visible*, not that it be forced. So the default is
 * returned here like any other answer, the screen marks and names whichever tile
 * `firstDiscard` holds, and tapping a tile replaces it. What is gone is the
 * silent version: this used to be `counts[suit][0]` computed inside `submit`,
 * where no screen ever showed it.
 *
 * The two null cases are not interchangeable, which is the whole reason this is a
 * function rather than a `??`: a player holding none of the suit submits
 * `firstDiscard: null` and takes the indicator, while sending null *while holding
 * the suit* is rejected by the engine as `void_indicator_not_allowed`, because it
 * would keep a tile that should have been separated (A36).
 *
 * A pick from a suit no longer chosen falls back to the default, so the caller
 * cannot submit a tile belonging to a different suit than the declaration.
 */
export function voidChoice(
  counts: SuitTiles,
  suit: Suit | null,
  picked: TileId | null,
): VoidChoice {
  if (suit === null) return { kind: 'noSuit' };
  const tiles = counts[suit];
  if (tiles.length === 0) return { kind: 'ready', suit, firstDiscard: null };
  const firstDiscard = picked !== null && tiles.includes(picked) ? picked : tiles[0]!;
  return { kind: 'ready', suit, firstDiscard };
}
