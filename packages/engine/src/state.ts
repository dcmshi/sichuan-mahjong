import type { Meld } from './melds.js';
import type { TileId, Suit } from './tiles.js';
import { buildWall, sortTiles, suitOf } from './tiles.js';

export type Seat = 0 | 1 | 2 | 3;
export type Phase = 'huan' | 'voidDeclare' | 'play' | 'roundEnd';

export type GameConfig = {
  enableHuanSanZhang: boolean;
  huanDirection: 'cw' | 'ccw' | 'random';
  enableRobbingKong: boolean;
  enableHeavenlyEarthly: boolean;
  voidDiscardRule: 'strict' | 'lenient';
  fanCap: number;
  claimWindowMs: number;
};

export const DEFAULT_CONFIG: GameConfig = {
  enableHuanSanZhang: true,
  huanDirection: 'random',
  enableRobbingKong: true,
  enableHeavenlyEarthly: true,
  voidDiscardRule: 'strict',
  fanCap: 3,
  claimWindowMs: 3000,
};

export type HuRecord = {
  seat: Seat;
  subtype: 'heavenly' | 'earthly' | 'winAfterKong' | 'shootAfterKong' | 'underTheSea' | 'robbingTheKong' | 'normal';
  fans: string[];
  handValue: number;
  winningTile: TileId;
  byDiscard: boolean;
  discarder: Seat | null;
};

export type PendingVoid = {
  suit: Suit;
  firstDiscardTile: TileId | null;
};

export type KongPaymentEntry = {
  declarer: Seat;
  kongSeq: number;
  paidBy: Seat;
  amount: number;
  refunded: boolean;
};

export type ClaimWindow = {
  tile: TileId;
  from: Seat;
  afterKong: boolean;   // true = robbing window; only Hu claims valid
  deadline: number;
  passed: [boolean, boolean, boolean, boolean];
  claims: [
    { kind: 'pung' | 'kong' | 'hu' } | null,
    { kind: 'pung' | 'kong' | 'hu' } | null,
    { kind: 'pung' | 'kong' | 'hu' } | null,
    { kind: 'pung' | 'kong' | 'hu' } | null,
  ];
};

export type PlayerState = {
  seat: Seat;
  name: string;
  isBot: boolean;
  hand: TileId[];
  melds: Meld[];
  discards: TileId[];
  firstDiscardFaceDown: boolean;
  voidedSuit: Suit | null;
  usedIndicator: boolean;
  voidCleared: boolean;
  status: 'playing' | 'hu';
  hu: HuRecord | null;
  isReady: boolean;
  scoreDelta: number;
  furiten: { since: number; minFanToOverride: number } | null;
};

export type GameState = {
  config: GameConfig;
  phase: Phase;
  seed: string;
  wall: TileId[];
  drawIndex: number;
  kongDrawIndex: number;
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  dealer: Seat;
  turn: Seat;
  turnNumber: number;
  firstTurnDone: [boolean, boolean, boolean, boolean];
  lastDiscard: { tile: TileId; from: Seat; claimable: boolean; afterKong: boolean } | null;
  lastDrawWasKongReplacement: boolean;
  lastDrawnTile: TileId | null;
  turnDrawNeeded: boolean;
  wallEndReached: boolean;
  anyClaimsHappened: boolean;
  pendingClaims: ClaimWindow | null;
  pendingKongTile: {
    seat: Seat;
    tile: TileId;
    kongSubtype: 'promoted' | 'postponed';
    paidAmounts: Array<{ from: Seat; amount: number }>;
  } | null;
  pendingHuan: (TileId[] | null)[];
  pendingVoid: (PendingVoid | null)[];
  penaltyPot: number;
  kongPaymentLog: KongPaymentEntry[];
  nextKongSeq: number;
  huOrder: Seat[];
  nextDealer: Seat;
  history: import('./actions.js').GameAction[];
  startedAt: number;
};

function makePlayer(seat: Seat, name: string, isBot: boolean): PlayerState {
  return {
    seat,
    name,
    isBot,
    hand: [],
    melds: [],
    discards: [],
    firstDiscardFaceDown: false,
    voidedSuit: null,
    usedIndicator: false,
    voidCleared: false,
    status: 'playing',
    hu: null,
    isReady: false,
    scoreDelta: 0,
    furiten: null,
  };
}

export type PlayerInit = { name: string; isBot: boolean };

export function createGame(
  seed: string,
  playerInits: [PlayerInit, PlayerInit, PlayerInit, PlayerInit],
  config: Partial<GameConfig> = {},
): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...config };
  const wall = buildWall(seed);

  const players = playerInits.map((p, i) =>
    makePlayer(i as Seat, p.name, p.isBot),
  ) as [PlayerState, PlayerState, PlayerState, PlayerState];

  // Deal 13 tiles to each player; East (seat 0) gets a 14th
  let idx = 0;
  for (let i = 0; i < 4; i++) {
    players[i]!.hand = sortTiles(wall.slice(idx, idx + 13));
    idx += 13;
  }
  players[0]!.hand = sortTiles([...players[0]!.hand, wall[idx]!]);
  idx += 1;

  const phase: Phase = cfg.enableHuanSanZhang ? 'huan' : 'voidDeclare';

  return {
    config: cfg,
    phase,
    seed,
    wall,
    drawIndex: idx,
    kongDrawIndex: 107,
    players,
    dealer: 0,
    turn: 0,
    turnNumber: 0,
    firstTurnDone: [false, false, false, false],
    lastDiscard: null,
    lastDrawWasKongReplacement: false,
    lastDrawnTile: null,
    turnDrawNeeded: false,  // East starts with 14 tiles; no draw needed
    wallEndReached: false,
    anyClaimsHappened: false,
    pendingClaims: null,
    pendingKongTile: null,
    pendingHuan: [null, null, null, null],
    pendingVoid: [null, null, null, null],
    penaltyPot: 0,
    kongPaymentLog: [],
    nextKongSeq: 0,
    huOrder: [],
    nextDealer: 0,
    history: [],
    startedAt: Date.now(),
  };
}

export function huPlayerCount(state: GameState): number {
  return state.players.filter(p => p.status === 'hu').length;
}

export function isVoidSuitTile(state: GameState, seat: Seat, tileId: TileId): boolean {
  const vs = state.players[seat]!.voidedSuit;
  return vs !== null && suitOf(tileId) === vs;
}
