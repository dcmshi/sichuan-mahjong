import type { GameState, Seat, HuRecord, PlayerState, GameConfig } from './state.js';
import type { Meld } from './melds.js';
import type { TileId, TileType, Suit } from './tiles.js';
import { tileTypeOf, tileFromType, tileToType, suitOf } from './tiles.js';
import type { GameAction } from './actions.js';
import type { Phase } from './state.js';
import { isWinningHand } from './hand.js';
import { canHuConsideringFuriten } from './claims.js';

// ---------------------------------------------------------------------------
// Public view types
// ---------------------------------------------------------------------------

export type PublicPlayer = {
  seat: Seat;
  name: string;
  isBot: boolean;
  melds: Meld[];
  discards: TileId[];
  firstDiscardFaceDown: boolean;
  status: 'playing' | 'hu';
  hu: HuRecord | null;
  isReady: boolean;
  scoreDelta: number;
  handCount: number;
};

export type PlayerView = {
  you: PublicPlayer & {
    hand: TileId[];
    voidedSuit: Suit | null;
    furiten: PlayerState['furiten'];
  };
  others: [PublicPlayer, PublicPlayer, PublicPlayer];
  wallRemaining: number;
  phase: Phase;
  turn: Seat;
  lastDiscard: { tile: TileId; from: Seat } | null;
  yourLegalActions: GameAction[];
  claimDeadline: number | null;
  config: GameConfig;
};

/** Read-only, hand-hiding view for spectators. Exposes no concealed hands. */
export type SpectatorView = {
  players: [PublicPlayer, PublicPlayer, PublicPlayer, PublicPlayer]; // seat-indexed
  wallRemaining: number;
  phase: Phase;
  turn: Seat;
  dealer: Seat;
  lastDiscard: { tile: TileId; from: Seat } | null;
  config: GameConfig;
};

// ---------------------------------------------------------------------------
// Legal actions computation
// ---------------------------------------------------------------------------

function getConcealdedKongTypes(state: GameState, seat: Seat): TileType[] {
  const player = state.players[seat]!;
  const counts = new Map<TileType, number>();
  for (const t of player.hand) {
    const type = tileTypeOf(t);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const result: TileType[] = [];
  for (const [type, cnt] of counts) {
    if (cnt >= 4) result.push(type);
  }
  return result;
}

function getPromotedPostponedKongActions(state: GameState, seat: Seat): GameAction[] {
  const player = state.players[seat]!;
  const result: GameAction[] = [];
  for (const meld of player.melds) {
    if (meld.kind !== 'pung' || meld.concealed) continue;
    const meldType = tileToType(meld.tile);
    const hasInHand = player.hand.some(t => tileTypeOf(t) === meldType);
    if (!hasInHand) continue;
    if (state.drawIndex > state.kongDrawIndex) continue;

    let subtype: 'promoted' | 'postponed' = 'postponed';
    if (state.lastDrawnTile !== null && tileTypeOf(state.lastDrawnTile) === meldType) {
      subtype = 'promoted';
    }
    result.push({ t: 'declareKongOnTurn', seat, tile: meld.tile, subtype });
  }
  return result;
}

function getDiscardOptions(state: GameState, seat: Seat): TileId[] {
  const player = state.players[seat]!;
  if (state.config.voidDiscardRule === 'strict' && !player.voidCleared) {
    return player.hand.filter(t => suitOf(t) === player.voidedSuit);
  }
  return [...player.hand];
}

export function computeLegalActions(state: GameState, seat: Seat): GameAction[] {
  const actions: GameAction[] = [];
  const player = state.players[seat]!;

  if (state.phase !== 'play') return actions;
  if (player.status === 'hu') return actions;

  // During a claim window
  if (state.pendingClaims !== null) {
    const w = state.pendingClaims;
    if (w.passed[seat] || w.claims[seat] !== null) return actions; // already acted
    if (seat === w.from) return actions; // discarder can't claim

    const tile = w.tile;

    if (canHuConsideringFuriten(state, seat, tile)) {
      actions.push({ t: 'claim', seat, claim: { kind: 'hu' } });
    }

    if (!w.afterKong && !state.wallEndReached && state.drawIndex <= state.kongDrawIndex) {
      const tileType = tileTypeOf(tile);
      if (
        player.voidedSuit === null || suitOf(tile) !== player.voidedSuit
      ) {
        const count = player.hand.filter(t => tileTypeOf(t) === tileType).length;
        if (count >= 3) actions.push({ t: 'claim', seat, claim: { kind: 'kong' } });
        if (count >= 2) actions.push({ t: 'claim', seat, claim: { kind: 'pung' } });
      }
    }

    actions.push({ t: 'pass', seat });
    return actions;
  }

  // Own turn
  if (state.turn !== seat) return actions;

  const isEastFirstTurn = seat === state.dealer && !state.firstTurnDone[seat];

  if (isEastFirstTurn) {
    // East turn 1: no draw. Can declareHeavenly, declareKongOnTurn (concealed), or discard.
    if (state.config.enableHeavenlyEarthly && player.usedIndicator) {
      if (isWinningHand(player.hand, player.melds, player.voidedSuit) !== null) {
        actions.push({ t: 'declareHeavenly', seat });
      }
    }
    if (!state.wallEndReached) {
      for (const type of getConcealdedKongTypes(state, seat)) {
        if (state.drawIndex <= state.kongDrawIndex) {
          actions.push({ t: 'declareKongOnTurn', seat, tile: tileFromType(type), subtype: 'concealed' });
        }
      }
    }
    for (const tile of getDiscardOptions(state, seat)) {
      actions.push({ t: 'discard', seat, tile });
    }
    return actions;
  }

  if (state.turnDrawNeeded) {
    // Waiting for draw (server-issued; no UI buttons)
    return actions;
  }

  // Normal turn: drew already (or after claim with no draw needed)
  if (isWinningHand(player.hand, player.melds, player.voidedSuit) !== null) {
    actions.push({ t: 'declareHuOnDraw', seat });
  }

  if (!state.wallEndReached) {
    for (const type of getConcealdedKongTypes(state, seat)) {
      if (state.drawIndex <= state.kongDrawIndex) {
        actions.push({ t: 'declareKongOnTurn', seat, tile: tileFromType(type), subtype: 'concealed' });
      }
    }
    for (const kongAction of getPromotedPostponedKongActions(state, seat)) {
      actions.push(kongAction);
    }
  }

  for (const tile of getDiscardOptions(state, seat)) {
    actions.push({ t: 'discard', seat, tile });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function toPublicPlayer(p: PlayerState): PublicPlayer {
  return {
    seat: p.seat,
    name: p.name,
    isBot: p.isBot,
    melds: p.melds,
    discards: p.discards,
    firstDiscardFaceDown: p.firstDiscardFaceDown,
    status: p.status,
    hu: p.hu,
    isReady: p.isReady,
    scoreDelta: p.scoreDelta,
    handCount: p.hand.length,
  };
}

export function projectView(state: GameState, seat: Seat): PlayerView {
  const you = state.players[seat]!;

  // Others in CCW order from `seat`
  const otherSeats: [Seat, Seat, Seat] = [
    ((seat + 3) % 4) as Seat,
    ((seat + 2) % 4) as Seat,
    ((seat + 1) % 4) as Seat,
  ];

  return {
    you: {
      ...toPublicPlayer(you),
      hand: [...you.hand],
      voidedSuit: you.voidedSuit,
      furiten: you.furiten,
    },
    others: otherSeats.map(s => toPublicPlayer(state.players[s]!)) as [PublicPlayer, PublicPlayer, PublicPlayer],
    wallRemaining: state.kongDrawIndex - state.drawIndex + 1,
    phase: state.phase,
    turn: state.turn,
    lastDiscard: state.lastDiscard
      ? { tile: state.lastDiscard.tile, from: state.lastDiscard.from }
      : null,
    yourLegalActions: computeLegalActions(state, seat),
    claimDeadline: state.pendingClaims?.deadline ?? null,
    config: state.config,
  };
}

export function projectSpectatorView(state: GameState): SpectatorView {
  return {
    players: state.players.map(toPublicPlayer) as [
      PublicPlayer, PublicPlayer, PublicPlayer, PublicPlayer,
    ],
    wallRemaining: state.kongDrawIndex - state.drawIndex + 1,
    phase: state.phase,
    turn: state.turn,
    dealer: state.dealer,
    lastDiscard: state.lastDiscard
      ? { tile: state.lastDiscard.tile, from: state.lastDiscard.from }
      : null,
    config: state.config,
  };
}
