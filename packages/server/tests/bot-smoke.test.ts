import { describe, it, expect } from 'vitest';
import {
  applyAction,
  createGame,
  DEFAULT_CONFIG,
} from '@sichuan-mahjong/engine';
import type { GameState, GameAction, Seat, PlayerInit } from '@sichuan-mahjong/engine';
import { botHuanAction, botVoidAction, botTurnAction, botClaimAction } from '../src/bot.js';

const NUM_GAMES = 100;
const MAX_ITER = 15_000;

const PLAYERS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'Bot0', isBot: true },
  { name: 'Bot1', isBot: true },
  { name: 'Bot2', isBot: true },
  { name: 'Bot3', isBot: true },
];

function runGame(seed: string): GameState {
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
            action = botClaimAction(state, seat);
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
        action = botTurnAction(state, state.turn);
      }
    }

    if (action === null) throw new Error(`Game ${seed}: no action at phase=${state.phase} turn=${state.turn} iter=${iter}`);

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

    for (let g = 0; g < NUM_GAMES; g++) {
      const seed = `smoke-game-${g}`;
      const state = runGame(seed);

      // Payment balance: sum(scoreDelta) + penaltyPot === 0
      const totalDelta = state.players.reduce((sum, p) => sum + p.scoreDelta, 0);
      expect(totalDelta + state.penaltyPot, `Game ${g} (${seed}): payment balance`).toBe(0);

      totalHus += state.players.filter(p => p.status === 'hu').length;
    }

    // At least some Hus across 100 games (highly likely)
    expect(totalHus).toBeGreaterThan(0);
  }, 120_000);
});
