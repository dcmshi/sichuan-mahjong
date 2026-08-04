import type { GameAction, GameEvent } from './actions.js';
import { canHuConsideringFuriten, canKongOnTile, canPungOnTile } from './claims.js';
import type { DiceRecord } from './dice.js';
import { WALL_SIZE } from './dice.js';
import { isWinningHand } from './hand.js';
import type { Meld } from './melds.js';
import type { GameConfig, GameState, HuRecord, PlayerState, Seat } from './state.js';
import { DEALT_TILES, mustPlayVoidFirst } from './state.js';
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
  /**
   * True once the face-down first discard has been turned over, which makes
   * `discards[0]` the void-suit tile this player declared. False for an indicator
   * user, who never separated one, and false while it is still face down — the
   * flip is what makes the suit public, and A40 is the standing reminder of what
   * happens when something says it earlier than that. Nothing here is new
   * information: after the flip the tile is face up in front of everyone.
   */
  firstDiscardIsVoid: boolean;
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
  /**
   * How far the wall has been eaten into from each end — `head` from the break
   * forwards, `tail` from the far end backwards, which is where kong
   * replacements come from. `wallRemaining` is the total and cannot say *where*
   * the gaps are, so a round with two kongs drew a wall that was wrong at both
   * ends. Public for the same reason the count is: everyone watches the same
   * wall come apart. (N14)
   */
  wallDrawn: { head: number; tail: number };
  phase: Phase;
  turn: Seat;
  lastDiscard: { tile: TileId; from: Seat } | null;
  yourLegalActions: GameAction[];
  claimDeadline: number | null;
  config: GameConfig;
  /**
   * Who the seating throw made East. The client needs it to say so, and it was
   * only ever absent here because it was always seat 0. (N2)
   */
  dealer: Seat;
  /**
   * The dice, unredacted on purpose. Every other addition to this type needed a
   * redaction decision; this one's is that dice are thrown face-up on a table
   * in front of four people, so there is nothing here a seat should not see.
   * The seating throw is null after the round that ran it. (N2)
   */
  dice: DiceRecord;
};

/** Read-only, hand-hiding view for spectators. Exposes no concealed hands. */
export type SpectatorView = {
  players: [PublicPlayer, PublicPlayer, PublicPlayer, PublicPlayer]; // seat-indexed
  wallRemaining: number;
  /** Same two ends as `PlayerView.wallDrawn`; the spectator sees the same wall. */
  wallDrawn: { head: number; tail: number };
  phase: Phase;
  turn: Seat;
  dealer: Seat;
  lastDiscard: { tile: TileId; from: Seat } | null;
  config: GameConfig;
  /** Same reasoning as `PlayerView.dice`: public at the table, public here. */
  dice: DiceRecord;
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
  const tiles = mustPlayVoidFirst(state, seat)
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

/**
 * `reveal` gates two things now: a concealed kong's rank, and the winning hand's
 * decomposition (N16). Both are the same question — may this viewer see tiles
 * this player never put on the table — so they take the same answer: yes to the
 * owner, and to everyone else only once the round has settled.
 *
 * **`hu.shape` needs the redaction that `hu.fans` did not.** A winner's fans are
 * already public mid-round and name a *property* of the hand; the shape names
 * every tile type in it, and a seat that has won sits out the rest of the round
 * with its concealed tiles unrevealed (`handCount`, never `hand`). Passing the
 * shape through would tell the remaining players exactly which tiles are dead —
 * real information, and information this codebase has never given them.
 */
function toPublicPlayer(p: PlayerState, reveal: boolean): PublicPlayer {
  return {
    seat: p.seat,
    name: p.name,
    isBot: p.isBot,
    melds: toPublicMelds(p.melds, reveal),
    discards: p.discards,
    pendingFirstDiscard: p.pendingFirstDiscard !== null,
    // The recorded tile, and that it is still at the head of the pond. Deriving
    // this from `!usedIndicator && discards.length > 0` marked `discards[0]`
    // whatever it was, and a claimed discard is spliced out of its owner's pond
    // (A15) — so a punged declaration promoted that seat's *second* discard into
    // their public declaration for the rest of the round. See `voidDiscardTile`.
    // Length-guarded rather than null-guarded: a snapshot written before
    // `voidDiscardTile` existed restores it as `undefined`, and on an empty pond
    // `discards[0] === undefined` would then be true and mark a declaration that
    // is not there. Comparing a tile that exists to the recorded one cannot.
    firstDiscardIsVoid: p.discards.length > 0 && p.discards[0] === p.voidDiscardTile,
    status: p.status,
    hu: p.hu === null || reveal ? p.hu : withoutShape(p.hu),
    isReady: p.isReady,
    scoreDelta: p.scoreDelta,
    handCount: p.hand.length,
  };
}

/** Drops the key rather than nulling it, because the field is optional. */
function withoutShape(hu: HuRecord): HuRecord {
  if (hu.shape === undefined) return hu;
  const { shape: _shape, ...rest } = hu;
  return rest;
}

/**
 * The wall's two open ends, as counts rather than indices: how many tiles have
 * come off the head since the deal, and how many off the tail. Indices are engine
 * bookkeeping and would put the deal's arithmetic on the wire; these are the two
 * numbers a diagram of the wall actually needs. (N14)
 */
function wallDrawnOf(state: GameState): { head: number; tail: number } {
  return {
    head: Math.max(0, state.drawIndex - DEALT_TILES),
    tail: Math.max(0, WALL_SIZE - 1 - state.kongDrawIndex),
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
    wallDrawn: wallDrawnOf(state),
    phase: state.phase,
    turn: state.turn,
    lastDiscard: state.lastDiscard
      ? { tile: state.lastDiscard.tile, from: state.lastDiscard.from }
      : null,
    yourLegalActions: computeLegalActions(state, seat),
    claimDeadline: state.pendingClaims?.deadline ?? null,
    config: state.config,
    dealer: state.dealer,
    dice: state.dice,
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
    wallDrawn: wallDrawnOf(state),
    phase: state.phase,
    turn: state.turn,
    dealer: state.dealer,
    lastDiscard: state.lastDiscard
      ? { tile: state.lastDiscard.tile, from: state.lastDiscard.from }
      : null,
    config: state.config,
    dice: state.dice,
  };
}
