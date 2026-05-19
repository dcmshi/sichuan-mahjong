import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng.js';

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
});
