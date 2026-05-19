import { describe, expect, it } from 'vitest';
import { createGame, DEFAULT_CONFIG } from '../src/state.js';
import { applyAction } from '../src/actions.js';
import type { GameState } from '../src/state.js';
import type { Seat } from '../src/state.js';
import { suitOf } from '../src/tiles.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a full game to wall exhaustion. Returns the final state. Throws on any rule violation. */
function runToWallEnd(seed: string, voidDiscardRule: 'strict' | 'lenient'): GameState {
  let state = createGame(
    seed,
    [
      { name: 'P0', isBot: true },
      { name: 'P1', isBot: true },
      { name: 'P2', isBot: true },
      { name: 'P3', isBot: true },
    ],
    { ...DEFAULT_CONFIG, enableHuanSanZhang: false, voidDiscardRule },
  );

  // Void declaration: each player picks the suit they have fewest of
  for (let i = 0; i < 4; i++) {
    const seat = i as Seat;
    const player = state.players[seat]!;

    // Count tiles per suit
    const counts: Record<string, number> = { man: 0, pin: 0, sou: 0 };
    for (const t of player.hand) counts[suitOf(t)]!++;

    // Pick suit with fewest tiles
    const voidSuit = (['man', 'pin', 'sou'] as const).reduce((a, b) =>
      (counts[a]! <= counts[b]! ? a : b),
    );

    // Find first tile of that suit (if any)
    const firstDiscard = player.hand.find(t => suitOf(t) === voidSuit) ?? null;

    const r = applyAction(state, { t: 'declareVoid', seat, suit: voidSuit, firstDiscard });
    if (!r.ok) throw new Error(`declareVoid seat ${seat} failed: ${r.reason}`);
    state = r.state;
  }

  expect(state.phase).toBe('play');

  // Play loop: draw then discard until wall exhausted
  let safety = 10_000;
  while (state.phase === 'play') {
    if (--safety <= 0) throw new Error('safety limit reached');

    const seat = state.turn;
    const player = state.players[seat]!;

    // East's first turn: no draw needed (already has 14 tiles)
    const isEastFirstTurn = seat === state.dealer && !state.firstTurnDone[seat];

    if (!isEastFirstTurn) {
      const dr = applyAction(state, { t: 'draw', seat });
      if (!dr.ok) throw new Error(`draw seat ${seat} failed: ${dr.reason}`);
      state = dr.state;
      if (state.phase !== 'play') break; // wall exhausted on draw
    }

    // Discard: pick a void-suit tile first (for clearing), then any tile
    const currentPlayer = state.players[seat]!;
    const voidTiles = currentPlayer.hand.filter(t => suitOf(t) === currentPlayer.voidedSuit);
    const tile = voidTiles.length > 0 ? voidTiles[0]! : currentPlayer.hand[0]!;

    const disc = applyAction(state, { t: 'discard', seat, tile });
    if (!disc.ok) throw new Error(`discard seat ${seat} failed: ${disc.reason} (tile ${tile})`);
    state = disc.state;
  }

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 1 — basic round (no claims, no Hu)', () => {
  it('runs to wall exhaustion under strict mode without rule violations', () => {
    const final = runToWallEnd('phase1-strict', 'strict');
    expect(final.phase).toBe('roundEnd');
  });

  it('runs to wall exhaustion under lenient mode without rule violations', () => {
    const final = runToWallEnd('phase1-lenient', 'lenient');
    expect(final.phase).toBe('roundEnd');
  });

  it('is deterministic: same seed produces same final state', () => {
    const a = runToWallEnd('determinism', 'strict');
    const b = runToWallEnd('determinism', 'strict');
    expect(a.history.length).toBe(b.history.length);
    expect(a.drawIndex).toBe(b.drawIndex);
  });

  it('tile conservation: 108 tiles accounted for at round end', () => {
    const final = runToWallEnd('conservation', 'strict');
    const inHands = final.players.reduce((sum, p) => sum + p.hand.length, 0);
    const inDiscards = final.players.reduce((sum, p) => sum + p.discards.length, 0);
    const inWall = final.wall.length - final.drawIndex;
    expect(inHands + inDiscards + inWall).toBe(108);
  });

  it('all players have a voided suit after void phase', () => {
    const final = runToWallEnd('voidsuits', 'strict');
    for (const p of final.players) {
      expect(p.voidedSuit).not.toBeNull();
    }
  });

  it('strict mode: no player holds void-suit tiles at round end', () => {
    const final = runToWallEnd('strictvoid', 'strict');
    for (const p of final.players) {
      const holdingVoid = p.hand.some(t => suitOf(t) === p.voidedSuit);
      expect(holdingVoid).toBe(false);
    }
  });

  it('createGame with huanSanZhang=false starts in voidDeclare', () => {
    const state = createGame(
      'test',
      [{ name: 'A', isBot: false }, { name: 'B', isBot: false }, { name: 'C', isBot: false }, { name: 'D', isBot: false }],
      { enableHuanSanZhang: false },
    );
    expect(state.phase).toBe('voidDeclare');
  });

  it('createGame with huanSanZhang=true starts in huan', () => {
    const state = createGame(
      'test',
      [{ name: 'A', isBot: false }, { name: 'B', isBot: false }, { name: 'C', isBot: false }, { name: 'D', isBot: false }],
      { enableHuanSanZhang: true },
    );
    expect(state.phase).toBe('huan');
  });

  it('East starts with 14 tiles, others with 13', () => {
    const state = createGame(
      'deal',
      [{ name: 'A', isBot: false }, { name: 'B', isBot: false }, { name: 'C', isBot: false }, { name: 'D', isBot: false }],
      { enableHuanSanZhang: false },
    );
    expect(state.players[0]!.hand).toHaveLength(14);
    expect(state.players[1]!.hand).toHaveLength(13);
    expect(state.players[2]!.hand).toHaveLength(13);
    expect(state.players[3]!.hand).toHaveLength(13);
  });

  it('rejects declareVoid with a tile not in hand', () => {
    const state = createGame(
      'reject',
      [{ name: 'A', isBot: false }, { name: 'B', isBot: false }, { name: 'C', isBot: false }, { name: 'D', isBot: false }],
      { enableHuanSanZhang: false },
    );
    // TileId 0 may or may not be in seat 0's hand — find one that isn't
    const hand = new Set(state.players[0]!.hand);
    const notInHand = Array.from({ length: 108 }, (_, i) => i).find(i => !hand.has(i))!;
    const r = applyAction(state, { t: 'declareVoid', seat: 0, suit: 'man', firstDiscard: notInHand });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('tile_not_in_hand');
  });
});
