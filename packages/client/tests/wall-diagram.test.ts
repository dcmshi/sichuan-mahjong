import type { Seat } from '@sichuan-mahjong/engine';
import { WALL_SIZE, createRng, throwForWall } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import {
  WALL_EW_DEPTH,
  WALL_LAP,
  WALL_NS_DEPTH,
  WALL_STACKS,
  WALL_STACKS_PER_SIDE,
  WALL_TILES,
  type WallState,
  ringSlot,
  sideOfSeat,
  wallHead,
  wallSlots,
  wallStacks,
} from '../src/components/WallDiagram.js';

/** A wall with `drawn` tiles off the head and nothing off the tail. */
const fromHead = (drawn: number, head = 0): WallState => ({
  head,
  drawnHead: drawn,
  drawnTail: 0,
});

const standing = (s: WallState) => wallStacks(s).reduce((a, b) => a + b, 0);

describe('wall diagram', () => {
  it('is four walls of seven stacks — the 56 tiles the deal leaves', () => {
    expect(WALL_STACKS).toBe(28);
    expect(WALL_TILES).toBe(56);
  });

  it('stands every stack up when nothing has been drawn', () => {
    expect(wallStacks(fromHead(0))).toEqual(Array(WALL_STACKS).fill(2));
  });

  it('takes the head stack apart one tile at a time', () => {
    expect(wallStacks(fromHead(1)).slice(0, 2)).toEqual([1, 2]);
    expect(wallStacks(fromHead(2)).slice(0, 2)).toEqual([0, 2]);
    expect(wallStacks(fromHead(3)).slice(0, 2)).toEqual([0, 1]);
  });

  it('is bare once everything is drawn, and never negative', () => {
    expect(wallStacks(fromHead(WALL_TILES))).toEqual(Array(WALL_STACKS).fill(0));
    expect(wallStacks(fromHead(1000))).toEqual(Array(WALL_STACKS).fill(0));
    expect(wallStacks({ head: 0, drawnHead: -5, drawnTail: -5 })).toEqual(
      Array(WALL_STACKS).fill(2),
    );
  });

  it('always accounts for exactly the tiles remaining', () => {
    for (let n = 0; n <= WALL_TILES; n++) {
      expect(standing(fromHead(n))).toBe(WALL_TILES - n);
    }
  });

  it('places one slot per tile, and fills exactly the ones still standing', () => {
    expect(wallSlots(fromHead(0))).toHaveLength(WALL_TILES);
    expect(wallSlots(fromHead(0)).every(s => s.filled)).toBe(true);
    expect(wallSlots(fromHead(WALL_TILES)).some(s => s.filled)).toBe(false);
    for (const n of [1, 17, 40, 55]) {
      expect(wallSlots(fromHead(n)).filter(s => s.filled)).toHaveLength(WALL_TILES - n);
    }
  });

  it('keeps every slot inside the square', () => {
    for (const slot of wallSlots(fromHead(0))) {
      expect(slot.left).toBeGreaterThanOrEqual(0);
      expect(slot.top).toBeGreaterThanOrEqual(0);
      expect(slot.left + slot.width).toBeLessThanOrEqual(100.01);
    }
  });

  it('leaves the middle clear for the discard', () => {
    expect(100 - 2 * WALL_NS_DEPTH).toBeGreaterThan(50);
    expect(100 - 2 * WALL_EW_DEPTH).toBeGreaterThan(50);
  });

  it('stacks the second tile over the first rather than beside it', () => {
    const slots = wallSlots(fromHead(0));
    // Every stack, on every side: the two layers share one axis and are offset
    // along the other by less than a tile, which is what reads as a stack. The
    // *direction* of the offset differs per side — it is always towards the
    // outside of the ring — so this asserts the overlap rather than the sign.
    for (let s = 0; s < slots.length; s += 2) {
      const [upper, lower] = [slots[s]!, slots[s + 1]!];
      const dx = Math.abs(lower.left - upper.left);
      const dy = Math.abs(lower.top - upper.top);
      expect(Math.min(dx, dy)).toBe(0);
      expect(Math.max(dx, dy)).toBeGreaterThan(0);
      expect(Math.max(dx, dy)).toBeLessThan(upper.width);
    }
  });

  it('laps the stacks rather than spacing them', () => {
    // Ring 14..20 is the wall across the table, which runs left to right.
    const across = wallSlots(fromHead(0)).slice(28, 32);
    const pitch = Math.abs(across[2]!.left - across[0]!.left);
    expect(pitch).toBeLessThan(across[0]!.width);
    // Read off the constant rather than restating it, so a change to the lap is a
    // one-line change here rather than a puzzle. WallDiagram's LAP doc records why
    // lapping harder than the body band was tried and reverted.
    expect(pitch / across[0]!.width).toBeCloseTo(1 - WALL_LAP, 3);
  });
});

// N14: the whole point of this pass — the same number of tiles left has to put
// the gap in a different place for a different throw.
describe('the break decides where the wall opens', () => {
  it('empties from the head, wherever the head is', () => {
    for (const head of [0, 3, 9, 14, 20, 27]) {
      const stacks = wallStacks(fromHead(4, head));
      expect(stacks[head], `head ${head} should be spent`).toBe(0);
      expect(stacks[(head + 1) % WALL_STACKS]).toBe(0);
      expect(stacks[(head + 2) % WALL_STACKS]).toBe(2);
      // And the stack *before* the head is untouched — the run goes forward.
      expect(stacks[(head - 1 + WALL_STACKS) % WALL_STACKS]).toBe(2);
    }
  });

  it('wraps round the ring rather than stopping at the last side', () => {
    // Head near the end of the ring: the run has to continue at position 0.
    const stacks = wallStacks(fromHead(6, 26));
    expect(stacks[26]).toBe(0);
    expect(stacks[27]).toBe(0);
    expect(stacks[0]).toBe(0);
    expect(stacks[1]).toBe(2);
  });

  it('puts the same remaining count in different places for different heads', () => {
    const a = wallStacks(fromHead(10, 0));
    const b = wallStacks(fromHead(10, 13));
    expect(standing(fromHead(10, 0))).toBe(standing(fromHead(10, 13)));
    expect(a).not.toEqual(b);
  });

  it('maps a seat to the side the board draws it on', () => {
    // You are always the bottom; the rest follow the board's own arrangement.
    expect(sideOfSeat(2 as Seat, 2 as Seat)).toBe(2);
    expect(sideOfSeat(3 as Seat, 2 as Seat)).toBe(3);
    expect(sideOfSeat(0 as Seat, 2 as Seat)).toBe(0);
    expect(sideOfSeat(1 as Seat, 2 as Seat)).toBe(1);
  });

  /**
   * The head lands on the side where the chosen wall's owner is sitting.
   *
   * Asserted against `sideOfSeat` and driven by the engine's own `throwForWall`,
   * rather than against a copy of the break-offset arithmetic. The old version
   * restated `wallSeat * 27 + (27 - indent * 2)` inline and asserted a ring
   * quarter, so it agreed with a formula rather than with the board — and it went
   * on passing while the diagram opened the wall of the player *opposite* the one
   * the dice had named. That is the whole of N22, and this is the assertion that
   * would have caught it.
   */
  it('opens the wall of the seat the dice named, on that seat’s side of the screen', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      for (let dealer = 0; dealer < 4; dealer++) {
        const t = throwForWall(createRng(seed), dealer as Seat);
        for (let you = 0; you < 4; you++) {
          const head = wallHead(t.breakOffset, you as Seat);
          expect(
            ringSlot(head).side,
            `seed ${seed}, dealer ${dealer}: wall ${t.wallSeat} seen from ${you}`,
          ).toBe(sideOfSeat(t.wallSeat as Seat, you as Seat));
        }
      }
    }
  });

  it('walks the ring the way the turn passes — bottom, right, top, left', () => {
    // Play travels counterclockwise: `nextActiveSeat` is `(from + 3) % 4`, and
    // relative seat 3 renders on the viewer's right. So the wall must open toward
    // the right, not the left. It used to advance bottom → left → top → right,
    // which is the other way round the table. (N22)
    const sides = [0, 7, 14, 21].map(ring => ringSlot(ring).side);
    expect(sides).toEqual([2, 1, 0, 3]);
    expect(sides).toEqual([0, 1, 2, 3].map(rel => sideOfSeat(((4 - rel) % 4) as Seat, 0)));
  });

  it('moves the head along the wall as the indent grows', () => {
    const per = WALL_SIZE / 4;
    const heads = [1, 2, 3, 4, 5, 6].map(indent => wallHead(per * 2 + (per - 2 * indent), 0));
    // Monotone: a bigger indent breaks further from the wall's far end, so the
    // head sits earlier along it.
    for (let i = 1; i < heads.length; i++) {
      expect(heads[i]!).toBeLessThanOrEqual(heads[i - 1]!);
    }
    expect(heads[0]).toBeGreaterThan(heads[5]!);
    // And every one of them stays on the wall it belongs to.
    for (const h of heads) expect(Math.floor(h / WALL_STACKS_PER_SIDE)).toBe(2);
  });

  it('keeps the head inside the ring for every legal throw', () => {
    for (let offset = 0; offset < WALL_SIZE; offset++) {
      for (let you = 0; you < 4; you++) {
        const h = wallHead(offset, you as Seat);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(WALL_STACKS);
      }
    }
  });
});

// The other end, which the single total could never show.
describe('kong replacements come off the far end', () => {
  it('opens a second gap behind the head', () => {
    const stacks = wallStacks({ head: 0, drawnHead: 0, drawnTail: 3 });
    expect(stacks[WALL_STACKS - 1]).toBe(0);
    expect(stacks[WALL_STACKS - 2]).toBe(1);
    expect(stacks[0]).toBe(2);
  });

  it('empties from both ends at once', () => {
    const s: WallState = { head: 5, drawnHead: 6, drawnTail: 4 };
    const stacks = wallStacks(s);
    expect(stacks[5]).toBe(0);
    expect(stacks[6]).toBe(0);
    expect(stacks[7]).toBe(0);
    expect(stacks[8]).toBe(2);
    // Tail: the two stacks before the head.
    expect(stacks[4]).toBe(0);
    expect(stacks[3]).toBe(0);
    expect(stacks[2]).toBe(2);
    expect(standing(s)).toBe(WALL_TILES - 10);
  });

  it('never lets the two ends claim the same tile', () => {
    for (let head = 0; head < WALL_TILES; head += 7) {
      for (let tail = 0; tail <= WALL_TILES; tail += 5) {
        const total = standing({ head: 0, drawnHead: head, drawnTail: tail });
        expect(total).toBe(Math.max(0, WALL_TILES - head - tail));
        expect(total).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('draws a two-kong round differently at each end', () => {
    const oneEnd = wallStacks({ head: 0, drawnHead: 10, drawnTail: 0 });
    const bothEnds = wallStacks({ head: 0, drawnHead: 6, drawnTail: 4 });
    expect(standing({ head: 0, drawnHead: 10, drawnTail: 0 })).toBe(
      standing({ head: 0, drawnHead: 6, drawnTail: 4 }),
    );
    expect(oneEnd).not.toEqual(bothEnds);
  });
});
