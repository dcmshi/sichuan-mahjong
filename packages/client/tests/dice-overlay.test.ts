import type { PlayerView } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { decidingRound, diceKey, throwerKey } from '../src/components/DiceOverlay.js';
import { faceRotation } from '../src/components/Die.js';
import { catalog } from '../src/i18n/index.js';

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

/**
 * Who threw, in a sentence that agrees with its subject. (N15)
 *
 * `nameOf` returns "You" for the local seat, so substituting it into a
 * third-person template produced "You is East" and "You rolls for the wall
 * break". The seating stage was fixed when the dice shipped; the wall stage was
 * missed, and both now go through one helper so they cannot drift apart again.
 *
 * Tested here rather than in the browser because who throws is decided by the
 * seating dice: the local player is East roughly a quarter of the time, so an e2e
 * check passes vacuously most runs — which is exactly what happened when this was
 * verified against the running app.
 */
describe('throwerKey (N15)', () => {
  it('gives your own seat its own sentence, at both stages', () => {
    expect(throwerKey('seating', 2, 2)).toBe('dice.youAreEast');
    expect(throwerKey('wall', 2, 2)).toBe('dice.wallTitleYou');
  });

  it('names anyone else, at both stages', () => {
    expect(throwerKey('seating', 1, 0)).toBe('dice.isEast');
    expect(throwerKey('wall', 1, 0)).toBe('dice.wallTitle');
  });

  it('covers every seat pairing', () => {
    for (const dealer of [0, 1, 2, 3] as const) {
      for (const you of [0, 1, 2, 3] as const) {
        const key = throwerKey('wall', dealer, you);
        expect(key, `dealer ${dealer}, you ${you}`).toBe(
          dealer === you ? 'dice.wallTitleYou' : 'dice.wallTitle',
        );
      }
    }
  });

  // The second-person keys must exist in every catalog, or the fix renders a raw
  // key where the sentence used to be — worse than the grammar it replaced.
  it('every key it can return resolves in all three languages', () => {
    const keys = new Set<string>();
    for (const stage of ['seating', 'wall'] as const) {
      for (const dealer of [0, 1] as const) keys.add(throwerKey(stage, dealer, 0));
    }
    expect(keys.size).toBe(4);
    for (const key of keys) {
      for (const lang of ['en', 'zh-Hans', 'zh-Hant'] as const) {
        expect(catalog[lang][key], `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  // The second-person form must not still contain the placeholder: `t` is called
  // with `name` regardless of which key comes back, so a template that kept
  // "{name}" would render "You roll" as "{name} roll".
  it('the second-person strings interpolate nothing', () => {
    for (const key of ['dice.youAreEast', 'dice.wallTitleYou']) {
      for (const lang of ['en', 'zh-Hans', 'zh-Hant'] as const) {
        expect(catalog[lang][key], `${lang} ${key}`).not.toContain('{name}');
      }
    }
  });
});
