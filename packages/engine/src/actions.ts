import type { GameState, Seat, PendingVoid, HuRecord, ClaimWindow, KongPaymentEntry } from './state.js';
import { huPlayerCount } from './state.js';
import type { Suit, TileId, Tile } from './tiles.js';
import { sortTiles, suitOf, tileTypeOf, tileFromType, tileToType } from './tiles.js';
import { isWinningHand, isTenpai } from './hand.js';
import {
  autoPassIneligible,
  allSeatsActed,
  forcePassAll,
  resolveWindow,
  furitenSeatsAfterWindow,
  ccwDist,
} from './claims.js';
import { calcHandScore, calcTMV } from './scoring.js';

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type ClaimDecision =
  | { kind: 'pung' }
  | { kind: 'kong' }
  | { kind: 'hu' };

export type GameAction =
  | { t: 'huanSelect';        seat: Seat; tiles: [TileId, TileId, TileId] }
  | { t: 'declareVoid';       seat: Seat; suit: Suit; firstDiscard: TileId | null }
  | { t: 'draw';              seat: Seat }
  | { t: 'discard';           seat: Seat; tile: TileId }
  | { t: 'claim';             seat: Seat; claim: ClaimDecision }
  | { t: 'pass';              seat: Seat }
  | { t: 'declareKongOnTurn'; seat: Seat; tile: Tile; subtype: 'concealed' | 'promoted' | 'postponed' }
  | { t: 'declareHuOnDraw';   seat: Seat }
  | { t: 'declareHeavenly';   seat: Seat }
  | { t: 'claimWindowExpire' };

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RuleViolation =
  | 'wrong_phase'
  | 'wrong_turn'
  | 'tile_not_in_hand'
  | 'void_not_declared'
  | 'must_discard_void_suit'
  | 'already_submitted_huan'
  | 'already_submitted_void'
  | 'huan_wrong_tile_count'
  | 'huan_tiles_not_same_suit'
  | 'huan_tiles_not_in_hand'
  | 'void_first_discard_wrong_suit'
  | 'invalid_seat'
  | 'not_a_winning_hand'
  | 'no_claim_window'
  | 'already_acted_in_window'
  | 'invalid_claim'
  | 'no_pending_kong_tile'
  | 'kong_no_replacement'
  | 'kong_requires_exposed_pung'
  | 'kong_tile_not_in_hand'
  | 'heavenly_not_eligible'
  | 'not_east_first_turn'
  | 'not_own_turn'
  | 'already_hu'
  | 'furiten_blocks_hu';

export type GameEvent =
  | { e: 'dealt' }
  | { e: 'huanComplete' }
  | { e: 'voidDeclared'; seat: Seat; suit: Suit }
  | { e: 'voidPhaseComplete' }
  | { e: 'drew'; seat: Seat; tile: TileId }
  | { e: 'discarded'; seat: Seat; tile: TileId }
  | { e: 'claimWindowOpened'; tile: TileId; from: Seat }
  | { e: 'claimWindowClosed' }
  | { e: 'claimed'; seat: Seat; kind: 'pung' | 'kong' | 'hu'; tile: TileId }
  | { e: 'kongDeclared'; seat: Seat; subtype: 'concealed' | 'promoted' | 'postponed'; tile: TileId }
  | { e: 'kongReplacement'; seat: Seat; tile: TileId }
  | { e: 'hu'; seat: Seat; record: HuRecord }
  | { e: 'huPayment'; from: Seat; to: Seat; amount: number }
  | { e: 'kongPayment'; from: Seat; to: Seat; amount: number; subtype: 'concealed' | 'exposed' | 'promoted' }
  | { e: 'kongRefund'; from: Seat; to: Seat; amount: number; reason: 'robbed' | 'shootAfterKong' | 'wallEnd' | 'falseHu' }
  | { e: 'buTingPayout'; from: Seat; to: Seat; amount: number }
  | { e: 'voidPenalty'; seat: Seat; amount: number }
  | { e: 'voidMeldPenalty'; seat: Seat; amount: number }
  | { e: 'flowerPig'; from: Seat; to: Seat; amount: number }
  | { e: 'falseHu'; seat: Seat }
  | { e: 'falseHuPayment'; from: Seat; to: Seat; amount: number }
  | { e: 'roundEnd'; reason: 'wallExhausted' | 'threeHu' };

export type ActionResult =
  | { ok: true;  state: GameState; events: GameEvent[] }
  | { ok: false; reason: RuleViolation };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(reason: RuleViolation): ActionResult {
  return { ok: false, reason };
}

function ok(state: GameState, events: GameEvent[]): ActionResult {
  return { ok: true, state, events };
}

function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      hand: [...p.hand],
      melds: [...p.melds],
      discards: [...p.discards],
    })) as GameState['players'],
    firstTurnDone: [...state.firstTurnDone] as GameState['firstTurnDone'],
    pendingHuan: [...state.pendingHuan],
    pendingVoid: [...state.pendingVoid],
    history: [...state.history],
    pendingClaims: state.pendingClaims === null ? null : {
      ...state.pendingClaims,
      passed: [...state.pendingClaims.passed] as ClaimWindow['passed'],
      claims: [...state.pendingClaims.claims] as ClaimWindow['claims'],
    },
    pendingKongTile: state.pendingKongTile === null ? null : {
      ...state.pendingKongTile,
      paidAmounts: [...state.pendingKongTile.paidAmounts],
    },
    kongPaymentLog: state.kongPaymentLog.map(e => ({ ...e })),
    huOrder: [...state.huOrder],
  };
}

function removeFromHand(hand: TileId[], tile: TileId): TileId[] | null {
  const idx = hand.indexOf(tile);
  if (idx === -1) return null;
  const next = [...hand];
  next.splice(idx, 1);
  return next;
}

/** Remove `count` copies of tile type from hand. Returns null if insufficient copies. */
function removeTypeFromHand(hand: TileId[], tileType: number, count: number): TileId[] | null {
  let removed = 0;
  const result: TileId[] = [];
  for (const t of hand) {
    if (tileTypeOf(t) === tileType && removed < count) {
      removed++;
    } else {
      result.push(t);
    }
  }
  return removed === count ? result : null;
}

function nextActiveSeat(state: GameState, from: Seat): Seat {
  let s = ((from + 3) % 4) as Seat;
  for (let i = 0; i < 4; i++) {
    if (state.players[s]!.status === 'playing') return s;
    s = ((s + 3) % 4) as Seat;
  }
  return from;
}

// ---------------------------------------------------------------------------
// Payment helpers
// ---------------------------------------------------------------------------

/** Number of distinct suits a player holds across concealed hand + melds. */
function playerSuitCount(p: GameState['players'][number]): number {
  const suits = new Set<Suit>();
  for (const t of p.hand) suits.add(suitOf(t));
  for (const m of p.melds) {
    if (m.kind === 'chow') {
      suits.add(m.tiles[0].suit);
      suits.add(m.tiles[1].suit);
      suits.add(m.tiles[2].suit);
    } else {
      suits.add(m.tile.suit);
    }
  }
  return suits.size;
}

/** Pay `amount` from `from` to `to`, mutating scoreDelta. */
function pay(s: GameState, from: Seat, to: Seat, amount: number): void {
  s.players[from]!.scoreDelta -= amount;
  s.players[to]!.scoreDelta += amount;
}

/** Pay `amount` from every non-Hu player except `skip` to `to`. Returns paid seats. */
function payFromAll(s: GameState, to: Seat, amount: number, skip?: Seat): Seat[] {
  const payers: Seat[] = [];
  for (let i = 0; i < 4; i++) {
    const seat = i as Seat;
    if (seat === to) continue;
    if (skip !== undefined && seat === skip) continue;
    if (s.players[seat]!.status === 'hu') continue;
    pay(s, seat, to, amount);
    payers.push(seat);
  }
  return payers;
}

/** Log a committed kong payment group, using the current nextKongSeq then incrementing it. */
function logKongPayments(
  s: GameState,
  declarer: Seat,
  payers: Array<{ from: Seat; amount: number }>,
): void {
  const seq = s.nextKongSeq++;
  for (const { from, amount } of payers) {
    s.kongPaymentLog.push({ declarer, kongSeq: seq, paidBy: from, amount, refunded: false });
  }
}

/** Refund all non-refunded entries in the log matching a predicate. Returns events. */
function refundLogEntries(
  s: GameState,
  predicate: (e: KongPaymentEntry) => boolean,
  reason: 'shootAfterKong' | 'wallEnd' | 'falseHu',
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const entry of s.kongPaymentLog) {
    if (entry.refunded) continue;
    if (!predicate(entry)) continue;
    entry.refunded = true;
    pay(s, entry.declarer, entry.paidBy, entry.amount);
    events.push({ e: 'kongRefund', from: entry.declarer, to: entry.paidBy, amount: entry.amount, reason });
  }
  return events;
}

/** Mark a player as Hu, track order, check for round end. Returns events to append. */
function applyHuStatus(s: GameState, seat: Seat, record: HuRecord): void {
  s.players[seat]!.status = 'hu';
  s.players[seat]!.hu = record;
  s.huOrder.push(seat);
}

/** Compute the dealer for the next round per §5.10. */
function calcNextDealer(s: GameState): Seat {
  if (s.huOrder.length === 0) return s.dealer; // no one Hu'd → dealer stays

  const firstHuSeat = s.huOrder[0]!;
  // Was the first Hu a multi-Hu on a single discard? Check if seat[1] also Hu'd on the same discard.
  if (s.huOrder.length >= 2) {
    const p0 = s.players[s.huOrder[0]!]!;
    const p1 = s.players[s.huOrder[1]!]!;
    if (
      p0.hu?.byDiscard &&
      p1.hu?.byDiscard &&
      p0.hu.discarder === p1.hu.discarder &&
      p0.hu.winningTile === p1.hu.winningTile
    ) {
      return p0.hu.discarder as Seat;
    }
  }

  return firstHuSeat;
}

/** Settle the round: bu-ting payouts, void penalties, wall-end kong refunds, dealer rotation. */
function settleRound(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];

  // Determine isReady for each non-Hu player
  for (const p of s.players) {
    if (p.status === 'hu') continue;
    // In lenient mode, void-suit tiles at wall end = treated as non-ready
    const hasVoidTiles = p.voidedSuit !== null && p.hand.some(t => suitOf(t) === p.voidedSuit);
    if (hasVoidTiles) {
      p.isReady = false;
    } else {
      const waitTypes = isTenpai(p.hand, p.melds, p.voidedSuit);
      p.isReady = waitTypes.length > 0;
    }
  }

  const nonHu = s.players.filter(p => p.status !== 'hu');
  const ready = nonHu.filter(p => p.isReady);
  const nonReady = nonHu.filter(p => !p.isReady);

  // Bu-ting payouts: non-ready non-Hu pays each ready non-Hu their TMV
  for (const nr of nonReady) {
    for (const r of ready) {
      const tmv = calcTMV(r.hand, r.melds, r.voidedSuit, s.config.fanCap);
      if (tmv === 0) continue;
      pay(s, nr.seat, r.seat, tmv);
      events.push({ e: 'buTingPayout', from: nr.seat, to: r.seat, amount: tmv });
    }
  }

  // Void penalties (lenient mode only): 48-point pure deduction
  if (s.config.voidDiscardRule === 'lenient') {
    for (const p of s.players) {
      if (p.status === 'hu') continue;
      if (p.voidedSuit === null) continue;
      if (!p.hand.some(t => suitOf(t) === p.voidedSuit)) continue;
      // Carve-out: all discards were void-suit tiles
      if (p.discards.every(t => suitOf(t) === p.voidedSuit)) continue;
      p.scoreDelta -= 48;
      s.penaltyPot += 48;
      events.push({ e: 'voidPenalty', seat: p.seat, amount: 48 });
    }
  }

  // Flower Pig (花猪) house rule: a non-Hu player ending with all 3 suits across
  // hand + melds pays each other player 2^fanCap (redistributive). Unreachable in
  // strict mode under normal play (void suit is fully cleared and never melded).
  if (s.config.enableFlowerPig) {
    const amount = 2 ** s.config.fanCap;
    for (const p of s.players) {
      if (p.status === 'hu') continue;
      if (playerSuitCount(p) < 3) continue;
      for (let i = 0; i < 4; i++) {
        const to = i as Seat;
        if (to === p.seat) continue;
        pay(s, p.seat, to, amount);
        events.push({ e: 'flowerPig', from: p.seat, to, amount });
      }
    }
  }

  // Wall-end blanket kong refund: non-Hu AND non-ready declarers refund all their kong payments
  events.push(
    ...refundLogEntries(
      s,
      entry => {
        const declarer = s.players[entry.declarer]!;
        return declarer.status !== 'hu' && !declarer.isReady;
      },
      'wallEnd',
    ),
  );

  // Dealer rotation
  s.nextDealer = calcNextDealer(s);

  return events;
}

// ---------------------------------------------------------------------------
// Claim window management
// ---------------------------------------------------------------------------

/** Transition to roundEnd phase, run settlement, push the roundEnd event. */
function transitionToRoundEnd(s: GameState, reason: 'wallExhausted' | 'threeHu', events: GameEvent[]): void {
  s.phase = 'roundEnd';
  events.push(...settleRound(s));
  events.push({ e: 'roundEnd', reason });
}

/**
 * Open a claim window after a discard or promoted/postponed kong.
 * Auto-passes ineligible seats. If all seats end up auto-passed, returns null
 * (caller should advance turn directly without opening a window).
 */
function openClaimWindow(
  s: GameState,
  tile: TileId,
  from: Seat,
  afterKong: boolean,
): ClaimWindow | null {
  const window: ClaimWindow = {
    tile,
    from,
    afterKong,
    deadline: Date.now() + s.config.claimWindowMs,
    passed: [false, false, false, false],
    claims: [null, null, null, null],
  };
  // Temporarily assign so autoPassIneligible can read state
  s.pendingClaims = window;
  const allPassed = autoPassIneligible(s);
  if (allPassed) {
    s.pendingClaims = null;
    return null;
  }
  return window;
}

/**
 * Apply furiten to seats that skipped a Hu opportunity, then close the window.
 */
function applyFuritenAndCloseWindow(s: GameState): void {
  for (const seat of furitenSeatsAfterWindow(s)) {
    s.players[seat]!.furiten = { since: s.turnNumber, minFanToOverride: 1 };
  }
  s.pendingClaims = null;
}

/**
 * Resolve the current claim window and mutate `s` accordingly.
 * Returns the generated events.
 */
function resolveAndApply(s: GameState): GameEvent[] {
  const resolution = resolveWindow(s);
  const events: GameEvent[] = [{ e: 'claimWindowClosed' }];

  detectAndApplyFalseHuClaims(s, events);
  applyFuritenAndCloseWindow(s);

  if (resolution === null) {
    // All passed — advance turn or end round
    if (s.wallEndReached) {
      transitionToRoundEnd(s, 'wallExhausted', events);
      return events;
    }
    s.turn = nextActiveSeat(s, s.lastDiscard!.from);
    s.turnNumber += 1;
    s.turnDrawNeeded = true;
    return events;
  }

  if (resolution.kind === 'hu') {
    return [...events, ...applyHuResolution(s, resolution.winners)];
  }

  if (resolution.kind === 'kong') {
    return [...events, ...applyKongClaim(s, resolution.winner)];
  }

  if (resolution.kind === 'pung') {
    return [...events, ...applyPungClaim(s, resolution.winner)];
  }

  return events;
}

/** Resolve robbing-the-kong window. Mutates `s`. Returns events. */
function resolveRobbingWindow(s: GameState): GameEvent[] {
  const resolution = resolveWindow(s);
  const kongInfo = s.pendingKongTile!;
  const events: GameEvent[] = [{ e: 'claimWindowClosed' }];

  detectAndApplyFalseHuClaims(s, events);
  applyFuritenAndCloseWindow(s);
  s.pendingKongTile = null;

  if (resolution === null || resolution.kind !== 'hu') {
    // Not robbed — commit payments to log, complete the kong
    if (kongInfo.paidAmounts.length > 0) {
      logKongPayments(s, kongInfo.seat, kongInfo.paidAmounts);
    }
    return [...events, ...completePromotedPostponedKong(s, kongInfo.seat, kongInfo.tile, kongInfo.kongSubtype)];
  }

  // Robbed! Refund promoted kong payments (they were made before the window)
  for (const { from, amount } of kongInfo.paidAmounts) {
    pay(s, kongInfo.seat, from, amount); // reverse: declarer pays back to payer
    events.push({ e: 'kongRefund', from: kongInfo.seat, to: from, amount, reason: 'robbed' });
  }

  // Kong never forms; Hu winners take the tile. Kong declarer = effective discarder.
  return [...events, ...applyHuResolution(s, resolution.winners, kongInfo.tile, kongInfo.seat)];
}

function applyHuResolution(s: GameState, winners: Seat[], robbingTile?: TileId, robbedFrom?: Seat): GameEvent[] {
  const events: GameEvent[] = [];
  const fromRobbingKong = robbingTile !== undefined;
  const discarder = fromRobbingKong ? (robbedFrom ?? null) : (s.lastDiscard?.from ?? null);
  const actualWinTile = fromRobbingKong
    ? robbingTile!
    : s.lastDiscard!.tile;

  for (const winner of winners) {
    const player = s.players[winner]!;

    let subtype: HuRecord['subtype'];
    if (fromRobbingKong) {
      subtype = 'robbingTheKong';
    } else if (s.wallEndReached) {
      subtype = 'underTheSea';
    } else if (s.lastDiscard!.afterKong) {
      subtype = 'shootAfterKong';
    } else {
      subtype = 'normal';
    }

    const score = calcHandScore(
      [...player.hand, actualWinTile], player.melds, player.voidedSuit,
      actualWinTile, subtype,
      s.config.fanCap, s.config.enableHeavenlyEarthly,
    );

    const record: HuRecord = {
      seat: winner,
      subtype,
      fans: score.fans.map(f => `${f.fan}${f.count > 1 ? `×${f.count}` : ''}`),
      handValue: score.handValue,
      winningTile: actualWinTile,
      byDiscard: true,
      discarder,
    };

    applyHuStatus(s, winner, record);
    events.push({ e: 'hu', seat: winner, record });
    events.push({ e: 'claimed', seat: winner, kind: 'hu', tile: actualWinTile });

    // Discard Hu payment: discarder → winner
    if (discarder !== null) {
      pay(s, discarder, winner, score.handValue);
      events.push({ e: 'huPayment', from: discarder, to: winner, amount: score.handValue });
    }

    // Shoot-after-kong refund: refund most recent kong payment group for the discarder
    if (subtype === 'shootAfterKong' && discarder !== null) {
      const maxSeq = s.kongPaymentLog
        .filter(e => e.declarer === discarder && !e.refunded)
        .reduce((max, e) => Math.max(max, e.kongSeq), -1);
      if (maxSeq >= 0) {
        events.push(...refundLogEntries(s, e => e.declarer === discarder && e.kongSeq === maxSeq, 'shootAfterKong'));
      }
    }
  }

  if (huPlayerCount(s) >= 3) {
    transitionToRoundEnd(s, 'threeHu', events);
    return events;
  }
  if (s.wallEndReached) {
    transitionToRoundEnd(s, 'wallExhausted', events);
    return events;
  }

  // Turn passes to CCW of second winner (if multi), else CCW of single winner
  const nextSeat = winners.length > 1
    ? nextActiveSeat(s, winners[1]!)
    : nextActiveSeat(s, winners[0]!);
  s.turn = nextSeat;
  s.turnNumber += 1;
  s.turnDrawNeeded = true;
  return events;
}

/**
 * Apply the false-Hu penalty: offender pays 8 to each non-Hu opponent;
 * all offender's unrefunded kong payments are refunded.
 */
function applyFalseHuPenalty(s: GameState, seat: Seat, events: GameEvent[]): void {
  events.push({ e: 'falseHu', seat });
  for (let i = 0; i < 4; i++) {
    const to = i as Seat;
    if (to === seat) continue;
    if (s.players[to]!.status === 'hu') continue;
    pay(s, seat, to, 8);
    events.push({ e: 'falseHuPayment', from: seat, to, amount: 8 });
  }
  events.push(...refundLogEntries(s, entry => entry.declarer === seat, 'falseHu'));
}

/**
 * Detect explicit Hu claims in the current window that are hand-invalid (not merely
 * furiten-blocked) and apply the false-Hu penalty to each such seat.
 * Must be called before pendingClaims is cleared.
 */
function detectAndApplyFalseHuClaims(s: GameState, events: GameEvent[]): void {
  const w = s.pendingClaims!;
  for (let i = 0; i < 4; i++) {
    const seat = i as Seat;
    if (w.claims[seat]?.kind !== 'hu') continue;
    if (seat === w.from) continue;
    if (s.players[seat]!.status === 'hu') continue;
    const player = s.players[seat]!;
    const isValid =
      (player.voidedSuit === null || suitOf(w.tile) !== player.voidedSuit) &&
      isWinningHand([...player.hand, w.tile], player.melds, player.voidedSuit) !== null;
    if (!isValid) {
      applyFalseHuPenalty(s, seat, events);
    }
  }
}

/** Apply the 48-point void-meld penalty if the meld suit matches the player's voided suit. */
function applyVoidMeldPenalty(s: GameState, seat: Seat, suit: Suit, events: GameEvent[]): void {
  const player = s.players[seat]!;
  if (player.voidedSuit !== null && suit === player.voidedSuit) {
    player.scoreDelta -= 48;
    s.penaltyPot += 48;
    events.push({ e: 'voidMeldPenalty', seat, amount: 48 });
  }
}

function applyKongClaim(s: GameState, winner: Seat): GameEvent[] {
  const tile = s.lastDiscard!.tile;
  const from = s.lastDiscard!.from;
  const tileType = tileTypeOf(tile);
  const player = s.players[winner]!;

  // Remove 3 copies from hand
  const newHand = removeTypeFromHand(player.hand, tileType, 3);
  if (newHand === null) return [];  // shouldn't happen; validated at claim time
  player.hand = newHand;

  // Form exposed kong meld
  player.melds.push({
    kind: 'kong',
    tile: tileFromType(tileType),
    subtype: 'exposed',
    claimedFrom: from,
    turnDeclared: s.turnNumber,
  });

  // Draw replacement
  const replacement = s.wall[s.kongDrawIndex]!;
  s.kongDrawIndex--;
  player.hand = sortTiles([...player.hand, replacement]);
  s.lastDrawWasKongReplacement = true;
  s.lastDrawnTile = replacement;
  s.anyClaimsHappened = true;

  s.turn = winner;
  s.turnNumber += 1;
  s.turnDrawNeeded = false;

  // Exposed kong: discarder pays 2
  pay(s, from, winner, 2);
  logKongPayments(s, winner, [{ from, amount: 2 }]);

  const events: GameEvent[] = [
    { e: 'claimed', seat: winner, kind: 'kong', tile },
    { e: 'kongPayment', from, to: winner, amount: 2, subtype: 'exposed' },
    { e: 'kongReplacement', seat: winner, tile: replacement },
  ];
  applyVoidMeldPenalty(s, winner, suitOf(tile), events);
  return events;
}

function applyPungClaim(s: GameState, winner: Seat): GameEvent[] {
  const tile = s.lastDiscard!.tile;
  const from = s.lastDiscard!.from;
  const tileType = tileTypeOf(tile);
  const player = s.players[winner]!;

  // Remove 2 copies from hand
  const newHand = removeTypeFromHand(player.hand, tileType, 2);
  if (newHand === null) return [];
  player.hand = newHand;

  // Form exposed pung meld
  player.melds.push({
    kind: 'pung',
    tile: tileFromType(tileType),
    concealed: false,
    claimedFrom: from,
  });

  s.anyClaimsHappened = true;
  s.turn = winner;
  s.turnNumber += 1;
  s.turnDrawNeeded = false;

  const events: GameEvent[] = [{ e: 'claimed', seat: winner, kind: 'pung', tile }];
  applyVoidMeldPenalty(s, winner, suitOf(tile), events);
  return events;
}

/** Complete a promoted/postponed kong after the robbing window passes with no claims. */
function completePromotedPostponedKong(
  s: GameState,
  seat: Seat,
  kongTileId: TileId,
  subtype: 'promoted' | 'postponed',
): GameEvent[] {
  const tileType = tileTypeOf(kongTileId);
  const player = s.players[seat]!;

  // Find the exposed pung meld with this tile type and upgrade to kong
  const meldIdx = player.melds.findIndex(
    m => m.kind === 'pung' && !m.concealed && tileToType(m.tile) === tileType,
  );
  if (meldIdx === -1) return [];

  const pungMeld = player.melds[meldIdx]!;
  if (pungMeld.kind !== 'pung') return [];
  player.melds[meldIdx] = {
    kind: 'kong',
    tile: pungMeld.tile,
    subtype,
    claimedFrom: null,
    turnDeclared: s.turnNumber,
  };

  // Draw replacement
  const replacement = s.wall[s.kongDrawIndex]!;
  s.kongDrawIndex--;
  player.hand = sortTiles([...player.hand, replacement]);
  s.lastDrawWasKongReplacement = true;
  s.lastDrawnTile = replacement;
  s.turnDrawNeeded = false;

  return [{ e: 'kongReplacement', seat, tile: replacement }];
}

// ---------------------------------------------------------------------------
// Phase handlers
// ---------------------------------------------------------------------------

function applyHuanSelect(state: GameState, action: Extract<GameAction, { t: 'huanSelect' }>): ActionResult {
  if (state.phase !== 'huan') return fail('wrong_phase');
  const { seat, tiles } = action;
  if (state.pendingHuan[seat] !== null) return fail('already_submitted_huan');
  if (tiles.length !== 3) return fail('huan_wrong_tile_count');

  const suit = suitOf(tiles[0]);
  if (!tiles.every(t => suitOf(t) === suit)) return fail('huan_tiles_not_same_suit');

  const player = state.players[seat]!;
  const tempHand = [...player.hand];
  for (const t of tiles) {
    const idx = tempHand.indexOf(t);
    if (idx === -1) return fail('huan_tiles_not_in_hand');
    tempHand.splice(idx, 1);
  }

  const s = clone(state);
  s.pendingHuan[seat] = [...tiles];
  s.history.push(action);

  const events: GameEvent[] = [];
  const allSubmitted = s.players.every((_, i) => s.pendingHuan[i] !== null);
  if (allSubmitted) {
    events.push(...applyHuanRotation(s));
    s.phase = 'voidDeclare';
    events.push({ e: 'huanComplete' });
  }

  return ok(s, events);
}

function applyHuanRotation(state: GameState): GameEvent[] {
  let dir = state.config.huanDirection;
  if (dir === 'random') {
    let h = 0;
    for (let i = 0; i < state.seed.length; i++) {
      h = (h * 31 + state.seed.charCodeAt(i)) | 0;
    }
    dir = (h & 1) ? 'cw' : 'ccw';
  }

  const selected = state.pendingHuan.map(tiles => tiles ?? [] as TileId[]);
  const offset = dir === 'cw' ? 1 : 3;

  for (let i = 0; i < 4; i++) {
    const from = i as Seat;
    const to = ((i + offset) % 4) as Seat;
    const given = selected[from]!;
    if (given.length === 0) continue;
    for (const t of given) {
      const idx = state.players[from]!.hand.indexOf(t);
      if (idx !== -1) state.players[from]!.hand.splice(idx, 1);
    }
    state.players[to]!.hand.push(...given);
    state.players[to]!.hand = sortTiles(state.players[to]!.hand);
  }

  state.pendingHuan = [null, null, null, null];
  return [];
}

function applyDeclareVoid(state: GameState, action: Extract<GameAction, { t: 'declareVoid' }>): ActionResult {
  if (state.phase !== 'voidDeclare') return fail('wrong_phase');
  const { seat, suit, firstDiscard } = action;
  if (state.pendingVoid[seat] !== null) return fail('already_submitted_void');

  const player = state.players[seat]!;
  if (firstDiscard !== null) {
    if (suitOf(firstDiscard) !== suit) return fail('void_first_discard_wrong_suit');
    if (!player.hand.includes(firstDiscard)) return fail('tile_not_in_hand');
  }

  const s = clone(state);
  s.pendingVoid[seat] = { suit, firstDiscardTile: firstDiscard };
  s.history.push(action);

  const events: GameEvent[] = [];
  if (s.pendingVoid.every(v => v !== null)) {
    events.push(...applyVoidResolution(s));
    s.phase = 'play';
    events.push({ e: 'voidPhaseComplete' });
  }

  return ok(s, events);
}

function applyVoidResolution(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];

  for (let i = 0; i < 4; i++) {
    const seat = i as Seat;
    const pv = state.pendingVoid[seat] as PendingVoid;
    const player = state.players[seat]!;

    player.voidedSuit = pv.suit;

    if (pv.firstDiscardTile !== null) {
      const hand = removeFromHand(player.hand, pv.firstDiscardTile);
      if (hand !== null) player.hand = hand;
      player.discards.push(pv.firstDiscardTile);
      player.firstDiscardFaceDown = true;
      player.usedIndicator = false;
    } else {
      player.usedIndicator = true;
      player.voidCleared = true;
    }

    if (!player.voidCleared) {
      const hasVoid = player.hand.some(t => suitOf(t) === pv.suit);
      if (!hasVoid) player.voidCleared = true;
    }

    events.push({ e: 'voidDeclared', seat, suit: pv.suit });
  }

  state.pendingVoid = [null, null, null, null];
  return events;
}

function applyDraw(state: GameState, action: Extract<GameAction, { t: 'draw' }>): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  const { seat } = action;
  if (seat !== state.turn) return fail('wrong_turn');
  if (state.players[seat]!.status !== 'playing') return fail('already_hu');
  if (!state.turnDrawNeeded) return fail('wrong_turn'); // shouldn't draw if not needed
  if (state.pendingClaims !== null) return fail('wrong_phase');

  if (state.drawIndex > state.kongDrawIndex) {
    const s = clone(state);
    s.history.push(action);
    const events: GameEvent[] = [];
    transitionToRoundEnd(s, 'wallExhausted', events);
    return ok(s, events);
  }

  const isLastLiveTile = state.drawIndex === state.kongDrawIndex;

  const tile = state.wall[state.drawIndex]!;
  const s = clone(state);
  s.players[seat]!.hand = sortTiles([...s.players[seat]!.hand, tile]);
  s.drawIndex += 1;
  s.lastDrawWasKongReplacement = false;
  s.lastDrawnTile = tile;
  s.turnDrawNeeded = false;
  s.history.push(action);

  if (isLastLiveTile) s.wallEndReached = true;

  // Self-draw clears furiten
  s.players[seat]!.furiten = null;

  return ok(s, [{ e: 'drew', seat, tile }]);
}

function applyDiscard(state: GameState, action: Extract<GameAction, { t: 'discard' }>): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  const { seat, tile } = action;
  if (seat !== state.turn) return fail('wrong_turn');
  if (state.pendingClaims !== null) return fail('wrong_phase');

  const player = state.players[seat]!;
  if (player.status !== 'playing') return fail('already_hu');
  if (player.voidedSuit === null) return fail('void_not_declared');
  if (state.turnDrawNeeded) return fail('wrong_turn'); // must draw before discarding

  if (!player.voidCleared) {
    const discardingVoid = suitOf(tile) === player.voidedSuit;
    if (state.config.voidDiscardRule === 'strict' && !discardingVoid) {
      return fail('must_discard_void_suit');
    }
  }

  const hand = removeFromHand(player.hand, tile);
  if (hand === null) return fail('tile_not_in_hand');

  const s = clone(state);
  const sp = s.players[seat]!;
  sp.hand = hand;
  sp.discards.push(tile);

  if (!sp.voidCleared && !sp.hand.some(t => suitOf(t) === sp.voidedSuit)) {
    sp.voidCleared = true;
  }

  s.firstTurnDone[seat] = true;
  s.lastDiscard = {
    tile,
    from: seat,
    claimable: true,
    afterKong: s.lastDrawWasKongReplacement,
  };
  s.history.push(action);

  const events: GameEvent[] = [{ e: 'discarded', seat, tile }];

  // Try to open claim window
  const window = openClaimWindow(s, tile, seat, false);
  if (window !== null) {
    events.push({ e: 'claimWindowOpened', tile, from: seat });
    return ok(s, events);
  }

  // No eligible claimants — advance turn directly
  if (s.wallEndReached) {
    transitionToRoundEnd(s, 'wallExhausted', events);
    return ok(s, events);
  }

  s.turn = nextActiveSeat(s, seat);
  s.turnNumber += 1;
  s.turnDrawNeeded = true;
  return ok(s, events);
}

function applyClaim(state: GameState, action: Extract<GameAction, { t: 'claim' }>): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  if (state.pendingClaims === null) return fail('no_claim_window');
  const { seat, claim } = action;
  const w = state.pendingClaims;

  if (state.players[seat]!.status === 'hu') return fail('already_hu');
  if (seat === w.from) return fail('wrong_turn');
  if (w.passed[seat] || w.claims[seat] !== null) return fail('already_acted_in_window');

  // Basic validation: claim type must be plausible
  const player = state.players[seat]!;
  if (w.afterKong && claim.kind !== 'hu') return fail('invalid_claim');
  if (state.wallEndReached && claim.kind === 'kong') return fail('invalid_claim');

  const s = clone(state);
  s.pendingClaims!.claims[seat] = { kind: claim.kind };
  s.history.push(action);

  if (allSeatsActed(s)) {
    const events = s.pendingClaims!.afterKong
      ? resolveRobbingWindow(s)
      : resolveAndApply(s);
    return ok(s, events);
  }

  return ok(s, []);
}

function applyPass(state: GameState, action: Extract<GameAction, { t: 'pass' }>): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  if (state.pendingClaims === null) return fail('no_claim_window');
  const { seat } = action;
  const w = state.pendingClaims;

  if (state.players[seat]!.status === 'hu') return fail('already_hu');
  if (seat === w.from) return fail('wrong_turn');
  if (w.passed[seat] || w.claims[seat] !== null) return fail('already_acted_in_window');

  const s = clone(state);
  s.pendingClaims!.passed[seat] = true;
  s.history.push(action);

  if (allSeatsActed(s)) {
    const events = s.pendingClaims!.afterKong
      ? resolveRobbingWindow(s)
      : resolveAndApply(s);
    return ok(s, events);
  }

  return ok(s, []);
}

function applyClaimWindowExpire(state: GameState, action: Extract<GameAction, { t: 'claimWindowExpire' }>): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  if (state.pendingClaims === null) return fail('no_claim_window');

  const s = clone(state);
  forcePassAll(s);
  s.history.push(action);

  const events = s.pendingClaims!.afterKong
    ? resolveRobbingWindow(s)
    : resolveAndApply(s);
  return ok(s, events);
}

function applyDeclareKongOnTurn(
  state: GameState,
  action: Extract<GameAction, { t: 'declareKongOnTurn' }>,
): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  if (state.pendingClaims !== null) return fail('wrong_phase');
  const { seat, tile, subtype } = action;
  if (seat !== state.turn) return fail('not_own_turn');
  if (state.players[seat]!.status !== 'playing') return fail('already_hu');
  if (state.turnDrawNeeded) return fail('wrong_turn'); // must have drawn first (unless East first turn)
  if (state.wallEndReached) return fail('wrong_phase'); // no kongs at wall end

  if (state.drawIndex > state.kongDrawIndex) return fail('kong_no_replacement');

  const player = state.players[seat]!;
  const tileType = tileToType(tile);

  if (subtype === 'concealed') {
    // Need 4 copies in hand
    const count = player.hand.filter(t => tileTypeOf(t) === tileType).length;
    if (count < 4) return fail('kong_tile_not_in_hand');

    const s = clone(state);
    const sp = s.players[seat]!;

    const newHand = removeTypeFromHand(sp.hand, tileType, 4);
    if (newHand === null) return fail('kong_tile_not_in_hand');
    sp.hand = newHand;

    sp.melds.push({
      kind: 'kong',
      tile,
      subtype: 'concealed',
      claimedFrom: null,
      turnDeclared: s.turnNumber,
    });

    // Draw replacement
    const replacement = s.wall[s.kongDrawIndex]!;
    s.kongDrawIndex--;
    sp.hand = sortTiles([...sp.hand, replacement]);
    s.lastDrawWasKongReplacement = true;
    s.lastDrawnTile = replacement;
    s.turnDrawNeeded = false;
    s.history.push(action);

    // Concealed kong: pay 2 from each non-Hu player, no robbing window
    const payers = payFromAll(s, seat, 2);
    logKongPayments(s, seat, payers.map(from => ({ from, amount: 2 })));

    const events: GameEvent[] = [
      { e: 'kongDeclared', seat, subtype: 'concealed', tile: tileType * 4 as TileId },
      ...payers.map(from => ({ e: 'kongPayment' as const, from, to: seat, amount: 2, subtype: 'concealed' as const })),
      { e: 'kongReplacement', seat, tile: replacement },
    ];
    applyVoidMeldPenalty(s, seat, tile.suit, events);
    return ok(s, events);
  }

  // Promoted or postponed: need an exposed pung of this tile type
  const pungMeldIdx = player.melds.findIndex(
    m => m.kind === 'pung' && !m.concealed && tileToType(m.tile) === tileType,
  );
  if (pungMeldIdx === -1) return fail('kong_requires_exposed_pung');

  // Need at least 1 copy of tile in hand (the 4th tile being added)
  const kongTileInstance = player.hand.find(t => tileTypeOf(t) === tileType);
  if (kongTileInstance === undefined) return fail('kong_tile_not_in_hand');

  const s = clone(state);
  const sp = s.players[seat]!;

  // Remove the promoting tile from hand
  const newHand = removeFromHand(sp.hand, kongTileInstance);
  if (newHand === null) return fail('kong_tile_not_in_hand');
  sp.hand = newHand;

  s.history.push(action);

  const events: GameEvent[] = [
    { e: 'kongDeclared', seat, subtype: subtype as 'promoted' | 'postponed', tile: kongTileInstance },
  ];

  // Promoted kong: pay 1 from each non-Hu player BEFORE robbing window (refundable if robbed)
  // Postponed: no payment
  const paidAmounts: Array<{ from: Seat; amount: number }> = [];
  if (subtype === 'promoted') {
    const payers = payFromAll(s, seat, 1);
    for (const from of payers) {
      paidAmounts.push({ from, amount: 1 });
      events.push({ e: 'kongPayment', from, to: seat, amount: 1, subtype: 'promoted' });
    }
  }

  s.pendingKongTile = { seat, tile: kongTileInstance, kongSubtype: subtype as 'promoted' | 'postponed', paidAmounts };

  if (state.config.enableRobbingKong) {
    const window = openClaimWindow(s, kongTileInstance, seat, true);
    if (window !== null) {
      events.push({ e: 'claimWindowOpened', tile: kongTileInstance, from: seat });
      return ok(s, events);
    }
    events.push(...completePromotedPostponedKong(s, seat, kongTileInstance, subtype as 'promoted' | 'postponed'));
    s.pendingKongTile = null;
  } else {
    events.push(...completePromotedPostponedKong(s, seat, kongTileInstance, subtype as 'promoted' | 'postponed'));
    s.pendingKongTile = null;
  }

  return ok(s, events);
}

/**
 * Shared settlement for a self-drawn / declared win (Hu-on-draw, Heavenly, Earthly):
 * mark the winner, pay (handValue + 1) from each non-Hu player, then either end the
 * round (3-Hu or wall exhausted) or pass the turn on.
 */
function applySelfDrawHu(
  state: GameState,
  action: GameAction,
  seat: Seat,
  record: HuRecord,
): ActionResult {
  const s = clone(state);
  applyHuStatus(s, seat, record);
  s.firstTurnDone[seat] = true;
  s.history.push(action);

  const events: GameEvent[] = [{ e: 'hu', seat, record }];

  const selfDrawAmount = record.handValue + 1;
  for (let i = 0; i < 4; i++) {
    const payer = i as Seat;
    if (payer === seat) continue;
    if (s.players[payer]!.status === 'hu') continue;
    pay(s, payer, seat, selfDrawAmount);
    events.push({ e: 'huPayment', from: payer, to: seat, amount: selfDrawAmount });
  }

  if (huPlayerCount(s) >= 3) {
    transitionToRoundEnd(s, 'threeHu', events);
    return ok(s, events);
  }
  if (s.wallEndReached) {
    transitionToRoundEnd(s, 'wallExhausted', events);
    return ok(s, events);
  }

  s.turn = nextActiveSeat(s, seat);
  s.turnNumber += 1;
  s.turnDrawNeeded = true;
  return ok(s, events);
}

function applyDeclareHuOnDraw(state: GameState, action: Extract<GameAction, { t: 'declareHuOnDraw' }>): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  if (state.pendingClaims !== null) return fail('wrong_phase');
  const { seat } = action;
  if (seat !== state.turn) return fail('wrong_turn');

  const player = state.players[seat]!;
  if (player.status !== 'playing') return fail('already_hu');
  if (state.turnDrawNeeded) return fail('wrong_turn');

  const shape = isWinningHand(player.hand, player.melds, player.voidedSuit);
  if (shape === null) {
    // Hand is not winning — false Hu. Apply penalty and let the player discard.
    const s = clone(state);
    s.history.push(action);
    const events: GameEvent[] = [];
    applyFalseHuPenalty(s, seat, events);
    return ok(s, events);
  }

  const winningTile = state.lastDrawnTile ?? player.hand[player.hand.length - 1]!;

  // Derive subtype
  let subtype: HuRecord['subtype'] = 'normal';
  if (state.lastDrawWasKongReplacement) {
    subtype = 'winAfterKong';
  } else if (state.wallEndReached) {
    subtype = 'underTheSea';
  } else if (
    state.config.enableHeavenlyEarthly &&
    player.usedIndicator &&
    seat !== state.dealer &&
    !state.firstTurnDone[seat] &&
    !state.anyClaimsHappened
  ) {
    subtype = 'earthly';
  }

  const score = calcHandScore(
    player.hand, player.melds, player.voidedSuit,
    winningTile, subtype,
    state.config.fanCap, state.config.enableHeavenlyEarthly,
  );

  const record: HuRecord = {
    seat,
    subtype,
    fans: score.fans.map(f => `${f.fan}${f.count > 1 ? `×${f.count}` : ''}`),
    handValue: score.handValue,
    winningTile,
    byDiscard: false,
    discarder: null,
  };

  return applySelfDrawHu(state, action, seat, record);
}

function applyDeclareHeavenly(state: GameState, action: Extract<GameAction, { t: 'declareHeavenly' }>): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  if (state.pendingClaims !== null) return fail('wrong_phase');
  const { seat } = action;

  // East only, first turn only
  if (seat !== state.dealer) return fail('not_east_first_turn');
  if (state.firstTurnDone[seat]) return fail('not_east_first_turn');
  if (seat !== state.turn) return fail('wrong_turn');
  if (state.turnDrawNeeded) return fail('wrong_turn');

  const player = state.players[seat]!;
  if (!state.config.enableHeavenlyEarthly) return fail('heavenly_not_eligible');
  if (!player.usedIndicator) return fail('heavenly_not_eligible');

  const shape = isWinningHand(player.hand, player.melds, player.voidedSuit);
  if (shape === null) return fail('not_a_winning_hand');

  const winningTile = player.hand[player.hand.length - 1]!;

  const score = calcHandScore(
    player.hand, player.melds, player.voidedSuit,
    winningTile, 'heavenly',
    state.config.fanCap, state.config.enableHeavenlyEarthly,
  );

  const record: HuRecord = {
    seat,
    subtype: 'heavenly',
    fans: score.fans.map(f => `${f.fan}${f.count > 1 ? `×${f.count}` : ''}`),
    handValue: score.handValue,
    winningTile,
    byDiscard: false,
    discarder: null,
  };

  return applySelfDrawHu(state, action, seat, record);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: GameAction): ActionResult {
  switch (action.t) {
    case 'huanSelect':        return applyHuanSelect(state, action);
    case 'declareVoid':       return applyDeclareVoid(state, action);
    case 'draw':              return applyDraw(state, action);
    case 'discard':           return applyDiscard(state, action);
    case 'claim':             return applyClaim(state, action);
    case 'pass':              return applyPass(state, action);
    case 'claimWindowExpire': return applyClaimWindowExpire(state, action);
    case 'declareKongOnTurn': return applyDeclareKongOnTurn(state, action);
    case 'declareHuOnDraw':   return applyDeclareHuOnDraw(state, action);
    case 'declareHeavenly':   return applyDeclareHeavenly(state, action);
  }
}
