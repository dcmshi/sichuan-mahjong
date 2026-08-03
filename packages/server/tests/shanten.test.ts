import { createRng, isWinningHand, tileTypeOf } from '@sichuan-mahjong/engine';
import type { Suit, TileId } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { acceptance, handShanten } from '../src/shanten.js';

/**
 * The oracle is the engine itself, asked structurally: a hand is tenpai when
 * *some* tile type completes it. `isTenpai` cannot be used directly — it also
 * applies the exhaustive-wait filter, so it calls a hand waiting on a type it
 * already holds four of "not tenpai", which is a rule about whether the wait can
 * ever fill rather than about how far from a win the shape is.
 */
function structurallyTenpai(hand: TileId[], voidedSuit: Suit | null): boolean {
  for (let type = 0; type < 27; type++) {
    const probe = (type * 4 + 3) as TileId;
    if (hand.includes(probe)) continue;
    if (isWinningHand([...hand, probe], [], voidedSuit) !== null) return true;
  }
  return false;
}

function deal(seed: string, count: number): TileId[] {
  const rng = createRng(seed);
  const deck = Array.from({ length: 108 }, (_, i) => i as TileId);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck.slice(0, count);
}

/** Tile ids for a readable hand spec like `['m1','m1','p3']`. Copies auto-assigned. */
function hand(spec: string[]): TileId[] {
  const used = new Map<number, number>();
  return spec.map(s => {
    const suit = { m: 0, p: 1, s: 2 }[s[0] as 'm' | 'p' | 's']!;
    const type = suit * 9 + (Number(s[1]) - 1);
    const copy = used.get(type) ?? 0;
    used.set(type, copy + 1);
    return (type * 4 + copy) as TileId;
  });
}

describe('shanten', () => {
  it('agrees with the engine on which 13-tile hands are tenpai', () => {
    // Built, not dealt: thirteen tiles off a shuffled deck are tenpai far too
    // rarely for a random sweep to cover the true half on its own.
    const tenpai = [
      // Three runs, a pair, and a two-sided wait.
      ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 'p9', 'p9', 's4', 's5'],
      // Four sets and a lone tile — the pair wait.
      ['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'p7', 'p7', 'p7', 's1'],
      // Six pairs: the seven-pairs wait.
      ['m1', 'm1', 'm4', 'm4', 'm7', 'm7', 'p1', 'p1', 'p4', 'p4', 'p7', 'p7', 's1'],
    ];
    for (const spec of tenpai) {
      const tiles = hand(spec);
      expect(structurallyTenpai(tiles, null), spec.join(' ')).toBe(true);
      expect(handShanten(tiles, 0, null).best, spec.join(' ')).toBe(0);
    }

    for (let i = 0; i < 400; i++) {
      const tiles = deal(`tenpai-${i}`, 13);
      const st = handShanten(tiles, 0, null).best;
      const oracle = structurallyTenpai(tiles, null);
      expect(st === 0, `hand ${i}: shanten ${st}, engine tenpai ${oracle}`).toBe(oracle);
    }
  });

  it('agrees with the engine on which 14-tile hands have already won', () => {
    // A random 14 is a winning hand roughly never, so the winners are built.
    const winners = [
      ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p1', 'p2', 'p3', 's5', 's5'],
      ['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'p7', 'p7', 'p7', 's1', 's1'],
      ['m1', 'm1', 'm2', 'm2', 'm3', 'm3', 'p4', 'p4', 'p5', 'p5', 's8', 's8', 's9', 's9'],
    ];
    for (const spec of winners) {
      const tiles = hand(spec);
      expect(isWinningHand(tiles, [], null), spec.join(' ')).not.toBeNull();
      expect(handShanten(tiles, 0, null).best, spec.join(' ')).toBe(-1);
    }

    for (let i = 0; i < 200; i++) {
      const tiles = deal(`win-${i}`, 14);
      const won = isWinningHand(tiles, [], null) !== null;
      expect(handShanten(tiles, 0, null).best === -1, `hand ${i}`).toBe(won);
    }
  });

  it('counts seven pairs, with a four-of-a-kind as two of them', () => {
    // Six pairs and a floater: one exchange from the seven-pair shape.
    const sixPairs = hand([
      'm1',
      'm1',
      'm2',
      'm2',
      'm3',
      'm3',
      'p4',
      'p4',
      'p5',
      'p5',
      's8',
      's8',
      's9',
    ]);
    expect(handShanten(sixPairs, 0, null).sevenPairs).toBe(0);

    // Root: m1 four times is two pairs, not one.
    const withRoot = hand([
      'm1',
      'm1',
      'm1',
      'm1',
      'm2',
      'm2',
      'm3',
      'm3',
      'p4',
      'p4',
      'p5',
      'p5',
      's9',
    ]);
    expect(handShanten(withRoot, 0, null).sevenPairs).toBe(0);

    // Melding forecloses the shape entirely.
    expect(handShanten(sixPairs, 1, null).sevenPairs).toBe(Number.POSITIVE_INFINITY);
  });

  it('treats the void suit as tiles that must leave, not as near misses', () => {
    // Three sets and a pair, plus one sou tile — tenpai on any sou wait, and
    // 1-shanten once sou is the declared void.
    const tiles = hand([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'p1',
      'p2',
      'p3',
      'p9',
      'p9',
      's4',
      's5',
    ]);
    expect(handShanten(tiles, 0, null).best).toBe(0);
    expect(handShanten(tiles, 0, 'sou').best).toBe(1);
  });

  it('never opens a sixth block, so six pairs is not read as a better standard hand', () => {
    // Ranks three apart, so nothing here is also a run — the six pairs are the
    // only reading, which is what isolates the block cap.
    const sixPairs = hand([
      'm1',
      'm1',
      'm4',
      'm4',
      'm7',
      'm7',
      'p1',
      'p1',
      'p4',
      'p4',
      'p7',
      'p7',
      's1',
    ]);
    // Five blocks, none of them a set: 8 - 0 - 5, and the no-pair correction
    // does not apply. A sixth block would wrongly give 2.
    expect(handShanten(sixPairs, 0, null).standard).toBe(3);
    // …while the same hand is one tile from a seven-pair win.
    expect(handShanten(sixPairs, 0, null).sevenPairs).toBe(0);
  });

  it('is a gradient: a 1-shanten hand reaches tenpai in one exchange', () => {
    let checked = 0;
    for (let i = 0; i < 300 && checked < 20; i++) {
      const tiles = deal(`grad-${i}`, 13);
      if (handShanten(tiles, 0, null).best !== 1) continue;
      checked++;

      const reachable = tiles.some((drop, di) => {
        const kept = tiles.filter((_, j) => j !== di);
        for (let type = 0; type < 27; type++) {
          const probe = (type * 4 + 3) as TileId;
          if (kept.includes(probe)) continue;
          if (handShanten([...kept, probe], 0, null).best === 0) return true;
        }
        return false;
      });
      expect(reachable, `hand ${i} is 1-shanten but reaches no tenpai`).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('acceptance', () => {
  it('counts the live copies of every tile that improves the hand', () => {
    // 1-shanten: m1m2m3 m4m5m6 p1p2p3 p9p9 s4 — s4 wants a partner or a
    // neighbour, and nothing else in the hand can improve.
    const tiles = hand([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'p1',
      'p2',
      'p3',
      'p9',
      'p9',
      's4',
      's5',
    ]);
    const own = new Map<number, number>();
    for (const id of tiles) own.set(tileTypeOf(id), (own.get(tileTypeOf(id)) ?? 0) + 1);
    const unseen = (type: number) => 4 - (own.get(type) ?? 0);

    // Tenpai already, so acceptance counts only what completes it.
    expect(handShanten(tiles, 0, null).best).toBe(0);
    expect(acceptance(tiles, 0, null, unseen)).toBeGreaterThan(0);
  });

  it('is zero when nothing unseen can help', () => {
    const tiles = deal('acc-none', 13);
    expect(acceptance(tiles, 0, null, () => 0)).toBe(0);
  });
});
