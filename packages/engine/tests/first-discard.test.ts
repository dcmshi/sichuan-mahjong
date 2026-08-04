/**
 * A35 / A36 / A37 — the void phase's face-down "first mandatory discard".
 *
 * Per the PDF (Lesson 4, "Forbidden suit"): "each player separates a tile of a
 * forbidden suit from the hand and places it face down in the center in front of
 * him / her; *the same tile is the first mandatory discard of the player*." The
 * separated tile is therefore not a free extra discard — on the player's first
 * turn they draw as usual and flip that tile *instead of* discarding from hand,
 * which is what keeps them at the standard 13 standing tiles.
 */
import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.js';
import { isWinningHand } from '../src/hand.js';
import type { Seat } from '../src/state.js';
import { createGame } from '../src/state.js';
import type { GameState } from '../src/state.js';
import type { TileId } from '../src/tiles.js';
import { suitOf, tileFromType, tileTypeOf } from '../src/tiles.js';
import { projectView } from '../src/views.js';

function newGame(seed: string): GameState {
  return createGame(
    seed,
    [
      { name: 'A', isBot: true },
      { name: 'B', isBot: true },
      { name: 'C', isBot: true },
      { name: 'D', isBot: true },
    ],
    { enableHuanSanZhang: false },
  );
}

/** Declare void for every seat: fewest-count suit, separating a tile when held. */
function declareAllVoid(state: GameState): { state: GameState; separated: boolean[] } {
  const separated: boolean[] = [];
  let s = state;
  for (let i = 0; i < 4; i++) {
    const seat = i as Seat;
    const hand = s.players[seat]!.hand;
    const counts: Record<string, number> = { man: 0, pin: 0, sou: 0 };
    for (const t of hand) counts[suitOf(t)]!++;
    const suit = (['man', 'pin', 'sou'] as const).reduce((a, b) =>
      counts[a]! <= counts[b]! ? a : b,
    );
    const firstDiscard = hand.find(t => suitOf(t) === suit) ?? null;
    separated.push(firstDiscard !== null);
    const r = applyAction(s, { t: 'declareVoid', seat, suit, firstDiscard });
    if (!r.ok) throw new Error(`declareVoid ${seat}: ${r.reason}`);
    s = r.state;
  }
  return { state: s, separated };
}

/**
 * Throw away the tile least connected to the rest of the hand — the easy bot's
 * heuristic, inlined so this test needs no server dependency. A policy that at
 * least tries to win is what makes "someone eventually Hus" a real signal.
 */
function leastConnected(candidates: TileId[], hand: TileId[]): TileId {
  let best = candidates[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const id of candidates) {
    const { suit, rank } = tileFromType(tileTypeOf(id));
    let score = 0;
    for (const other of hand) {
      if (other === id) continue;
      const o = tileFromType(tileTypeOf(other));
      if (o.suit !== suit) continue;
      const dist = Math.abs(o.rank - rank);
      if (dist === 0) score += 3;
      else if (dist === 1) score += 2;
      else if (dist === 2) score += 1;
    }
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/**
 * Play a whole round with a simple policy (Hu when possible, otherwise flip /
 * discard the least useful legal tile) and record, per seat, the largest
 * concealed-tile count ever reached at a decision point.
 */
function playRound(seed: string): {
  final: GameState;
  separated: boolean[];
  maxConcealedAtDecision: number[];
} {
  const { state: start, separated } = declareAllVoid(newGame(seed));
  let state = start;
  const maxConcealedAtDecision = [0, 0, 0, 0];

  let safety = 20_000;
  while (state.phase === 'play') {
    if (--safety <= 0) throw new Error('safety limit reached');

    if (state.pendingClaims !== null) {
      const r = applyAction(state, { t: 'claimWindowExpire' });
      if (!r.ok) throw new Error(`claimWindowExpire: ${r.reason}`);
      state = r.state;
      continue;
    }

    const seat = state.turn;
    const isEastFirstTurn = seat === state.dealer && !state.firstTurnDone[seat];
    if (!isEastFirstTurn && state.turnDrawNeeded) {
      const r = applyAction(state, { t: 'draw', seat });
      if (!r.ok) throw new Error(`draw: ${r.reason}`);
      state = r.state;
      if (state.phase !== 'play') break;
      if (state.pendingClaims !== null) continue;
    }

    const p = state.players[seat]!;
    maxConcealedAtDecision[seat] = Math.max(maxConcealedAtDecision[seat]!, p.hand.length);

    if (isWinningHand(p.hand, p.melds, p.voidedSuit) !== null) {
      const r = applyAction(state, { t: 'declareHuOnDraw', seat });
      if (r.ok) {
        state = r.state;
        if (state.phase !== 'play') break;
        continue;
      }
    }

    if (p.pendingFirstDiscard !== null) {
      const r = applyAction(state, { t: 'flipFirstDiscard', seat });
      if (!r.ok) throw new Error(`flipFirstDiscard: ${r.reason}`);
      state = r.state;
      continue;
    }

    const voidTiles = p.hand.filter(t => suitOf(t) === p.voidedSuit);
    const candidates = p.voidCleared || voidTiles.length === 0 ? p.hand : voidTiles;
    const tile = leastConnected(candidates, p.hand);
    const r = applyAction(state, { t: 'discard', seat, tile });
    if (!r.ok) throw new Error(`discard: ${r.reason}`);
    state = r.state;
  }

  return { final: state, separated, maxConcealedAtDecision };
}

describe('A35 — the separated tile is the first mandatory discard', () => {
  it('holds the separated tile out of the discard pile until it is flipped', () => {
    const { state, separated } = declareAllVoid(newGame('a35-hold'));
    for (let i = 0; i < 4; i++) {
      const p = state.players[i]!;
      if (!separated[i]) continue;
      expect(p.pendingFirstDiscard).not.toBeNull();
      expect(p.discards).toHaveLength(0);
      // The tile left the hand at separation, exactly as at a real table.
      expect(p.hand).not.toContain(p.pendingFirstDiscard);
      expect(p.hand).toHaveLength(i === state.dealer ? 13 : 12);
    }
  });

  it('rejects a hand discard while the face-down tile is still unflipped', () => {
    const { state, separated } = declareAllVoid(newGame('a35-reject'));
    const dealer = state.dealer;
    expect(separated[dealer]).toBe(true); // seed precondition
    const other = state.players[dealer]!.hand.find(
      t => t !== state.players[dealer]!.pendingFirstDiscard,
    )!;
    const r = applyAction(state, { t: 'discard', seat: dealer, tile: other });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('must_flip_first_discard');
  });

  it('the flip is the discard: it lands in the pond and leaves the hand intact', () => {
    const { state, separated } = declareAllVoid(newGame('a35-flip'));
    const dealer = state.dealer;
    expect(separated[dealer]).toBe(true);
    const pending = state.players[dealer]!.pendingFirstDiscard!;
    const handBefore = state.players[dealer]!.hand.length;

    const r = applyAction(state, { t: 'flipFirstDiscard', seat: dealer });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const p = r.state.players[dealer]!;
    expect(p.pendingFirstDiscard).toBeNull();
    expect(p.discards).toEqual([pending]);
    expect(p.hand).toHaveLength(handBefore); // a flip costs no hand tile
    expect(r.state.firstTurnDone[dealer]).toBe(true);
    expect(r.events.some(e => e.e === 'discarded' && e.tile === pending)).toBe(true);
  });

  it('only calls the first discard a void declaration once it is face up', () => {
    const { state, separated } = declareAllVoid(newGame('a35-flip'));
    const dealer = state.dealer;
    expect(separated[dealer]).toBe(true);

    // Face down: the tile is not in `discards` and nothing may point at it, or
    // the suit leaks before the flip makes it public (the A40 failure mode).
    const before = projectView(state, ((dealer + 1) % 4) as Seat);
    expect(before.others.every(o => !o.firstDiscardIsVoid)).toBe(true);

    const r = applyAction(state, { t: 'flipFirstDiscard', seat: dealer });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Face up: every seat sees it, including the one that flipped it.
    for (const viewer of [0, 1, 2, 3] as Seat[]) {
      const v = projectView(r.state, viewer);
      const them = viewer === dealer ? v.you : v.others.find(o => o.seat === dealer)!;
      expect(them.firstDiscardIsVoid).toBe(true);
      expect(them.discards[0]).toBe(r.state.players[dealer]!.discards[0]);
    }
  });

  it('never says that of an indicator user, who separated nothing', () => {
    const { state, separated } = declareAllVoid(newGame('a35-flip'));
    const indicator = ([0, 1, 2, 3] as Seat[]).find(s => !separated[s]);
    if (indicator === undefined) return; // this seed separated for everyone
    expect(state.players[indicator]!.usedIndicator).toBe(true);
    const v = projectView(state, indicator);
    expect(v.you.firstDiscardIsVoid).toBe(false);
  });

  it('stops calling it a void declaration once the tile is claimed away', () => {
    // The bug: `firstDiscardIsVoid` was "this seat separated a tile and their
    // pond is non-empty", which points at `discards[0]` whatever that is. A
    // claimed discard is spliced out of its owner's pond (takeClaimedDiscard,
    // A15) — so a punged declaration promoted the seat's *second* discard into
    // their public declaration, and the client rings it, for the rest of the
    // round. Simulated here rather than played out: reaching a real claim on the
    // very first flip needs a seed that offers one, and the view derivation is
    // what is under test.
    const { state, separated } = declareAllVoid(newGame('a35-flip'));
    const dealer = state.dealer;
    expect(separated[dealer]).toBe(true);

    const flipped = applyAction(state, { t: 'flipFirstDiscard', seat: dealer });
    expect(flipped.ok).toBe(true);
    if (!flipped.ok) return;
    const s = flipped.state;
    const declared = s.players[dealer]!.discards[0]!;
    expect(s.players[dealer]!.voidDiscardTile).toBe(declared);
    expect(projectView(s, dealer).you.firstDiscardIsVoid).toBe(true);

    // Someone claims it, and this seat later throws something else.
    s.players[dealer]!.discards = [];
    expect(projectView(s, dealer).you.firstDiscardIsVoid).toBe(false);

    const other = s.players[dealer]!.hand[0]!;
    s.players[dealer]!.discards = [other];
    expect(other).not.toBe(declared);
    expect(projectView(s, dealer).you.firstDiscardIsVoid).toBe(false);

    // And every other seat is told the same thing about them.
    for (const viewer of [0, 1, 2, 3] as Seat[]) {
      if (viewer === dealer) continue;
      const them = projectView(s, viewer).others.find(o => o.seat === dealer)!;
      expect(them.firstDiscardIsVoid).toBe(false);
    }
  });

  it('flipFirstDiscard is rejected when nothing is pending', () => {
    const { state } = declareAllVoid(newGame('a35-nothing'));
    const flipped = applyAction(state, { t: 'flipFirstDiscard', seat: state.dealer });
    expect(flipped.ok).toBe(true);
    if (!flipped.ok) return;
    // Same seat, already flipped (and no longer their turn either).
    const again = applyAction(flipped.state, { t: 'flipFirstDiscard', seat: state.dealer });
    expect(again.ok).toBe(false);
  });

  it('players who separated a tile still reach 14 tiles and can win', () => {
    // The regression: applyVoidResolution used to charge the separation *and* a
    // normal hand discard, permanently pinning those players one tile short of
    // the 14 that isWinningHand requires — only indicator users could ever Hu.
    let separatedHus = 0;
    let indicatorHus = 0;
    for (let g = 0; g < 30; g++) {
      const { final, separated, maxConcealedAtDecision } = playRound(`a35-round-${g}`);
      for (let i = 0; i < 4; i++) {
        const p = final.players[i]!;
        const needed = 14 - p.melds.length * 3;
        if (separated[i]) {
          expect(maxConcealedAtDecision[i]).toBeGreaterThanOrEqual(needed);
        }
        if (p.status === 'hu') {
          if (separated[i]) separatedHus++;
          else indicatorHus++;
        }
      }
    }
    // Indicator users are rare (they need a whole suit missing), so essentially
    // every win in a 30-round sample must come from a separated-tile player.
    expect(separatedHus).toBeGreaterThan(0);
    expect(separatedHus + indicatorHus).toBeGreaterThan(0);
  });

  it('wall-end readiness is computable again', () => {
    // Second-order fallout of the same bug: isTenpai needs 13 − 3·melds tiles, so
    // with everyone pinned at 12 no player was ever "ready" at wall end — the
    // bu-ting payouts were structurally always zero and every kong got the
    // wall-end blanket refund.
    let readyPlayers = 0;
    for (let g = 0; g < 30; g++) {
      const { final } = playRound(`a35-ready-${g}`);
      readyPlayers += final.players.filter(p => p.status !== 'hu' && p.isReady).length;
    }
    expect(readyPlayers).toBeGreaterThan(0);
  });

  it('tile conservation holds across a full round', () => {
    const { final } = playRound('a35-conservation');
    const inHands = final.players.reduce((n, p) => n + p.hand.length, 0);
    const inDiscards = final.players.reduce((n, p) => n + p.discards.length, 0);
    const inMelds = final.players.reduce(
      (n, p) => n + p.melds.reduce((m, meld) => m + (meld.kind === 'kong' ? 4 : 3), 0),
      0,
    );
    const pending = final.players.reduce((n, p) => n + (p.pendingFirstDiscard === null ? 0 : 1), 0);
    const inWall = final.wall.length - final.drawIndex;
    expect(inHands + inDiscards + inMelds + pending + inWall).toBe(108);
  });
});

describe('A36 — the indicator requires an actually void-free hand', () => {
  it('rejects firstDiscard: null while the hand holds the declared suit', () => {
    const state = newGame('a36');
    const hand = state.players[0]!.hand;
    const held = (['man', 'pin', 'sou'] as const).find(s => hand.some(t => suitOf(t) === s))!;
    // A crafted frame: claim the indicator while still holding the suit. Without
    // the guard this sets usedIndicator and keeps a tile that should have been
    // separated — a free extra tile for the whole round, plus false
    // Heavenly/Earthly eligibility.
    const r = applyAction(state, { t: 'declareVoid', seat: 0, suit: held, firstDiscard: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('void_indicator_not_allowed');
    expect(state.pendingVoid[0]).toBeNull();
  });

  it('accepts firstDiscard: null when the hand genuinely lacks the suit', () => {
    const state = newGame('a36-ok');
    const hand = state.players[0]!.hand;
    const missing = (['man', 'pin', 'sou'] as const).find(s => !hand.some(t => suitOf(t) === s));
    if (missing === undefined) return; // seed has all three suits; nothing to assert
    const r = applyAction(state, { t: 'declareVoid', seat: 0, suit: missing, firstDiscard: null });
    expect(r.ok).toBe(true);
  });
});

describe('A37 — the face-down tile is not public until it is flipped', () => {
  it('opponents see only that a tile is pending, never which tile', () => {
    const { state, separated } = declareAllVoid(newGame('a37'));
    const dealer = state.dealer;
    expect(separated[dealer]).toBe(true);
    const pending = state.players[dealer]!.pendingFirstDiscard!;

    const viewer = ((dealer + 1) % 4) as Seat;
    const view = projectView(state, viewer);
    const them = view.others.find(o => o.seat === dealer)!;
    expect(them.pendingFirstDiscard).toBe(true);
    expect(them.discards).not.toContain(pending);

    // Its owner does see it — they chose it, and it survives a reconnect.
    const own = projectView(state, dealer);
    expect(own.you.pendingFirstDiscardTile).toBe(pending);

    // After the flip it is public, like any other discard.
    const flipped = applyAction(state, { t: 'flipFirstDiscard', seat: dealer });
    expect(flipped.ok).toBe(true);
    if (!flipped.ok) return;
    const after = projectView(flipped.state, viewer).others.find(o => o.seat === dealer)!;
    expect(after.pendingFirstDiscard).toBe(false);
    expect(after.discards).toContain(pending);
  });
});
