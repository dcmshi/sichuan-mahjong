/**
 * Replay corpus — one scenario per fan combination + penalty paths.
 *
 * Each test builds a minimal synthetic state, drives it through applyAction,
 * and asserts the exact fans emitted in the `hu` event record plus the
 * correct payment amounts. This locks in scoring + payment regressions
 * across all 10 fan types: Kong, Root, AllPungs, GoldenWait, FullFlush,
 * SevenPairs, WinAfterKong, ShootAfterKong, RobbingTheKong, UnderTheSea.
 *
 * Penalty paths: VoidPenalty (lenient wall-end) with and without the
 * all-void-discards carve-out.
 */
import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.js';
import type { GameEvent } from '../src/actions.js';
import type { Meld } from '../src/melds.js';
import { DEFAULT_CONFIG } from '../src/state.js';
import type { GameState, Seat } from '../src/state.js';
import type { TileId } from '../src/tiles.js';
import { suitOf, tileFromType } from '../src/tiles.js';

// ── Tile helpers ──────────────────────────────────────────────────────────────
const M = (r: number): number => r - 1; // man: types 0-8
const P = (r: number): number => 9 + r - 1; // pin: types 9-17
const S = (r: number): number => 18 + r - 1; // sou: types 18-26
function tid(type: number, copy: 0 | 1 | 2 | 3 = 0): TileId {
  return (type * 4 + copy) as TileId;
}

// ── State builder ─────────────────────────────────────────────────────────────
function makeState(opts: {
  hands?: TileId[][];
  melds?: Meld[][];
  discards?: TileId[][];
  turn?: Seat;
  turnDrawNeeded?: boolean;
  drewThisTurn?: boolean;
  lastDrawnTile?: TileId | null;
  lastDrawWasKongReplacement?: boolean;
  wallEndReached?: boolean;
  lastDiscard?: GameState['lastDiscard'];
  config?: Partial<typeof DEFAULT_CONFIG>;
  voidedSuit?: 'man' | 'pin' | 'sou';
}): GameState {
  const wall = Array.from({ length: 108 }, (_, i) => i) as TileId[];
  const cfg = { ...DEFAULT_CONFIG, enableHuanSanZhang: false, ...opts.config };
  const vs = opts.voidedSuit ?? 'sou';

  return {
    config: cfg,
    phase: 'play',
    seed: 'replay',
    wall,
    drawIndex: 53,
    kongDrawIndex: 107,
    players: ([0, 1, 2, 3] as Seat[]).map(i => ({
      seat: i,
      name: `P${i}`,
      isBot: false,
      hand: opts.hands?.[i] ?? [],
      melds: opts.melds?.[i] ?? [],
      discards: opts.discards?.[i] ?? [],
      firstDiscardFaceDown: false,
      voidedSuit: vs as 'man' | 'pin' | 'sou',
      usedIndicator: false,
      voidCleared: true,
      status: 'playing' as const,
      hu: null,
      isReady: false,
      scoreDelta: 0,
      furiten: null,
    })) as GameState['players'],
    dealer: 0,
    turn: opts.turn ?? 0,
    turnNumber: 10,
    firstTurnDone: [true, true, true, true],
    lastDiscard: opts.lastDiscard ?? null,
    lastDrawWasKongReplacement: opts.lastDrawWasKongReplacement ?? false,
    lastDrawnTile: opts.lastDrawnTile ?? null,
    turnDrawNeeded: opts.turnDrawNeeded ?? false,
    // Synthetic self-draw scenarios represent a player who just drew (or took a
    // kong replacement); default accordingly unless a draw is still pending.
    drewThisTurn: opts.drewThisTurn ?? !(opts.turnDrawNeeded ?? false),
    wallEndReached: opts.wallEndReached ?? false,
    anyClaimsHappened: true,
    pendingClaims: null,
    pendingKongTile: null,
    pendingHuan: [null, null, null, null],
    pendingVoid: [null, null, null, null],
    penaltyPot: 0,
    kongPaymentLog: [],
    nextKongSeq: 0,
    huOrder: [],
    nextDealer: 0,
    history: [],
    startedAt: 0,
  };
}

// ── Self-draw Hu helper ───────────────────────────────────────────────────────
function huOk(state: GameState, seat: Seat = 0): { events: GameEvent[]; state: GameState } {
  const r = applyAction(state, { t: 'declareHuOnDraw', seat });
  if (!r.ok) throw new Error(`declareHuOnDraw failed: ${r.reason}`);
  return r;
}

function huRecord(events: GameEvent[]) {
  const e = events.find(ev => ev.e === 'hu') as
    | { e: 'hu'; record: { fans: string[]; handValue: number } }
    | undefined;
  if (!e) throw new Error('no hu event found');
  return e.record;
}

function paymentAmounts(events: GameEvent[], to: Seat) {
  return events
    .filter(
      (ev): ev is { e: 'huPayment'; from: Seat; to: Seat; amount: number } =>
        ev.e === 'huPayment' && (ev as { to: Seat }).to === to,
    )
    .map(ev => ev.amount);
}

// ── Fan combination scenarios (self-draw Hu) ──────────────────────────────────

describe('Replay corpus — structural fans via declareHuOnDraw', () => {
  // AllPungs: mixed suit, winning tile completes a pung (not the pair) → no GoldenWait
  it('AllPungs (1 fan, 2 pts): mixed-suit all-pung hand', () => {
    // 3 complete pungs + M4-pung completing on draw + M5-pair
    const hand: TileId[] = [
      tid(M(1), 0),
      tid(M(1), 1),
      tid(M(1), 2), // M1 pung
      tid(P(2), 0),
      tid(P(2), 1),
      tid(P(2), 2), // P2 pung
      tid(P(3), 0),
      tid(P(3), 1),
      tid(P(3), 2), // P3 pung
      tid(M(4), 0),
      tid(M(4), 1),
      tid(M(4), 2), // M4 pung (3rd = win tile)
      tid(M(5), 0),
      tid(M(5), 1), // M5 pair
    ];
    const winTile = tid(M(4), 2);
    const state = makeState({ hands: [hand, [], [], []], lastDrawnTile: winTile });

    const { events, state: s } = huOk(state);
    const rec = huRecord(events);

    expect(rec.fans).toContain('AllPungs');
    expect(rec.fans).not.toContain('GoldenWait');
    expect(rec.fans).not.toContain('FullFlush');
    expect(rec.handValue).toBe(2); // 1 fan → 2^1

    // Self-draw: each of 3 opponents pays (handValue + 1) = 3
    const amounts = paymentAmounts(events, 0);
    expect(amounts).toHaveLength(3);
    expect(amounts.every(a => a === 3)).toBe(true);
    expect(s.players[0]!.scoreDelta).toBe(9); // +3×3
  });

  // AllPungs + GoldenWait: winning tile completes the pair
  it('AllPungs + GoldenWait (2 fan, 4 pts): win on pair tile', () => {
    const hand: TileId[] = [
      tid(M(1), 0),
      tid(M(1), 1),
      tid(M(1), 2),
      tid(P(2), 0),
      tid(P(2), 1),
      tid(P(2), 2),
      tid(P(3), 0),
      tid(P(3), 1),
      tid(P(3), 2),
      tid(M(4), 0),
      tid(M(4), 1),
      tid(M(4), 2),
      tid(M(5), 0),
      tid(M(5), 1), // win on M5 pair
    ];
    const winTile = tid(M(5), 1); // pair tile
    const state = makeState({ hands: [hand, [], [], []], lastDrawnTile: winTile });

    const { events, state: s } = huOk(state);
    const rec = huRecord(events);

    expect(rec.fans).toContain('AllPungs');
    expect(rec.fans).toContain('GoldenWait');
    expect(rec.handValue).toBe(4); // 2 fan → 2^2

    const amounts = paymentAmounts(events, 0);
    expect(amounts.every(a => a === 5)).toBe(true); // handValue+1 = 5
    expect(s.players[0]!.scoreDelta).toBe(15); // +3×5
  });

  // AllPungs + FullFlush: all same suit → 3 fan (hits cap)
  it('AllPungs + FullFlush (3 fan cap, 8 pts): all-man all-pung hand', () => {
    const hand: TileId[] = [
      tid(M(1), 0),
      tid(M(1), 1),
      tid(M(1), 2),
      tid(M(2), 0),
      tid(M(2), 1),
      tid(M(2), 2),
      tid(M(3), 0),
      tid(M(3), 1),
      tid(M(3), 2),
      tid(M(4), 0),
      tid(M(4), 1),
      tid(M(4), 2), // win tile completes pung
      tid(M(5), 0),
      tid(M(5), 1),
    ];
    const winTile = tid(M(4), 2);
    const state = makeState({ hands: [hand, [], [], []], lastDrawnTile: winTile });

    const { events, state: s } = huOk(state);
    const rec = huRecord(events);

    expect(rec.fans).toContain('AllPungs');
    expect(rec.fans).toContain('FullFlush');
    expect(rec.handValue).toBe(8); // capped at 3 fan → 2^3

    const amounts = paymentAmounts(events, 0);
    expect(amounts.every(a => a === 9)).toBe(true); // 8+1
    expect(s.players[0]!.scoreDelta).toBe(27); // 3×9
  });

  // SevenPairs: 7 distinct pairs, mixed suit → 2 fan
  it('SevenPairs (2 fan, 4 pts): 7 distinct pairs', () => {
    const hand: TileId[] = [
      tid(M(1), 0),
      tid(M(1), 1),
      tid(P(2), 0),
      tid(P(2), 1),
      tid(P(3), 0),
      tid(P(3), 1),
      tid(M(4), 0),
      tid(M(4), 1),
      tid(M(5), 0),
      tid(M(5), 1),
      tid(P(4), 0),
      tid(P(4), 1),
      tid(M(6), 0),
      tid(M(6), 1), // winning pair
    ];
    const winTile = tid(M(6), 1);
    const state = makeState({ hands: [hand, [], [], []], lastDrawnTile: winTile });

    const { events, state: s } = huOk(state);
    const rec = huRecord(events);

    expect(rec.fans).toContain('SevenPairs');
    expect(rec.fans).not.toContain('AllPungs');
    expect(rec.handValue).toBe(4); // 2 fan

    const amounts = paymentAmounts(events, 0);
    expect(amounts.every(a => a === 5)).toBe(true);
    expect(s.players[0]!.scoreDelta).toBe(15);
  });

  // SevenPairs + FullFlush: all same suit → 4 fan, capped → 8 pts
  it('SevenPairs + FullFlush (4 fan → cap, 8 pts): all-man seven pairs', () => {
    const hand: TileId[] = [
      tid(M(1), 0),
      tid(M(1), 1),
      tid(M(2), 0),
      tid(M(2), 1),
      tid(M(3), 0),
      tid(M(3), 1),
      tid(M(4), 0),
      tid(M(4), 1),
      tid(M(5), 0),
      tid(M(5), 1),
      tid(M(6), 0),
      tid(M(6), 1),
      tid(M(7), 0),
      tid(M(7), 1),
    ];
    const winTile = tid(M(7), 1);
    const state = makeState({ hands: [hand, [], [], []], lastDrawnTile: winTile });

    const { events } = huOk(state);
    const rec = huRecord(events);

    expect(rec.fans).toContain('SevenPairs');
    expect(rec.fans).toContain('FullFlush');
    expect(rec.handValue).toBe(8); // 4 fan capped at 3 → 2^3
  });

  // SevenPairs + Root: one tile appears 4× among the pairs → Root fires
  it('SevenPairs + Root (3 fan, 8 pts): quadruple pair', () => {
    const hand: TileId[] = [
      tid(M(1), 0),
      tid(M(1), 1),
      tid(M(1), 2),
      tid(M(1), 3), // M1×4 (Root)
      tid(P(2), 0),
      tid(P(2), 1),
      tid(P(3), 0),
      tid(P(3), 1),
      tid(M(4), 0),
      tid(M(4), 1),
      tid(M(5), 0),
      tid(M(5), 1),
      tid(M(6), 0),
      tid(M(6), 1),
    ];
    const winTile = tid(M(6), 1);
    const state = makeState({ hands: [hand, [], [], []], lastDrawnTile: winTile });

    const { events } = huOk(state);
    const rec = huRecord(events);

    expect(rec.fans).toContain('SevenPairs');
    expect(rec.fans).toContain('Root');
    expect(rec.handValue).toBe(8); // SevenPairs(2) + Root(1) = 3 fan → 2^3
  });

  // Kong fan: 1 exposed kong meld + 3 pungs + pair in hand
  it('Kong(1) + AllPungs (2 fan, 4 pts): one exposed kong', () => {
    const kongMeld: Meld = {
      kind: 'kong',
      tile: tileFromType(M(1)),
      subtype: 'exposed',
      claimedFrom: 1,
      turnDeclared: 5,
    };
    // 11 tiles forming 3 pungs + 1 pair (mixed suit → no FullFlush)
    const hand: TileId[] = [
      tid(P(2), 0),
      tid(P(2), 1),
      tid(P(2), 2),
      tid(P(3), 0),
      tid(P(3), 1),
      tid(P(3), 2),
      tid(P(4), 0),
      tid(P(4), 1),
      tid(P(4), 2), // win tile completes pung
      tid(M(5), 0),
      tid(M(5), 1), // pair (different suit → no FullFlush)
    ];
    const winTile = tid(P(4), 2);
    const state = makeState({
      hands: [hand, [], [], []],
      melds: [[kongMeld], [], [], []],
      lastDrawnTile: winTile,
    });

    const { events } = huOk(state);
    const rec = huRecord(events);

    expect(rec.fans).toContain('Kong');
    expect(rec.fans).toContain('AllPungs');
    expect(rec.fans).not.toContain('FullFlush');
    expect(rec.handValue).toBe(4); // Kong(1) + AllPungs(1) = 2 fan → 2^2
  });
});

// ── Contextual fan scenarios ──────────────────────────────────────────────────

describe('Replay corpus — contextual fans', () => {
  // WinAfterKong: win on a kong replacement draw
  it('WinAfterKong + AllPungs (2 fan, 4 pts): win on replacement tile', () => {
    const hand: TileId[] = [
      tid(M(1), 0),
      tid(M(1), 1),
      tid(M(1), 2),
      tid(P(2), 0),
      tid(P(2), 1),
      tid(P(2), 2),
      tid(P(3), 0),
      tid(P(3), 1),
      tid(P(3), 2),
      tid(M(4), 0),
      tid(M(4), 1),
      tid(M(4), 2),
      tid(M(5), 0),
      tid(M(5), 1),
    ];
    const winTile = tid(M(4), 2);
    const state = makeState({
      hands: [hand, [], [], []],
      lastDrawnTile: winTile,
      lastDrawWasKongReplacement: true, // ← the key flag
    });

    const { events } = huOk(state);
    const rec = huRecord(events);

    expect(rec.fans).toContain('WinAfterKong');
    expect(rec.fans).toContain('AllPungs');
    expect(rec.handValue).toBe(4); // WinAfterKong(1) + AllPungs(1) = 2 fan
  });

  // UnderTheSea: win on the very last tile (wallEndReached=true + self-draw)
  it('UnderTheSea + AllPungs (2 fan, 4 pts): win on last tile of wall', () => {
    const hand: TileId[] = [
      tid(M(1), 0),
      tid(M(1), 1),
      tid(M(1), 2),
      tid(P(2), 0),
      tid(P(2), 1),
      tid(P(2), 2),
      tid(P(3), 0),
      tid(P(3), 1),
      tid(P(3), 2),
      tid(M(4), 0),
      tid(M(4), 1),
      tid(M(4), 2),
      tid(M(5), 0),
      tid(M(5), 1),
    ];
    const winTile = tid(M(4), 2);
    const state = makeState({
      hands: [hand, [], [], []],
      lastDrawnTile: winTile,
      wallEndReached: true, // ← the key flag
    });

    const { events } = huOk(state);
    const rec = huRecord(events);

    expect(rec.fans).toContain('UnderTheSea');
    expect(rec.fans).toContain('AllPungs');
    expect(rec.handValue).toBe(4); // UnderTheSea(1) + AllPungs(1) = 2 fan
  });

  // ShootAfterKong: Hu off a discard made right after the discarder declared a kong
  it('ShootAfterKong + AllPungs + GoldenWait (3 fan, 8 pts): Hu off post-kong discard', () => {
    // P0 just got a kong replacement (lastDrawWasKongReplacement=true) and discards M9.
    // P1 is tenpai on M9 with a pair wait → AllPungs + GoldenWait + ShootAfterKong = 3 fan.
    const discardTile = tid(M(9), 0);
    const p1Hand: TileId[] = [
      tid(M(1), 0),
      tid(M(1), 1),
      tid(M(1), 2),
      tid(P(2), 0),
      tid(P(2), 1),
      tid(P(2), 2),
      tid(P(3), 0),
      tid(P(3), 1),
      tid(P(3), 2),
      tid(M(4), 0),
      tid(M(4), 1),
      tid(M(4), 2),
      tid(M(9), 1), // pair wait on M9
    ];
    const p0Hand: TileId[] = [discardTile, tid(M(2), 0), tid(M(3), 0)];

    let state = makeState({
      hands: [p0Hand, p1Hand, [], []],
      turn: 0,
      lastDrawWasKongReplacement: true, // P0's "draw" was a kong replacement
    });

    // P0 discards → lastDiscard.afterKong = true since lastDrawWasKongReplacement=true
    let r = applyAction(state, { t: 'discard', seat: 0, tile: discardTile });
    expect(r.ok).toBe(true);
    state = (r as { ok: true; state: GameState }).state;
    expect(state.lastDiscard!.afterKong).toBe(true);
    expect(state.pendingClaims).not.toBeNull();

    // P1 claims Hu; P2 and P3 are auto-passed (empty hands)
    r = applyAction(state, { t: 'claim', seat: 1, claim: { kind: 'hu' } });
    expect(r.ok).toBe(true);
    const events = (r as { ok: true; events: GameEvent[] }).events;

    const rec = huRecord(events);
    expect(rec.fans).toContain('ShootAfterKong');
    expect(rec.fans).toContain('AllPungs');
    expect(rec.fans).toContain('GoldenWait');
    expect(rec.handValue).toBe(8); // ShootAfterKong(1) + AllPungs(1) + GoldenWait(1) = 3 fan

    // Discard Hu: only discarder (P0) pays
    const pmts = paymentAmounts(events, 1);
    expect(pmts).toHaveLength(1);
    expect(pmts[0]).toBe(8);
  });

  // RobbingTheKong: Hu by claiming a promoted kong tile
  // Note: RobbingTheKong is incompatible with AllPungs per the scoring table (PDF Table 9),
  // so the hand must contain a chow for RobbingTheKong to apply.
  it('RobbingTheKong (1 fan, 2 pts): rob a promoted kong with chow hand', () => {
    const pungMeld: Meld = {
      kind: 'pung',
      tile: tileFromType(M(3)),
      concealed: false,
      claimedFrom: 3,
    };
    const p0Hand: TileId[] = [
      tid(M(3), 3), // the 4th M3 — will be used to promote pung to kong
      tid(P(1), 0),
      tid(P(2), 0),
      tid(P(3), 0),
      tid(P(4), 0),
      tid(P(5), 0),
      tid(P(6), 0),
      tid(P(7), 0),
      tid(P(8), 0),
      tid(P(9), 0),
      tid(M(2), 0),
    ];
    // P1 tenpai on M3 (chow wait: M1-M2-[M3]) — will rob
    // Has a chow so AllPungs does NOT apply, allowing RobbingTheKong to fire.
    const p1Hand: TileId[] = [
      tid(M(1), 1),
      tid(M(2), 1), // chow wait with M3
      tid(P(1), 1),
      tid(P(1), 2),
      tid(P(1), 3), // pung
      tid(P(4), 1),
      tid(P(4), 2),
      tid(P(4), 3), // pung
      tid(M(5), 1),
      tid(M(5), 2),
      tid(M(5), 3), // pung
      tid(M(7), 1),
      tid(M(7), 2), // pair
    ];

    let state = makeState({
      hands: [p0Hand, p1Hand, [], []],
      melds: [[pungMeld], [], [], []],
      lastDrawnTile: tid(M(3), 3),
    });

    // P0 promotes pung → kong — opens robbing window
    let r = applyAction(state, {
      t: 'declareKongOnTurn',
      seat: 0,
      tile: tileFromType(M(3)),
      subtype: 'promoted',
    });
    expect(r.ok).toBe(true);
    state = (r as { ok: true; state: GameState }).state;
    expect(state.pendingClaims).not.toBeNull(); // robbing window open

    // P1 robs (P2, P3 auto-passed)
    r = applyAction(state, { t: 'claim', seat: 1, claim: { kind: 'hu' } });
    expect(r.ok).toBe(true);
    const events = (r as { ok: true; events: GameEvent[] }).events;

    const rec = huRecord(events);
    expect(rec.fans).toContain('RobbingTheKong');
    expect(rec.fans).not.toContain('AllPungs'); // incompatible with RobbingTheKong
    expect(rec.handValue).toBe(2); // RobbingTheKong(1) = 1 fan = 2 pts
  });
});

// ── Penalty path scenarios ────────────────────────────────────────────────────

describe('Replay corpus — penalty paths', () => {
  // VoidPenalty (lenient mode): holding void tiles at wall end incurs 48-pt deduction
  it('VoidPenalty (lenient): player holding void tiles at wall end pays 48 pts', () => {
    // P0 has sou tiles (voided suit) in hand at wall end + a non-sou discard history
    const souTile = tid(S(1), 0);
    const p0Hand: TileId[] = [
      souTile, // void tile still in hand at wall end
      tid(M(2), 0),
      tid(M(3), 0), // will discard one of these
    ];
    const discardTile = tid(M(2), 0);

    const state = makeState({
      hands: [p0Hand, [], [], []],
      voidedSuit: 'sou',
      wallEndReached: true,
      config: { voidDiscardRule: 'lenient' },
    });
    // Give P0 a non-void discard history (so carve-out doesn't apply)
    state.players[0]!.discards = [tid(M(8), 0)]; // one man discard

    const r = applyAction(state, { t: 'discard', seat: 0, tile: discardTile });
    expect(r.ok).toBe(true);
    const events = (r as { ok: true; events: GameEvent[] }).events;
    const finalState = (r as { ok: true; state: GameState }).state;

    expect(finalState.phase).toBe('roundEnd');
    const penaltyEvent = events.find(ev => ev.e === 'voidPenalty');
    expect(penaltyEvent).toBeDefined();
    expect((penaltyEvent as { seat: number; amount: number }).seat).toBe(0);
    expect((penaltyEvent as { amount: number }).amount).toBe(48);

    expect(finalState.players[0]!.scoreDelta).toBe(-48);
    expect(finalState.penaltyPot).toBe(48);
    // Balance: total + penaltyPot = 0 (non-redistributive penalty)
    const totalDelta = finalState.players.reduce((s, p) => s + p.scoreDelta, 0);
    expect(totalDelta + finalState.penaltyPot).toBe(0);
  });

  // VoidPenalty carve-out: if EVERY discard was void-suit, no penalty
  it('VoidPenalty carve-out: all-void discards waive the penalty', () => {
    // P0 has S1 and S4 in hand (voided suit = sou). Prior discards and the current
    // discard are all sou → player was faithfully clearing void tiles → carve-out.
    // S1 stays in hand after discarding S4, triggering the penalty condition, but
    // the carve-out (all discards were sou) should suppress it.
    const p0Hand: TileId[] = [tid(S(1), 0), tid(S(4), 0), tid(M(2), 0)];

    const state = makeState({
      hands: [p0Hand, [], [], []],
      voidedSuit: 'sou',
      wallEndReached: true,
      config: { voidDiscardRule: 'lenient' },
    });
    // All prior discards were sou tiles
    state.players[0]!.discards = [tid(S(2), 0), tid(S(3), 0)];

    // Discard S4 (also sou) → hand = [S1, M2], still holds void tile
    const r = applyAction(state, { t: 'discard', seat: 0, tile: tid(S(4), 0) });
    expect(r.ok).toBe(true);
    const events = (r as { ok: true; events: GameEvent[] }).events;

    expect(events.find(ev => ev.e === 'voidPenalty')).toBeUndefined();
    expect((r as { ok: true; state: GameState }).state.penaltyPot).toBe(0);
  });

  // VoidPenalty strict mode: the same hand at wall end does NOT incur the penalty
  it('VoidPenalty: strict mode never fires void penalty', () => {
    const souTile = tid(S(1), 0);
    const p0Hand: TileId[] = [souTile, tid(M(2), 0), tid(M(3), 0)];

    const state = makeState({
      hands: [p0Hand, [], [], []],
      voidedSuit: 'sou',
      wallEndReached: true,
      config: { voidDiscardRule: 'strict' },
    });
    state.players[0]!.discards = [tid(M(8), 0)];

    const r = applyAction(state, { t: 'discard', seat: 0, tile: tid(M(2), 0) });
    expect(r.ok).toBe(true);
    const events = (r as { ok: true; events: GameEvent[] }).events;

    expect(events.find(ev => ev.e === 'voidPenalty')).toBeUndefined();
  });
});
