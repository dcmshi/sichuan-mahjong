import type { Suit, TileId, TileType } from './tiles.js';
import { tileTypeOf, tileToType, suitOf } from './tiles.js';
import type { Meld } from './melds.js';

// ---------------------------------------------------------------------------
// Win shape
// ---------------------------------------------------------------------------

export type SetShape =
  | { kind: 'chow'; types: [TileType, TileType, TileType] }
  | { kind: 'pung'; type: TileType }
  | { kind: 'kong'; type: TileType };

export type WinShape =
  | { kind: 'standard'; sets: SetShape[]; pair: TileType }
  | { kind: 'sevenPairs'; pairs: [TileType, TileType, TileType, TileType, TileType, TileType, TileType] };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function meldToSetShape(m: Meld): SetShape {
  if (m.kind === 'pung') return { kind: 'pung', type: tileToType(m.tile) };
  if (m.kind === 'kong') return { kind: 'kong', type: tileToType(m.tile) };
  return { kind: 'chow', types: [tileToType(m.tiles[0]), tileToType(m.tiles[1]), tileToType(m.tiles[2])] };
}

function countTypes(tiles: TileId[]): Map<TileType, number> {
  const m = new Map<TileType, number>();
  for (const t of tiles) {
    const type = tileTypeOf(t);
    m.set(type, (m.get(type) ?? 0) + 1);
  }
  return m;
}

function smallestKey(counts: Map<TileType, number>): TileType | undefined {
  let min: TileType | undefined;
  for (const [k, v] of counts) {
    if (v > 0 && (min === undefined || k < min)) min = k;
  }
  return min;
}

/**
 * Recursive standard-hand solver operating on a counts map.
 * Always removes the smallest remaining tile type first to avoid duplicates.
 */
function solveStandard(counts: Map<TileType, number>, setsLeft: number): SetShape[][] {
  if (setsLeft === 0) return [[]];

  const t = smallestKey(counts);
  if (t === undefined) return [];

  const cnt = counts.get(t)!;
  const results: SetShape[][] = [];

  // Try pung
  if (cnt >= 3) {
    counts.set(t, cnt - 3);
    for (const rest of solveStandard(counts, setsLeft - 1)) {
      results.push([{ kind: 'pung', type: t }, ...rest]);
    }
    counts.set(t, cnt);
  }

  // Try chow (t, t+1, t+2) — must stay within same suit (same floor(t/9))
  const t1 = t + 1;
  const t2 = t + 2;
  if (
    Math.floor(t / 9) === Math.floor(t1 / 9) &&
    Math.floor(t / 9) === Math.floor(t2 / 9) &&
    (counts.get(t1) ?? 0) >= 1 &&
    (counts.get(t2) ?? 0) >= 1
  ) {
    counts.set(t, cnt - 1);
    counts.set(t1, counts.get(t1)! - 1);
    counts.set(t2, counts.get(t2)! - 1);
    for (const rest of solveStandard(counts, setsLeft - 1)) {
      results.push([{ kind: 'chow', types: [t, t1, t2] }, ...rest]);
    }
    counts.set(t, cnt);
    counts.set(t1, counts.get(t1)! + 1);
    counts.set(t2, counts.get(t2)! + 1);
  }

  return results;
}

function findStandardShapes(tiles: TileId[], melds: Meld[], voidedSuit: Suit | null): WinShape[] {
  if (tiles.some(t => voidedSuit !== null && suitOf(t) === voidedSuit)) return [];

  const meldShapes = melds.map(meldToSetShape);
  const setsNeeded = 4 - melds.length;
  const counts = countTypes(tiles);
  const results: WinShape[] = [];

  for (const [pairType, cnt] of counts) {
    if (cnt < 2) continue;
    counts.set(pairType, cnt - 2);
    for (const sets of solveStandard(new Map(counts), setsNeeded)) {
      results.push({ kind: 'standard', sets: [...meldShapes, ...sets], pair: pairType });
    }
    counts.set(pairType, cnt);
  }

  return results;
}

function findSevenPairsShape(tiles: TileId[], voidedSuit: Suit | null): WinShape | null {
  if (tiles.length !== 14) return null;
  if (tiles.some(t => voidedSuit !== null && suitOf(t) === voidedSuit)) return null;

  const counts = countTypes(tiles);
  const pairs: TileType[] = [];
  for (const [type, cnt] of counts) {
    // cnt must be 2 or 4; 4-of-a-kind counts as two pairs in seven-pairs
    if (cnt === 2) pairs.push(type);
    else if (cnt === 4) pairs.push(type, type);
    else return null;
  }
  if (pairs.length !== 7) return null;

  pairs.sort((a, b) => a - b);
  return {
    kind: 'sevenPairs',
    pairs: pairs as [TileType, TileType, TileType, TileType, TileType, TileType, TileType],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isWinningHand(tiles: TileId[], melds: Meld[], voidedSuit: Suit | null): WinShape | null {
  if (melds.length === 0) {
    const sp = findSevenPairsShape(tiles, voidedSuit);
    if (sp) return sp;
  }

  const expectedHandTiles = 14 - melds.length * 3;
  if (tiles.length !== expectedHandTiles) return null;

  const shapes = findStandardShapes(tiles, melds, voidedSuit);
  return shapes.length > 0 ? shapes[0]! : null;
}

export function findAllWinningShapes(tiles: TileId[], melds: Meld[], voidedSuit: Suit | null): WinShape[] {
  const results: WinShape[] = [];

  if (melds.length === 0) {
    const sp = findSevenPairsShape(tiles, voidedSuit);
    if (sp) results.push(sp);
  }

  const expectedHandTiles = 14 - melds.length * 3;
  if (tiles.length === expectedHandTiles) {
    results.push(...findStandardShapes(tiles, melds, voidedSuit));
  }

  return results;
}

/**
 * Returns winning tile types for a tenpai hand (13 standing tiles).
 * Exhaustive-wait filter: excludes types where the player already sees all 4 copies.
 * `visibleTiles` should include the player's own hand + meld tiles (their visible set).
 */
export function isTenpai(
  tiles: TileId[],
  melds: Meld[],
  voidedSuit: Suit | null,
  visibleTiles: TileType[] = [],
): TileType[] {
  const visibleCounts = new Map<TileType, number>();
  for (const t of visibleTiles) visibleCounts.set(t, (visibleCounts.get(t) ?? 0) + 1);
  for (const t of tiles) {
    const type = tileTypeOf(t);
    visibleCounts.set(type, (visibleCounts.get(type) ?? 0) + 1);
  }

  const winning: TileType[] = [];
  for (let type = 0; type < 27; type++) {
    if (voidedSuit !== null) {
      const suit = (['man', 'pin', 'sou'] as const)[Math.floor(type / 9)]!;
      if (suit === voidedSuit) continue;
    }
    if ((visibleCounts.get(type) ?? 0) >= 4) continue;

    // Use the 4th copy (index 3) as a placeholder — safe since exhaustive-wait already filtered out
    // cases where all 4 are visible
    const testTile = (type * 4 + 3) as TileId;
    if (isWinningHand([...tiles, testTile], melds, voidedSuit) !== null) {
      winning.push(type);
    }
  }

  return winning;
}

/**
 * Returns a map from winning tile type → copies still unseen (max 4 - visible).
 */
export function ukeire(
  tiles: TileId[],
  melds: Meld[],
  voidedSuit: Suit | null,
  visibleTiles: TileType[],
): Map<TileType, number> {
  const winning = isTenpai(tiles, melds, voidedSuit, visibleTiles);

  const allVisible = new Map<TileType, number>();
  for (const t of visibleTiles) allVisible.set(t, (allVisible.get(t) ?? 0) + 1);
  for (const t of tiles) {
    const type = tileTypeOf(t);
    allVisible.set(type, (allVisible.get(type) ?? 0) + 1);
  }

  const result = new Map<TileType, number>();
  for (const type of winning) {
    result.set(type, 4 - (allVisible.get(type) ?? 0));
  }
  return result;
}
