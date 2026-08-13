import { DEFAULT_CONFIG, applyAction, createGame } from '@sichuan-mahjong/engine';
import type {
  BotDifficulty,
  GameAction,
  GameEvent,
  GameState,
  PlayerInit,
  PlayerState,
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
} from '../src/bot.js';

/**
 * What has to be true of a whole round, checked after every action. (A66)
 *
 * `bot-smoke.test.ts` plays the same games and asserts one thing about the end
 * of them: that `sum(scoreDelta) + penaltyPot` is zero. That is a real guard and
 * it is not enough — **A56 passed it for the life of the bug.** A promoted kong
 * took its points and never recorded them in `kongPaymentLog`, so no refund
 * could ever find them; the deltas still balanced, because the payment itself
 * was correct and only the *record* of it was missing.
 *
 * So these assert the things a balance cannot see: where all 108 tiles are, that
 * every surviving payment reached the log, and that the ledger explains the
 * deltas it is derived from.
 *
 * **Three places a tile sits that are not a hand, a meld or a pond**, and the
 * first draft of this missed all three — each looked like an engine bug and was
 * not:
 *
 *  - A tile won off a discard is in **no collection at all**. `takeClaimedDiscard`
 *    lifts it out of the pond and the `HuRecord` is the only thing holding it
 *    (see `separateWinningTile`). Two winners on one discard share **one** tile,
 *    so the count is of distinct ids — get that wrong and every multi-winner
 *    round reads as a duplicated tile.
 *  - The fourth tile of a promoted kong sits in `pendingKongTile` for as long as
 *    the robbing window is open: out of the hand, not yet in the meld.
 *  - A robbed kong's payments are reversed on the spot and **never logged**,
 *    which is right — there is nothing left for a later refund to find.
 */

const PLAYERS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'Bot0', isBot: true },
  { name: 'Bot1', isBot: true },
  { name: 'Bot2', isBot: true },
  { name: 'Bot3', isBot: true },
];

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

const WALL_SIZE = 108;

/** Every physical tile a seat is holding, wherever it is sitting. */
function heldBy(p: PlayerState): number {
  const melded = p.melds.reduce((n, m) => n + (m.kind === 'kong' ? 4 : 3), 0);
  return p.hand.length + melded + p.discards.length + (p.pendingFirstDiscard !== null ? 1 : 0);
}

/** Tiles that have left the wall, from both ends: the head walks up, the tail down. */
const offTheWall = (s: GameState): number => s.drawIndex + (WALL_SIZE - 1 - s.kongDrawIndex);

/** Distinct tiles held only by a HuRecord — two winners on one discard share one. */
function inHuRecords(s: GameState): number {
  const ids = new Set<number>();
  for (const p of s.players) if (p.hu?.byDiscard === true) ids.add(p.hu.winningTile);
  return ids.size;
}

/** Conservation, plus the two cheap sanity checks that ride along with it. */
function checkState(s: GameState, where: string, fail: (m: string) => void): void {
  const pending = s.pendingKongTile === null ? 0 : 1;
  const held = s.players.reduce((n, p) => n + heldBy(p), 0) + inHuRecords(s) + pending;
  if (held !== offTheWall(s)) {
    fail(`${where}: ${held} tiles accounted for, ${offTheWall(s)} off the wall`);
  }
  if (s.kongDrawIndex - s.drawIndex + 1 < 0) fail(`${where}: negative wallRemaining`);
  for (const p of s.players) {
    if (p.hand.some(id => id < 0 || id > 107)) fail(`${where}: seat ${p.seat} holds a bad tile id`);
    if (new Set(p.hand).size !== p.hand.length) {
      fail(`${where}: seat ${p.seat} holds the same tile id twice`);
    }
  }
}

function playRound(seed: string, levels: BotDifficulty[], fail: (m: string) => void) {
  const play = (seat: Seat) => LEVELS[levels[seat] ?? 'easy'];
  let state = createGame(seed, PLAYERS, { ...DEFAULT_CONFIG, claimWindowMs: 0 });
  const events: GameEvent[] = [];
  let iter = 0;

  checkState(state, `${seed} @deal`, fail);

  while (state.phase !== 'roundEnd') {
    if (iter++ >= 15_000) {
      fail(`${seed}: exceeded iterations`);
      return null;
    }
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
    } else if (state.pendingClaims !== null) {
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
      if (allDecided) action = { t: 'claimWindowExpire' };
    } else if (state.turnDrawNeeded) {
      action = { t: 'draw', seat: state.turn };
    } else {
      action = play(state.turn).turn(state, state.turn);
    }

    if (action === null) {
      fail(`${seed}: no action available at ${state.phase}`);
      return null;
    }
    const r = applyAction(state, action, 1000);
    if (!r.ok) {
      fail(`${seed}: ${action.t} rejected — ${r.reason} ${r.detail ?? ''}`);
      return null;
    }
    state = r.state;
    events.push(...r.events);
    checkState(state, `${seed} @iter${iter} after ${action.t}`, fail);
  }

  // Every kong payment that survives must be in the refund log, because the log
  // is the only thing any refund path reads. This is the shape A56 had, and the
  // one assertion here that would have failed while it was live.
  const paid = events.filter(e => e.e === 'kongPayment');
  const robbedBack = events.filter(e => e.e === 'kongRefund' && e.reason === 'robbed');
  const wantEntries = paid.length - robbedBack.length;
  if (state.kongPaymentLog.length !== wantEntries) {
    fail(
      `${seed}: ${paid.length} kongPayment events less ${robbedBack.length} robbed = ${wantEntries}, log has ${state.kongPaymentLog.length}`,
    );
  }
  const sum = (xs: Array<{ amount: number }>) => xs.reduce((n, e) => n + e.amount, 0);
  if (sum(state.kongPaymentLog) !== sum(paid) - sum(robbedBack)) {
    fail(`${seed}: the log's points do not match the payments that survived`);
  }

  // An entry marked refunded must correspond to a refund that was emitted.
  const nonRobbed = events.filter(e => e.e === 'kongRefund' && e.reason !== 'robbed').length;
  const marked = state.kongPaymentLog.filter(e => e.refunded).length;
  if (nonRobbed !== marked) {
    fail(`${seed}: ${nonRobbed} refund events vs ${marked} entries marked refunded`);
  }

  // The ledger is derived from the payment events, so per seat it has to add up
  // to exactly that seat's delta — that is the promise `ledgerEntriesFor` makes.
  for (const p of state.players) {
    const fromLedger = state.ledger.reduce(
      (n, e) => n + (e.from === p.seat ? -e.amount : 0) + (e.to === p.seat ? e.amount : 0),
      0,
    );
    if (fromLedger !== p.scoreDelta) {
      fail(`${seed}: seat ${p.seat} ledger says ${fromLedger}, delta is ${p.scoreDelta}`);
    }
  }

  // A winner holds 14 tiles, plus one per kong — counting the one it won on,
  // which for a discard win is in the record rather than the hand. Same check
  // the client's `revealedTileCount` makes, applied at the source.
  for (const p of state.players) {
    if (p.status !== 'hu' || !p.hu) continue;
    const melded = p.melds.reduce((n, m) => n + (m.kind === 'kong' ? 4 : 3), 0);
    const total = p.hand.length + melded + (p.hu.byDiscard ? 1 : 0);
    const want = 14 + p.melds.filter(m => m.kind === 'kong').length;
    if (total !== want)
      fail(`${seed}: seat ${p.seat} won holding ${total} tiles, expected ${want}`);
  }

  return state;
}

const TABLES: Array<[string, BotDifficulty[]]> = [
  ['easy', ['easy', 'easy', 'easy', 'easy']],
  ['medium', ['medium', 'medium', 'medium', 'medium']],
  ['hard', ['hard', 'hard', 'hard', 'hard']],
  ['mixed', ['easy', 'medium', 'hard', 'medium']],
];

const GAMES_PER_TABLE = 30;

describe('whole-round invariants (A66)', () => {
  it('hold across every table, after every action', () => {
    const failures: string[] = [];
    const fail = (m: string) => {
      if (failures.length < 10) failures.push(m);
    };
    let wins = 0;
    let kongs = 0;
    let multiWinner = 0;
    let rounds = 0;

    for (const [label, levels] of TABLES) {
      for (let g = 0; g < GAMES_PER_TABLE; g++) {
        const s = playRound(`inv-${label}-${g}`, levels, fail);
        if (!s) continue;
        rounds++;
        wins += s.players.filter(p => p.status === 'hu').length;
        kongs += s.players.reduce((k, p) => k + p.melds.filter(m => m.kind === 'kong').length, 0);
        if (s.huOrder.length > 1) multiWinner++;
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
    expect(rounds).toBe(TABLES.length * GAMES_PER_TABLE);

    // Coverage floors, so a change that quietly stops rounds reaching these
    // states cannot leave the assertions above passing vacuously. A kong is what
    // exercises the payment log; a second winner on one discard is what A57 got
    // wrong and only Bloody Rules produces.
    expect(wins, 'rounds that were won').toBeGreaterThan(0);
    expect(kongs, 'kongs declared').toBeGreaterThan(0);
    expect(multiWinner, 'rounds with more than one winner').toBeGreaterThan(0);
  }, 180_000);
});
