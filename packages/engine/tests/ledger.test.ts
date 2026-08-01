import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.js';
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
