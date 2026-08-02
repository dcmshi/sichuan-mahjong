import { describe, expect, it } from 'vitest';
import {
  WALL_STACKS,
  WALL_STACKS_PER_SIDE,
  WALL_TILES,
  sideStacks,
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

  it('splits the ring into four equal sides', () => {
    const stacks = wallStacks(WALL_TILES);
    for (let side = 0; side < 4; side++) {
      expect(sideStacks(stacks, side)).toHaveLength(WALL_STACKS_PER_SIDE);
    }
    expect(sideStacks(wallStacks(2), 0)[0]).toBe(0);
    expect(sideStacks(wallStacks(2), 3).at(-1)).toBe(2);
  });
});
