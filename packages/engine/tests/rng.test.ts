import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng.js';
import { buildWall } from '../src/tiles.js';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('hello');
    const b = createRng('hello');
    for (let i = 0; i < 200; i++) expect(a.next()).toBe(b.next());
  });

  it('differs for different seeds', () => {
    const seq = (s: string) => Array.from({ length: 20 }, () => createRng(s).next());
    expect(seq('seed-a')).not.toEqual(seq('seed-b'));
  });

  it('next() returns uint32 values', () => {
    const rng = createRng('uint32');
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('nextInt(n) always returns values in [0, n)', () => {
    const rng = createRng('nextInt');
    for (let i = 1; i <= 108; i++) {
      const v = rng.nextInt(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(i);
    }
  });

  it('nextFloat() returns values in [0, 1)', () => {
    const rng = createRng('float');
    for (let i = 0; i < 200; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces all values in range for small n (distribution sanity)', () => {
    const rng = createRng('dist');
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) seen.add(rng.nextInt(6));
    expect(seen.size).toBe(6);
  });

  /**
   * Every test above compares the generator to itself or to a range, so none of
   * them could fail on a change that produced *different* numbers deterministically
   * — the seed expansion, the xoshiro step, the shuffle's direction. These pin the
   * numbers. If they go red, the deal moved: read the note on `nextInt` in
   * `rng.ts` before regenerating them. (A54)
   *
   * They deliberately do **not** guard the modulo bias, and cannot: swapping
   * `% n` for rejection sampling leaves both of these green, because the
   * rejection branch is 2.24×10⁻⁸ likely at its widest. That is the same fact
   * that makes the bias irrelevant.
   */
  describe('the golden sequence', () => {
    it('nextInt is modulo, and these are its values', () => {
      const rng = createRng('a54-golden');
      const drawn = Array.from({ length: 12 }, () => rng.nextInt(108));
      expect(drawn).toEqual([55, 39, 5, 42, 33, 82, 53, 72, 97, 95, 50, 59]);
    });

    it('and this is the wall it shuffles', () => {
      expect(buildWall('a54-golden').slice(0, 12)).toEqual([
        90, 66, 87, 50, 68, 72, 1, 24, 54, 28, 0, 101,
      ]);
    });
  });
});
