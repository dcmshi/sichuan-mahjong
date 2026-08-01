import type { GameAction, GameEvent } from './actions.js';
import { canHuConsideringFuriten, canKongOnTile, canPungOnTile } from './claims.js';
import { isWinningHand } from './hand.js';
import type { Meld } from './melds.js';
import type { GameConfig, GameState, HuRecord, PlayerState, Seat } from './state.js';
import type { Phase } from './state.js';
import type { Suit, TileId, TileType } from './tiles.js';
import { suitOf, tileFromType, tileToType, tileTypeOf } from './tiles.js';

// ---------------------------------------------------------------------------
// Public view types
// ---------------------------------------------------------------------------

/**
 * A meld as other players see it. A concealed kong's tile type is secret until
 * the round ends (the meld's existence and its payments are public, its rank is
 * not) — so in projected views it ships with `tile: null`. The owner's own view
 * and all round-end views carry the real `Meld`. (A27)
 */
export type PublicMeld =
  | Meld
  | { kind: 'kong'; subtype: 'concealed'; tile: null; claimedFrom: null; turnDeclared: number };

export type PublicPlayer = {
  seat: Seat;
  name: string;
  isBot: boolean;
  melds: PublicMeld[];
  discards: TileId[];
  /**
   * True while this player still owes their first-discard flip. Only the fact is
   * public — the tile itself is face down on the table, and stays out of
   * `discards` until flipped. Its owner gets the id in `you`. (A37)
   */
  pendingFirstDiscard: boolean;
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
    /** Your own face-down first discard — you chose it, so you may see it. (A37) */
    pendingFirstDiscardTile: TileId | null;
    /**
     * Whether this seat has already submitted its huan selection / void
     * declaration. The client used to track this only in component state, which
     * a reconnect or a refresh-and-rejoin throws away — the player was then
     * shown the selection UI again and could only discover the truth by
     * resubmitting and being rejected. The server is the only thing that knows.
     */
    hasSubmittedHuan: boolean;
    hasDeclaredVoid: boolean;
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

function getConcealedKongTypes(state: GameState, seat: Seat): TileType[] {
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

/**
 * The discard (or flip) actions available to `seat` right now. A player who still
 * owes their face-down first discard has exactly one option — flip it; the hand
 * is off limits until then. (A35)
 */
function getDiscardActions(state: GameState, seat: Seat): GameAction[] {
  const player = state.players[seat]!;
  if (player.pendingFirstDiscard !== null) return [{ t: 'flipFirstDiscard', seat }];
  const tiles =
    state.config.voidDiscardRule === 'strict' && !player.voidCleared
      ? player.hand.filter(t => suitOf(t) === player.voidedSuit)
      : player.hand;
  return tiles.map(tile => ({ t: 'discard', seat, tile }));
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

    // Reuse the claim-resolution predicates so the offered buttons can't drift
    // from what the engine will actually honor. Kong is gated on wall-end +
    // replacement availability inside canKongOnTile; pung is not (§5.5.9 allows
    // the wall-end pung-chain), so it must still be offered at the wall's end.
    if (!w.afterKong) {
      if (canKongOnTile(state, seat, tile))
        actions.push({ t: 'claim', seat, claim: { kind: 'kong' } });
      if (canPungOnTile(state, seat, tile))
        actions.push({ t: 'claim', seat, claim: { kind: 'pung' } });
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
      for (const type of getConcealedKongTypes(state, seat)) {
        if (state.drawIndex <= state.kongDrawIndex) {
          actions.push({
            t: 'declareKongOnTurn',
            seat,
            tile: tileFromType(type),
            subtype: 'concealed',
          });
        }
      }
    }
    actions.push(...getDiscardActions(state, seat));
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
    for (const type of getConcealedKongTypes(state, seat)) {
      if (state.drawIndex <= state.kongDrawIndex) {
        actions.push({
          t: 'declareKongOnTurn',
          seat,
          tile: tileFromType(type),
          subtype: 'concealed',
        });
      }
    }
    for (const kongAction of getPromotedPostponedKongActions(state, seat)) {
      actions.push(kongAction);
    }
  }

  actions.push(...getDiscardActions(state, seat));

  return actions;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function toPublicMelds(melds: Meld[], reveal: boolean): PublicMeld[] {
  if (reveal) return melds;
  return melds.map(m =>
    m.kind === 'kong' && m.subtype === 'concealed'
      ? {
          kind: 'kong' as const,
          subtype: 'concealed' as const,
          tile: null,
          claimedFrom: null,
          turnDeclared: m.turnDeclared,
        }
      : m,
  );
}

function toPublicPlayer(p: PlayerState, revealMelds: boolean): PublicPlayer {
  return {
    seat: p.seat,
    name: p.name,
    isBot: p.isBot,
    melds: toPublicMelds(p.melds, revealMelds),
    discards: p.discards,
    pendingFirstDiscard: p.pendingFirstDiscard !== null,
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

  // Concealed kong ranks are revealed once the round settles (they always were
  // to their owner).
  const reveal = state.phase === 'roundEnd';

  return {
    you: {
      ...toPublicPlayer(you, true),
      hand: [...you.hand],
      voidedSuit: you.voidedSuit,
      furiten: you.furiten,
      pendingFirstDiscardTile: you.pendingFirstDiscard,
      hasSubmittedHuan: state.pendingHuan[seat] != null,
      hasDeclaredVoid: state.pendingVoid[seat] != null,
    },
    others: otherSeats.map(s => toPublicPlayer(state.players[s]!, reveal)) as [
      PublicPlayer,
      PublicPlayer,
      PublicPlayer,
    ],
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

/**
 * Redact per-viewer secrets from the event delta log. Events are produced once
 * per action but broadcast to every seat and spectator, and `drew` /
 * `kongReplacement` carry the drawn tile — which only the drawer may see
 * (anyone else's client would be one dev-tools tab away from reading every
 * opponent draw). Pass 'spectator' for spectate streams: they see no drawn
 * tiles at all. (A31)
 *
 * `voidDeclared` carries the same kind of secret and was leaking it: the void
 * phase resolves all four declarations at once, so every client received all
 * four suits — the one fact `projectView` withholds (`voidedSuit` is on `you`
 * alone) and that A37 put the declaration tile face down to protect. A table
 * learns a player's void suit when they flip that tile, not before. (A40)
 */
export function redactEventsFor(viewer: Seat | 'spectator', events: GameEvent[]): GameEvent[] {
  return events.map(ev => {
    if (ev.e === 'drew' || ev.e === 'kongReplacement') {
      return ev.seat === viewer ? ev : { ...ev, tile: null };
    }
    if (ev.e === 'voidDeclared') {
      return ev.seat === viewer ? ev : { ...ev, suit: null };
    }
    return ev;
  });
}

export function projectSpectatorView(state: GameState): SpectatorView {
  const reveal = state.phase === 'roundEnd';
  return {
    players: state.players.map(p => toPublicPlayer(p, reveal)) as [
      PublicPlayer,
      PublicPlayer,
      PublicPlayer,
      PublicPlayer,
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
