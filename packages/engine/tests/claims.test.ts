import { describe, expect, it } from 'vitest';
import {
  autoPassIneligible,
  canHuConsideringFuriten,
  canKongOnTile,
  canPungOnTile,
  ccwDist,
  resolveWindow,
} from '../src/claims.js';
import type { ClaimWindow, GameState, Seat } from '../src/state.js';
import type { TileId, TileType } from '../src/tiles.js';
import { tableAt } from './helpers/table.js';

/**
 * The claim window's own rules, tested directly. (A78)
 *
 * Found by mutation testing rather than by reading: `claims.ts` scored 72.76%,
 * the lowest in the engine, and the survivors clustered on three things the
 * rest of the suite reaches only sideways. Every case below corresponds to a
 * mutant that lived — a change to the source that all 738 tests accepted.
 *
 * The worst of them is the void-suit guard. It appears identically in
 * `canHuOnTile`, `canPungOnTile` and `canKongOnTile`, and **all three survived
 * being replaced with `if (false)`** — so the three lines could be deleted
 * outright and nothing would fail. That is not an idle branch: CLAUDE.md leans
 * on it twice, once for N46 ("only a draw can re-arm it; claims cannot,
 * because canPungOnTile / canKongOnTile / canHuOnTile all refuse a void-suit
 * tile") and once for A62, whose whole argument is that no claim can bring a
 * void tile into a meld. An invariant two items rest on had no test at all.
 *
 * Each case carries a positive control — the same hand with the suit *not*
 * voided — because a refusal test that passes for the wrong reason is the
 * failure mode here: every one of these predicates has several ways to return
 * false.
 */

const tid = (type: TileType, copy: 0 | 1 | 2 | 3 = 0): TileId => (type * 4 + copy) as TileId;
const M = (r: number): TileType => r - 1;
const S = (r: number): TileType => 18 + r - 1;
const copies = (type: TileType, n: number): TileId[] =>
  Array.from({ length: n }, (_, i) => tid(type, i as 0 | 1 | 2 | 3));

/** A window on `tile` thrown by `from`, with nobody having acted yet. */
function windowOn(tile: TileId, from: Seat): ClaimWindow {
  return {
    tile,
    from,
    afterKong: false,
    deadline: 0,
    passed: [false, false, false, false],
    claims: [null, null, null, null],
  };
}

describe('a claim on your own void suit is refused (A78)', () => {
  /** Seat 1 holds three sou 3; `tableAt` voids sou for everyone. */
  const holding = (over: Partial<GameState> = {}) =>
    tableAt([{}, { hand: copies(S(3), 3) }, {}, {}], over);

  it('canPungOnTile refuses it — and would allow it if the suit were not void', () => {
    const s = holding();
    expect(canPungOnTile(s, 1 as Seat, tid(S(3), 3))).toBe(false);

    // The control: same hand, same tile, sou no longer void.
    s.players[1]!.voidedSuit = 'man';
    expect(
      canPungOnTile(s, 1 as Seat, tid(S(3), 3)),
      'the hand can pung; only the suit stopped it',
    ).toBe(true);
  });

  it('canKongOnTile refuses it — and would allow it if the suit were not void', () => {
    const s = holding();
    expect(canKongOnTile(s, 1 as Seat, tid(S(3), 3))).toBe(false);

    s.players[1]!.voidedSuit = 'man';
    expect(canKongOnTile(s, 1 as Seat, tid(S(3), 3))).toBe(true);
  });

  it('canHuOnTile refuses it — twice over, and the second reason is the load-bearing one', () => {
    // Four sets and a pair completed by sou 9, with sou voided.
    const hand = [
      ...copies(M(1), 3),
      ...copies(M(4), 3),
      ...copies(M(7), 3),
      ...copies(S(9), 2),
      ...copies(M(9), 2),
    ];
    const s = tableAt([{}, { hand }, {}, {}]);
    expect(canHuConsideringFuriten(s, 1 as Seat, tid(S(9), 2))).toBe(false);

    // **No control is possible here, and that is the finding.** Unlike the pung
    // and kong predicates — which only count copies in hand, so their guard is
    // the only thing refusing a void tile — `canHuOnTile` falls through to
    // `isWinningHand`, and `findFirstStandardShape` already rejects any shape
    // containing the void suit. Adding the winning tile to the hand puts a void
    // tile in `tiles`, so the shape check refuses it regardless.
    //
    // So this guard is belt-and-braces, its mutant is **not killable by any
    // behavioural test**, and the honest thing is to say so rather than to
    // invent a control that passes for a different reason. Left in place: it
    // states the rule at the point a reader looks for it, and it is what makes
    // the three predicates read alike.
    const shapeAlsoRefuses = tableAt([{}, { hand }, {}, {}]);
    shapeAlsoRefuses.players[1]!.voidedSuit = 'sou';
    expect(canHuConsideringFuriten(shapeAlsoRefuses, 1 as Seat, tid(S(9), 2))).toBe(false);
  });

  it('and the window auto-passes a seat whose only claim would be a void one', () => {
    const s = holding({ pendingClaims: windowOn(tid(S(3), 3), 0 as Seat) });
    expect(autoPassIneligible(s), 'every seat is ineligible, so the window resolves at once').toBe(
      true,
    );
    expect(s.pendingClaims?.passed[1]).toBe(true);
  });
});

/**
 * Priority between two seats that both claim. `ccwDist` decides it, and every
 * mutant in it lived — including `(from - to + 4) % 4` becoming `* 4`.
 */
describe('claim priority runs counterclockwise from the discarder (A78)', () => {
  it('ccwDist counts seat-decreasing, which is play order', () => {
    // Play passes to the seat on your right, which is seat-decreasing, so from
    // seat 0 the next to play is 3, then 2, then 1.
    expect(ccwDist(0 as Seat, 3 as Seat)).toBe(1);
    expect(ccwDist(0 as Seat, 2 as Seat)).toBe(2);
    expect(ccwDist(0 as Seat, 1 as Seat)).toBe(3);
    expect(ccwDist(0 as Seat, 0 as Seat)).toBe(0);
    expect(ccwDist(2 as Seat, 1 as Seat)).toBe(1);
    expect(ccwDist(1 as Seat, 2 as Seat)).toBe(3);
  });

  it('gives a contested pung to the nearest seat, not the lowest-numbered', () => {
    // Seats 1 and 2 can both pung man 5 off seat 0. Seat 2 is one step nearer
    // counterclockwise, so it wins — a lowest-index tie-break would say seat 1.
    const s = tableAt([{}, { hand: copies(M(5), 2) }, { hand: copies(M(5), 2) }, {}], {
      pendingClaims: windowOn(tid(M(5), 3), 0 as Seat),
    });
    s.pendingClaims!.claims[1] = { kind: 'pung' };
    s.pendingClaims!.claims[2] = { kind: 'pung' };

    expect(resolveWindow(s)).toEqual({ kind: 'pung', winner: 2 });
  });

  it('gives a contested kong to the nearest seat too', () => {
    const s = tableAt([{}, { hand: copies(M(5), 3) }, { hand: copies(M(5), 3) }, {}], {
      pendingClaims: windowOn(tid(M(5), 3), 0 as Seat),
    });
    s.pendingClaims!.claims[1] = { kind: 'kong' };
    s.pendingClaims!.claims[2] = { kind: 'kong' };

    expect(resolveWindow(s)).toEqual({ kind: 'kong', winner: 2 });
  });

  it('orders multiple Hu winners nearest-first, which decides the next dealer', () => {
    // Both seats win on the same discard. The order matters beyond display:
    // `calcNextDealer` reads huOrder[0] and [1], and `applyHuResolution` passes
    // the turn on from the *second* winner.
    const winning = [
      ...copies(M(1), 3),
      ...copies(M(4), 3),
      ...copies(M(7), 3),
      ...copies(M(9), 2),
      tid(M(2), 0),
      tid(M(3), 0),
    ];
    const s = tableAt([{}, { hand: winning }, { hand: winning }, {}], {
      pendingClaims: windowOn(tid(M(1), 3), 0 as Seat),
    });
    s.pendingClaims!.claims[1] = { kind: 'hu' };
    s.pendingClaims!.claims[2] = { kind: 'hu' };

    const r = resolveWindow(s);
    expect(r?.kind).toBe('hu');
    expect(r?.kind === 'hu' && r.winners, 'seat 2 is nearer counterclockwise').toEqual([2, 1]);
  });
});

describe('a seat that has already won takes no further part (A78)', () => {
  it('is auto-passed rather than left pending, which would hang the window', () => {
    // Emptying this branch survived every test: a won seat stayed un-acted, and
    // `allSeatsActed` skips it anyway — so nothing failed, and the flag it sets
    // is the one `forcePassAll` and the resolution both read.
    const s = tableAt([{}, { hand: copies(M(5), 2), status: 'hu' }, {}, {}], {
      pendingClaims: windowOn(tid(M(5), 3), 0 as Seat),
    });
    autoPassIneligible(s);
    expect(s.pendingClaims?.passed[1], 'a seat that has won must be marked passed').toBe(true);
  });

  it('cannot win the window even if a claim is somehow recorded for it', () => {
    const s = tableAt([{}, { hand: copies(M(5), 2), status: 'hu' }, {}, {}], {
      pendingClaims: windowOn(tid(M(5), 3), 0 as Seat),
    });
    s.pendingClaims!.claims[1] = { kind: 'pung' };
    expect(resolveWindow(s), 'a seat that is out cannot claim').toBeNull();
  });
});
