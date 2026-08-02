import { describe, expect, it } from 'vitest';
import {
  WALL_EW_DEPTH,
  WALL_NS_DEPTH,
  WALL_STACKS,
  WALL_TILES,
  wallSlots,
  wallStacks,
} from '../src/components/WallDiagram.js';

describe('wall diagram', () => {
  it('is four walls of seven stacks — the 56 tiles the deal leaves', () => {
    expect(WALL_STACKS).toBe(28);
    expect(WALL_TILES).toBe(56);
  });

  it('stands every stack up when nothing has been drawn', () => {
    expect(wallStacks(WALL_TILES)).toEqual(Array(WALL_STACKS).fill(2));
  });

  it('takes the head stack apart one tile at a time', () => {
    expect(wallStacks(WALL_TILES - 1).slice(0, 2)).toEqual([1, 2]);
    expect(wallStacks(WALL_TILES - 2).slice(0, 2)).toEqual([0, 2]);
    expect(wallStacks(WALL_TILES - 3).slice(0, 2)).toEqual([0, 1]);
  });

  it('is bare at zero, and never negative', () => {
    expect(wallStacks(0)).toEqual(Array(WALL_STACKS).fill(0));
    expect(wallStacks(-10)).toEqual(Array(WALL_STACKS).fill(0));
  });

  it('never stands more than the wall holds', () => {
    expect(wallStacks(1000)).toEqual(Array(WALL_STACKS).fill(2));
  });

  it('always accounts for exactly the tiles remaining', () => {
    for (let n = 0; n <= WALL_TILES; n++) {
      expect(wallStacks(n).reduce((a, b) => a + b, 0)).toBe(n);
    }
  });

  it('places one slot per tile, and fills exactly the ones still standing', () => {
    expect(wallSlots(WALL_TILES)).toHaveLength(WALL_TILES);
    expect(wallSlots(WALL_TILES).every(s => s.filled)).toBe(true);
    expect(wallSlots(0).some(s => s.filled)).toBe(false);
    for (const n of [1, 17, 40, 55]) {
      expect(wallSlots(n).filter(s => s.filled)).toHaveLength(n);
    }
  });

  it('keeps every slot inside the square', () => {
    for (const slot of wallSlots(WALL_TILES)) {
      expect(slot.left).toBeGreaterThanOrEqual(0);
      expect(slot.top).toBeGreaterThanOrEqual(0);
      expect(slot.left + slot.width).toBeLessThanOrEqual(100.01);
    }
  });

  it('leaves the middle clear for the discard', () => {
    // Both walls of a pair, plus what they leave between them, is the whole edge.
    expect(100 - 2 * WALL_NS_DEPTH).toBeGreaterThan(50);
    expect(100 - 2 * WALL_EW_DEPTH).toBeGreaterThan(50);
  });

  it('laps the stacks rather than spacing them', () => {
    const north = wallSlots(WALL_TILES).slice(0, 4);
    // Two slots to a stack, so the next stack is two along.
    const pitch = north[2]!.left - north[0]!.left;
    expect(pitch).toBeLessThan(north[0]!.width);
    expect(pitch / north[0]!.width).toBeCloseTo(0.775, 3);
  });

  it('stacks the second tile over the first rather than beside it', () => {
    const [upper, lower] = wallSlots(WALL_TILES);
    expect(lower!.left).toBe(upper!.left);
    expect(lower!.top).toBeGreaterThan(upper!.top);
    // Overlapping, not stood end to end: the rise is a fraction of the tile.
    expect(lower!.top - upper!.top).toBeLessThan(upper!.width);
  });
});
