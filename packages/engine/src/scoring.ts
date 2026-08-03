import type { WinShape } from './hand.js';
import { findAllWinningShapes, isTenpai } from './hand.js';
import type { Meld } from './melds.js';
import type { Suit, TileId, TileType } from './tiles.js';
import { tileToType, tileTypeOf } from './tiles.js';

export type FanType =
  | 'Kong'
  | 'Root'
  | 'AllPungs'
  | 'GoldenWait'
  | 'FullFlush'
  | 'SevenPairs'
  | 'WinAfterKong'
  | 'ShootAfterKong'
  | 'RobbingTheKong'
  | 'UnderTheSea';

export type FanEntry = { fan: FanType; count: number };

export type HandScore = {
  fans: FanEntry[];
  totalFan: number;
  handValue: number;
};

/**
 * A score plus the decomposition it was computed from. (N16)
 *
 * A hand parses more than one way — 111222333 is three pungs or three chows —
 * and `calcHandScore` keeps the best-scoring reading. Nothing recorded *which*,
 * so a client wanting to show the hand grouped had to re-run the tie-break and
 * would eventually disagree with the fan list printed beside it. The scorer has
 * the answer in hand at the moment it picks, so this is a field rather than a
 * computation.
 *
 * Null only if the hand does not win at all, which is the false-Hu path.
 */
export type ScoredHand = HandScore & { shape: WinShape | null };

export type HuSubtype =
  | 'heavenly'
  | 'earthly'
  | 'winAfterKong'
  | 'shootAfterKong'
  | 'underTheSea'
  | 'robbingTheKong'
  | 'normal';

// PDF Table 9 — encoded verbatim.
// fanValue: fan contribution per instance.  selfMax: max stacking instances.
export const COMPATIBILITY: Record<
  FanType,
  { fanValue: number; selfMax: number; incompatible: FanType[] }
> = {
  Kong: { fanValue: 1, selfMax: 4, incompatible: ['SevenPairs'] },
  Root: { fanValue: 1, selfMax: 3, incompatible: ['AllPungs', 'GoldenWait'] },
  AllPungs: { fanValue: 1, selfMax: 1, incompatible: ['Root', 'SevenPairs', 'RobbingTheKong'] },
  GoldenWait: { fanValue: 1, selfMax: 1, incompatible: ['Root', 'SevenPairs', 'RobbingTheKong'] },
  FullFlush: { fanValue: 2, selfMax: 1, incompatible: [] },
  SevenPairs: {
    fanValue: 2,
    selfMax: 1,
    incompatible: ['Kong', 'AllPungs', 'GoldenWait', 'WinAfterKong', 'RobbingTheKong'],
  },
  WinAfterKong: {
    fanValue: 1,
    selfMax: 1,
    incompatible: ['SevenPairs', 'ShootAfterKong', 'RobbingTheKong', 'UnderTheSea'],
  },
  ShootAfterKong: { fanValue: 1, selfMax: 1, incompatible: ['WinAfterKong'] },
  RobbingTheKong: {
    fanValue: 1,
    selfMax: 1,
    incompatible: ['AllPungs', 'GoldenWait', 'SevenPairs', 'WinAfterKong', 'UnderTheSea'],
  },
  UnderTheSea: { fanValue: 1, selfMax: 1, incompatible: ['RobbingTheKong', 'WinAfterKong'] },
};

function huSubtypeToContextualFan(sub: HuSubtype): FanType | null {
  switch (sub) {
    case 'winAfterKong':
      return 'WinAfterKong';
    case 'shootAfterKong':
      return 'ShootAfterKong';
    case 'robbingTheKong':
      return 'RobbingTheKong';
    case 'underTheSea':
      return 'UnderTheSea';
    default:
      return null;
  }
}

function calcStructuralFans(shape: WinShape, winningTileType: TileType): Map<FanType, number> {
  const fans = new Map<FanType, number>();

  if (shape.kind === 'sevenPairs') {
    fans.set('SevenPairs', 1);

    // Root: any type that appears twice in pairs list is a 4-of-a-kind
    const pairCounts = new Map<TileType, number>();
    for (const t of shape.pairs) pairCounts.set(t, (pairCounts.get(t) ?? 0) + 1);
    let rootCount = 0;
    for (const [, cnt] of pairCounts) if (cnt >= 2) rootCount++;
    if (rootCount > 0) fans.set('Root', rootCount);

    const suits = new Set(shape.pairs.map(t => Math.floor(t / 9)));
    if (suits.size === 1) fans.set('FullFlush', 1);

    return fans;
  }

  // Standard shape
  const { sets, pair } = shape;

  const kongCount = sets.filter(s => s.kind === 'kong').length;
  if (kongCount > 0) fans.set('Kong', kongCount);

  const hasChow = sets.some(s => s.kind === 'chow');
  if (!hasChow) {
    fans.set('AllPungs', 1);
    // GoldenWait: all-pung hand AND winning tile completes the pair
    if (winningTileType === pair) fans.set('GoldenWait', 1);
  }

  // FullFlush: every tile type in the hand is same suit
  const allTypes: TileType[] = [pair];
  for (const s of sets) {
    if (s.kind === 'chow') allTypes.push(s.types[0], s.types[1], s.types[2]);
    else allTypes.push(s.type);
  }
  const suits = new Set(allTypes.map(t => Math.floor(t / 9)));
  if (suits.size === 1) fans.set('FullFlush', 1);

  return fans;
}

function withContextualFan(
  structural: Map<FanType, number>,
  contextual: FanType | null,
): Map<FanType, number> {
  if (contextual === null) return structural;
  // Add contextual fan only if it doesn't conflict with any structural fan
  if (COMPATIBILITY[contextual].incompatible.some(f => structural.has(f))) return structural;
  const result = new Map(structural);
  result.set(contextual, 1);
  return result;
}

function fanMapToScore(fans: Map<FanType, number>, fanCap: number): HandScore {
  const entries: FanEntry[] = [];
  let total = 0;
  for (const [fan, count] of fans) {
    const spec = COMPATIBILITY[fan];
    const capped = Math.min(count, spec.selfMax);
    entries.push({ fan, count: capped });
    total += capped * spec.fanValue;
  }
  const totalFan = Math.min(total, fanCap);
  return { fans: entries, totalFan, handValue: 2 ** totalFan };
}

/**
 * Compute the hand score for a completed win.
 * Does NOT import from state.ts — takes primitives directly to avoid circular deps.
 */
export function calcHandScore(
  tiles: TileId[],
  melds: Meld[],
  voidedSuit: Suit | null,
  winningTile: TileId,
  huSubtype: HuSubtype,
  fanCap: number,
  enableHeavenlyEarthly: boolean,
): ScoredHand {
  const shapes = findAllWinningShapes(tiles, melds, voidedSuit);
  const contextualFan = huSubtypeToContextualFan(huSubtype);
  const winningTileType = tileTypeOf(winningTile);

  let best: HandScore = { fans: [], totalFan: 0, handValue: 1 };
  let bestShape: WinShape | null = null;

  for (const shape of shapes) {
    const structural = calcStructuralFans(shape, winningTileType);
    const allFans = withContextualFan(structural, contextualFan);
    const score = fanMapToScore(allFans, fanCap);
    if (score.handValue > best.handValue) {
      best = score;
      bestShape = shape;
    }
  }

  // A fan-less hand scores exactly the seed value above, so no shape ever beats
  // it and `bestShape` stays null — but the hand still won and still has a
  // decomposition to show. Falling back to the first keeps `best` untouched,
  // which matters: the comparison is `>`, so changing the seed to shape 0's score
  // would be a behaviour change for the sake of a display field.
  const shape = bestShape ?? shapes[0] ?? null;

  // Heavenly / Earthly: auto-cap hand value while keeping structural fans for display
  if ((huSubtype === 'heavenly' || huSubtype === 'earthly') && enableHeavenlyEarthly) {
    return { fans: best.fans, totalFan: fanCap, handValue: 2 ** fanCap, shape };
  }

  return { ...best, shape };
}

/** Meld tile types for exhaustive-wait filtering in isTenpai. */
export function meldTileTypes(melds: Meld[]): TileType[] {
  const types: TileType[] = [];
  for (const m of melds) {
    if (m.kind === 'chow') {
      types.push(tileToType(m.tiles[0]), tileToType(m.tiles[1]), tileToType(m.tiles[2]));
    } else {
      const t = tileToType(m.tile);
      const count = m.kind === 'kong' ? 4 : 3;
      for (let i = 0; i < count; i++) types.push(t);
    }
  }
  return types;
}

/**
 * Theoretical max hand value for a tenpai hand at wall end.
 * Excludes Kong fan and all situational fans (can't be chosen via tile selection).
 */
export function calcTMV(
  tiles: TileId[],
  melds: Meld[],
  voidedSuit: Suit | null,
  fanCap: number,
): number {
  const waitTypes = isTenpai(tiles, melds, voidedSuit, meldTileTypes(melds));
  if (waitTypes.length === 0) return 0;

  let maxValue = 0;
  for (const waitType of waitTypes) {
    const testTile = (waitType * 4 + 3) as TileId;
    const shapes = findAllWinningShapes([...tiles, testTile], melds, voidedSuit);

    for (const shape of shapes) {
      const structural = calcStructuralFans(shape, waitType);
      structural.delete('Kong'); // Kong requires explicit declaration
      const score = fanMapToScore(structural, fanCap);
      if (score.handValue > maxValue) maxValue = score.handValue;
    }
  }

  return maxValue;
}
