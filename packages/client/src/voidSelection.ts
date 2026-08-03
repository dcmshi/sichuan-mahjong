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
  | { kind: 'noSuit' }
  /** A suit is chosen but which of its tiles leads is still unanswered. */
  | { kind: 'needTile'; suit: Suit }
  | { kind: 'ready'; suit: Suit; firstDiscard: TileId | null };

/**
 * What the void screen may submit for the current selection.
 *
 * The two null cases are not interchangeable, which is the whole reason this is a
 * function rather than a `&&`: a player holding the suit must name the tile that
 * leads (N30 — it is the tile three opponents get their first claim window on),
 * while a player holding none of it submits `firstDiscard: null` and takes the
 * indicator. Sending null while holding the suit is rejected by the engine as
 * `void_indicator_not_allowed`, because it would keep a tile that should have been
 * separated (A36).
 *
 * A pick from a suit no longer chosen is treated as no pick, so the caller cannot
 * submit a tile that belongs to a different suit than the declaration.
 */
export function voidChoice(
  counts: SuitTiles,
  suit: Suit | null,
  picked: TileId | null,
): VoidChoice {
  if (suit === null) return { kind: 'noSuit' };
  if (counts[suit].length === 0) return { kind: 'ready', suit, firstDiscard: null };
  if (picked === null || !counts[suit].includes(picked)) return { kind: 'needTile', suit };
  return { kind: 'ready', suit, firstDiscard: picked };
}
