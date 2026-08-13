import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.js';
import { findAllWinningShapes } from '../src/hand.js';
import type { Meld } from '../src/melds.js';
import { COMPATIBILITY, calcHandScore } from '../src/scoring.js';
import type { FanType, HuSubtype } from '../src/scoring.js';
import { DEFAULT_CONFIG, createGame } from '../src/state.js';
import type { GameState, PlayerInit, Seat } from '../src/state.js';
import type { TileId, TileType } from '../src/tiles.js';

const PLAYERS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'A', isBot: false },
  { name: 'B', isBot: false },
  { name: 'C', isBot: false },
  { name: 'D', isBot: false },
];

/**
 * Worked scoring cases, written so a human can check them against another source.
 *
 * Filed alongside N21 — a player reported a hand scored wrong, and the fastest
 * way to settle that is a list of hands with their fan and their points spelled
 * out, rather than an assertion that some internal predicate fired. Each case
 * below states the hand in readable form, the fan it should earn, and the money
 * that changes hands, so a disagreement can be pointed at a specific line.
 *
 * Where our reading is a *choice* rather than a derivation, the test says so in
 * a comment. Those comments are the shortlist N21 should check first.
 */

const tid = (type: TileType, copy: 0 | 1 | 2 | 3 = 0): TileId => (type * 4 + copy) as TileId;
const M = (r: number): TileType => r - 1;
const P = (r: number): TileType => 9 + r - 1;
const S = (r: number): TileType => 18 + r - 1;

/** n copies of a type, as tile ids. */
const copies = (type: TileType, n: number): TileId[] =>
  Array.from({ length: n }, (_, i) => tid(type, i as 0 | 1 | 2 | 3));
const pung = (type: TileType) => copies(type, 3);
const pair = (type: TileType) => copies(type, 2);
const chow = (type: TileType) => [tid(type), tid(type + 1), tid(type + 2)];

const FC = DEFAULT_CONFIG.fanCap;

function score(
  tiles: TileId[],
  melds: Meld[],
  winningTile: TileId,
  subtype: HuSubtype = 'normal',
  voided: 'man' | 'pin' | 'sou' = 'sou',
) {
  return calcHandScore(tiles, melds, voided, winningTile, subtype, FC, true);
}

const fansOf = (s: { fans: { fan: FanType; count: number }[] }) =>
  Object.fromEntries(s.fans.map(f => [f.fan, f.count]));

describe('worked hands — fan and points', () => {
  it('a plain chow hand scores nothing and pays the base point', () => {
    // man 123 / man 456 / pin 234 / pin 678 / pair pin 9. Two suits, chows
    // present, no kong: none of the ten fan apply.
    const tiles = [...chow(M(1)), ...chow(M(4)), ...chow(P(2)), ...chow(P(6)), ...pair(P(9))];
    // Asserted first, because a hand that does not win at all also scores no fan
    // and one point — so without this the test below would pass for the wrong
    // reason, which is how N15's browser check passed vacuously.
    expect(findAllWinningShapes(tiles, [], 'sou').length).toBeGreaterThan(0);
    const s = score(tiles, [], tid(M(1)));
    expect(s.fans).toEqual([]);
    expect(s.totalFan).toBe(0);
    // 2^0. A fan-less win is still worth a point, which is what makes the
    // self-draw "+1" below visible rather than a rounding detail.
    expect(s.handValue).toBe(1);
  });

  it('all pungs alone is 1 fan → 2 points', () => {
    const tiles = [...pung(M(1)), ...pung(M(4)), ...pung(P(2)), ...pung(P(7)), ...pair(P(9))];
    // Won on a pung tile, not the pair, so this is All Pungs without Golden Wait.
    const s = score(tiles, [], tid(M(1), 2));
    expect(fansOf(s)).toEqual({ AllPungs: 1 });
    expect(s.handValue).toBe(2);
  });

  it('all pungs won on the pair adds Golden Wait → 2 fan, 4 points', () => {
    const tiles = [...pung(M(1)), ...pung(M(4)), ...pung(P(2)), ...pung(P(7)), ...pair(P(9))];
    const s = score(tiles, [], tid(P(9), 1));
    expect(fansOf(s)).toEqual({ AllPungs: 1, GoldenWait: 1 });
    expect(s.handValue).toBe(4);
  });

  it('full flush alone is 2 fan → 4 points', () => {
    const tiles = [...chow(M(1)), ...chow(M(4)), ...chow(M(7)), ...chow(M(2)), ...pair(M(9))];
    const s = score(tiles, [], tid(M(1)));
    expect(fansOf(s)).toEqual({ FullFlush: 1 });
    expect(s.handValue).toBe(4);
  });

  it('seven pairs alone is 2 fan → 4 points', () => {
    const tiles = [
      ...pair(M(1)),
      ...pair(M(4)),
      ...pair(M(6)),
      ...pair(M(9)),
      ...pair(P(2)),
      ...pair(P(5)),
      ...pair(P(8)),
    ];
    const s = score(tiles, [], tid(P(8), 1));
    expect(fansOf(s)).toEqual({ SevenPairs: 1 });
    expect(s.handValue).toBe(4);
  });

  it('a four-of-a-kind inside seven pairs is Root, not Kong', () => {
    // Six distinct pairs plus one type held four times, which counts as two of
    // the seven pairs. Not a kong: a kong cannot sit inside a seven-pairs shape,
    // which is why `COMPATIBILITY` rules the two out of each other.
    const tiles = [
      ...copies(M(1), 4),
      ...pair(M(4)),
      ...pair(M(6)),
      ...pair(M(9)),
      ...pair(P(2)),
      ...pair(P(5)),
    ];
    const s = score(tiles, [], tid(P(5), 1));
    expect(fansOf(s)).toEqual({ SevenPairs: 1, Root: 1 });
    expect(s.handValue).toBe(8); // 2 + 1 = 3 fan
    expect(COMPATIBILITY.SevenPairs.incompatible).toContain('Kong');
  });

  // Root outside seven pairs. The PDF defines it on the decomposition — "1 for
  // each 4 identical tiles in two or more sets" — and names the standard-hand
  // shape in the kong chapter: "if three tiles make up a pung and the fourth
  // tile is used in a chow". The engine awarded it only inside seven pairs until
  // A49, so every payment off one of these hands was half what the rules say.
  it('a pung and the fourth copy in a chow is Root', () => {
    // man 111 + man 123 + pin 456 + pin 789 + pin 22. Four 1m, spread across
    // the pung and the chow.
    const tiles = [
      ...copies(M(1), 4),
      tid(M(2)),
      tid(M(3)),
      ...chow(P(4)),
      ...chow(P(7)),
      ...pair(P(2)),
    ];
    const s = score(tiles, [], tid(P(2), 1));
    expect(fansOf(s)).toEqual({ Root: 1 });
    expect(s.handValue).toBe(2);
  });

  it('a melded pung and the fourth copy in a concealed chow is Root', () => {
    // Concealedness does not enter fan scoring except for kongs, so the pung
    // being laid down changes nothing.
    const melds: Meld[] = [
      { kind: 'pung', tile: { suit: 'man', rank: 1 }, concealed: false, claimedFrom: 1 },
    ];
    const tiles = [tid(M(1), 3), tid(M(2)), tid(M(3)), ...chow(P(4)), ...chow(P(7)), ...pair(P(2))];
    const s = score(tiles, melds, tid(P(2), 1));
    expect(fansOf(s)).toEqual({ Root: 1 });
    expect(s.handValue).toBe(2);
  });

  it('four identical tiles in one set is Kong, not Root', () => {
    // The two fans divide on how the four copies sit: one set is a kong, two or
    // more sets is a root. A kong is never both.
    const melds: Meld[] = [
      {
        kind: 'kong',
        subtype: 'concealed',
        tile: { suit: 'man', rank: 1 },
        claimedFrom: null,
        turnDeclared: 1,
      },
    ];
    const tiles = [...chow(M(2)), ...chow(P(4)), ...chow(P(7)), ...pair(P(2))];
    const s = score(tiles, melds, tid(P(2), 1));
    expect(fansOf(s)).toEqual({ Kong: 1 });
  });

  it('Root stacks to the three the table allows', () => {
    // 1m, 2m and 3m are each held four times: a set of three each, plus one
    // copy each in the chow. The pung of 1m is melded, which is what keeps this
    // a standard hand — held entirely in hand it would read as seven pairs
    // (4+4+4+2), and Root already scored there.
    const melds: Meld[] = [
      { kind: 'pung', tile: { suit: 'man', rank: 1 }, concealed: false, claimedFrom: 1 },
    ];
    const tiles = [tid(M(1), 3), ...copies(M(2), 4), ...copies(M(3), 4), ...pair(P(2))];
    const s = score(tiles, melds, tid(P(2), 1));
    expect(fansOf(s)).toEqual({ Root: 3 });
    expect(s.handValue).toBe(8); // selfMax 3 and the fan cap both land here
  });

  it('a declared kong is 1 fan each, and they stack', () => {
    const melds: Meld[] = [
      {
        kind: 'kong',
        subtype: 'concealed',
        tile: { suit: 'man', rank: 1 },
        claimedFrom: null,
        turnDeclared: 1,
      },
      {
        kind: 'kong',
        subtype: 'concealed',
        tile: { suit: 'man', rank: 4 },
        claimedFrom: null,
        turnDeclared: 2,
      },
    ];
    // Two kongs melded, two sets and the pair still in hand.
    const tiles = [...pung(P(2)), ...pung(P(7)), ...pair(P(9))];
    const s = score(tiles, melds, tid(P(9), 1));
    // All-pung too — kongs are not chows — and won on the pair, so Golden Wait.
    expect(fansOf(s)).toMatchObject({ Kong: 2, AllPungs: 1, GoldenWait: 1 });
    expect(s.totalFan).toBe(FC); // 2 + 1 + 1 = 4, capped
    expect(s.handValue).toBe(8);
  });

  it('caps at three fan, so eight points is the ceiling', () => {
    // All pungs in one suit: AllPungs(1) + FullFlush(2) = 3 exactly.
    const flushPungs = [...pung(M(1)), ...pung(M(3)), ...pung(M(5)), ...pung(M(7)), ...pair(M(9))];
    expect(score(flushPungs, [], tid(M(9), 1)).handValue).toBe(8);
    // And adding Golden Wait on top cannot buy a ninth point.
    const s = score(flushPungs, [], tid(M(9), 1));
    expect(s.totalFan).toBe(FC);
    expect(s.handValue).toBe(2 ** FC);
  });

  // The scorer sees every decomposition and keeps the best-paying one. A hand
  // that parses two ways is where "that was scored wrong" usually comes from,
  // because the player read it the other way.
  it('scores the best reading of a hand that parses more than one way', () => {
    // 111 222 333 in man is three pungs OR three chows. Three pungs (with the
    // rest pungs too) is All Pungs; three chows is not.
    const tiles = [...pung(M(1)), ...pung(M(2)), ...pung(M(3)), ...pung(M(7)), ...pair(M(9))];
    const shapes = findAllWinningShapes(tiles, [], 'sou');
    expect(shapes.length).toBeGreaterThan(1); // genuinely ambiguous

    const s = score(tiles, [], tid(M(7), 2));
    // Both readings are a full flush; only the pung reading adds All Pungs.
    expect(fansOf(s)).toMatchObject({ FullFlush: 1, AllPungs: 1 });
    expect(s.handValue).toBe(8);
  });

  it('takes the seven-pairs reading when it pays more than the standard one', () => {
    // man 1122334455 6677 is seven pairs, and also 123/123/567/567 + 44.
    const tiles = [
      ...pair(M(1)),
      ...pair(M(2)),
      ...pair(M(3)),
      ...pair(M(4)),
      ...pair(M(5)),
      ...pair(M(6)),
      ...pair(M(7)),
    ];
    const shapes = findAllWinningShapes(tiles, [], 'sou');
    expect(shapes.some(sh => sh.kind === 'sevenPairs')).toBe(true);
    expect(shapes.some(sh => sh.kind === 'standard')).toBe(true);
    const s = score(tiles, [], tid(M(7), 1));
    expect(fansOf(s)).toMatchObject({ SevenPairs: 1, FullFlush: 1 });
  });

  it('adds the situational fan only when the structure allows it', () => {
    const sevenPairs = [
      ...pair(M(1)),
      ...pair(M(4)),
      ...pair(M(6)),
      ...pair(M(9)),
      ...pair(P(2)),
      ...pair(P(5)),
      ...pair(P(8)),
    ];
    // Under the Sea is compatible with seven pairs; Win After Kong is not.
    expect(fansOf(score(sevenPairs, [], tid(P(8), 1), 'underTheSea'))).toMatchObject({
      SevenPairs: 1,
      UnderTheSea: 1,
    });
    expect(fansOf(score(sevenPairs, [], tid(P(8), 1), 'winAfterKong'))).toEqual({ SevenPairs: 1 });
  });

  it('never lets the voided suit into a winning hand', () => {
    const tiles = [...chow(M(1)), ...chow(M(4)), ...chow(P(2)), ...chow(S(6)), ...pair(P(9))];
    // The hand holds sou, and sou is the declared void — nothing wins.
    expect(findAllWinningShapes(tiles, [], 'sou')).toEqual([]);
    expect(score(tiles, [], tid(M(1))).handValue).toBe(1); // no shape → base
  });
});

/**
 * One hand carried all the way to the chips that change hands.
 *
 * The fan tests above stop at `handValue`; a dispute is usually about the number
 * on the round-end screen, which is `handValue` *and* the payment rule together.
 * The two rules are a reading of the ruleset rather than a derivation from it,
 * so they are the first thing N21 should check against another source:
 *   - self-draw: every other player pays `handValue + 1`
 *   - discard:   the discarder alone pays `handValue`
 *
 * `applyAction` is driven for real here rather than the arithmetic restated,
 * which is the difference between a test and a comment.
 */
describe('a named hand, all the way to the chips', () => {
  /** The smallest state a self-drawn Hu needs: one seat holding a winning hand. */
  function stateWith(hand: TileId[]): GameState {
    return {
      config: { ...DEFAULT_CONFIG, enableHuanSanZhang: false },
      phase: 'play',
      seed: 'scoring-cases',
      dice: createGame('scoring-cases', PLAYERS, {}, 0 as Seat).dice,
      wall: Array.from({ length: 108 }, (_, i) => i) as TileId[],
      drawIndex: 53,
      kongDrawIndex: 107,
      players: ([0, 1, 2, 3] as Seat[]).map(i => ({
        seat: i,
        name: `P${i}`,
        isBot: false,
        hand: i === 0 ? hand : [],
        melds: [],
        discards: [],
        pendingFirstDiscard: null,
        voidedSuit: 'sou' as const,
        usedIndicator: false,
        status: 'playing' as const,
        hu: null,
        isReady: false,
        scoreDelta: 0,
        furiten: null,
      })) as GameState['players'],
      dealer: 0,
      turn: 0,
      turnNumber: 10,
      firstTurnDone: [true, true, true, true],
      lastDiscard: null,
      lastDrawWasKongReplacement: false,
      lastDrawnTile: null,
      turnDrawNeeded: false,
      drewThisTurn: true,
      wallEndReached: false,
      anyClaimsHappened: false,
      pendingClaims: null,
      pendingKongTile: null,
      pendingHuan: [null, null, null, null],
      pendingVoid: [null, null, null, null],
      penaltyPot: 0,
      ledger: [],
      kongPaymentLog: [],
      nextKongSeq: 0,
      huOrder: [],
      nextDealer: 0,
      history: [],
      startedAt: 0,
    } as GameState;
  }

  it('all pungs in one suit, self-drawn: 3 fan, 8 points, 27 chips across the table', () => {
    // man 111 333 555 777 + 99. All Pungs (1) + Full Flush (2) = 3 fan, which is
    // the cap, so the hand is worth 2^3 = 8.
    const hand = [...pung(M(1)), ...pung(M(3)), ...pung(M(5)), ...pung(M(7)), ...pair(M(9))];
    expect(score(hand, [], tid(M(9), 1)).handValue).toBe(8);

    const r = applyAction(stateWith(hand), { t: 'declareHuOnDraw', seat: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Self-draw, so each of the other three pays 8 + 1.
    expect(r.state.players[0]!.scoreDelta).toBe(27);
    for (const seat of [1, 2, 3] as const) {
      expect(r.state.players[seat]!.scoreDelta).toBe(-9);
    }
    expect(r.state.players.reduce((sum, p) => sum + p.scoreDelta, 0)).toBe(0);
  });

  it('a fan-less hand still moves chips, which is what the +1 is for', () => {
    // Two suits, chows throughout: no fan at all, so handValue is 2^0 = 1 and a
    // self-draw still collects 2 from each. A win is never worth nothing.
    const hand = [...chow(M(1)), ...chow(M(4)), ...chow(P(2)), ...chow(P(6)), ...pair(P(9))];
    expect(score(hand, [], tid(P(9), 1)).handValue).toBe(1);

    const r = applyAction(stateWith(hand), { t: 'declareHuOnDraw', seat: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[0]!.scoreDelta).toBe(6);
    for (const seat of [1, 2, 3] as const) {
      expect(r.state.players[seat]!.scoreDelta).toBe(-2);
    }
  });
});

/**
 * Win after Kong and Under the Sea are one situation, not two. (A67)
 *
 * A kong declared with one tile left in the wall takes that tile, so a win on
 * the replacement is both. Table 9 marks the pair compatible in both directions;
 * this table said they excluded each other, and `HuSubtype` can only name one
 * anyway. Corroborated outside the PDF: Japanese mahjong forbids the
 * combination and Chinese Official and Sichuan allow it.
 *
 * The two below it are the other half — that a kong emptying the wall is
 * noticed at all, which nothing checked because `wallEndReached` was only ever
 * set by `applyDraw`.
 */
describe('the last tile of the wall, taken as a kong replacement', () => {
  /** Seat 0 holds four man 1 to kong and waits on pin 9; one tile is left. */
  function oneTileLeft(): GameState {
    const s = createGame('a67', PLAYERS, { ...DEFAULT_CONFIG, enableHuanSanZhang: false }, 0, 0);
    s.phase = 'play';
    s.turn = 0;
    s.turnDrawNeeded = false;
    s.drewThisTurn = true;
    s.lastDrawnTile = tid(M(1), 3);
    for (const p of s.players) {
      p.voidedSuit = 'sou';
      p.usedIndicator = true;
      p.pendingFirstDiscard = null;
    }
    s.drawIndex = 60;
    s.kongDrawIndex = 60;
    s.wall[60] = tid(P(9), 2);
    s.players[0]!.hand = [
      ...copies(M(1), 4),
      ...chow(M(4)),
      ...chow(P(1)),
      ...chow(P(5)),
      tid(P(9), 0),
    ];
    return s;
  }

  const kong = (s: GameState) =>
    applyAction(s, {
      t: 'declareKongOnTurn',
      seat: 0 as Seat,
      tile: { suit: 'man', rank: 1 },
      subtype: 'concealed',
    });

  it('leaves the wall empty, and the engine knows it', () => {
    const before = oneTileLeft();
    expect(before.kongDrawIndex - before.drawIndex + 1, 'one tile left').toBe(1);
    const r = kong(before);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.kongDrawIndex - r.state.drawIndex + 1, 'wall is empty').toBe(0);
    expect(r.state.wallEndReached, 'and the round knows it has ended').toBe(true);
  });

  it('scores a win on that replacement as both Win after Kong and Under the Sea', () => {
    const r = kong(oneTileLeft());
    if (!r.ok) return;
    const won = applyAction(r.state, { t: 'declareHuOnDraw', seat: 0 as Seat });
    expect(won.ok).toBe(true);
    if (!won.ok) return;

    const hu = won.state.players[0]!.hu;
    expect(hu, 'the hand wins').not.toBeNull();
    const fans = Object.fromEntries((hu?.fans ?? []).map(f => [f.fan, f.count]));
    expect(fans.WinAfterKong).toBe(1);
    expect(fans.UnderTheSea, 'the replacement was the last tile in the wall').toBe(1);
    expect(fans.Kong).toBe(1);
    // Three fans: Kong + Win after Kong + Under the Sea. It was two before, and
    // at the default cap that is the difference between 4 points and 8.
    expect(hu?.handValue).toBe(8);
  });

  it('still names one subtype, because only the fans are read', () => {
    // `subtype` is the event label and nothing consumes it — the reveal draws
    // `fans`. Widening it would have reached the snapshot and the wire for a
    // field no screen shows.
    const r = kong(oneTileLeft());
    if (!r.ok) return;
    const won = applyAction(r.state, { t: 'declareHuOnDraw', seat: 0 as Seat });
    if (!won.ok) return;
    expect(won.state.players[0]!.hu?.subtype).toBe('winAfterKong');
  });
});
