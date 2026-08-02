import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type DiePair,
  MAX_SEATING_ROUNDS,
  TILES_PER_WALL,
  WALL_SIZE,
  lowerDie,
  pairSum,
  rollPair,
  rotateWall,
  throwForSeats,
  throwForWall,
} from '../src/dice.js';
import { createRng } from '../src/rng.js';
import { DEFAULT_CONFIG, type Seat, createGame } from '../src/state.js';
import { type TileId, buildWall } from '../src/tiles.js';

const PLAYERS = [
  { name: 'A', isBot: false },
  { name: 'B', isBot: false },
  { name: 'C', isBot: false },
  { name: 'D', isBot: false },
] as [
  { name: string; isBot: boolean },
  { name: string; isBot: boolean },
  { name: string; isBot: boolean },
  { name: string; isBot: boolean },
];

/** A stub whose `nextInt` walks a fixed script — for pinning exact outcomes. */
function scriptedRng(values: number[]) {
  let i = 0;
  return {
    next: () => 0,
    nextFloat: () => 0,
    nextInt: (n: number) => {
      const v = values[i++] ?? 0;
      return v % n;
    },
  };
}

describe('rolling', () => {
  it('only ever produces faces 1..6', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), seed => {
        const rng = createRng(seed);
        for (let i = 0; i < 200; i++) {
          const p = rollPair(rng);
          expect(p.a).toBeGreaterThanOrEqual(1);
          expect(p.a).toBeLessThanOrEqual(6);
          expect(p.b).toBeGreaterThanOrEqual(1);
          expect(p.b).toBeLessThanOrEqual(6);
        }
      }),
      { numRuns: 20 },
    );
  });

  it('is a pure function of the seed', () => {
    const a = throwForSeats(createRng('same'));
    const b = throwForSeats(createRng('same'));
    expect(a).toEqual(b);
    // Replays depend on this: a different seed has to be able to differ.
    expect(throwForSeats(createRng('other'))).not.toEqual(a);
  });
});

describe('the seating throw', () => {
  it('gives East to the highest sum', () => {
    // Seat 2 throws 6+6; nobody else can match it.
    const rng = scriptedRng([0, 0, 1, 1, 5, 5, 2, 2]);
    const { east } = throwForSeats(rng);
    expect(east).toBe(2);
  });

  it('re-throws only among the tied, and settles', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), seed => {
        const { rounds, east } = throwForSeats(createRng(seed));
        expect(rounds.length).toBeGreaterThanOrEqual(1);
        expect(rounds.length).toBeLessThanOrEqual(MAX_SEATING_ROUNDS);
        expect([0, 1, 2, 3]).toContain(east);

        // Round 1 is everyone; each later round is a strict subset of the one
        // before, and the winner threw in every round.
        const thrownIn = (r: { rolls: (DiePair | null)[] }) =>
          r.rolls.map((p, s) => (p ? s : -1)).filter(s => s >= 0);
        expect(thrownIn(rounds[0] as { rolls: (DiePair | null)[] })).toEqual([0, 1, 2, 3]);
        for (let i = 1; i < rounds.length; i++) {
          const prev = thrownIn(rounds[i - 1] as { rolls: (DiePair | null)[] });
          const now = thrownIn(rounds[i] as { rolls: (DiePair | null)[] });
          expect(now.length).toBeGreaterThan(1);
          expect(now.length).toBeLessThan(prev.length + 1);
          for (const s of now) expect(prev).toContain(s);
        }
        for (const r of rounds) expect(r.rolls[east]).not.toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it('falls back to the lowest tied seat rather than throwing forever', () => {
    // Every seat rolls 6+6 in every round: the tie can never break.
    const rng = scriptedRng(new Array(64).fill(5));
    const { rounds, east } = throwForSeats(rng);
    expect(rounds).toHaveLength(MAX_SEATING_ROUNDS);
    expect(east).toBe(0);
  });
});

describe('the wall throw', () => {
  it('counts the sum counterclockwise from East, as the PDF tabulates it', () => {
    // 5/9 → East, 2/6/10 → South, 3/7/11 → West, 4/8/12 → North, with East at
    // seat 0 so the offset and the seat coincide.
    const expected: Record<number, Seat> = {
      2: 1,
      3: 2,
      4: 3,
      5: 0,
      6: 1,
      7: 2,
      8: 3,
      9: 0,
      10: 1,
      11: 2,
      12: 3,
    };
    for (const [sum, seat] of Object.entries(expected)) {
      const n = Number(sum);
      // Split the sum into two faces that are both in range.
      const a = Math.min(6, n - 1);
      const b = n - a;
      const rng = scriptedRng([a - 1, b - 1]);
      expect(throwForWall(rng, 0).wallSeat, `sum ${n}`).toBe(seat);
    }
  });

  it('is relative to East, not to seat 0', () => {
    // Sum 5 is always East's own wall, wherever East is sitting.
    const rng = () => scriptedRng([1, 2]); // 2 + 3 = 5
    for (const dealer of [0, 1, 2, 3] as Seat[]) {
      expect(throwForWall(rng(), dealer).wallSeat).toBe(dealer);
    }
  });

  it('takes the indent from the lower die', () => {
    const rng = scriptedRng([4, 1]); // faces 5 and 2
    const t = throwForWall(rng, 0);
    expect(t.indent).toBe(2);
    expect(lowerDie(t.wall)).toBe(2);
    expect(pairSum(t.wall)).toBe(7);
  });

  it('breaks inside the wall the sum chose', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), seed => {
        const t = throwForWall(createRng(seed), 0);
        expect(t.indent).toBeGreaterThanOrEqual(1);
        expect(t.indent).toBeLessThanOrEqual(6);
        expect(t.breakOffset).toBeGreaterThanOrEqual(0);
        expect(t.breakOffset).toBeLessThan(WALL_SIZE);
        // The offset lands in the selected wall's quarter, indent stacks in
        // from its right end.
        expect(Math.floor(t.breakOffset / TILES_PER_WALL)).toBe(t.wallSeat);
      }),
      { numRuns: 200 },
    );
  });
});

describe('rotateWall', () => {
  it('is a rotation — same tiles, new starting point', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.nat(500), (seed, offset) => {
        const wall = buildWall(seed);
        const rotated = rotateWall(wall, offset);
        expect(rotated).toHaveLength(wall.length);
        expect([...rotated].sort((x, y) => x - y)).toEqual([...wall].sort((x, y) => x - y));
        expect(rotated[0]).toBe(wall[offset % wall.length]);
      }),
      { numRuns: 100 },
    );
  });

  it('does not mutate its input', () => {
    const wall = buildWall('nomutate');
    const before = [...wall];
    rotateWall(wall, 37);
    expect(wall).toEqual(before);
  });

  it('handles an offset of zero and an empty wall', () => {
    const wall = buildWall('zero');
    expect(rotateWall(wall, 0)).toEqual(wall);
    expect(rotateWall([] as TileId[], 5)).toEqual([]);
  });
});

describe('createGame wiring', () => {
  it('records both throws and deals from the break', () => {
    const s = createGame('wired', PLAYERS);
    expect(s.dice.seating).not.toBeNull();
    expect(s.dice.wallSeat).toBeGreaterThanOrEqual(0);
    expect(s.players[s.dealer]!.hand).toHaveLength(14);
    // The deal starts at the break, so seat-by-seat it is the rotated wall.
    const rotated = rotateWall(buildWall('wired'), s.dice.breakOffset);
    expect(s.wall).toEqual(rotated);
  });

  it('is deterministic for a seed, dice included', () => {
    const a = createGame('determinism', PLAYERS);
    const b = createGame('determinism', PLAYERS);
    expect(a.dice).toEqual(b.dice);
    expect(a.dealer).toBe(b.dealer);
    expect(a.wall).toEqual(b.wall);
  });

  it('skips the seating throw when a dealer is pinned, but still throws for the wall', () => {
    // This is the startNextRound path: a seat once won is not re-contested.
    const s = createGame('pinned', PLAYERS, {}, 2);
    expect(s.dealer).toBe(2);
    expect(s.dice.seating).toBeNull();
    expect(s.dice.wall.a).toBeGreaterThanOrEqual(1);
  });

  it('still deals a legal wall — 108 distinct tiles', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), seed => {
        const s = createGame(seed, PLAYERS);
        expect(new Set(s.wall).size).toBe(WALL_SIZE);
      }),
      { numRuns: 100 },
    );
  });

  it('spreads East around rather than favouring a seat', () => {
    // Not a fairness proof — the shuffle already provides that — but a wired-up
    // seating throw that always returns seat 0 would pass every test above.
    const seen = new Set<Seat>();
    for (let i = 0; i < 200; i++) seen.add(createGame(`spread-${i}`, PLAYERS).dealer);
    expect(seen.size).toBe(4);
  });

  it('defaults the seating throw on', () => {
    expect(DEFAULT_CONFIG.enableSeatingThrow).toBe(true);
  });
});
