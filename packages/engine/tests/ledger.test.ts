import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyAction, ledgerEntriesFor } from '../src/actions.js';
import type { GameEvent } from '../src/actions.js';
import { createGame } from '../src/state.js';
import type { GameState, Seat } from '../src/state.js';
import { runFullGame } from './helpers/full-game.js';

/**
 * `enableHuanSanZhang` is explicit because one test below asserts the view's
 * `hasSubmittedHuan` flag, which needs a huan phase to exist — and the swap is a
 * house rule, so the shipped default deals straight into the void declaration.
 */
function fresh(): GameState {
  return createGame(
    'ledger-seed',
    [
      { name: 'A', isBot: true },
      { name: 'B', isBot: true },
      { name: 'C', isBot: true },
      { name: 'D', isBot: true },
    ],
    { enableHuanSanZhang: true },
  );
}

describe('payment ledger', () => {
  it('starts empty on a new game', () => {
    expect(fresh().ledger).toEqual([]);
  });

  it('is never shared between an input state and its result', () => {
    // applyAction works on a clone, so a caller holding the old state must not
    // see entries appended to the new one.
    const s = fresh();
    const before = s.ledger;
    const r = applyAction(s, { t: 'claimWindowExpire' });
    expect(s.ledger).toBe(before);
    if (r.ok) expect(r.state.ledger).not.toBe(s.ledger);
  });
});

describe('ledgerEntriesFor', () => {
  it('maps each payment event to a directional entry', () => {
    const events: GameEvent[] = [
      { e: 'huPayment', from: 1, to: 0, amount: 4 },
      { e: 'kongPayment', from: 2, to: 0, amount: 2, subtype: 'concealed' },
      { e: 'kongRefund', from: 0, to: 2, amount: 2, reason: 'robbed' },
      { e: 'buTingPayout', from: 3, to: 1, amount: 2 },
      { e: 'flowerPig', from: 3, to: 0, amount: 8 },
      { e: 'falseHuPayment', from: 1, to: 3, amount: 8 },
      { e: 'voidPenalty', seat: 2, amount: 48 },
      { e: 'voidMeldPenalty', seat: 3, amount: 48 },
    ];

    expect(ledgerEntriesFor(events)).toEqual([
      { reason: 'hu', from: 1, to: 0, amount: 4, detail: null },
      { reason: 'kong', from: 2, to: 0, amount: 2, detail: 'concealed' },
      { reason: 'kongRefund', from: 0, to: 2, amount: 2, detail: 'robbed' },
      { reason: 'buTing', from: 3, to: 1, amount: 2, detail: null },
      { reason: 'flowerPig', from: 3, to: 0, amount: 8, detail: null },
      { reason: 'falseHu', from: 1, to: 3, amount: 8, detail: null },
      { reason: 'voidPenalty', from: 2, to: null, amount: 48, detail: null },
      { reason: 'voidMeldPenalty', from: 3, to: null, amount: 48, detail: null },
    ]);
  });

  it('ignores events that move no points', () => {
    const events: GameEvent[] = [
      { e: 'discarded', seat: 0, tile: 4 },
      { e: 'falseHu', seat: 1 },
      { e: 'roundEnd', reason: 'threeHu' },
    ];
    expect(ledgerEntriesFor(events)).toEqual([]);
  });
});

/** Signed total for one seat: it loses what it pays and gains what it receives. */
function ledgerTotalFor(state: GameState, seat: Seat): number {
  return state.ledger.reduce((sum, e) => {
    if (e.from === seat) return sum - e.amount;
    if (e.to === seat) return sum + e.amount;
    return sum;
  }, 0);
}

describe('ledger balance property', () => {
  it('a real game produces entries', () => {
    // Guards the tests below from passing vacuously on an always-empty ledger.
    expect(runFullGame('ledger-populated').ledger.length).toBeGreaterThan(0);
  });

  it('every seat total matches its scoreDelta, and pot entries match penaltyPot', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 4, maxLength: 12 }), seed => {
        const final = runFullGame(seed);

        for (const p of final.players) {
          expect(ledgerTotalFor(final, p.seat)).toBe(p.scoreDelta);
        }

        const potTotal = final.ledger
          .filter(e => e.to === null)
          .reduce((sum, e) => sum + e.amount, 0);
        expect(potTotal).toBe(final.penaltyPot);
      }),
      { numRuns: 25 },
    );
  });
});

describe('HuRecord fans', () => {
  it('carries structured entries, not pre-formatted English', () => {
    // 'fans-structured' (the seed used in the brief) ends in a wall-exhaustion
    // draw with this bot strategy — no player ever reaches `hu`. 'phase4-tiles'
    // is confirmed (by phase4.test.ts's own 'tile conservation' test) to produce
    // a winner, so it's used here instead.
    const final = runFullGame('phase4-tiles');
    const winner = final.players.find(p => p.hu !== null);
    expect(winner, 'seeded game should produce a winner').toBeDefined();
    for (const entry of winner!.hu!.fans) {
      expect(typeof entry.fan).toBe('string');
      expect(typeof entry.count).toBe('number');
      expect(entry.count).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── View: own submitted state ───────────────────────────────────────────────
// A reconnecting or refreshed client has no memory of having submitted; the
// server is the only thing that knows, so the view has to say.
describe('own huan/void submitted state in the view', () => {
  it('flips once the seat has acted, and only for that seat', async () => {
    const { projectView } = await import('../src/views.js');
    const s = fresh();

    expect(projectView(s, 0).you.hasSubmittedHuan).toBe(false);
    expect(projectView(s, 1).you.hasSubmittedHuan).toBe(false);

    const hand = s.players[0]!.hand;
    const r = applyAction(s, {
      t: 'huanSelect',
      seat: 0,
      tiles: [hand[0]!, hand[1]!, hand[2]!],
    });
    expect(r.ok, 'huanSelect on a freshly dealt game should be legal').toBe(true);
    if (!r.ok) return;

    expect(projectView(r.state, 0).you.hasSubmittedHuan).toBe(true);
    expect(projectView(r.state, 1).you.hasSubmittedHuan).toBe(false);
  });
});
