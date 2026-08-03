import { type PlayerView, type TileType, tileToType } from '@sichuan-mahjong/engine';
import type { GameAction } from '@sichuan-mahjong/engine';

export type KongAction = Extract<GameAction, { t: 'declareKongOnTurn' }>;

/**
 * A kong the player may declare this turn, with everything the button needs to
 * say what it will do. (N28)
 *
 * The button used to read `Kong M3 (promoted)`. Two things were wrong with that.
 * `M3` is a code no other screen uses — every other tile in the app is named
 * through `tileLabel`, which says "3 Characters" and is translated, so the one
 * control asking a player to give up a specific tile named it in untranslated
 * shorthand. And "(promoted)" is the *name* of the subtype rather than an account
 * of what happens, which is why the report was "it looks like it adds an
 * additional tile to my hand, but it's not super clear which one it is."
 *
 * Both halves of that are right. A promoted kong genuinely does add a tile: one
 * copy leaves your hand onto the exposed pung and then a replacement comes off
 * the far end of the wall. The three subtypes differ in exactly the ways a player
 * would want to know and all three drew the same purple button:
 *
 * - **concealed** — all four are already in hand and become a meld. 2 from each.
 * - **promoted** — one leaves hand and joins your pung. 1 from each, *and it can
 *   be robbed*: another seat may Hu on the tile you are adding.
 * - **postponed** — same shape, but the fourth copy was not the tile you just
 *   drew, and it **pays nothing**. Two identical-looking buttons where one is
 *   worth points and the other is not.
 */
export type KongOffer = {
  action: KongAction;
  /** The tile type, so the hand can mark the copies this kong would consume. */
  type: TileType;
  /** Any id of that type — for drawing the tile on the button. Faces are per type. */
  tileId: number;
  hintKey: `play.kong.hint.${KongAction['subtype']}`;
};

export function kongOffers(view: PlayerView): KongOffer[] {
  const out: KongOffer[] = [];
  for (const a of view.yourLegalActions) {
    if (a.t !== 'declareKongOnTurn') continue;
    // `a.tile` is a Tile ({suit, rank}), not a TileId — a previous version read it
    // as an id and crashed the app whenever a kong was offered.
    const type = tileToType(a.tile);
    out.push({ action: a, type, tileId: type * 4, hintKey: `play.kong.hint.${a.subtype}` });
  }
  return out;
}

/**
 * The tile types any offered kong would consume, for marking them in the hand —
 * "which one is it" was half the report, and the hand is where the answer is.
 */
export function kongTileTypes(offers: KongOffer[]): Set<TileType> {
  return new Set(offers.map(o => o.type));
}
