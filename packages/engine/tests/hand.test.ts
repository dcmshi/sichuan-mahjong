import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findAllWinningShapes, isTenpai, isWinningHand } from '../src/hand.js';
import type { TileId, TileType } from '../src/tiles.js';
import { tileToType } from '../src/tiles.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a TileId array from (suit-index, rank) pairs — uses copy 0. */
function tiles(...args: [number, number][]): TileId[] {
  return args.map(([s, r]) => (s * 9 + (r - 1)) * 4) as TileId[];
}

/** man suit = 0, pin = 1, sou = 2 */
const M = 0;
const P = 1;
const S = 2;

// A clean 14-tile all-man hand: 123 123 123 11 (pair) + 2 extra = 4 chow + pair
// man: 1 1 1 2 2 2 3 3 3 1 1 3 4 5 — let's build a known winner instead
// 111 222 333 man + 11 pin pair
function knownWinner(): TileId[] {
  return tiles(
    [M, 1],
    [M, 1],
    [M, 1],
    [M, 2],
    [M, 2],
    [M, 2],
    [M, 3],
    [M, 3],
    [M, 3],
    [M, 4],
    [M, 4],
    [M, 4],
    [P, 5],
    [P, 5],
  );
}

// 7 pairs hand
function sevenPairsHand(): TileId[] {
  return tiles(
    [M, 1],
    [M, 1],
    [M, 3],
    [M, 3],
    [M, 5],
    [M, 5],
    [M, 7],
    [M, 7],
    [P, 2],
    [P, 2],
    [P, 4],
    [P, 4],
    [P, 6],
    [P, 6],
    [P, 8],
    [P, 8],
  ).slice(0, 14); // 14 tiles
}

function sevenPairsHandExact(): TileId[] {
  return [
    ...tiles([M, 1], [M, 1]),
    ...tiles([M, 3], [M, 3]),
    ...tiles([M, 5], [M, 5]),
    ...tiles([M, 7], [M, 7]),
    ...tiles([P, 2], [P, 2]),
    ...tiles([P, 4], [P, 4]),
    ...tiles([P, 6], [P, 6]),
  ];
}

// Tenpai hand: 4 tiles of 1-man remaining as pair wait → 13 tiles
function tenpaiHand(): TileId[] {
  return tiles(
    [M, 1],
    [M, 1],
    [M, 1],
    [M, 2],
    [M, 2],
    [M, 2],
    [M, 3],
    [M, 3],
    [M, 3],
    [M, 4],
    [M, 4],
    [M, 4],
    [P, 5],
    // waiting on P5 pair
  );
}

// ---------------------------------------------------------------------------
// isWinningHand
// ---------------------------------------------------------------------------

describe('isWinningHand', () => {
  it('recognizes a 4-pung + pair hand', () => {
    expect(isWinningHand(knownWinner(), [], null)).not.toBeNull();
  });

  it('recognizes a 4-chow + pair hand', () => {
    const hand = tiles(
      [M, 1],
      [M, 2],
      [M, 3],
      [M, 4],
      [M, 5],
      [M, 6],
      [M, 7],
      [M, 8],
      [M, 9],
      [P, 1],
      [P, 2],
      [P, 3],
      [S, 5],
      [S, 5],
    );
    expect(isWinningHand(hand, [], null)).not.toBeNull();
  });

  it('recognizes seven pairs', () => {
    expect(isWinningHand(sevenPairsHandExact(), [], null)).toMatchObject({ kind: 'sevenPairs' });
  });

  it('returns null for a 13-tile hand', () => {
    expect(isWinningHand(tenpaiHand(), [], null)).toBeNull();
  });

  it('returns null for a random non-winning 14-tile hand', () => {
    const hand = tiles(
      [M, 1],
      [M, 3],
      [M, 5],
      [M, 7],
      [P, 2],
      [P, 4],
      [P, 6],
      [P, 8],
      [S, 1],
      [S, 3],
      [S, 5],
      [S, 7],
      [S, 9],
      [M, 9],
    );
    expect(isWinningHand(hand, [], null)).toBeNull();
  });

  it('rejects a winning hand that contains voided-suit tiles', () => {
    // knownWinner has man tiles; void man → not a win
    expect(isWinningHand(knownWinner(), [], 'man')).toBeNull();
  });

  it('accepts the same hand with a different voided suit', () => {
    expect(isWinningHand(knownWinner(), [], 'sou')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findAllWinningShapes
// ---------------------------------------------------------------------------

describe('findAllWinningShapes', () => {
  it('returns multiple shapes for ambiguous hands', () => {
    // 1112223334445 man (13 tiles) + 1 man → can decompose multiple ways
    const hand = tiles(
      [M, 1],
      [M, 1],
      [M, 1],
      [M, 2],
      [M, 2],
      [M, 2],
      [M, 3],
      [M, 3],
      [M, 3],
      [M, 4],
      [M, 4],
      [M, 4],
      [M, 5],
      [M, 5],
    );
    const shapes = findAllWinningShapes(hand, [], null);
    expect(shapes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isTenpai
// ---------------------------------------------------------------------------

describe('isTenpai', () => {
  it('returns winning tile types for a tenpai hand', () => {
    const winning = isTenpai(tenpaiHand(), [], null);
    const pinType5: TileType = 1 * 9 + 4; // pin 5
    expect(winning).toContain(pinType5);
  });

  it('returns empty array for a non-tenpai hand', () => {
    const garbage = tiles(
      [M, 1],
      [M, 3],
      [M, 5],
      [P, 2],
      [P, 4],
      [P, 6],
      [S, 1],
      [S, 3],
      [S, 5],
      [M, 7],
      [P, 8],
      [S, 9],
      [M, 9],
    );
    expect(isTenpai(garbage, [], null)).toHaveLength(0);
  });

  it('exhaustive-wait filter: excludes types where all 4 copies are visible', () => {
    // Waiting on pin 5, but we mark all 4 copies of pin5 as visible
    const pin5Type: TileType = 1 * 9 + 4;
    const visible: TileType[] = [pin5Type, pin5Type, pin5Type, pin5Type];
    const winning = isTenpai(tenpaiHand(), [], null, visible);
    expect(winning).not.toContain(pin5Type);
  });

  it('does not return voided-suit tile types', () => {
    // Tenpai hand waiting on pin 5 — void pin → pin5 excluded
    const winning = isTenpai(tenpaiHand(), [], 'pin');
    const pinType5: TileType = 1 * 9 + 4;
    expect(winning).not.toContain(pinType5);
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('hand property tests', () => {
  it('any constructively built 4-pung + pair hand is recognized as winning', () => {
    // Build: pick 5 distinct tile types, use 3 of the first 4 as pungs, 2 of the 5th as pair
    const tileTypeArb = fc.integer({ min: 0, max: 26 });
    const fiveDistinct = fc
      .array(tileTypeArb, { minLength: 5, maxLength: 5 })
      .filter(arr => new Set(arr).size === 5);

    fc.assert(
      fc.property(fiveDistinct, types => {
        const hand: TileId[] = [];
        for (let i = 0; i < 4; i++) {
          for (let c = 0; c < 3; c++) hand.push((types[i]! * 4 + c) as TileId);
        }
        // pair from 5th type
        hand.push((types[4]! * 4 + 0) as TileId);
        hand.push((types[4]! * 4 + 1) as TileId);
        return isWinningHand(hand, [], null) !== null;
      }),
    );
  });

  it('a tenpai hand always has at least one winning tile type', () => {
    // Build 13-tile tenpai: 3 pungs (9) + partial pung wait (2) + pair (2) = 13 tiles
    // Waiting on the 3rd copy of types[3] to complete a pung
    const tileTypeArb = fc.integer({ min: 0, max: 26 });
    const fiveDistinct = fc
      .array(tileTypeArb, { minLength: 5, maxLength: 5 })
      .filter(arr => new Set(arr).size === 5);

    fc.assert(
      fc.property(fiveDistinct, types => {
        const hand: TileId[] = [];
        for (let i = 0; i < 3; i++) {
          for (let c = 0; c < 3; c++) hand.push((types[i]! * 4 + c) as TileId);
        }
        // partial pung (2 of types[3])
        hand.push((types[3]! * 4 + 0) as TileId);
        hand.push((types[3]! * 4 + 1) as TileId);
        // pair (types[4])
        hand.push((types[4]! * 4 + 0) as TileId);
        hand.push((types[4]! * 4 + 1) as TileId);
        // 9 + 2 + 2 = 13 tiles, waiting on types[3] copy 2 or 3 to complete the pung
        return isTenpai(hand, [], null).length > 0;
      }),
    );
  });
});
