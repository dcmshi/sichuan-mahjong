import { describe, expect, it } from 'vitest';
import { applyAction, ledgerEntriesFor } from '../src/actions.js';
import type { GameEvent } from '../src/actions.js';
import { createGame } from '../src/state.js';
import type { GameState } from '../src/state.js';

function fresh(): GameState {
  return createGame('ledger-seed', [
    { name: 'A', isBot: true },
    { name: 'B', isBot: true },
    { name: 'C', isBot: true },
    { name: 'D', isBot: true },
  ]);
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
