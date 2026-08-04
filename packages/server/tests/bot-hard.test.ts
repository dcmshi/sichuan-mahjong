import { DEFAULT_CONFIG, createGame, suitOf } from '@sichuan-mahjong/engine';
import type { GameState, PlayerInit, Seat } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import {
  botClaimAction,
  botClaimActionHard,
  botVoidAction,
  botVoidActionHard,
} from '../src/bot.js';
import { botTurnActionHard } from '../src/bot.js';
import { handShanten } from '../src/shanten.js';

const PLAYERS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'Bot0', isBot: true },
  { name: 'Bot1', isBot: true },
  { name: 'Bot2', isBot: true },
  { name: 'Bot3', isBot: true },
];

/** Tile id from a suit and rank, choosing which of the four copies. */
function id(suit: 'm' | 'p' | 's', rank: number, copy = 0) {
  return ({ m: 0, p: 1, s: 2 }[suit] * 9 + (rank - 1)) * 4 + copy;
}

function base(): GameState {
  return createGame('hard-bot', PLAYERS, { ...DEFAULT_CONFIG, enableHuanSanZhang: false });
}

describe('hard bot: the discard read (N19)', () => {
  /**
   * Seat 1 is one tile from a win and has flipped a declaration, which is the
   * whole of what the table knows about its hand. Seat 0 is three exchanges away,
   * so the race is lost and the turn is a fold — and every tile of the declared
   * suit is one the engine will not let seat 1 claim.
   *
   * The declared suit is the parameter, and the two hands are mirror images, so
   * the pair of cases below differ in nothing but what seat 1 told the table.
   */
  function rigThreat(threatVoid: 'sou' | 'pin'): GameState {
    const state = base();
    state.phase = 'play';
    state.turn = 0;
    state.turnDrawNeeded = false;
    state.pendingClaims = null;
    for (const p of state.players) {
      p.pendingFirstDiscard = null;
      p.usedIndicator = true;
    }
    state.firstTurnDone = [true, true, true, true];

    // Fourteen tiles, no man (its own void) and nothing that completes a set:
    // pin 1-1-2-4-5-7-8 and sou 1-2-4-5-5-7-8, so three exchanges from a win
    // whichever tile goes — and evenly split between the two suits, so nothing
    // but the danger read can prefer one.
    state.players[0]!.voidedSuit = 'man';
    state.players[0]!.hand = [
      id('p', 1, 0),
      id('p', 1, 1),
      id('p', 2),
      id('p', 4),
      id('p', 5),
      id('p', 7),
      id('p', 8),
      id('s', 1),
      id('s', 2),
      id('s', 4),
      id('s', 5, 0),
      id('s', 5, 1),
      id('s', 7),
      id('s', 8),
    ];

    // Seat 1: man 1-9, a run in the suit it kept, and a lone tile to pair —
    // tenpai, and holding none of the suit it declared.
    const kept = threatVoid === 'sou' ? 'p' : 's';
    state.players[1]!.voidedSuit = threatVoid;
    state.players[1]!.usedIndicator = false;
    state.players[1]!.hand = [
      id('m', 1),
      id('m', 2),
      id('m', 3),
      id('m', 4),
      id('m', 5),
      id('m', 6),
      id('m', 7),
      id('m', 8),
      id('m', 9),
      id(kept, 1, 3),
      id(kept, 2, 2),
      id(kept, 3, 1),
      id(kept, 5, 3),
    ];
    // One discard, of the suit it gave up, so the declaration counts as flipped.
    state.players[1]!.discards = [id(threatVoid === 'sou' ? 's' : 'p', 3, 3)];

    // Two seats going nowhere: three loose partials each and no pair.
    state.players[2]!.hand = [
      id('m', 1, 1),
      id('m', 2, 1),
      id('m', 4, 1),
      id('m', 5, 1),
      id('m', 7, 1),
      id('m', 8, 1),
      id('p', 1, 2),
      id('p', 4, 2),
      id('p', 7, 2),
      id('s', 1, 1),
      id('s', 4, 1),
      id('s', 7, 1),
      id('s', 9, 1),
    ];
    state.players[3]!.hand = [
      id('m', 1, 2),
      id('m', 2, 2),
      id('m', 4, 2),
      id('m', 5, 2),
      id('m', 7, 2),
      id('m', 8, 2),
      id('m', 9, 2),
      id('p', 2, 1),
      id('p', 5, 2),
      id('p', 8, 2),
      id('s', 2, 1),
      id('s', 5, 2),
      id('s', 8, 1),
    ];
    return state;
  }

  it('is set up as described: seat 0 is out of the race, seat 1 is in it', () => {
    for (const threatVoid of ['sou', 'pin'] as const) {
      const state = rigThreat(threatVoid);
      expect(handShanten(state.players[0]!.hand, 0, 'man').best).toBeGreaterThanOrEqual(2);
      expect(handShanten(state.players[1]!.hand, 0, threatVoid).best).toBe(0);
      expect(handShanten(state.players[2]!.hand, 0, null).best).toBeGreaterThan(0);
      expect(handShanten(state.players[3]!.hand, 0, null).best).toBeGreaterThan(0);
    }
  });

  it('folds into the threatened seat’s declared void suit, whichever it is', () => {
    for (const [threatVoid, expected] of [
      ['sou', 'sou'],
      ['pin', 'pin'],
    ] as const) {
      const action = botTurnActionHard(rigThreat(threatVoid), 0);
      expect(action?.t).toBe('discard');
      const tile = (action as { t: 'discard'; tile: number }).tile;
      expect(suitOf(tile), `declared ${threatVoid}, discarded ${tile}`).toBe(expected);
    }
  });

  it('reads the declaration rather than the hand behind it', () => {
    // The suit is safe because seat 1 *said* so, in public, by flipping. Take the
    // flip away — same hand, same tenpai — and there is nothing to read: the
    // choice falls back to efficiency, and stops tracking the declaration.
    const declared = botTurnActionHard(rigThreat('sou'), 0) as { tile: number };

    const hidden = rigThreat('sou');
    hidden.players[1]!.discards = [];
    const blind = botTurnActionHard(hidden, 0) as { tile: number };

    expect(suitOf(declared.tile)).toBe('sou');
    expect(blind.tile, 'a hidden declaration should not steer the discard').not.toBe(declared.tile);
  });
});

describe('hard bot: claim discipline (N19)', () => {
  /**
   * Seat 0 is already tenpai, waiting on man 5 between man 4 and man 6. Punging
   * man 1 is legal and does nothing: the hand stays exactly one tile away, having
   * spent a turn and shown the table a set. Hard passes; the other two levels ask
   * only whether the tile has chow neighbours, and it has none.
   */
  function rigPung(): GameState {
    const state = base();
    state.phase = 'play';
    for (const p of state.players) {
      p.voidedSuit = 'sou';
      p.usedIndicator = true;
      p.pendingFirstDiscard = null;
    }

    state.players[0]!.hand = [
      id('m', 1, 1),
      id('m', 1, 2),
      id('p', 1),
      id('p', 2),
      id('p', 3),
      id('p', 4),
      id('p', 5),
      id('p', 6),
      id('p', 7),
      id('p', 8),
      id('p', 9),
      id('m', 4, 0),
      id('m', 6, 0),
    ];
    state.players[1]!.hand = state.players[1]!.hand.slice(0, 13);
    state.players[1]!.discards.push(id('m', 1, 0));
    state.lastDiscard = { tile: id('m', 1, 0), from: 1, afterKong: false };
    state.pendingClaims = {
      tile: id('m', 1, 0),
      from: 1,
      afterKong: false,
      deadline: Date.now() + 3000,
      passed: [false, false, false, false],
      claims: [null, null, null, null],
    };
    return state;
  }

  it('declines a pung that leaves the hand no closer to a win', () => {
    const state = rigPung();
    expect(handShanten(state.players[0]!.hand, 0, 'sou').best).toBe(0);
    expect(botClaimActionHard(state, 0)).toEqual({ t: 'pass', seat: 0 });
  });

  it('…which the easy bot takes, since it only looks at the tile', () => {
    expect(botClaimAction(rigPung(), 0)).toEqual({
      t: 'claim',
      seat: 0,
      claim: { kind: 'pung' },
    });
  });
});

describe('hard bot: the void declaration (N19)', () => {
  /**
   * Man is the shortest suit and the worst one to give up: those three tiles are
   * a finished run, while the four sou are scattered singles worth nothing.
   */
  function rigVoid(): GameState {
    const state = base();
    state.phase = 'voidDeclare';
    state.pendingVoid = [null, null, null, null];
    state.players[0]!.hand = [
      id('m', 1),
      id('m', 2),
      id('m', 3),
      id('p', 1),
      id('p', 2),
      id('p', 3),
      id('p', 5),
      id('p', 6),
      id('p', 7),
      id('s', 1),
      id('s', 4),
      id('s', 7),
      id('s', 9),
    ];
    return state;
  }

  it('gives up the suit that costs the hand least, not the one with fewest tiles', () => {
    const state = rigVoid();
    const hard = botVoidActionHard(state, 0);
    expect(hard).toMatchObject({ t: 'declareVoid', suit: 'sou' });

    // The other levels count tiles, so they throw away a completed run.
    const easy = botVoidAction(state, 0);
    expect(easy).toMatchObject({ t: 'declareVoid', suit: 'man' });

    // …and the shanten says which of the two was right.
    expect(handShanten(state.players[0]!.hand, 0, 'sou').best).toBeLessThan(
      handShanten(state.players[0]!.hand, 0, 'man').best,
    );
  });

  it('separates a tile of the suit it declared', () => {
    const action = botVoidActionHard(rigVoid(), 0) as {
      suit: string;
      firstDiscard: number | null;
    };
    expect(action.firstDiscard).not.toBeNull();
    expect(suitOf(action.firstDiscard as number)).toBe(action.suit);
  });
});
