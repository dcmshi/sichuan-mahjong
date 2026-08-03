import type { Meld, RoundResult, Seat, TileId } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import {
  expectedWinningTileCount,
  revealedTileCount,
  separateWinningTile,
} from '../src/roundEnd.js';

type Player = RoundResult['players'][number];

/**
 * The nine wins from the three recorded rounds of live room NDRV, which is where
 * this was reported: the reveal showed 13 tiles for a discard win and a player
 * read it as the engine having accepted a hand that does not win. Every one of
 * these was a *valid* Hu — checked against the engine's own `isWinningHand` —
 * so the reveal was the only thing wrong, and these are the cases it has to draw
 * completely.
 */
const NDRV_WINS: { round: number; seat: Seat; hand: number; melds: Meld[]; byDiscard: boolean }[] =
  [
    { round: 0, seat: 1, hand: 10, melds: [pung('sou', 1)], byDiscard: true },
    { round: 0, seat: 2, hand: 13, melds: [], byDiscard: true },
    { round: 0, seat: 3, hand: 7, melds: [pung('man', 6), pung('man', 5)], byDiscard: true },
    { round: 1, seat: 0, hand: 10, melds: [pung('man', 9)], byDiscard: true },
    { round: 1, seat: 2, hand: 13, melds: [], byDiscard: true },
    { round: 1, seat: 3, hand: 13, melds: [], byDiscard: true },
    { round: 2, seat: 1, hand: 8, melds: [pung('sou', 6), kong('man', 8)], byDiscard: false },
    { round: 2, seat: 2, hand: 10, melds: [pung('sou', 2)], byDiscard: true },
    { round: 2, seat: 3, hand: 8, melds: [pung('pin', 1), pung('man', 3)], byDiscard: false },
  ];

function pung(suit: 'man' | 'pin' | 'sou', rank: number): Meld {
  return { kind: 'pung', tile: { suit, rank }, concealed: false, claimedFrom: 0 } as Meld;
}

function kong(suit: 'man' | 'pin' | 'sou', rank: number): Meld {
  return {
    kind: 'kong',
    tile: { suit, rank },
    subtype: 'exposed',
    claimedFrom: 0,
    turnDeclared: 1,
  } as Meld;
}

function playerWith(handSize: number, melds: Meld[], byDiscard: boolean | null): Player {
  return {
    seat: 0,
    name: 'p',
    scoreDelta: 0,
    hand: Array.from({ length: handSize }, (_, i) => i as TileId),
    melds,
    isReady: false,
    ledger: [],
    hu:
      byDiscard === null
        ? null
        : {
            seat: 0,
            subtype: 'normal',
            fans: [],
            handValue: 1,
            winningTile: 66 as TileId,
            byDiscard,
            discarder: byDiscard ? 3 : null,
          },
  } as Player;
}

describe('separateWinningTile', () => {
  it('returns the tile for a discard win, which `hand` does not contain', () => {
    expect(separateWinningTile(playerWith(13, [], true))).toBe(66);
  });

  it('returns nothing for a self-draw, which already holds it', () => {
    // Appending here would draw the tile twice and show a 15-tile hand.
    expect(separateWinningTile(playerWith(14, [], false))).toBeNull();
  });

  it('returns nothing for a seat that did not win', () => {
    expect(separateWinningTile(playerWith(13, [], null))).toBeNull();
  });

  /**
   * It also has to work on `PlayerView.you`, which is the half that was missed:
   * the round-end reveal was fixed, the play screen was not, so from declaring Hu
   * on a discard until the round ended your own hand showed 13 tiles under a
   * banner saying it was complete. Same symptom, same tell — a self-draw looked
   * right because the tile really is in hand. (N29)
   */
  it('reads a live view seat, not only a finished round', () => {
    const you = {
      seat: 0 as Seat,
      hand: [1, 2, 3] as TileId[],
      status: 'hu' as const,
      hu: {
        seat: 0 as Seat,
        subtype: 'normal' as const,
        fans: [],
        handValue: 4,
        winningTile: 66 as TileId,
        byDiscard: true,
        discarder: 2 as Seat,
      },
    };
    expect(separateWinningTile(you)).toBe(66);
    expect(separateWinningTile({ ...you, hu: { ...you.hu, byDiscard: false } })).toBeNull();
    expect(separateWinningTile({ ...you, hu: null })).toBeNull();
  });
});

describe('the reveal draws a complete hand for every real NDRV win', () => {
  for (const w of NDRV_WINS) {
    it(`round ${w.round} seat ${w.seat} (${w.byDiscard ? 'discard' : 'self-draw'})`, () => {
      const p = playerWith(w.hand, w.melds, w.byDiscard);
      expect(revealedTileCount(p)).toBe(expectedWinningTileCount(p));
    });
  }

  it('would have caught the bug: hand alone is short for every discard win', () => {
    // The regression guard. Before the fix the reveal drew `hand` + melds only,
    // so this is what a player was shown.
    const shortfalls = NDRV_WINS.filter(w => w.byDiscard).map(w => {
      const p = playerWith(w.hand, w.melds, w.byDiscard);
      const melded = w.melds.reduce((n, m) => n + (m.kind === 'kong' ? 4 : 3), 0);
      return expectedWinningTileCount(p) - (w.hand + melded);
    });
    expect(shortfalls).toHaveLength(7);
    expect(new Set(shortfalls)).toEqual(new Set([1]));
  });

  it('and is exact for the self-draws, which were never short', () => {
    for (const w of NDRV_WINS.filter(w => !w.byDiscard)) {
      const p = playerWith(w.hand, w.melds, w.byDiscard);
      const melded = w.melds.reduce((n, m) => n + (m.kind === 'kong' ? 4 : 3), 0);
      expect(w.hand + melded).toBe(expectedWinningTileCount(p));
    }
  });
});

describe('kongs raise the expected count', () => {
  it('one kong means 15 tiles, not 14', () => {
    expect(expectedWinningTileCount(playerWith(8, [pung('sou', 6), kong('man', 8)], false))).toBe(
      15,
    );
  });
});
