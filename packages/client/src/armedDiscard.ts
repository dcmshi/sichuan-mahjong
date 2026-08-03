import type { PlayerView, TileId } from '@sichuan-mahjong/engine';

/**
 * Pre-selecting a discard while you wait (N11).
 *
 * Under `voidDiscardRule: 'strict'` your legal discards are only void-suit tiles
 * until that suit is gone, so for the opening turns the decision is already made
 * and the taps are pure latency. Arming is local: nothing goes on the wire until
 * the discard is legal, so this adds no message and no server-side validation.
 *
 * The whole risk is in the *cancel*. An armed tile that fires on a turn where you
 * could have won, konged, or claimed would spend that decision without you
 * touching anything — the worst failure a convenience feature can have, because
 * it is silent. So this fires only on a turn that offers nothing else, and stands
 * down with a reason otherwise.
 *
 * Pure and exported because the client suite has no DOM, and because the cases
 * that matter — the drawn winning tile, the claim window — are exactly the ones a
 * browser check reaches only by luck.
 */

export type StandDownReason =
  /** A window opened where you could pung, kong or hu. */
  | 'claim'
  /** The turn arrived carrying a win or a kong — decisions worth stopping for. */
  | 'choice'
  /** Legal to discard something, but not this: the void rule forbids it. */
  | 'illegal'
  /** The tile left your hand — claimed, or absorbed into a kong. */
  | 'gone';

export type ArmedOutcome =
  | { t: 'hold' }
  | { t: 'fire'; tile: TileId }
  | { t: 'standDown'; reason: StandDownReason };

type ArmedView = Pick<PlayerView, 'yourLegalActions' | 'claimDeadline' | 'you' | 'turn' | 'phase'>;

export function armedDiscardOutcome(view: ArmedView, armed: TileId | null): ArmedOutcome {
  if (armed === null) return { t: 'hold' };
  if (view.phase !== 'play' || view.you.status !== 'playing') {
    return { t: 'standDown', reason: 'gone' };
  }
  if (!view.you.hand.includes(armed)) return { t: 'standDown', reason: 'gone' };

  const actions = view.yourLegalActions;

  // Checked before the turn test, because a claim window is open on someone
  // else's turn — which is precisely when a tile is sitting armed.
  if (view.claimDeadline !== null || actions.some(a => a.t === 'claim')) {
    return { t: 'standDown', reason: 'claim' };
  }

  if (view.turn !== view.you.seat) return { t: 'hold' };

  // The server draws for you, so by the time a discard is legal the drawn tile is
  // already in hand and its consequences are already in `yourLegalActions`.
  if (
    actions.some(
      a => a.t === 'declareHuOnDraw' || a.t === 'declareHeavenly' || a.t === 'declareKongOnTurn',
    )
  ) {
    return { t: 'standDown', reason: 'choice' };
  }

  if (actions.some(a => a.t === 'discard' && a.tile === armed)) return { t: 'fire', tile: armed };

  // Discards are legal but not this one — the void rule. Distinct from the
  // mandatory first-discard flip (A35), where no discard is legal at all and the
  // arm should simply survive to the next turn.
  return actions.some(a => a.t === 'discard')
    ? { t: 'standDown', reason: 'illegal' }
    : { t: 'hold' };
}
