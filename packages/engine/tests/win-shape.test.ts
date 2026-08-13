import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/actions.js';
import { findAllWinningShapes } from '../src/hand.js';
import { calcHandScore } from '../src/scoring.js';
import type { HuRecord, Seat } from '../src/state.js';
import type { TileId, TileType } from '../src/tiles.js';
import { projectSpectatorView, projectView, redactEventsFor } from '../src/views.js';
import { tableAt } from './helpers/table.js';

/**
 * The decomposition a hand was *scored* from, recorded rather than recomputed.
 * (N16)
 *
 * The reveal has to draw the hand as the sets that won it, and a hand parses more
 * than one way — so a client re-running the tie-break would eventually disagree
 * with the fan list printed beside it. These pin the two things that makes safe:
 * the shape is the one the fans came from, and it is redacted from the seats that
 * have not been shown the hand.
 */

const tid = (type: TileType, copy: 0 | 1 | 2 | 3 = 0): TileId => (type * 4 + copy) as TileId;
const M = (r: number): TileType => r - 1;
const P = (r: number): TileType => 9 + r - 1;
const copies = (type: TileType, n: number): TileId[] =>
  Array.from({ length: n }, (_, i) => tid(type, i as 0 | 1 | 2 | 3));
const pung = (type: TileType) => copies(type, 3);
const pair = (type: TileType) => copies(type, 2);
const chow = (type: TileType) => [tid(type), tid(type + 1), tid(type + 2)];

const score = (hand: TileId[], winningTile: TileId) =>
  calcHandScore(hand, [], 'sou', winningTile, 'normal', 3, true);

describe('calcHandScore records the shape it scored', () => {
  it('reports the reading that produced the fans, not just any that wins', () => {
    // 111 222 333 in one suit parses as three pungs or three chows, and only the
    // pung reading earns All Pungs. The fans and the shape have to agree, because
    // the reveal draws one directly under the other.
    const hand = [...pung(M(1)), ...pung(M(2)), ...pung(M(3)), ...pung(M(5)), ...pair(M(9))];
    const s = score(hand, tid(M(9), 1));

    expect(s.fans.map(f => f.fan)).toContain('AllPungs');
    expect(s.shape?.kind).toBe('standard');
    const kinds = s.shape?.kind === 'standard' ? s.shape.sets.map(x => x.kind) : [];
    expect(kinds, 'the scored reading is the all-pung one').toEqual([
      'pung',
      'pung',
      'pung',
      'pung',
    ]);
  });

  it('records a shape for a fan-less hand, which scores nothing at all', () => {
    // The seed score is handValue 1 and the comparison is `>`, so no shape ever
    // beats it — this is the case that returns null unless it is handled.
    const hand = [...chow(M(1)), ...chow(M(4)), ...chow(P(2)), ...chow(P(6)), ...pair(P(9))];
    const s = score(hand, tid(P(9), 1));

    expect(s.fans, 'nothing about this hand earns a fan').toEqual([]);
    expect(s.handValue).toBe(1);
    expect(s.shape).not.toBeNull();
    expect(s.shape?.kind).toBe('standard');
  });

  it('picks seven pairs as seven pairs', () => {
    const hand = [
      ...pair(M(1)),
      ...pair(M(3)),
      ...pair(M(5)),
      ...pair(M(7)),
      ...pair(M(9)),
      ...pair(P(2)),
      ...pair(P(4)),
    ];
    const s = score(hand, tid(P(4), 1));
    expect(s.shape?.kind).toBe('sevenPairs');
  });

  it('is one of the readings the hand actually has', () => {
    // Guards against a shape that scores well but does not describe these tiles —
    // which is what a stale or mismatched field would look like.
    const hand = [...pung(M(1)), ...pung(M(2)), ...pung(M(3)), ...pung(M(5)), ...pair(M(9))];
    const s = score(hand, tid(M(9), 1));
    const all = findAllWinningShapes(hand, [], 'sou');
    expect(all.map(x => JSON.stringify(x))).toContain(JSON.stringify(s.shape));
  });

  it('is null when the hand does not win — the false-Hu path', () => {
    const junk = [...chow(M(1)), ...chow(M(4)), ...chow(P(2)), tid(P(6)), tid(P(8))];
    expect(score(junk, tid(P(8))).shape).toBeNull();
  });
});

describe('the shape is redacted until the hand has been revealed', () => {
  /** Seat 1 has won; the round is still running. */
  function midRound() {
    const hand = [...pung(M(1)), ...pung(M(2)), ...pung(M(3)), ...pung(M(5)), ...pair(M(9))];
    const s = score(hand, tid(M(9), 1));
    const state = tableAt([{}, { status: 'hu', hand }, {}, {}]);
    const winner = state.players[1]!;
    winner.hu = {
      seat: 1 as Seat,
      subtype: 'normal',
      fans: s.fans,
      handValue: s.handValue,
      winningTile: tid(M(9), 1),
      byDiscard: false,
      discarder: null,
      ...(s.shape ? { shape: s.shape } : {}),
    };
    return state;
  }

  it('keeps it for the winner, who is looking at their own hand', () => {
    const view = projectView(midRound(), 1 as Seat);
    expect(view.you.hu?.shape).toBeDefined();
  });

  it('strips it from every other seat while the round runs', () => {
    // The fans are public and describe a *property* of the hand; the shape names
    // every tile type in it. A winner sits out with their concealed tiles unshown
    // (`handCount`, never `hand`), so passing the shape through would say exactly
    // which tiles are dead.
    const view = projectView(midRound(), 0 as Seat);
    const winner = view.others.find(o => o.seat === 1);
    expect(winner?.hu, 'the record itself still arrives').not.toBeNull();
    expect(winner?.hu?.fans.length, 'and its fans are still public').toBeGreaterThan(0);
    expect(winner?.hu?.shape, 'but not the decomposition').toBeUndefined();
  });

  it('strips it from spectators too', () => {
    const view = projectSpectatorView(midRound());
    expect(view.players[1]?.hu?.shape).toBeUndefined();
  });

  it('releases it once the round has settled', () => {
    // Same gate as a concealed kong's rank: at round end every hand is on the
    // table, and `RoundResult` already carries them.
    const state = midRound();
    state.phase = 'roundEnd';
    const view = projectView(state, 0 as Seat);
    expect(view.others.find(o => o.seat === 1)?.hu?.shape).toBeDefined();
  });

  /**
   * The event channel, which is the half that was leaking. (A58)
   *
   * `projectView` was right from the start; `redactEventsFor` was not, and the
   * two run against every client on the same broadcast — so the field the view
   * withheld arrived anyway, in the `hu` event beside it. Drawn tiles (A31) and
   * void declarations (A40) each got here the same way, which is why the
   * convention is written as "a field redacted in `views.ts` is not redacted
   * until it is redacted here too".
   */
  describe('and the event carrying it is redacted the same way', () => {
    const huEvent = (): GameEvent => {
      const record = projectView(midRound(), 1 as Seat).you.hu as HuRecord;
      return { e: 'hu', seat: 1 as Seat, record };
    };

    it('keeps the shape for the winner', () => {
      const [ev] = redactEventsFor(1 as Seat, [huEvent()]);
      expect(ev?.e === 'hu' && ev.record.shape).toBeDefined();
    });

    it('strips it for every other seat, and for spectators', () => {
      for (const viewer of [0, 2, 3, 'spectator'] as const) {
        const [ev] = redactEventsFor(viewer, [huEvent()]);
        expect(ev?.e === 'hu' && ev.record.shape, `viewer ${viewer}`).toBeUndefined();
        // Only the shape goes. The fans and the value are public the moment a
        // hand is declared, and the feed says what the win was worth.
        expect(ev?.e === 'hu' && ev.record.handValue).toBe(8);
      }
    });

    it('leaves the caller-side record untouched', () => {
      // Events are produced once and redacted per viewer, so redaction has to
      // copy rather than mutate — the next seat in the broadcast reads the same
      // array.
      const events = [huEvent()];
      redactEventsFor(0 as Seat, events);
      const ev = events[0];
      expect(ev?.e === 'hu' && ev.record.shape).toBeDefined();
    });
  });
});
