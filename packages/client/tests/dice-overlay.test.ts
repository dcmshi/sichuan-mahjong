import type { PlayerView } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { decidingRound, diceKey } from '../src/components/DiceOverlay.js';
import { faceRotation } from '../src/components/Die.js';

const pair = (a: number, b: number) => ({ a, b });

/** Only the fields the two helpers read. */
function viewWith(dice: Partial<PlayerView['dice']>, dealer = 0): PlayerView {
  return {
    dealer,
    dice: {
      seating: null,
      wall: pair(3, 4),
      wallSeat: 2,
      indent: 3,
      breakOffset: 75,
      ...dice,
    },
  } as unknown as PlayerView;
}

describe('faceRotation', () => {
  it('brings each face to the front', () => {
    // Opposite faces sum to 7, so opposite faces must be half a turn apart on
    // exactly one axis — that is the property that makes the cube read as a die
    // rather than as six unrelated squares.
    const opposites: [number, number][] = [
      [1, 6],
      [3, 4],
      [5, 2],
    ];
    for (const [a, b] of opposites) {
      const ra = faceRotation(a);
      const rb = faceRotation(b);
      const dx = Math.abs(ra.x - rb.x);
      const dy = Math.abs(ra.y - rb.y);
      expect(dx + dy, `faces ${a}/${b}`).toBe(180);
    }
  });

  it('gives every face a distinct rotation', () => {
    const seen = new Set([1, 2, 3, 4, 5, 6].map(v => JSON.stringify(faceRotation(v))));
    expect(seen.size).toBe(6);
  });

  it('leaves an out-of-range value flat rather than throwing', () => {
    expect(faceRotation(0)).toEqual({ x: 0, y: 0 });
    expect(faceRotation(7)).toEqual({ x: 0, y: 0 });
  });
});

describe('diceKey', () => {
  it('changes when the throws change', () => {
    const a = diceKey(viewWith({}));
    expect(diceKey(viewWith({ wall: pair(1, 1), breakOffset: 20 }))).not.toBe(a);
    expect(diceKey(viewWith({}, 2))).not.toBe(a);
  });

  it('is stable across re-renders of the same round', () => {
    // The overlay shows once per round and this is what stops it re-showing on
    // every incoming view — of which there are dozens per round.
    expect(diceKey(viewWith({}))).toBe(diceKey(viewWith({})));
  });

  it('separates a re-thrown seating round from a first-time one', () => {
    const once = diceKey(viewWith({ seating: [{ rolls: [pair(1, 1), null, null, null] }] }));
    const twice = diceKey(
      viewWith({
        seating: [
          { rolls: [pair(1, 1), null, null, null] },
          { rolls: [pair(2, 2), null, null, null] },
        ],
      }),
    );
    expect(once).not.toBe(twice);
  });
});

describe('decidingRound', () => {
  it('is the last round thrown, which is the one that settled it', () => {
    const view = viewWith({
      seating: [
        { rolls: [pair(6, 6), pair(6, 6), pair(1, 2), pair(1, 3)] },
        { rolls: [pair(5, 1), pair(2, 2), null, null] },
      ],
    });
    expect(decidingRound(view)).toEqual([pair(5, 1), pair(2, 2), null, null]);
  });

  it('is null when the seating throw did not run', () => {
    expect(decidingRound(viewWith({ seating: null }))).toBeNull();
    expect(decidingRound(viewWith({ seating: [] }))).toBeNull();
  });
});
