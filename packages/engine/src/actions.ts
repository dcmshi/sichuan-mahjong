import type { GameState, Seat, PendingVoid, HuRecord } from './state.js';
import { huPlayerCount, isVoidSuitTile } from './state.js';
import type { Suit, TileId } from './tiles.js';
import { sortTiles, suitOf, tileTypeOf } from './tiles.js';
import { isWinningHand } from './hand.js';

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
  | { t: 'declareKongOnTurn'; seat: Seat; tile: import('./tiles.js').Tile; subtype: 'concealed' | 'promoted' | 'postponed' }
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
  | 'cannot_discard_void_suit_cleared'
  | 'already_submitted_huan'
  | 'already_submitted_void'
  | 'huan_wrong_tile_count'
  | 'huan_tiles_not_same_suit'
  | 'huan_tiles_not_in_hand'
  | 'void_first_discard_wrong_suit'
  | 'invalid_seat';

export type GameEvent =
  | { e: 'dealt' }
  | { e: 'huanComplete' }
  | { e: 'voidDeclared'; seat: Seat; suit: Suit }
  | { e: 'voidPhaseComplete' }
  | { e: 'drew'; seat: Seat; tile: TileId }
  | { e: 'discarded'; seat: Seat; tile: TileId }
  | { e: 'hu'; seat: Seat; record: HuRecord }
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
  };
}

function removeFromHand(hand: TileId[], tile: TileId): TileId[] | null {
  const idx = hand.indexOf(tile);
  if (idx === -1) return null;
  const next = [...hand];
  next.splice(idx, 1);
  return next;
}

function nextActiveSeat(state: GameState, from: Seat): Seat {
  let s = ((from + 3) % 4) as Seat; // counter-clockwise = subtract 1 mod 4
  for (let i = 0; i < 4; i++) {
    if (state.players[s]!.status === 'playing') return s;
    s = ((s + 3) % 4) as Seat;
  }
  return from;
}

// ---------------------------------------------------------------------------
// Phase handlers
// ---------------------------------------------------------------------------

function applyHuanSelect(state: GameState, action: Extract<GameAction, { t: 'huanSelect' }>): ActionResult {
  if (state.phase !== 'huan') return fail('wrong_phase');
  const { seat, tiles } = action;
  if (state.pendingHuan[seat] !== null) return fail('already_submitted_huan');

  if (tiles.length !== 3) return fail('huan_wrong_tile_count');

  // All three tiles must be same suit
  const suit = suitOf(tiles[0]);
  if (!tiles.every(t => suitOf(t) === suit)) return fail('huan_tiles_not_same_suit');

  // All tiles must be in hand
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

  // Check if all 4 have submitted (skipping players who can't form 3-of-suit)
  const allSubmitted = s.players.every((p, i) => {
    if (s.pendingHuan[i] !== null) return true;
    // Player may be skipped if they can't form 3 tiles of one suit
    // We only auto-skip if we've processed their turn; they must explicitly submit
    return false;
  });

  if (allSubmitted) {
    events.push(...applyHuanRotation(s));
    s.phase = 'voidDeclare';
    events.push({ e: 'huanComplete' });
  }

  return ok(s, events);
}

function applyHuanRotation(state: GameState): GameEvent[] {
  // Determine direction from seed if random
  let dir = state.config.huanDirection;
  if (dir === 'random') {
    // Use a simple hash of the seed to pick direction
    let h = 0;
    for (let i = 0; i < state.seed.length; i++) {
      h = (h * 31 + state.seed.charCodeAt(i)) | 0;
    }
    dir = (h & 1) ? 'cw' : 'ccw';
  }

  // Collect selected tiles; players without a selection keep their hands unchanged
  const selected = state.pendingHuan.map((tiles, i) =>
    tiles ?? [] as TileId[],
  );

  // Perform the rotation: each player gives their selected tiles to their neighbour
  // cw: seat i gives to seat (i+1)%4; ccw: seat i gives to seat (i+3)%4
  const offset = dir === 'cw' ? 1 : 3;

  for (let i = 0; i < 4; i++) {
    const from = i as Seat;
    const to = ((i + offset) % 4) as Seat;
    const given = selected[from]!;
    if (given.length === 0) continue;

    // Remove from donor
    for (const t of given) {
      const idx = state.players[from]!.hand.indexOf(t);
      if (idx !== -1) state.players[from]!.hand.splice(idx, 1);
    }
    // Add to recipient
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

  // Validate firstDiscard
  if (firstDiscard !== null) {
    if (suitOf(firstDiscard) !== suit) return fail('void_first_discard_wrong_suit');
    if (!player.hand.includes(firstDiscard)) return fail('tile_not_in_hand');
  }

  const s = clone(state);
  s.pendingVoid[seat] = { suit, firstDiscardTile: firstDiscard };
  s.history.push(action);

  const events: GameEvent[] = [];

  // Check if all 4 have declared
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
      // Remove from hand, add to discards (face-down)
      const hand = removeFromHand(player.hand, pv.firstDiscardTile);
      if (hand !== null) player.hand = hand;
      player.discards.push(pv.firstDiscardTile);
      player.firstDiscardFaceDown = true;
      player.usedIndicator = false;
    } else {
      // No void-suit tiles at declaration → indicator used
      player.usedIndicator = true;
      player.voidCleared = true; // nothing to clear
    }

    // Check if hand already has no void-suit tiles (aside from the removed one)
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

  const player = state.players[seat]!;
  if (player.status !== 'playing') return fail('wrong_turn');

  if (state.drawIndex > state.kongDrawIndex) {
    // Wall exhausted — round ends
    const s = clone(state);
    s.phase = 'roundEnd';
    s.history.push(action);
    return ok(s, [{ e: 'roundEnd', reason: 'wallExhausted' }]);
  }

  const tile = state.wall[state.drawIndex]!;
  const s = clone(state);
  s.players[seat]!.hand = sortTiles([...s.players[seat]!.hand, tile]);
  s.drawIndex += 1;
  s.lastDrawWasKongReplacement = false;
  s.history.push(action);

  return ok(s, [{ e: 'drew', seat, tile }]);
}

function applyDiscard(state: GameState, action: Extract<GameAction, { t: 'discard' }>): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  const { seat, tile } = action;
  if (seat !== state.turn) return fail('wrong_turn');

  const player = state.players[seat]!;
  if (player.voidedSuit === null) return fail('void_not_declared');

  // Void-suit enforcement
  if (!player.voidCleared) {
    const discardingVoid = suitOf(tile) === player.voidedSuit;
    if (state.config.voidDiscardRule === 'strict' && !discardingVoid) {
      return fail('must_discard_void_suit');
    }
    // lenient: any discard allowed, penalties at round end
  }

  const hand = removeFromHand(player.hand, tile);
  if (hand === null) return fail('tile_not_in_hand');

  const s = clone(state);
  const sp = s.players[seat]!;
  sp.hand = hand;
  sp.discards.push(tile);

  // Update voidCleared if just discarded last void-suit tile
  if (!sp.voidCleared && !sp.hand.some(t => suitOf(t) === sp.voidedSuit)) {
    sp.voidCleared = true;
  }

  s.lastDiscard = { tile, from: seat, claimable: true, afterKong: s.lastDrawWasKongReplacement };
  s.firstTurnDone[seat] = true;

  // In Phase 1 there are no claims — advance turn immediately
  s.turn = nextActiveSeat(s, seat);
  s.turnNumber += 1;

  // Clear furiten on the discarding player's next self-draw cycle
  // (furiten is cleared on their own draw; for now just advance)
  s.history.push(action);

  return ok(s, [{ e: 'discarded', seat, tile }]);
}

function applyDeclareHuOnDraw(state: GameState, action: Extract<GameAction, { t: 'declareHuOnDraw' }>): ActionResult {
  if (state.phase !== 'play') return fail('wrong_phase');
  const { seat } = action;
  if (seat !== state.turn) return fail('wrong_turn');

  const player = state.players[seat]!;
  if (player.status !== 'playing') return fail('wrong_turn');

  const shape = isWinningHand(player.hand, player.melds, player.voidedSuit);
  if (shape === null) return fail('not_a_winning_hand' as RuleViolation);

  // Derive subtype from context (Phase 2: earthly/winAfterKong/underTheSea deferred to Phase 4)
  const subtype = 'normal' as HuRecord['subtype'];

  // The winning tile is the last drawn tile (last element added to sorted hand — approximate)
  // A proper implementation tracks lastDrawn; for Phase 2 we use a sentinel
  const winningTile = player.hand[player.hand.length - 1]!;

  const record: HuRecord = {
    seat,
    subtype,
    fans: [],
    handValue: 1,
    winningTile,
    byDiscard: false,
    discarder: null,
  };

  const s = clone(state);
  s.players[seat]!.status = 'hu';
  s.players[seat]!.hu = record;
  s.history.push(action);

  const events: GameEvent[] = [{ e: 'hu', seat, record }];

  // Check if 3 players now have hu → round ends
  if (huPlayerCount(s) >= 3) {
    s.phase = 'roundEnd';
    events.push({ e: 'roundEnd', reason: 'threeHu' });
    return ok(s, events);
  }

  // Advance turn past the hu player
  s.turn = nextActiveSeat(s, seat);
  s.turnNumber += 1;

  return ok(s, events);
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
    case 'declareHuOnDraw':   return applyDeclareHuOnDraw(state, action);

    // Stubs for phases not yet implemented — reject gracefully
    case 'claim':
    case 'pass':
    case 'declareKongOnTurn':
    case 'declareHeavenly':
    case 'claimWindowExpire':
      return fail('wrong_phase');
  }
}
