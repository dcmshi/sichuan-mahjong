import {
  type DiceRecord,
  type SeatingRound,
  rotateWall,
  throwForSeats,
  throwForWall,
} from './dice.js';
import type { Meld } from './melds.js';
import { createRng } from './rng.js';
import type { Suit, TileId, TileType } from './tiles.js';
import { buildWall, sortTiles, suitOf, tileTypeOf } from './tiles.js';

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
  /**
   * Everyone throws two dice before the first deal and the highest becomes
   * East. On by default, unlike the other additions to Novikov: the wall throw
   * he *does* specify is meaningless without an East to throw it, and every
   * outside source seats players by dice. Off leaves seat 0 as East, which is
   * what every test that pins a dealer relies on.
   */
  enableSeatingThrow: boolean;
};

/**
 * Tiles the deal takes off the head of the wall before play starts: 13 each.
 * The dealer's 14th is a draw like any other, so it is not counted here — which
 * is what makes `drawIndex - DEALT_TILES` "tiles drawn from the head so far".
 */
export const DEALT_TILES = 52;

export const DEFAULT_CONFIG: GameConfig = {
  enableHuanSanZhang: false,
  huanDirection: 'random',
  enableRobbingKong: true,
  enableHeavenlyEarthly: true,
  voidDiscardRule: 'strict',
  enableFlowerPig: false,
  fanCap: 3,
  enableSeatingThrow: true,
  // 15s. This shipped at 3, went to 6, then 10, and was *still* hurrying people:
  // a claim is three decisions inside one window — notice the discard, see that it
  // fits your hand, and pick between Hu, Pung and Kong — and you are usually
  // looking at your own hand when it opens.
  //
  // Four moves in one direction is the argument for a longer default rather than a
  // better guess: the deadline is only ever a **backstop**. The window closes the
  // moment every eligible seat has acted, anyone who doesn't want the tile has a
  // Pass button, and bots answer within their pace and never wait it out — so a
  // longer value costs time only when a human is genuinely thinking, which is the
  // one case where spending it is right. A table that disagrees now has the lobby
  // preset (N6) instead of needing this number changed.
  claimWindowMs: 15000,
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
  /**
   * The decomposition the fans above were scored from — four sets and a pair, or
   * seven pairs — so the round-end reveal can show the hand grouped as it won
   * rather than as a flat run of fourteen. (N16)
   *
   * `sets` includes the declared melds first, in `melds` order, because that is
   * what `findAllWinningShapes` returns; a renderer drawing melds separately
   * skips that many.
   *
   * **Optional, and it has to stay optional.** It lands in the persisted
   * snapshot, so a game saved before this existed has no shape — and it is
   * redacted from other seats mid-round (see `views.ts`), so a client may hold a
   * `HuRecord` without it even for a live game.
   */
  shape?: import('./hand.js').WinShape;
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
  /**
   * The tile that *was* the void declaration, kept after the flip that
   * `pendingFirstDiscard` nulls. Set once and never cleared.
   *
   * `firstDiscardIsVoid` used to be derived as "this seat separated a tile and
   * their pond is non-empty", which reads `discards[0]` as the declaration. A
   * claimed discard is spliced out of its owner's pond (`takeClaimedDiscard`,
   * A15) — so if the declaration is punged or konged, `discards[0]` becomes that
   * seat's *second* discard and the client rings an ordinary tile as their public
   * declaration. Wrong information about a public fact, and it survives the round.
   * Comparing against the recorded tile is what makes the flag mean what it says.
   */
  voidDiscardTile: TileId | null;
  voidedSuit: Suit | null;
  usedIndicator: boolean;
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
  /**
   * What the dice decided this round: the seating throw (only on the round that
   * ran it) and East's throw for the break. Kept on the state rather than
   * recomputed, so a restored snapshot still shows the table what it saw.
   */
  dice: DiceRecord;
  wall: TileId[];
  /**
   * The two ends the wall is consumed from. `drawIndex` walks forward from the
   * break; `kongDrawIndex` starts at the last tile and walks *back*, because
   * kong replacements come off the other end. They meet in the middle, which is
   * why `wallRemaining` is the gap between them rather than a countdown.
   */
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
    voidDiscardTile: null,
    voidedSuit: null,
    usedIndicator: false,
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
  /**
   * Null asks for the seating throw; a seat pins East and skips it. That is the
   * difference between starting a match and starting a round — `startNextRound`
   * passes the rotated dealer, because a seat once won is not re-contested.
   */
  dealer: Seat | null = null,
): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...config };

  // A stream of its own, so the dice neither consume from nor perturb the
  // shuffle. Same seed still means the same throws.
  const diceRng = createRng(`${seed}:dice`);

  let seating: SeatingRound[] | null = null;
  let east: Seat;
  if (dealer !== null) {
    east = dealer;
  } else if (cfg.enableSeatingThrow) {
    const thrown = throwForSeats(diceRng);
    seating = thrown.rounds;
    east = thrown.east;
  } else {
    east = 0;
  }

  const breakThrow = throwForWall(diceRng, east);
  const dice: DiceRecord = { seating, ...breakThrow };
  // The break, applied. A rotation of a uniform shuffle is still uniform, so
  // this changes which tiles a seed deals and nothing else.
  const wall = rotateWall(buildWall(seed), breakThrow.breakOffset);

  const players = playerInits.map((p, i) => makePlayer(i as Seat, p.name, p.isBot)) as [
    PlayerState,
    PlayerState,
    PlayerState,
    PlayerState,
  ];

  // Deal 13 tiles to each player; the dealer gets a 14th
  let idx = 0;
  for (let i = 0; i < 4; i++) {
    players[i]!.hand = sortTiles(wall.slice(idx, idx + DEALT_TILES / 4));
    idx += DEALT_TILES / 4;
  }
  players[east]!.hand = sortTiles([...players[east]!.hand, wall[idx]!]);
  idx += 1;

  const phase: Phase = cfg.enableHuanSanZhang ? 'huan' : 'voidDeclare';

  return {
    config: cfg,
    phase,
    seed,
    dice,
    wall,
    drawIndex: idx,
    kongDrawIndex: 107,
    players,
    dealer: east,
    turn: east,
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

/**
 * Strict mode, and this seat is still holding void-suit tiles it has to play out
 * first. **The single definition of that rule** — the engine's discard validator,
 * `views.ts`'s legal-action list and all three bot difficulties ask this, and they
 * used to each test a `voidCleared` flag instead.
 *
 * That flag was a latch: set when the last void-suit tile left the hand and never
 * reconsidered. Draw one back off the wall and every one of those five callers
 * agreed the seat was free, so it could discard anything while holding a tile it
 * can never win with — and the bots would, permanently. ARCHITECTURE §5.5.3 has
 * always defined strict as "while the player holds any void-suit tile in hand",
 * which is a property of the hand and cannot be cached across a draw. (N46)
 *
 * Only a draw can re-arm this: claims cannot bring a void-suit tile in, because
 * `canPungOnTile` / `canKongOnTile` / `canHuOnTile` all refuse one.
 */
export function mustPlayVoidFirst(state: GameState, seat: Seat): boolean {
  if (state.config.voidDiscardRule !== 'strict') return false;
  const p = state.players[seat]!;
  return p.voidedSuit !== null && p.hand.some(t => suitOf(t) === p.voidedSuit);
}

/**
 * Whether this turn was entered by a pung rather than by a draw, which is the
 * PDF's second restriction on declaring kongs: *"one cannot declare kong if a
 * player has declared a pung on the same turn"* (the first being that a
 * replacement tile must be left). A pung hands you a tile off the table and
 * obliges a discard; there is no wall tile behind it for a kong to spend.
 *
 * `drewThisTurn` is false in exactly one reachable position — a pung claim
 * clears it, which is the same fact `declareHuOnDraw` reads to refuse a
 * self-draw win on a claimed tile (A7).
 */
export function turnEnteredByPung(state: GameState): boolean {
  return !state.turnDrawNeeded && !state.drewThisTurn;
}

/**
 * Promoted or postponed, derived from where the fourth tile came from — the one
 * thing that separates them, and the reason they pay differently (1 from each
 * opponent versus nothing at all).
 *
 * The PDF: promoted *"places freshly taken tile from the wall"*, postponed
 * *"detaches a tile from the standing tiles"*. **The subtype is never read off
 * the wire** — `declareKongOnTurn` carries one, and taking it as sent made
 * `promoted` worth 3 points to anyone who could craft a frame. `views.ts` reads
 * this too, so the button and the payment cannot disagree. (A50)
 */
export function promotedKongSubtype(
  state: GameState,
  tileType: TileType,
): 'promoted' | 'postponed' {
  const drawn = state.lastDrawnTile;
  if (!state.drewThisTurn || drawn === null) return 'postponed';
  return tileTypeOf(drawn) === tileType ? 'promoted' : 'postponed';
}
