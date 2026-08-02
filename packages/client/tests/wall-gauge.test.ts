import { describe, expect, it } from 'vitest';
import { WALL_MAX_BACKS, WALL_PER_BACK, wallBacks } from '../src/components/WallGauge.js';

describe('wall gauge', () => {
  it('draws one back per WALL_PER_BACK tiles', () => {
    expect(wallBacks(WALL_PER_BACK)).toBe(1);
    expect(wallBacks(WALL_PER_BACK * 5)).toBe(5);
  });

  it('rounds up, so a wall only reads as empty once it is', () => {
    expect(wallBacks(1)).toBe(1);
    expect(wallBacks(WALL_PER_BACK + 1)).toBe(2);
  });

  it('is empty at zero, and never negative', () => {
    expect(wallBacks(0)).toBe(0);
    expect(wallBacks(-4)).toBe(0);
  });

  it('caps, so a longer wall cannot push the strip past the well', () => {
    expect(wallBacks(WALL_PER_BACK * WALL_MAX_BACKS)).toBe(WALL_MAX_BACKS);
    expect(wallBacks(1000)).toBe(WALL_MAX_BACKS);
  });

  it('shows the full strip at the deal — 56 tiles after 4×13 are dealt', () => {
    expect(wallBacks(56)).toBe(14);
  });
});
