import { DEFAULT_CONFIG, applyAction, createGame } from '@sichuan-mahjong/engine';
import type {
  BotDifficulty,
  GameAction,
  GameState,
  PlayerInit,
  Seat,
} from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import {
  botClaimAction,
  botClaimActionHard,
  botClaimActionMedium,
  botHuanAction,
  botTurnAction,
  botTurnActionHard,
  botTurnActionMedium,
  botVoidAction,
  botVoidActionHard,
  visibleTileTypes,
} from '../src/bot.js';

const NUM_GAMES = 100;
const MAX_ITER = 15_000;

const PLAYERS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'Bot0', isBot: true },
  { name: 'Bot1', isBot: true },
  { name: 'Bot2', isBot: true },
  { name: 'Bot3', isBot: true },
];

/** The same table `room.ts` dispatches through, so the suite covers what ships. */
const LEVELS: Record<
  BotDifficulty,
  {
    turn: typeof botTurnAction;
    claim: typeof botClaimAction;
    declareVoid: typeof botVoidAction;
  }
> = {
  easy: { turn: botTurnAction, claim: botClaimAction, declareVoid: botVoidAction },
  medium: { turn: botTurnActionMedium, claim: botClaimActionMedium, declareVoid: botVoidAction },
  hard: { turn: botTurnActionHard, claim: botClaimActionHard, declareVoid: botVoidActionHard },
};

/** One level per seat, so a table can mix them. */
function runMixedGame(seed: string, levels: BotDifficulty[]): GameState {
  const play = (seat: Seat) => LEVELS[levels[seat] ?? 'easy'];
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
          action = play(s as Seat).declareVoid(state, s as Seat);
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
            action = play(seat).claim(state, seat);
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
        action = play(state.turn).turn(state, state.turn);
      }
    }

    if (action === null)
      throw new Error(
        `Game ${seed}: no action at phase=${state.phase} turn=${state.turn} iter=${iter}`,
      );

    const result = applyAction(state, action);
    if (!result.ok) {
      throw new Error(
        `Game ${seed}, iter ${iter}: action rejected: ${result.reason}
action: ${JSON.stringify(action)}
phase: ${state.phase}`,
      );
    }
    state = result.state;
  }

  return state;
}

function runGame(seed: string, difficulty: BotDifficulty = 'easy'): GameState {
  return runMixedGame(seed, [difficulty, difficulty, difficulty, difficulty]);
}

describe('bot smoke test', () => {
  it(`runs ${NUM_GAMES} full bot-vs-bot games without rule violations or balance errors`, () => {
    let totalHus = 0;
    let totalExposedPungs = 0;
    // Wins by players who separated a face-down first discard (i.e. everyone but
    // the rare indicator user). Before A35 this was structurally zero: the void
    // phase took their tile *and* charged them a normal turn-1 discard, pinning
    // them a tile below the 14 a win needs — and the old `totalHus > 0` assertion
    // sailed through on indicator users alone.
    let separatedHus = 0;

    for (let g = 0; g < NUM_GAMES; g++) {
      const seed = `smoke-game-${g}`;
      const state = runGame(seed);

      // Payment balance: sum(scoreDelta) + penaltyPot === 0
      const totalDelta = state.players.reduce((sum, p) => sum + p.scoreDelta, 0);
      expect(totalDelta + state.penaltyPot, `Game ${g} (${seed}): payment balance`).toBe(0);

      totalHus += state.players.filter(p => p.status === 'hu').length;
      separatedHus += state.players.filter(p => p.status === 'hu' && !p.usedIndicator).length;
      totalExposedPungs += state.players.reduce(
        (n, p) => n + p.melds.filter(m => m.kind === 'pung' && !m.concealed).length,
        0,
      );
    }

    // At least some Hus across 100 games (highly likely)
    expect(totalHus).toBeGreaterThan(0);
    // …and they must not all come from indicator users. (A35)
    expect(separatedHus).toBeGreaterThan(0);
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

  // N19's own pass through the smoke test. A level that reaches the engine by a
  // different route can violate rules no other test would catch — the hard bot
  // declines kongs and pungs the others take, and declares a different void suit,
  // so it visits states neither of the other two does.
  it('runs hard-bot games without rule violations or balance errors', () => {
    let exposedPungs = 0;
    for (let g = 0; g < 30; g++) {
      const state = runGame(`smoke-hard-${g}`, 'hard');
      const totalDelta = state.players.reduce((sum, p) => sum + p.scoreDelta, 0);
      expect(totalDelta + state.penaltyPot, `hard game ${g}: payment balance`).toBe(0);
      exposedPungs += state.players.reduce(
        (n, p) => n + p.melds.filter(m => m.kind === 'pung' && !m.concealed).length,
        0,
      );
    }
    // Hard declines pungs the other levels take, and a discipline that declines
    // *every* one is a bot that never claims — which no unit test of the refusal
    // path would catch.
    expect(exposedPungs).toBeGreaterThan(0);
  }, 180_000);
});

/**
 * The ladder has to be a ladder. Each rung is seated at 0 and 2 against the rung
 * below at 1 and 3, on one deal each, and scored across the run — a single round
 * turns on the deal far too much to say anything.
 *
 * This is the assertion N19 was really for, and it is the one that found the
 * defect it was filed around: before the shanten term went in, **medium lost to
 * easy** here, −60 over 60 games with half as many wins. Medium ranked discards
 * by an acceptance count that is identically zero until the hand is already
 * tenpai, so for most of a round it kept whichever tile came first in hand order,
 * while easy at least read the shape it was holding.
 */
describe('the bot ladder', () => {
  function ledger(strong: BotDifficulty, weak: BotDifficulty, games: number): [number, number] {
    let strongTotal = 0;
    let weakTotal = 0;
    for (let g = 0; g < games; g++) {
      const state = runMixedGame(`ladder-${strong}-${weak}-${g}`, [strong, weak, strong, weak]);
      strongTotal += (state.players[0]?.scoreDelta ?? 0) + (state.players[2]?.scoreDelta ?? 0);
      weakTotal += (state.players[1]?.scoreDelta ?? 0) + (state.players[3]?.scoreDelta ?? 0);
    }
    return [strongTotal, weakTotal];
  }

  it('has hard above medium above easy', () => {
    for (const [strong, weak] of [
      ['hard', 'medium'],
      ['hard', 'easy'],
      ['medium', 'easy'],
    ] as const) {
      const [s, w] = ledger(strong, weak, 40);
      expect(s, `${strong} scored ${s} against ${weak}'s ${w}`).toBeGreaterThan(w);
    }
  }, 300_000);
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

describe('bot tile visibility (A33)', () => {
  it("excludes other players' concealed kong ranks but keeps its own", () => {
    const state = createGame('a33', PLAYERS, { ...DEFAULT_CONFIG, enableHuanSanZhang: false });
    // Seat 0: own concealed kong of man-1 — visible to itself.
    state.players[0]!.melds.push({
      kind: 'kong',
      tile: { suit: 'man', rank: 1 },
      subtype: 'concealed',
      claimedFrom: null,
      turnDeclared: 1,
    });
    // Seat 1: concealed kong of man-2 (hidden from seat 0) and an exposed pung
    // of man-3 (public).
    state.players[1]!.melds.push(
      {
        kind: 'kong',
        tile: { suit: 'man', rank: 2 },
        subtype: 'concealed',
        claimedFrom: null,
        turnDeclared: 2,
      },
      { kind: 'pung', tile: { suit: 'man', rank: 3 }, concealed: false, claimedFrom: 2 },
    );

    const forSeat0 = visibleTileTypes(state, 0);
    expect(forSeat0.filter(t => t === 0)).toHaveLength(4); // own man-1 kong: all 4
    expect(forSeat0.filter(t => t === 1)).toHaveLength(0); // seat 1's concealed kong: hidden
    expect(forSeat0.filter(t => t === 2)).toHaveLength(3); // exposed pung: public

    const forSeat1 = visibleTileTypes(state, 1);
    expect(forSeat1.filter(t => t === 1)).toHaveLength(4); // own kong visible to itself
    expect(forSeat1.filter(t => t === 0)).toHaveLength(0); // seat 0's concealed kong: hidden
  });
});
