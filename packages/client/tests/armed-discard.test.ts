import type { GameAction, PlayerView, Seat, TileId } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { armedDiscardOutcome } from '../src/armedDiscard.js';

const ARMED = 12 as TileId;
const OTHER = 40 as TileId;

type ArmedView = Parameters<typeof armedDiscardOutcome>[0];

/**
 * The smallest view the helper reads. Built by hand rather than from a real
 * `GameState` on purpose: the cases worth guarding — you draw the winning tile,
 * a claim window opens on the tile you armed — are ones a played round reaches
 * only by luck, which is exactly why N15's browser check passed vacuously.
 */
function view(over: {
  actions?: GameAction[];
  hand?: TileId[];
  turn?: Seat;
  claimDeadline?: number | null;
  phase?: PlayerView['phase'];
  status?: 'playing' | 'hu';
}): ArmedView {
  return {
    yourLegalActions: over.actions ?? [],
    claimDeadline: over.claimDeadline ?? null,
    turn: over.turn ?? (1 as Seat),
    phase: over.phase ?? 'play',
    you: {
      seat: 0 as Seat,
      hand: over.hand ?? [ARMED, OTHER],
      status: over.status ?? 'playing',
    },
  } as unknown as ArmedView;
}

const discard = (tile: TileId): GameAction => ({ t: 'discard', seat: 0 as Seat, tile });

describe('armed discard', () => {
  it('holds while it is somebody else’s turn', () => {
    expect(armedDiscardOutcome(view({}), ARMED)).toEqual({ t: 'hold' });
  });

  it('holds when nothing is armed', () => {
    expect(armedDiscardOutcome(view({ turn: 0 as Seat }), null)).toEqual({ t: 'hold' });
  });

  it('fires when your turn offers only the discard', () => {
    const v = view({ turn: 0 as Seat, actions: [discard(ARMED), discard(OTHER)] });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'fire', tile: ARMED });
  });

  // The failure this feature must never produce: spending a claim you never saw.
  it('stands down when a claim window opens', () => {
    const v = view({ claimDeadline: Date.now() + 5000 });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'claim' });
  });

  it('stands down when a claim is offered without a deadline in view', () => {
    const v = view({
      actions: [{ t: 'claim', seat: 0 as Seat, claim: { kind: 'pung' } } as GameAction],
    });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'claim' });
  });

  // The second silent loss: you drew the tile that wins, and the armed discard
  // would throw it away before you were shown it.
  it('stands down when the draw lets you declare Hu', () => {
    const v = view({
      turn: 0 as Seat,
      actions: [discard(ARMED), { t: 'declareHuOnDraw', seat: 0 as Seat }],
    });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'choice' });
  });

  it('stands down when the draw lets you declare Heavenly', () => {
    const v = view({
      turn: 0 as Seat,
      actions: [discard(ARMED), { t: 'declareHeavenly', seat: 0 as Seat }],
    });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'choice' });
  });

  it('stands down when a kong is available on the turn', () => {
    const v = view({
      turn: 0 as Seat,
      actions: [
        discard(ARMED),
        {
          t: 'declareKongOnTurn',
          seat: 0 as Seat,
          tile: { suit: 'man', rank: 3 },
          subtype: 'concealed',
        } as GameAction,
      ],
    });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'choice' });
  });

  it('stands down when the void rule forbids the armed tile', () => {
    const v = view({ turn: 0 as Seat, actions: [discard(OTHER)] });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'illegal' });
  });

  // A35: on the flip turn no discard is legal at all, so the arm survives to the
  // turn after rather than being thrown away as illegal.
  it('holds through the mandatory first-discard flip', () => {
    const v = view({ turn: 0 as Seat, actions: [{ t: 'flipFirstDiscard', seat: 0 as Seat }] });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'hold' });
  });

  it('stands down when the tile has left the hand', () => {
    const v = view({ hand: [OTHER] });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'gone' });
  });

  it('stands down once you have won', () => {
    const v = view({ status: 'hu', turn: 0 as Seat, actions: [discard(ARMED)] });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'gone' });
  });

  it('stands down once the round is over', () => {
    const v = view({ phase: 'roundEnd', turn: 0 as Seat });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'gone' });
  });

  // Claim beats the turn test: a window is open on somebody else's turn, which is
  // exactly when a tile is sitting armed.
  it('prefers the claim stand-down over holding', () => {
    const v = view({ turn: 2 as Seat, claimDeadline: Date.now() + 3000 });
    expect(armedDiscardOutcome(v, ARMED)).toEqual({ t: 'standDown', reason: 'claim' });
  });
});
