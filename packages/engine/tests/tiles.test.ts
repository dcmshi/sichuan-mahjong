import { describe, expect, it } from 'vitest';
import {
  buildWall,
  rankOf,
  sortTiles,
  suitOf,
  tileFromType,
  tileToType,
  tileTypeOf,
} from '../src/tiles.js';

const SUITS = ['man', 'pin', 'sou'] as const;

describe('tileFromType / tileToType', () => {
  it('round-trips all 27 TileTypes', () => {
    for (let t = 0; t < 27; t++) {
      expect(tileToType(tileFromType(t))).toBe(t);
    }
  });

  it('maps each type to the correct suit and rank', () => {
    for (let s = 0; s < 3; s++) {
      for (let r = 1; r <= 9; r++) {
        const tile = tileFromType(s * 9 + (r - 1));
        expect(tile.suit).toBe(SUITS[s]);
        expect(tile.rank).toBe(r);
      }
    }
  });
});

describe('tileTypeOf', () => {
  it('maps all 108 TileIds to the correct TileType', () => {
    for (let id = 0; id < 108; id++) {
      expect(tileTypeOf(id)).toBe(Math.floor(id / 4));
    }
  });

  it('four copies of each type share the same TileType', () => {
    for (let type = 0; type < 27; type++) {
      for (let copy = 0; copy < 4; copy++) {
        expect(tileTypeOf(type * 4 + copy)).toBe(type);
      }
    }
  });
});

describe('suitOf', () => {
  it('returns the correct suit for every TileId', () => {
    for (let id = 0; id < 108; id++) {
      const expected = SUITS[Math.floor(Math.floor(id / 4) / 9)];
      expect(suitOf(id)).toBe(expected);
    }
  });
});

describe('rankOf', () => {
  it('returns the correct rank for every TileId', () => {
    for (let id = 0; id < 108; id++) {
      const expected = (Math.floor(id / 4) % 9) + 1;
      expect(rankOf(id)).toBe(expected);
    }
  });
});

describe('sortTiles', () => {
  it('returns a sorted copy without mutating the input', () => {
    const ids = [107, 0, 54, 27, 13, 99, 3];
    const original = [...ids];
    const sorted = sortTiles(ids);
    expect(ids).toEqual(original);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]).toBeGreaterThanOrEqual(sorted[i - 1] as number);
    }
  });

  it('handles an empty array', () => {
    expect(sortTiles([])).toEqual([]);
  });
});

describe('buildWall', () => {
  it('returns exactly 108 tiles', () => {
    expect(buildWall('seed')).toHaveLength(108);
  });

  it('is a permutation of 0..107', () => {
    const wall = buildWall('permutation');
    expect([...wall].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 108 }, (_, i) => i),
    );
  });

  it('contains no duplicates', () => {
    const wall = buildWall('dupes');
    expect(new Set(wall).size).toBe(108);
  });

  it('is deterministic for the same seed', () => {
    expect(buildWall('stable')).toEqual(buildWall('stable'));
  });

  it('produces different orders for different seeds', () => {
    expect(buildWall('alpha')).not.toEqual(buildWall('beta'));
  });
});
