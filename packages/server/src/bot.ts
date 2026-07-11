import {
  computeLegalActions,
  tileFromType,
  tileToType,
  tileTypeOf,
  ukeire,
} from '@sichuan-mahjong/engine';
import type { GameAction, GameState, Seat, TileId } from '@sichuan-mahjong/engine';

function suitIndex(suit: string): number {
  return suit === 'man' ? 0 : suit === 'pin' ? 1 : 2;
}

/** Higher score = more connected to rest of hand (worth keeping). */
function connectScore(id: TileId, hand: TileId[]): number {
  const type = tileTypeOf(id);
  const { suit, rank } = tileFromType(type);
  let score = 0;
  for (const t of hand) {
    if (t === id) continue;
    const tt = tileTypeOf(t);
    if (tt === type) {
      score += 3;
      continue;
    }
    const ti = tileFromType(tt);
    if (ti.suit === suit) {
      const dist = Math.abs(ti.rank - rank);
      if (dist === 1) score += 2;
      else if (dist === 2) score += 1;
    }
  }
  return score;
}

/** Pick most isolated tile from candidates. Tiebreak: terminals first, then lower rank. */
function pickDiscard(candidates: TileId[], hand: TileId[]): TileId | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestScore = connectScore(best, hand);
  let bestRank = tileFromType(tileTypeOf(best)).rank;
  let bestTerminal = bestRank === 1 || bestRank === 9;

  for (const t of candidates.slice(1)) {
    const s = connectScore(t, hand);
    const { rank } = tileFromType(tileTypeOf(t));
    const terminal = rank === 1 || rank === 9;
    if (
      s < bestScore ||
      (s === bestScore && terminal && !bestTerminal) ||
      (s === bestScore && terminal === bestTerminal && rank < bestRank)
    ) {
      best = t;
      bestScore = s;
      bestRank = rank;
      bestTerminal = terminal;
    }
  }
  return best;
}

export function botHuanAction(state: GameState, seat: Seat): GameAction | null {
  if (state.phase !== 'huan') return null;
  if (state.pendingHuan[seat] != null) return null;
  const player = state.players[seat];
  if (!player) return null;

  const bySuit: [TileId[], TileId[], TileId[]] = [[], [], []];
  for (const t of player.hand) {
    const si = Math.floor(tileTypeOf(t) / 9) as 0 | 1 | 2;
    bySuit[si].push(t);
  }

  // Pick suit with fewest tiles that has ≥3
  let chosen: TileId[] | null = null;
  let minLen = Number.POSITIVE_INFINITY;
  for (const tiles of bySuit) {
    if (tiles.length >= 3 && tiles.length < minLen) {
      chosen = tiles;
      minLen = tiles.length;
    }
  }
  if (!chosen || chosen.length < 3) return null;

  return { t: 'huanSelect', seat, tiles: [chosen[0]!, chosen[1]!, chosen[2]!] };
}

export function botVoidAction(state: GameState, seat: Seat): GameAction | null {
  if (state.phase !== 'voidDeclare') return null;
  if (state.pendingVoid[seat] != null) return null;
  const player = state.players[seat];
  if (!player) return null;

  const bySuit: [TileId[], TileId[], TileId[]] = [[], [], []];
  for (const t of player.hand) {
    const si = Math.floor(tileTypeOf(t) / 9) as 0 | 1 | 2;
    bySuit[si].push(t);
  }

  let minIdx: 0 | 1 | 2 = 0;
  if (bySuit[1].length < bySuit[minIdx].length) minIdx = 1;
  if (bySuit[2].length < bySuit[minIdx].length) minIdx = 2;

  const suits = ['man', 'pin', 'sou'] as const;
  const suit = suits[minIdx];
  const firstDiscard = bySuit[minIdx][0] ?? null;
  return { t: 'declareVoid', seat, suit, firstDiscard };
}

export function botTurnAction(state: GameState, seat: Seat): GameAction | null {
  if (state.phase !== 'play') return null;
  const player = state.players[seat];
  if (!player) return null;

  const legal = computeLegalActions(state, seat);

  const hu = legal.find(a => a.t === 'declareHuOnDraw' || a.t === 'declareHeavenly');
  if (hu) return hu;

  const kong = legal.find(a => a.t === 'declareKongOnTurn');
  if (kong) return kong;

  // Build candidate discard pool
  const legalDiscardSet = new Set(
    legal
      .filter((a): a is { t: 'discard'; seat: Seat; tile: TileId } => a.t === 'discard')
      .map(a => a.tile),
  );
  let candidates = player.hand.filter(t => legalDiscardSet.has(t));
  if (candidates.length === 0) candidates = [...legalDiscardSet];

  // In strict mode with void uncleared, prefer void-suit tiles
  if (state.config.voidDiscardRule === 'strict' && !player.voidCleared && player.voidedSuit) {
    const si = suitIndex(player.voidedSuit);
    const voidCandidates = candidates.filter(t => Math.floor(tileTypeOf(t) / 9) === si);
    if (voidCandidates.length > 0) candidates = voidCandidates;
  }

  const tile = pickDiscard(candidates, player.hand);
  if (tile !== null) return { t: 'discard', seat, tile };

  // Absolute fallback
  const fallback = [...legalDiscardSet][0];
  return fallback !== undefined ? { t: 'discard', seat, tile: fallback } : null;
}

export function botClaimAction(state: GameState, seat: Seat): GameAction {
  const legal = computeLegalActions(state, seat);

  const hu = legal.find(
    a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'hu',
  );
  if (hu) return hu;

  const kong = legal.find(
    a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'kong',
  );
  if (kong) return kong;

  const pung = legal.find(
    a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'pung',
  );
  if (pung && shouldPung(state, seat)) return pung;

  return { t: 'pass', seat };
}

function shouldPung(state: GameState, seat: Seat): boolean {
  const window = state.pendingClaims;
  if (!window) return false;
  const { suit, rank } = tileFromType(tileTypeOf(window.tile));
  const player = state.players[seat];
  if (!player) return false;

  // Avoid punging when the tile is more useful in chows: count same-suit hand
  // tiles within a chow window (rank distance 1–2), EXCLUDING the pung pair
  // itself (distance 0). The old `<= 1` counted the two matching copies that make
  // the pung legal, so adjCount was always ≥ 2 and the bot never punged. (A13)
  let chowNeighbors = 0;
  for (const t of player.hand) {
    const ti = tileFromType(tileTypeOf(t));
    const d = Math.abs(ti.rank - rank);
    if (ti.suit === suit && d >= 1 && d <= 2) chowNeighbors++;
  }
  return chowNeighbors < 2;
}

// ---------------------------------------------------------------------------
// Medium bot — ukeire-based discard efficiency
// ---------------------------------------------------------------------------

/**
 * Compute the ukeire (tile acceptance count) for the hand after hypothetically
 * removing `tile`. Returns 0 if removing the tile leaves a hand where ukeire
 * cannot be computed (e.g., wrong size).
 */
/** Tile types visible to everyone (all discards + all exposed melds). */
function visibleTileTypes(state: GameState): number[] {
  const visible: number[] = [];
  for (const p of state.players) {
    for (const id of p.discards) visible.push(tileTypeOf(id));
    for (const meld of p.melds) {
      if (meld.kind === 'pung' || meld.kind === 'kong') {
        const tt = tileToType(meld.tile);
        visible.push(tt, tt, tt);
        if (meld.kind === 'kong') visible.push(tt);
      } else if (meld.kind === 'chow') {
        for (const t of meld.tiles) visible.push(tileToType(t));
      }
    }
  }
  return visible;
}

function ukeireAfterDiscard(tile: TileId, state: GameState, seat: Seat, visible: number[]): number {
  const player = state.players[seat];
  if (!player) return 0;
  const hand = player.hand.filter(t => t !== tile);
  const uke = ukeire(hand, player.melds, player.voidedSuit, visible);
  let total = 0;
  for (const count of uke.values()) total += count;
  return total;
}

/**
 * Medium bot turn action: uses ukeire to pick the discard that maximises
 * acceptance count. Defensive: if any opponent has declared Hu this round,
 * additionally penalise tiles that the winning player would want.
 */
export function botTurnActionMedium(state: GameState, seat: Seat): GameAction | null {
  if (state.phase !== 'play') return null;
  const player = state.players[seat];
  if (!player) return null;

  const legal = computeLegalActions(state, seat);

  const hu = legal.find(a => a.t === 'declareHuOnDraw' || a.t === 'declareHeavenly');
  if (hu) return hu;

  const kong = legal.find(a => a.t === 'declareKongOnTurn');
  if (kong) return kong;

  const legalDiscardSet = new Set(
    legal
      .filter((a): a is { t: 'discard'; seat: Seat; tile: TileId } => a.t === 'discard')
      .map(a => a.tile),
  );
  let candidates = player.hand.filter(t => legalDiscardSet.has(t));
  if (candidates.length === 0) candidates = [...legalDiscardSet];

  // Strict mode void clearing still takes priority
  if (state.config.voidDiscardRule === 'strict' && !player.voidCleared && player.voidedSuit) {
    const si = suitIndex(player.voidedSuit);
    const voidCandidates = candidates.filter(t => Math.floor(tileTypeOf(t) / 9) === si);
    if (voidCandidates.length > 0) candidates = voidCandidates;
  }

  // Pick tile that maximises ukeire after discard. The visible-tile set is the
  // same for every candidate, so compute it once instead of per-candidate.
  const visible = visibleTileTypes(state);
  let bestTile = candidates[0];
  let bestUke = -1;
  for (const t of candidates) {
    const uke = ukeireAfterDiscard(t, state, seat, visible);
    if (uke > bestUke) {
      bestUke = uke;
      bestTile = t;
    }
  }

  if (bestTile === undefined) {
    const fallback = [...legalDiscardSet][0];
    return fallback !== undefined ? { t: 'discard', seat, tile: fallback } : null;
  }
  return { t: 'discard', seat, tile: bestTile };
}

/** Medium bot claim: more defensive — avoid punging when an opponent is close to winning. */
export function botClaimActionMedium(state: GameState, seat: Seat): GameAction {
  const legal = computeLegalActions(state, seat);

  const hu = legal.find(
    a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'hu',
  );
  if (hu) return hu;

  const kong = legal.find(
    a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'kong',
  );
  if (kong) return kong;

  // Pung only if no opponent is currently at ≤2 wall tiles from a win (simplified heuristic)
  const anyOpponentClose = state.players.some(
    p => p.seat !== seat && p.status === 'playing' && p.isReady,
  );
  if (!anyOpponentClose) {
    const pung = legal.find(
      a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'pung',
    );
    if (pung && shouldPung(state, seat)) return pung;
  }

  return { t: 'pass', seat };
}
