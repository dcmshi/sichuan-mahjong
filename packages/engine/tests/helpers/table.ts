import type { GameState, Meld, PlayerInit, Seat, TileId } from '../../src/index.js';
import { DEFAULT_CONFIG, createGame } from '../../src/state.js';

// Plain module (no `.test.` in the filename), so Vitest's default include glob
// does not collect it as a test file.

const PLAYERS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'A', isBot: false },
  { name: 'B', isBot: false },
  { name: 'C', isBot: false },
  { name: 'D', isBot: false },
];

export type SeatSetup = {
  hand?: TileId[];
  melds?: Meld[];
  /** A seat that has already won sits out every payment that follows. */
  status?: 'playing' | 'hu';
  discards?: TileId[];
};

/**
 * A mid-play table, built rather than played to.
 *
 * Payment rules are the thing hardest to reach from a real round — reproducing
 * "someone has already won and a second player then self-draws" by playing takes
 * a seed hunt, and the test that results asserts on whatever that seed happened
 * to deal. Building the position states it instead.
 */
export function tableAt(
  seats: [SeatSetup, SeatSetup, SeatSetup, SeatSetup],
  over: Partial<GameState> = {},
): GameState {
  return {
    config: { ...DEFAULT_CONFIG, enableHuanSanZhang: false },
    phase: 'play',
    seed: 'table-helper',
    // Real dice, so nothing downstream has to cope with a half-built record.
    dice: createGame('table-helper', PLAYERS, {}, 0 as Seat).dice,
    wall: Array.from({ length: 108 }, (_, i) => i) as TileId[],
    drawIndex: 53,
    kongDrawIndex: 107,
    players: ([0, 1, 2, 3] as Seat[]).map(i => ({
      seat: i,
      name: `P${i}`,
      isBot: false,
      hand: seats[i]!.hand ?? [],
      melds: seats[i]!.melds ?? [],
      discards: seats[i]!.discards ?? [],
      pendingFirstDiscard: null,
      voidedSuit: 'sou' as const,
      usedIndicator: false,
      status: seats[i]!.status ?? ('playing' as const),
      // A seat marked `hu` needs a record, or round-end projection has nothing to
      // read; the contents do not matter to a payment test.
      hu:
        seats[i]!.status === 'hu'
          ? {
              seat: i,
              subtype: 'normal' as const,
              fans: [],
              handValue: 1,
              winningTile: 0 as TileId,
              byDiscard: false,
              discarder: null,
            }
          : null,
      isReady: false,
      scoreDelta: 0,
      furiten: null,
    })) as GameState['players'],
    dealer: 0,
    turn: 0,
    turnNumber: 10,
    firstTurnDone: [true, true, true, true],
    lastDiscard: null,
    lastDrawWasKongReplacement: false,
    lastDrawnTile: null,
    turnDrawNeeded: false,
    drewThisTurn: true,
    wallEndReached: false,
    anyClaimsHappened: false,
    pendingClaims: null,
    pendingKongTile: null,
    pendingHuan: [null, null, null, null],
    pendingVoid: [null, null, null, null],
    penaltyPot: 0,
    ledger: [],
    kongPaymentLog: [],
    nextKongSeq: 0,
    huOrder: [],
    nextDealer: 0,
    history: [],
    startedAt: 0,
    ...over,
  } as GameState;
}

/** Every seat's net movement, seat-indexed — the line a player actually disputes. */
export function deltas(s: GameState): [number, number, number, number] {
  return s.players.map(p => p.scoreDelta) as [number, number, number, number];
}
