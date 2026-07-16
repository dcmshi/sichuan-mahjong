import { DEFAULT_CONFIG, applyAction, createGame } from '@sichuan-mahjong/engine';
import type { GameAction, GameState, PlayerInit, Seat } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import {
  botClaimAction,
  botClaimActionMedium,
  botHuanAction,
  botTurnAction,
  botTurnActionMedium,
  botVoidAction,
} from '../src/bot.js';

const NUM_GAMES = 100;
const MAX_ITER = 15_000;

const PLAYERS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'Bot0', isBot: true },
  { name: 'Bot1', isBot: true },
  { name: 'Bot2', isBot: true },
  { name: 'Bot3', isBot: true },
];

function runGame(seed: string, difficulty: 'easy' | 'medium' = 'easy'): GameState {
  const turnFn = difficulty === 'medium' ? botTurnActionMedium : botTurnAction;
  const claimFn = difficulty === 'medium' ? botClaimActionMedium : botClaimAction;
  let state = createGame(seed, PLAYERS, { ...DEFAULT_CONFIG, claimWindowMs: 0 });
  let iter = 0;

  while (state.phase !== 'roundEnd') {
    if (iter++ >= MAX_ITER) throw new Error(`Game ${seed}: exceeded ${MAX_ITER} iterations`);

    let action: GameAction | null = null;

    if (state.phase === 'huan') {
      for (let s = 0; s < 4; s++) {
        if (state.pendingHuan[s] == null) {
          action = botHuanAction(state, s as Seat);
          break;
        }
      }
    } else if (state.phase === 'voidDeclare') {
      for (let s = 0; s < 4; s++) {
        if (state.pendingVoid[s] == null) {
          action = botVoidAction(state, s as Seat);
          break;
        }
      }
    } else if (state.phase === 'play') {
      if (state.pendingClaims !== null) {
        const w = state.pendingClaims;
        let allDecided = true;
        for (let s = 0; s < 4; s++) {
          const seat = s as Seat;
          if (seat === w.from) continue;
          if (!w.passed[seat] && w.claims[seat] === null) {
            action = claimFn(state, seat);
            allDecided = false;
            break;
          }
        }
        if (allDecided) {
          action = { t: 'claimWindowExpire' };
        }
      } else if (state.turnDrawNeeded) {
        action = { t: 'draw', seat: state.turn };
      } else {
        action = turnFn(state, state.turn);
      }
    }

    if (action === null)
      throw new Error(
        `Game ${seed}: no action at phase=${state.phase} turn=${state.turn} iter=${iter}`,
      );

    const result = applyAction(state, action);
    if (!result.ok) {
      throw new Error(
        `Game ${seed}, iter ${iter}: action rejected: ${result.reason}\naction: ${JSON.stringify(action)}\nphase: ${state.phase}`,
      );
    }
    state = result.state;
  }

  return state;
}

describe('bot smoke test', () => {
  it(`runs ${NUM_GAMES} full bot-vs-bot games without rule violations or balance errors`, () => {
    let totalHus = 0;
    let totalExposedPungs = 0;

    for (let g = 0; g < NUM_GAMES; g++) {
      const seed = `smoke-game-${g}`;
      const state = runGame(seed);

      // Payment balance: sum(scoreDelta) + penaltyPot === 0
      const totalDelta = state.players.reduce((sum, p) => sum + p.scoreDelta, 0);
      expect(totalDelta + state.penaltyPot, `Game ${g} (${seed}): payment balance`).toBe(0);

      totalHus += state.players.filter(p => p.status === 'hu').length;
      totalExposedPungs += state.players.reduce(
        (n, p) => n + p.melds.filter(m => m.kind === 'pung' && !m.concealed).length,
        0,
      );
    }

    // At least some Hus across 100 games (highly likely)
    expect(totalHus).toBeGreaterThan(0);
    // Bots must actually pung now — before A13 the heuristic always returned false,
    // so no exposed pungs ever formed.
    expect(totalExposedPungs).toBeGreaterThan(0);
  }, 120_000);

  it('runs medium-bot games without rule violations or balance errors', () => {
    for (let g = 0; g < 30; g++) {
      const state = runGame(`smoke-medium-${g}`, 'medium');
      const totalDelta = state.players.reduce((sum, p) => sum + p.scoreDelta, 0);
      expect(totalDelta + state.penaltyPot, `medium game ${g}: payment balance`).toBe(0);
    }
  }, 120_000);
});

describe('medium bot defensive pung (A25)', () => {
  /**
   * Rig a claim window where seat 0 (medium bot) can pung man-1 discarded by
   * seat 1. Seat 2's hand is the variable: tenpai in one case, hopeless in the
   * other. Tile ids are hand-picked so no id appears twice (id = type*4 + copy).
   */
  function rigClaimState(opponentTenpai: boolean): GameState {
    const state = createGame('a25', PLAYERS, { ...DEFAULT_CONFIG, enableHuanSanZhang: false });
    state.phase = 'play';
    for (const p of state.players) {
      p.voidedSuit = 'sou';
      p.voidCleared = true;
      p.usedIndicator = true;
    }

    // Seat 0: two more man-1 copies (pung-eligible), no man-2/man-3 so the
    // shouldPung chow heuristic doesn't veto, and nothing close to tenpai.
    state.players[0]!.hand = [1, 2, 16, 17, 20, 28, 29, 32, 60, 61, 64, 68, 69];

    // Seat 2: pin111 222 333 444 + single pin5 → tenpai (pair wait on pin5);
    // or pin111 222 333 + four isolated singles → nowhere near a win.
    state.players[2]!.hand = opponentTenpai
      ? [36, 37, 38, 40, 41, 42, 44, 45, 46, 48, 49, 50, 52]
      : [36, 37, 38, 40, 41, 42, 44, 45, 46, 18, 34, 52, 70];

    // Seat 3: five pairs + three isolated singles — not tenpai.
    state.players[3]!.hand = [4, 5, 8, 12, 13, 24, 25, 33, 56, 57, 62, 65, 66];

    // Seat 1 discarded man-1 (id 0); claim window open on it.
    state.players[1]!.hand = state.players[1]!.hand.slice(0, 13);
    state.players[1]!.discards.push(0);
    state.lastDiscard = { tile: 0, from: 1, afterKong: false };
    state.pendingClaims = {
      tile: 0,
      from: 1,
      afterKong: false,
      deadline: Date.now() + 3000,
      passed: [false, false, false, false],
      claims: [null, null, null, null],
    };
    return state;
  }

  it('declines the pung while an opponent is tenpai', () => {
    const action = botClaimActionMedium(rigClaimState(true), 0);
    expect(action.t).toBe('pass');
  });

  it('takes the pung when no opponent is tenpai', () => {
    const action = botClaimActionMedium(rigClaimState(false), 0);
    expect(action).toEqual({ t: 'claim', seat: 0, claim: { kind: 'pung' } });
  });
});
