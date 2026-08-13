import {
  calcTMV,
  computeLegalActions,
  isTenpai,
  meldTileTypes,
  mustPlayVoidFirst,
  suitOf,
  tileFromType,
  tileToType,
  tileTypeOf,
  ukeire,
} from '@sichuan-mahjong/engine';
import type {
  GameAction,
  GameState,
  PlayerState,
  Seat,
  Suit,
  TileId,
  TileType,
} from '@sichuan-mahjong/engine';
import { acceptance, handShanten } from './shanten.js';

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

  // The face-down void tile is this turn's mandatory discard — there is nothing
  // to choose, and no hand tile is discardable until it is flipped. (A35)
  const flip = legal.find(a => a.t === 'flipFirstDiscard');
  if (flip) return flip;

  // Build candidate discard pool
  const legalDiscardSet = new Set(
    legal
      .filter((a): a is { t: 'discard'; seat: Seat; tile: TileId } => a.t === 'discard')
      .map(a => a.tile),
  );
  let candidates = player.hand.filter(t => legalDiscardSet.has(t));
  if (candidates.length === 0) candidates = [...legalDiscardSet];

  // In strict mode with void uncleared, prefer void-suit tiles
  if (player.voidedSuit && mustPlayVoidFirst(state, player.seat)) {
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
// Medium bot — discard efficiency: get closer to a win, and keep more ways in
// ---------------------------------------------------------------------------

/**
 * A meld whose rank is nobody else's business until the round ends (A27), so no
 * bot may read its suit off another seat. One definition, because the two places
 * that needed it disagreed. (A60)
 */
export function isConcealedKong(m: PlayerState['melds'][number]): boolean {
  return m.kind === 'kong' && m.subtype === 'concealed';
}

/**
 * Tile types visible to `seat`: all discards, exposed melds, and the seat's own
 * concealed kongs. Other players' concealed kong ranks are hidden information
 * in real play (A27), so the bot must not count them either — even though it
 * technically holds the full state. Exported for tests.
 */
export function visibleTileTypes(state: GameState, seat: Seat): number[] {
  const visible: number[] = [];
  for (const p of state.players) {
    for (const id of p.discards) visible.push(tileTypeOf(id));
    // Pungs and kongs only — Sichuan has no chow claims. (A47)
    for (const meld of p.melds) {
      if (isConcealedKong(meld) && p.seat !== seat) continue;
      const tt = tileToType(meld.tile);
      visible.push(tt, tt, tt);
      if (meld.kind === 'kong') visible.push(tt);
    }
  }
  return visible;
}

/** How many copies of each type `seat` has not accounted for. */
function unseenCounter(state: GameState, seat: Seat): (type: TileType) => number {
  const counts = new Map<TileType, number>();
  for (const type of visibleTileTypes(state, seat)) counts.set(type, (counts.get(type) ?? 0) + 1);
  for (const id of state.players[seat]?.hand ?? []) {
    const type = tileTypeOf(id);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return type => 4 - (counts.get(type) ?? 0);
}

/**
 * Live copies of the tiles that would complete a hand *already* one away.
 *
 * The engine's `ukeire` answers only for a tenpai hand — it is `isTenpai` with
 * counts attached — so this is the last step of a hand rather than a measure of
 * the whole one. N19 found that medium had nothing else: it ranked every
 * candidate discard by this alone, so for most of a round every candidate scored
 * 0 and the loop kept whichever tile came first in hand order. Measured over 60
 * mixed tables, that put medium *behind* easy, which at least reads the shape it
 * is holding. The shanten term below is what it was missing; this stays as the
 * tie-break it is good at.
 */
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
 * True if any opponent of `seat` is tenpai (one tile from a win). Server-side
 * bots see the full state, so this is a genuine look at opponents' hands —
 * the "don't help a player who is about to win" defensive signal.
 */
function anyOpponentTenpai(state: GameState, seat: Seat): boolean {
  return state.players.some(
    p =>
      p.seat !== seat &&
      p.status === 'playing' &&
      isTenpai(p.hand, p.melds, p.voidedSuit, meldTileTypes(p.melds)).length > 0,
  );
}

/**
 * Medium bot turn action: the discard that leaves the hand closest to a win, and
 * among those the one that leaves the most ways to get there.
 *
 * Three keys, cheapest last. Shanten is the one that carries the round; ukeire
 * separates the tenpai endgame; and the isolation score easy uses breaks what is
 * left, so a hand with nothing to choose between still sheds its loosest tile
 * rather than its first.
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

  // The face-down void tile is this turn's mandatory discard — there is nothing
  // to choose, and no hand tile is discardable until it is flipped. (A35)
  const flip = legal.find(a => a.t === 'flipFirstDiscard');
  if (flip) return flip;

  const legalDiscardSet = new Set(
    legal
      .filter((a): a is { t: 'discard'; seat: Seat; tile: TileId } => a.t === 'discard')
      .map(a => a.tile),
  );
  let candidates = player.hand.filter(t => legalDiscardSet.has(t));
  if (candidates.length === 0) candidates = [...legalDiscardSet];

  // Strict mode void clearing still takes priority
  if (player.voidedSuit && mustPlayVoidFirst(state, player.seat)) {
    const si = suitIndex(player.voidedSuit);
    const voidCandidates = candidates.filter(t => Math.floor(tileTypeOf(t) / 9) === si);
    if (voidCandidates.length > 0) candidates = voidCandidates;
  }

  // The visible-tile set is the same for every candidate, so compute it once
  // rather than per-candidate.
  const visible = visibleTileTypes(state, seat);
  const meldCount = player.melds.length;

  let bestTile = candidates[0];
  let bestShanten = Number.POSITIVE_INFINITY;
  let bestUke = -1;
  let bestIsolation = Number.POSITIVE_INFINITY;
  for (const t of candidates) {
    const kept = player.hand.filter(h => h !== t);
    const shanten = handShanten(kept, meldCount, player.voidedSuit).best;
    if (shanten > bestShanten) continue;
    const uke = ukeireAfterDiscard(t, state, seat, visible);
    const isolation = connectScore(t, player.hand);
    if (shanten < bestShanten || uke > bestUke || (uke === bestUke && isolation < bestIsolation)) {
      bestShanten = shanten;
      bestUke = uke;
      bestIsolation = isolation;
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

  // Defensive pung gate: don't pung while any opponent is tenpai — exposing a
  // meld and advancing play mostly helps whoever is about to win. (A25: the old
  // check read p.isReady, which is only computed during round-end settlement,
  // so it was always false in play and this gate never fired.)
  if (!anyOpponentTenpai(state, seat)) {
    const pung = legal.find(
      a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'pung',
    );
    if (pung && shouldPung(state, seat)) return pung;
  }

  return { t: 'pass', seat };
}

// ---------------------------------------------------------------------------
// Hard bot — shanten, a public read of the table, and a hand worth points (N19)
// ---------------------------------------------------------------------------

/**
 * **Hard sees exactly what medium sees.** The one look either takes at a hand it
 * should not be able to read is `anyOpponentTenpai`, which A25 put there and this
 * level keeps — a level called "hard" that defends less than medium would be a
 * strange thing to ship. What changes is what the look is *for*: medium uses it
 * to gate a single pung, hard uses it to decide whether the whole turn is a push
 * or a fold, and then picks the tile from evidence anyone at the table has.
 *
 * That evidence is the void declarations and the discard piles, which N19 filed
 * as the free information both other bots ignore. It is genuinely free: a tile in
 * a seat's declared void suit can never reach them, because `canHuOnTile`,
 * `canPungOnTile` and `canKongOnTile` each reject it outright.
 */

/**
 * The void suit a seat has actually shown the table, which is not the same as
 * the one it declared: the tile stays face down until its owner flips it on
 * their first turn, and an indicator user never separated one at all. The
 * condition mirrors `PublicPlayer.firstDiscardIsVoid` exactly — A40 is the
 * standing reminder of what happens when something says this earlier.
 */
function publicVoidSuit(p: PlayerState): Suit | null {
  if (p.usedIndicator || p.pendingFirstDiscard !== null || p.discards.length === 0) return null;
  return p.voidedSuit;
}

/**
 * How much a tile risks against one opponent, read only off the table.
 *
 * Zero is a guarantee rather than an estimate — the engine refuses the claim.
 * Everything above it is the discard read: a suit a seat has never thrown is the
 * suit they are collecting, a meld in that suit says so twice, and a type whose
 * copies are nearly all face up has a thinner wait left to fill.
 */
function dangerAgainst(tile: TileId, o: PlayerState, unseen: (type: TileType) => number): number {
  const suit = suitOf(tile);
  if (publicVoidSuit(o) === suit) return 0;

  const declaration = publicVoidSuit(o) === null ? 0 : 1;
  let thrown = 0;
  for (const id of o.discards.slice(declaration)) if (suitOf(id) === suit) thrown++;

  let danger = thrown === 0 ? 3 : thrown === 1 ? 2 : 1;
  // Exposed melds only. A concealed kong's rank is hidden until the round ends
  // (A27) and `visibleTileTypes` already refuses to count one — this read the
  // suit straight off the meld, which is the one thing in the danger model no
  // player at the table can see. (A60)
  if (o.melds.some(m => !isConcealedKong(m) && m.tile.suit === suit)) danger++;
  if (unseen(tileTypeOf(tile)) <= 1) danger--;
  return Math.max(1, danger);
}

/** Seats close enough to a win that a discard is worth being careful around. */
function threatSeats(state: GameState, seat: Seat): PlayerState[] {
  return state.players.filter(
    p =>
      p.seat !== seat &&
      p.status === 'playing' &&
      isTenpai(p.hand, p.melds, p.voidedSuit, meldTileTypes(p.melds)).length > 0,
  );
}

/**
 * How much the hand is still worth winning with, so the bot steers toward a hand
 * that pays rather than merely one that finishes. Neither other level has any
 * notion of a fan.
 *
 * Two scales, and they never meet: candidates are only ever compared against
 * others at the same shanten, so either every one of them is tenpai and this is
 * `calcTMV`'s real answer in hand value, or none is and this is the shape
 * estimate. Full flush is the one worth steering a whole hand toward — 2 fan,
 * and it compounds with everything — so it carries the weight.
 */
function handPotential(
  hand: TileId[],
  melds: PlayerState['melds'],
  voidedSuit: Suit | null,
  fanCap: number,
): number {
  const tmv = calcTMV(hand, melds, voidedSuit, fanCap);
  if (tmv > 0) return tmv;

  const bySuit = [0, 0, 0];
  for (const id of hand) bySuit[Math.floor(tileTypeOf(id) / 9)]!++;
  for (const m of melds) {
    bySuit[Math.floor(tileToType(m.tile) / 9)]! += 3;
  }
  const total = bySuit[0]! + bySuit[1]! + bySuit[2]!;
  const flush = total === 0 ? 0 : Math.max(...bySuit) / total;

  const counts = new Map<TileType, number>();
  for (const id of hand) counts.set(tileTypeOf(id), (counts.get(tileTypeOf(id)) ?? 0) + 1);
  // Every meld is a pung or a kong, so every meld is a pung block. (A47)
  let pungBlocks = melds.length;
  for (const [, c] of counts) if (c >= 2) pungBlocks++;

  return 2 * flush + 0.25 * Math.min(pungBlocks, 4);
}

/** True when the hand reads better as seven pairs, which no kong may join. */
function prefersSevenPairs(hand: TileId[], melds: number, voidedSuit: Suit | null): boolean {
  const st = handShanten(hand, melds, voidedSuit);
  return st.sevenPairs < st.standard;
}

type Candidate = {
  tile: TileId;
  shanten: number;
  danger: number;
  accept: number;
  potential: number;
  isolation: number;
};

export function botTurnActionHard(state: GameState, seat: Seat): GameAction | null {
  if (state.phase !== 'play') return null;
  const player = state.players[seat];
  if (!player) return null;

  const legal = computeLegalActions(state, seat);

  const hu = legal.find(a => a.t === 'declareHuOnDraw' || a.t === 'declareHeavenly');
  if (hu) return hu;

  // Kong is a fan and a replacement draw, but it is also the one fan that
  // SevenPairs refuses to sit beside (Table 9), and four of a kind is two of the
  // seven pairs. A hand already reading that way gives up more than it gains.
  const kong = legal.find(a => a.t === 'declareKongOnTurn');
  if (kong && !prefersSevenPairs(player.hand, player.melds.length, player.voidedSuit)) return kong;

  const flip = legal.find(a => a.t === 'flipFirstDiscard');
  if (flip) return flip;

  const legalDiscardSet = new Set(
    legal
      .filter((a): a is { t: 'discard'; seat: Seat; tile: TileId } => a.t === 'discard')
      .map(a => a.tile),
  );
  let candidates = player.hand.filter(t => legalDiscardSet.has(t));
  if (candidates.length === 0) candidates = [...legalDiscardSet];
  if (candidates.length === 0) return null;

  if (player.voidedSuit && mustPlayVoidFirst(state, player.seat)) {
    const si = suitIndex(player.voidedSuit);
    const voidCandidates = candidates.filter(t => Math.floor(tileTypeOf(t) / 9) === si);
    if (voidCandidates.length > 0) candidates = voidCandidates;
  }

  const meldCount = player.melds.length;
  const unseen = unseenCounter(state, seat);
  const threats = threatSeats(state, seat);

  const scored: Candidate[] = candidates.map(tile => {
    const kept = player.hand.filter(t => t !== tile);
    return {
      tile,
      shanten: handShanten(kept, meldCount, player.voidedSuit).best,
      danger: threats.reduce((sum, o) => sum + dangerAgainst(tile, o, unseen), 0),
      accept: -1,
      potential: 0,
      isolation: connectScore(tile, player.hand),
    };
  });

  // Fold when someone is about to win and this hand is not in the race. Two away
  // is the line: at 1-shanten a single useful draw puts the hand in it, and
  // folding a race that is still winnable costs more than the discard risks.
  const ourShanten = Math.min(...scored.map(c => c.shanten));
  const folding = threats.length > 0 && ourShanten >= 2;

  // Acceptance is 27 shanten evaluations a candidate, so the field is narrowed on
  // the cheap keys first and only the survivors are priced.
  const shortlist = folding
    ? [...scored].sort((a, b) => a.danger - b.danger || a.shanten - b.shanten).slice(0, 5)
    : scored.filter(c => c.shanten === ourShanten);

  for (const c of shortlist) {
    const kept = player.hand.filter(t => t !== c.tile);
    c.accept = acceptance(kept, meldCount, player.voidedSuit, unseen);
    c.potential = handPotential(kept, player.melds, player.voidedSuit, state.config.fanCap);
  }

  shortlist.sort((a, b) =>
    folding
      ? a.danger - b.danger || a.shanten - b.shanten || b.accept - a.accept
      : b.accept - a.accept ||
        a.danger - b.danger ||
        b.potential - a.potential ||
        a.isolation - b.isolation,
  );

  const best = shortlist[0] ?? scored[0];
  return best ? { t: 'discard', seat, tile: best.tile } : null;
}

/**
 * Hard bot claim: takes a pung only when it actually advances the hand, which is
 * what medium's local chow-neighbour test was standing in for. Punging costs the
 * tempo of a turn and shows the table a set it can read, so "it was legal" is not
 * a reason on its own — and while someone else is tenpai, only a pung that lands
 * this hand in tenpai too is worth entering the race with.
 */
export function botClaimActionHard(state: GameState, seat: Seat): GameAction {
  const legal = computeLegalActions(state, seat);
  const player = state.players[seat];

  const hu = legal.find(
    a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'hu',
  );
  if (hu) return hu;

  const window = state.pendingClaims;
  if (!player || !window) return { t: 'pass', seat };

  const kong = legal.find(
    a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'kong',
  );
  if (kong && !prefersSevenPairs(player.hand, player.melds.length, player.voidedSuit)) return kong;

  const pung = legal.find(
    a => a.t === 'claim' && (a as { t: 'claim'; claim: { kind: string } }).claim.kind === 'pung',
  );
  if (!pung) return { t: 'pass', seat };

  const type = tileTypeOf(window.tile);
  const before = handShanten(player.hand, player.melds.length, player.voidedSuit).best;

  // The claimed tile plus two from hand become the meld; what is left is one
  // tile over, so the honest comparison is against the best discard from it.
  let taken = 0;
  const remaining = player.hand.filter(t => {
    if (tileTypeOf(t) === type && taken < 2) {
      taken++;
      return false;
    }
    return true;
  });
  let after = Number.POSITIVE_INFINITY;
  for (const drop of remaining) {
    const kept = remaining.filter(t => t !== drop);
    after = Math.min(after, handShanten(kept, player.melds.length + 1, player.voidedSuit).best);
  }

  if (after >= before) return { t: 'pass', seat };
  if (threatSeats(state, seat).length > 0 && after > 0) return { t: 'pass', seat };
  return pung;
}

/**
 * Hard bot void declaration: the suit whose loss leaves the best hand, rather
 * than simply the shortest one. Both other levels count tiles, which reads four
 * scattered singles as worse to give up than three that already form a run — and
 * this is the single most consequential decision of the round, made once, before
 * a tile has been drawn.
 */
export function botVoidActionHard(state: GameState, seat: Seat): GameAction | null {
  if (state.phase !== 'voidDeclare') return null;
  if (state.pendingVoid[seat] != null) return null;
  const player = state.players[seat];
  if (!player) return null;

  const suits: readonly Suit[] = ['man', 'pin', 'sou'];
  let bestSuit: Suit = 'man';
  let bestShanten = Number.POSITIVE_INFINITY;
  let bestCount = Number.POSITIVE_INFINITY;

  for (const suit of suits) {
    const count = player.hand.filter(t => suitOf(t) === suit).length;
    const st = handShanten(player.hand, player.melds.length, suit).best;
    if (st < bestShanten || (st === bestShanten && count < bestCount)) {
      bestSuit = suit;
      bestShanten = st;
      bestCount = count;
    }
  }

  const firstDiscard = player.hand.find(t => suitOf(t) === bestSuit) ?? null;
  return { t: 'declareVoid', seat, suit: bestSuit, firstDiscard };
}
