import type { Meld, RoundResult, Seat, TileId, TileType, WinShape } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { groupWinningHand } from '../src/roundEnd.js';

/**
 * A winner's tiles, split into the sets that won. (N16)
 *
 * The reveal draws real tiles, so the shape's tile *types* have to be matched back
 * onto the ids the player held — and the invariant that matters is conservation:
 * every tile in, every tile out, none invented. A grouping that silently dropped
 * one would draw a hand shorter than the player held, which is the failure
 * `revealedTileCount` exists to catch on the other path.
 */

const tid = (type: TileType, copy: 0 | 1 | 2 | 3 = 0): TileId => (type * 4 + copy) as TileId;
const M = (r: number): TileType => r - 1;
const P = (r: number): TileType => 9 + r - 1;
const copies = (t: TileType, n: number) =>
  Array.from({ length: n }, (_, i) => tid(t, i as 0 | 1 | 2 | 3));

type Player = RoundResult['players'][number];

function winner(over: {
  hand: TileId[];
  shape?: WinShape;
  melds?: Meld[];
  winningTile?: TileId;
  byDiscard?: boolean;
}): Player {
  return {
    seat: 0 as Seat,
    name: 'W',
    scoreDelta: 9,
    hand: over.hand,
    melds: over.melds ?? [],
    isReady: false,
    ledger: [],
    hu: {
      seat: 0 as Seat,
      subtype: 'normal',
      fans: [],
      handValue: 1,
      winningTile: over.winningTile ?? over.hand[over.hand.length - 1]!,
      byDiscard: over.byDiscard ?? false,
      discarder: null,
      ...(over.shape ? { shape: over.shape } : {}),
    },
  } as Player;
}

const flat = (gs: ReturnType<typeof groupWinningHand>) => (gs ?? []).flatMap(g => g.tiles);

describe('groupWinningHand', () => {
  it('splits four sets and a pair into five groups', () => {
    const hand = [
      ...copies(M(1), 3),
      ...copies(M(2), 3),
      ...copies(M(3), 3),
      ...copies(M(5), 3),
      ...copies(M(9), 2),
    ];
    const shape: WinShape = {
      kind: 'standard',
      sets: [
        { kind: 'pung', type: M(1) },
        { kind: 'pung', type: M(2) },
        { kind: 'pung', type: M(3) },
        { kind: 'pung', type: M(5) },
      ],
      pair: M(9),
    };
    const groups = groupWinningHand(winner({ hand, shape }));
    expect(groups?.map(g => g.kind)).toEqual(['pung', 'pung', 'pung', 'pung', 'pair']);
    expect(groups?.map(g => g.tiles.length)).toEqual([3, 3, 3, 3, 2]);
  });

  it('loses no tile and invents none', () => {
    const hand = [
      ...copies(M(1), 3),
      tid(M(4)),
      tid(M(5)),
      tid(M(6)),
      ...copies(P(2), 3),
      ...copies(P(7), 3),
      ...copies(P(9), 2),
    ];
    const shape: WinShape = {
      kind: 'standard',
      sets: [
        { kind: 'pung', type: M(1) },
        { kind: 'chow', types: [M(4), M(5), M(6)] },
        { kind: 'pung', type: P(2) },
        { kind: 'pung', type: P(7) },
      ],
      pair: P(9),
    };
    const out = flat(groupWinningHand(winner({ hand, shape })));
    expect([...out].sort((a, b) => a - b)).toEqual([...hand].sort((a, b) => a - b));
  });

  it('skips the declared melds, which the reveal draws separately', () => {
    // `shape.sets` leads with the melds, so a renderer that did not skip them
    // would draw a pung it has no tiles for and then run the pool dry.
    const melds: Meld[] = [
      { kind: 'pung', tile: { suit: 'man', rank: 1 }, claimedFrom: 1 as Seat, concealed: false },
    ];
    const hand = [...copies(M(4), 3), ...copies(P(2), 3), ...copies(P(7), 3), ...copies(P(9), 2)];
    const shape: WinShape = {
      kind: 'standard',
      sets: [
        { kind: 'pung', type: M(1) }, // the meld
        { kind: 'pung', type: M(4) },
        { kind: 'pung', type: P(2) },
        { kind: 'pung', type: P(7) },
      ],
      pair: P(9),
    };
    const groups = groupWinningHand(winner({ hand, shape, melds }));
    expect(groups?.length, 'three concealed sets plus the pair').toBe(4);
    expect(flat(groups).length).toBe(hand.length);
    expect(
      groups?.some(g => g.kind === 'rest'),
      'nothing left over',
    ).toBe(false);
  });

  it('puts a discard-won tile in the set it completed, though it is not in the hand', () => {
    // `separateWinningTile`: a claimed tile never enters `hand`, so the group that
    // needs it has to be given it or it comes out one short.
    const hand = [
      ...copies(M(1), 3),
      ...copies(M(2), 3),
      ...copies(M(3), 3),
      ...copies(M(5), 2), // one short — the third comes off the discard
      ...copies(M(9), 2),
    ];
    const shape: WinShape = {
      kind: 'standard',
      sets: [
        { kind: 'pung', type: M(1) },
        { kind: 'pung', type: M(2) },
        { kind: 'pung', type: M(3) },
        { kind: 'pung', type: M(5) },
      ],
      pair: M(9),
    };
    const won = tid(M(5), 2);
    const groups = groupWinningHand(winner({ hand, shape, winningTile: won, byDiscard: true }));
    expect(groups?.map(g => g.tiles.length)).toEqual([3, 3, 3, 3, 2]);
    const holder = groups?.find(g => g.tiles.includes(won));
    expect(holder?.kind, 'it completed the man-5 pung').toBe('pung');
  });

  it('splits seven pairs into seven groups of two', () => {
    const types: [TileType, TileType, TileType, TileType, TileType, TileType, TileType] = [
      M(1),
      M(3),
      M(5),
      M(7),
      M(9),
      P(2),
      P(4),
    ];
    const hand = types.flatMap(t => copies(t, 2));
    const groups = groupWinningHand(winner({ hand, shape: { kind: 'sevenPairs', pairs: types } }));
    expect(groups?.length).toBe(7);
    expect(groups?.every(g => g.kind === 'pair' && g.tiles.length === 2)).toBe(true);
  });

  it('returns null with no shape, so the caller keeps the flat run', () => {
    // Both real cases: a snapshot written before the field existed, and a record
    // whose shape `views.ts` stripped because the round had not settled.
    const hand = copies(M(1), 3);
    expect(groupWinningHand(winner({ hand }))).toBeNull();
  });

  it('returns null for a seat that did not win', () => {
    const loser = { ...winner({ hand: copies(M(1), 3) }), hu: null } as Player;
    expect(groupWinningHand(loser)).toBeNull();
  });

  it('reports a mismatched shape as leftovers rather than dropping tiles', () => {
    // Should never happen — the engine records the shape it scored these tiles
    // from. If it ever does, the reveal must not quietly draw a shorter hand.
    const hand = [...copies(M(1), 3), ...copies(P(5), 3)];
    const shape: WinShape = {
      kind: 'standard',
      sets: [{ kind: 'pung', type: M(1) }],
      pair: M(9), // not in the hand
    };
    const groups = groupWinningHand(winner({ hand, shape }));
    expect(flat(groups).length, 'every tile still accounted for').toBe(hand.length);
    expect(groups?.some(g => g.kind === 'rest')).toBe(true);
  });
});
