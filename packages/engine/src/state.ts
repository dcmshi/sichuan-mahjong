import type { Meld } from './melds.js';
import type { Suit, TileId } from './tiles.js';
import { buildWall, sortTiles, suitOf } from './tiles.js';

export type Seat = 0 | 1 | 2 | 3;
export type Phase = 'huan' | 'voidDeclare' | 'play' | 'roundEnd';

export type GameConfig = {
  /**
   * 換三張 — each player passes three same-suit tiles before the void declaration.
   * A house rule, not part of SBR: Novikov gives the deal as prepare wall → choose
   * a forbidden suit → East's initial turn, with no swap anywhere. Very common in
   * Sichuan (especially Chengdu-style) play, so it is offered — but off by default,
   * like `enableFlowerPig`, because the canonical ruleset is the default.
   */
  enableHuanSanZhang: boolean;
  huanDirection: 'cw' | 'ccw' | 'random';
  enableRobbingKong: boolean;
  enableHeavenlyEarthly: boolean;
  voidDiscardRule: 'strict' | 'lenient';
  enableFlowerPig: boolean;
  fanCap: number;
  claimWindowMs: number;
};

export const DEFAULT_CONFIG: GameConfig = {
  enableHuanSanZhang: false,
  huanDirection: 'random',
  enableRobbingKong: true,
  enableHeavenlyEarthly: true,
  voidDiscardRule: 'strict',
  enableFlowerPig: false,
  fanCap: 3,
  // 6s, not the 3s this shipped with. A claim is three decisions inside one
  // window — notice the discard, see that it fits your hand, and pick between Hu,
  // Pung and Kong — and 3s was only ever enough if you were already expecting the
  // tile. The window still closes as soon as every eligible seat has acted, so
  // the longer deadline costs nothing except when someone is genuinely thinking.
  claimWindowMs: 6000,
};

/**
 * One movement of points, derived from the payment events the engine emits.
 * Accumulated on the state (not in the server room) so it survives the
 * snapshot/restore path — a room-local accumulator would come back empty after
 * a host restart and quietly produce a wrong round-end breakdown.
 */
export type LedgerEntry = {
  reason:
    | 'hu'
    | 'kong'
    | 'kongRefund'
    | 'buTing'
    | 'flowerPig'
    | 'falseHu'
    | 'voidPenalty'
    | 'voidMeldPenalty';
  from: Seat;
  /** null for the non-redistributive penalties: they go to the pot, not a player. */
  to: Seat | null;
  amount: number;
  /** Qualifier where the reason alone is ambiguous: kong subtype, refund reason. */
  detail: string | null;
};

export type HuRecord = {
  seat: Seat;
  subtype:
    | 'heavenly'
    | 'earthly'
    | 'winAfterKong'
    | 'shootAfterKong'
    | 'underTheSea'
    | 'robbingTheKong'
    | 'normal';
  fans: import('./scoring.js').FanEntry[];
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
  afterKong: boolean; // true = robbing window; only Hu claims valid
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
  /**
   * The void-suit tile separated from the hand at declaration and laid face down
   * in the center — "the same tile is the first mandatory discard of the player"
   * (PDF, Lesson 4). It has already left `hand` but is not yet in `discards`: on
   * the player's first turn they draw as usual and flip *this* tile instead of
   * discarding from hand, which is what keeps them at 13 standing tiles. Null
   * once flipped, and for indicator users who never separated one. (A35/A37)
   */
  pendingFirstDiscard: TileId | null;
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
  lastDiscard: { tile: TileId; from: Seat; afterKong: boolean } | null;
  lastDrawWasKongReplacement: boolean;
  lastDrawnTile: TileId | null;
  turnDrawNeeded: boolean;
  /**
   * True when the current turn-holder's actionable tile came from the wall this
   * turn (a draw or kong replacement, or the dealer's dealt 14th on turn 1).
   * Gates `declareHuOnDraw` so a pung (which yields a claimed discard, not a
   * drawn tile) can't be laundered into a self-draw win. (A7)
   */
  drewThisTurn: boolean;
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
  /** Per-round payment log; see LedgerEntry. Reset by createGame. */
  ledger: LedgerEntry[];
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
    pendingFirstDiscard: null,
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
  dealer: Seat = 0,
): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...config };
  const wall = buildWall(seed);

  const players = playerInits.map((p, i) => makePlayer(i as Seat, p.name, p.isBot)) as [
    PlayerState,
    PlayerState,
    PlayerState,
    PlayerState,
  ];

  // Deal 13 tiles to each player; the dealer gets a 14th
  let idx = 0;
  for (let i = 0; i < 4; i++) {
    players[i]!.hand = sortTiles(wall.slice(idx, idx + 13));
    idx += 13;
  }
  players[dealer]!.hand = sortTiles([...players[dealer]!.hand, wall[idx]!]);
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
    dealer,
    turn: dealer,
    turnNumber: 0,
    firstTurnDone: [false, false, false, false],
    lastDiscard: null,
    lastDrawWasKongReplacement: false,
    lastDrawnTile: null,
    turnDrawNeeded: false, // East starts with 14 tiles; no draw needed
    drewThisTurn: true, // the dealer's dealt 14th tile stands in for turn-1's draw
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
    startedAt: Date.now(),
  };
}

/**
 * Begin a fresh round in the same match: same players/config, new wall, and the
 * dealer rotated to `prev.nextDealer` (computed at the previous round's end).
 * Per-round score deltas reset to 0; cumulative match totals are tracked client-side.
 */
export function startNextRound(prev: GameState, seed: string): GameState {
  const inits = prev.players.map(p => ({ name: p.name, isBot: p.isBot })) as [
    PlayerInit,
    PlayerInit,
    PlayerInit,
    PlayerInit,
  ];
  return createGame(seed, inits, prev.config, prev.nextDealer);
}

export function huPlayerCount(state: GameState): number {
  return state.players.filter(p => p.status === 'hu').length;
}

export function isVoidSuitTile(state: GameState, seat: Seat, tileId: TileId): boolean {
  const vs = state.players[seat]!.voidedSuit;
  return vs !== null && suitOf(tileId) === vs;
}
