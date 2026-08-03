import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.js';
import type { Meld } from '../src/melds.js';
import type { Seat } from '../src/state.js';
import type { TileId, TileType } from '../src/tiles.js';
import { deltas, tableAt } from './helpers/table.js';

/**
 * Who pays what, stated one rule at a time.
 *
 * N21: a player at a real table reported a *payment* as wrong — not a fan. The
 * fan tests in `scoring-cases.test.ts` stop at `handValue`; these carry each
 * settlement path through `applyAction` and assert every seat's net movement, so
 * a disagreement can be pointed at one line rather than at "the scoring".
 *
 * **The rule most likely to surprise someone is that a player who has already
 * won pays nothing for the rest of the round.** That is Bloody Rules — the round
 * continues after the first Hu and the winner sits out — and it means the same
 * hand is worth less the later it lands. Every payment loop in `actions.ts`
 * skips `status === 'hu'`, and each test below says how many payers that leaves.
 */

const tid = (type: TileType, copy: 0 | 1 | 2 | 3 = 0): TileId => (type * 4 + copy) as TileId;
const M = (r: number): TileType => r - 1;
const P = (r: number): TileType => 9 + r - 1;

const copies = (type: TileType, n: number): TileId[] =>
  Array.from({ length: n }, (_, i) => tid(type, i as 0 | 1 | 2 | 3));
const pung = (type: TileType) => copies(type, 3);
const pair = (type: TileType) => copies(type, 2);
const chow = (type: TileType) => [tid(type), tid(type + 1), tid(type + 2)];

/** A fan-less winning hand: two suits, all chows. Worth 2^0 = 1. */
const plainWin = () => [...chow(M(1)), ...chow(M(4)), ...chow(P(2)), ...chow(P(6)), ...pair(P(9))];

/** All pungs in one suit: All Pungs (1) + Full Flush (2) = the cap. Worth 8. */
const bigWin = () => [...pung(M(1)), ...pung(M(3)), ...pung(M(5)), ...pung(M(7)), ...pair(M(9))];

const apply = (
  state: Parameters<typeof applyAction>[0],
  action: Parameters<typeof applyAction>[1],
) => {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${action.t} failed: ${r.reason}`);
  return r.state;
};

describe('self-draw', () => {
  it('collects handValue + 1 from each of the other three', () => {
    const s = apply(tableAt([{ hand: bigWin() }, {}, {}, {}]), { t: 'declareHuOnDraw', seat: 0 });
    // 8 + 1, three times.
    expect(deltas(s)).toEqual([27, -9, -9, -9]);
  });

  it('is worth less once someone has already won, because they stop paying', () => {
    const s = apply(tableAt([{ hand: bigWin() }, { status: 'hu' }, {}, {}]), {
      t: 'declareHuOnDraw',
      seat: 0,
    });
    // Two payers, not three. The hand is identical; the round has moved on.
    expect(deltas(s)).toEqual([18, 0, -9, -9]);
  });

  it('a fan-less hand still collects two from each — a win is never worth nothing', () => {
    const s = apply(tableAt([{ hand: plainWin() }, {}, {}, {}]), { t: 'declareHuOnDraw', seat: 0 });
    expect(deltas(s)).toEqual([6, -2, -2, -2]);
  });

  it('is zero-sum across the table', () => {
    for (const hand of [bigWin(), plainWin()]) {
      const s = apply(tableAt([{ hand }, {}, {}, {}]), { t: 'declareHuOnDraw', seat: 0 });
      expect(deltas(s).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });
});

describe('winning on a discard', () => {
  /** Seat 1 waits on man 9; seat 0 discards it. */
  function shotAt(winnerHand: TileId[], discard: TileId) {
    const base = tableAt([{ hand: [discard, ...chow(P(2))] }, { hand: winnerHand }, {}, {}], {
      turn: 0 as Seat,
      drewThisTurn: true,
    });
    return apply(base, { t: 'discard', seat: 0 as Seat, tile: discard });
  }

  it('collects handValue from the discarder alone — nobody else pays', () => {
    // Seat 1 is one man-9 short of the all-pung flush.
    const waiting = bigWin().filter(t => t !== tid(M(9), 1));
    const afterDiscard = shotAt(waiting, tid(M(9), 1));
    // A Hu claim settles the window on the spot — it outranks everything, so
    // there is nothing left to wait for and no `claimWindowExpire` to send.
    const settled = apply(afterDiscard, { t: 'claim', seat: 1 as Seat, claim: { kind: 'hu' } });
    const d = deltas(settled);
    // The discarder pays the whole hand value; the two bystanders pay nothing.
    // This is the asymmetry with self-draw, and the one worth checking against
    // another source (N21): 8 from one seat, not 9 from each.
    expect(d[1]).toBe(8);
    expect(d[0]).toBe(-8);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(0);
    expect(d.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('kongs', () => {
  const kongTiles = (type: TileType) => copies(type, 4);

  it('a concealed kong takes 2 from every seat still playing', () => {
    const hand = [...kongTiles(M(1)), ...chow(P(2)), ...pair(P(9))];
    const s = apply(tableAt([{ hand }, {}, {}, {}], { lastDrawnTile: tid(M(1), 3) }), {
      t: 'declareKongOnTurn',
      seat: 0 as Seat,
      tile: { suit: 'man', rank: 1 },
      subtype: 'concealed',
    });
    expect(deltas(s)).toEqual([6, -2, -2, -2]);
  });

  it('a concealed kong skips a seat that has already won', () => {
    const hand = [...kongTiles(M(1)), ...chow(P(2)), ...pair(P(9))];
    const s = apply(
      tableAt([{ hand }, { status: 'hu' }, {}, {}], { lastDrawnTile: tid(M(1), 3) }),
      {
        t: 'declareKongOnTurn',
        seat: 0 as Seat,
        tile: { suit: 'man', rank: 1 },
        subtype: 'concealed',
      },
    );
    expect(deltas(s)).toEqual([4, 0, -2, -2]);
  });

  it('a promoted kong takes 1 from each, not 2', () => {
    // A melded pung of man 1, with the fourth copy drawn.
    const melds: Meld[] = [
      {
        kind: 'pung',
        tile: { suit: 'man', rank: 1 },
        claimedFrom: 1 as Seat,
        concealed: false,
        turnDeclared: 2,
      },
    ];
    const hand = [tid(M(1), 3), ...chow(P(2)), ...pair(P(9))];
    const s = apply(tableAt([{ hand, melds }, {}, {}, {}], { lastDrawnTile: tid(M(1), 3) }), {
      t: 'declareKongOnTurn',
      seat: 0 as Seat,
      tile: { suit: 'man', rank: 1 },
      subtype: 'promoted',
    });
    expect(deltas(s)).toEqual([3, -1, -1, -1]);
  });
});

describe('the false-Hu penalty', () => {
  it('is a flat 8 to each opponent still playing, and is not scaled by the cap', () => {
    // A hand that does not win at all.
    const junk = [...chow(M(1)), ...chow(M(4)), ...chow(P(2)), tid(P(6)), tid(P(8)), tid(M(7))];
    const s = apply(tableAt([{ hand: junk }, {}, {}, {}]), {
      t: 'declareHuOnDraw',
      seat: 0 as Seat,
    });
    expect(deltas(s)).toEqual([-24, 8, 8, 8]);
  });

  it('pays only the seats still playing', () => {
    const junk = [...chow(M(1)), ...chow(M(4)), ...chow(P(2)), tid(P(6)), tid(P(8)), tid(M(7))];
    const s = apply(tableAt([{ hand: junk }, { status: 'hu' }, {}, {}]), {
      t: 'declareHuOnDraw',
      seat: 0 as Seat,
    });
    expect(deltas(s)).toEqual([-16, 0, 8, 8]);
  });
});
