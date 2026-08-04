import { tileToType } from '@sichuan-mahjong/engine';
import type { Rank, Suit, TileId } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { reconcileHandOrder } from '../src/handOrder.js';

// Distinct ids, so a reordering is visible rather than coincidental.
function tile(suit: Suit, rank: Rank, copy = 0): TileId {
  return tileToType({ suit, rank }) * 4 + copy;
}

const M1 = tile('man', 1);
const M2 = tile('man', 2);
const M3 = tile('man', 3);
const P7 = tile('pin', 7);
const S4 = tile('sou', 4);
const S5 = tile('sou', 5);

describe('reconcileHandOrder', () => {
  // The whole point of the local order: a draw must not reshuffle the tiles the
  // player already sorted.
  it('keeps the dragged arrangement for tiles still held', () => {
    const dragged = [S4, M1, P7, M2];
    // The server sends its own order, and it is not the player's.
    expect(reconcileHandOrder(dragged, [M1, M2, P7, S4])).toEqual([S4, M1, P7, M2]);
  });

  it('appends a drawn tile at the end rather than sorting it in', () => {
    const dragged = [S4, M1, P7];
    expect(reconcileHandOrder(dragged, [M1, P7, S4, M2])).toEqual([S4, M1, P7, M2]);
  });

  it('drops a tile that left the hand, keeping the rest in place', () => {
    const dragged = [S4, M1, P7, M2];
    expect(reconcileHandOrder(dragged, [M1, P7, M2])).toEqual([M1, P7, M2]);
  });

  // A kong on your pung takes the tiles out from under you mid-turn, so more than
  // one can leave at once — and a draw can land in the same push.
  it('handles tiles leaving and arriving in the same update', () => {
    const dragged = [S4, M1, P7, M2];
    expect(reconcileHandOrder(dragged, [M1, M2, S5, M3])).toEqual([M1, M2, S5, M3]);
  });

  // A re-deal replaces every id at once. Nothing is kept, so the new hand is
  // appended whole — which is the same rule, not a special case.
  it('takes a completely new hand in server order', () => {
    expect(reconcileHandOrder([S4, M1, P7], [M2, M3, S5])).toEqual([M2, M3, S5]);
  });

  it('is stable when nothing changed', () => {
    const dragged = [S4, M1, P7, M2];
    expect(reconcileHandOrder(dragged, dragged)).toEqual(dragged);
  });

  it('handles the empty cases', () => {
    expect(reconcileHandOrder([], [M1, M2])).toEqual([M1, M2]);
    expect(reconcileHandOrder([M1, M2], [])).toEqual([]);
  });

  // It feeds a `useState` setter, so returning the input array would let a later
  // mutation write through into React's previous state.
  it('does not alias either input', () => {
    const prev = [S4, M1];
    const hand = [M1, S4];
    const out = reconcileHandOrder(prev, hand);
    out.push(P7);
    expect(prev).toEqual([S4, M1]);
    expect(hand).toEqual([M1, S4]);
  });

  // Four copies of a tile type are four distinct ids, and a hand can hold all of
  // them. Reconciling by type instead of by id would collapse them to one.
  it('keeps every copy of a repeated tile type', () => {
    const copies = [tile('sou', 9, 0), tile('sou', 9, 1), tile('sou', 9, 2), tile('sou', 9, 3)];
    expect(reconcileHandOrder([copies[3]!, copies[0]!], copies)).toEqual([
      copies[3],
      copies[0],
      copies[1],
      copies[2],
    ]);
  });
});
