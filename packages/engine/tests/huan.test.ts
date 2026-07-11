import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.js';
import { createGame } from '../src/state.js';
import type { GameState, PlayerInit, Seat } from '../src/state.js';
import { suitOf } from '../src/tiles.js';
import type { TileId } from '../src/tiles.js';

const INITS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'P0', isBot: false },
  { name: 'P1', isBot: false },
  { name: 'P2', isBot: false },
  { name: 'P3', isBot: false },
];

/** Pick 3 tiles of the same suit from a hand (the largest suit always has ≥3). */
function pick3SameSuit(hand: TileId[]): [TileId, TileId, TileId] {
  const bySuit: Record<string, TileId[]> = { man: [], pin: [], sou: [] };
  for (const t of hand) bySuit[suitOf(t)]!.push(t);
  const group = Object.values(bySuit).sort((a, b) => b.length - a.length)[0]!;
  return [group[0]!, group[1]!, group[2]!];
}

/** Run the huan phase: every seat swaps 3 tiles. Returns {state, picks per seat}. */
function runHuan(seed: string, huanDirection: 'cw' | 'ccw' | 'random') {
  let state = createGame(seed, INITS, { huanDirection });
  expect(state.phase).toBe('huan');
  const picks: TileId[][] = [];
  for (let i = 0; i < 4; i++) {
    const seat = i as Seat;
    const tiles = pick3SameSuit(state.players[seat]!.hand);
    picks.push(tiles);
    const r = applyAction(state, { t: 'huanSelect', seat, tiles });
    if (!r.ok) throw new Error(`huanSelect seat ${i} failed: ${r.reason}`);
    state = r.state;
  }
  return { state, picks };
}

function assertRotation(state: GameState, picks: TileId[][], offset: number) {
  for (let i = 0; i < 4; i++) {
    const to = (i + offset) % 4;
    const recipientHand = state.players[to]!.hand;
    const giverHand = state.players[i]!.hand;
    for (const t of picks[i]!) {
      expect(recipientHand, `seat ${i}'s tile ${t} should be in seat ${to}'s hand`).toContain(t);
      expect(giverHand, `seat ${i} should no longer hold given tile ${t}`).not.toContain(t);
    }
  }
}

describe('Huan San Zhang rotation', () => {
  it('cw: seat i passes its 3 tiles to seat (i+1)', () => {
    const { state, picks } = runHuan('huan-cw', 'cw');
    expect(state.phase).toBe('voidDeclare'); // huan complete → next phase
    expect(state.pendingHuan).toEqual([null, null, null, null]);
    assertRotation(state, picks, 1);
  });

  it('ccw: seat i passes its 3 tiles to seat (i+3)', () => {
    const { state, picks } = runHuan('huan-ccw', 'ccw');
    expect(state.phase).toBe('voidDeclare');
    assertRotation(state, picks, 3);
  });

  it('random: direction is seed-derived and deterministic', () => {
    const seed = 'huan-random-seed';
    // Replicate the engine's seed hash → direction derivation.
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const expectedOffset = h & 1 ? 1 /* cw */ : 3 /* ccw */;

    const { state, picks } = runHuan(seed, 'random');
    assertRotation(state, picks, expectedOffset);

    // Same seed → same direction (deterministic).
    const again = runHuan(seed, 'random');
    assertRotation(again.state, again.picks, expectedOffset);
  });

  it('every tile is conserved across the swap (no tiles created or lost)', () => {
    const { state } = runHuan('huan-conserve', 'cw');
    const all = state.players.flatMap(p => p.hand).sort((a, b) => a - b);
    const unique = new Set(all);
    expect(unique.size).toBe(all.length); // no duplicates introduced
    expect(all.length).toBe(53); // 13*4 + dealer's 14th
  });
});
