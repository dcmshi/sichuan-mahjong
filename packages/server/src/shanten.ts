import { tileTypeOf } from '@sichuan-mahjong/engine';
import type { Suit, TileId, TileType } from '@sichuan-mahjong/engine';

/**
 * Shanten — how many tile exchanges a hand is from a win. 0 is tenpai, -1 is a
 * completed hand.
 *
 * This exists because the engine has no notion of "close": `isTenpai` and
 * `ukeire` both answer only about a hand that is already one tile away, so the
 * medium bot's `ukeireAfterDiscard` returns 0 for every candidate until tenpai
 * arrives, and its "maximise acceptance" loop silently degrades to "keep the
 * first legal tile in hand order" for most of a round. A hard bot needs a
 * gradient over the whole hand, which is what this is.
 *
 * It lives in the server beside the bots rather than in the engine: no rule
 * depends on it, nothing a client sees is derived from it, and the engine's
 * purity is about replay determinism rather than about being the only place
 * mahjong is understood.
 */

const VOID_SUIT_INDEX: Record<Suit, number> = { man: 0, pin: 1, sou: 2 };

export type Shanten = {
  /** Four sets and a pair. */
  standard: number;
  /** Seven pairs — unavailable once anything is melded, hence `Infinity` then. */
  sevenPairs: number;
  /** The better of the two; what "how far from a win" means without qualification. */
  best: number;
};

/**
 * Tile-type counts with the void suit zeroed.
 *
 * A hand holding its own void suit cannot win at all — `findAllWinningShapes`
 * rejects any shape containing it — so those tiles are not near-misses, they are
 * tiles that must leave. Dropping them here is what makes the count below say so.
 */
function countsOf(tiles: readonly TileId[], voidedSuit: Suit | null): Uint8Array {
  const counts = new Uint8Array(27);
  const voidIndex = voidedSuit === null ? -1 : VOID_SUIT_INDEX[voidedSuit];
  for (const id of tiles) {
    const type = tileTypeOf(id);
    if (Math.floor(type / 9) === voidIndex) continue;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

/**
 * The standard formula: `8 - 2·sets - blocks`, over every way the hand can be
 * read, where a block is a pair or two tiles of a run waiting on the third.
 *
 * Two corrections are the whole subtlety. A hand can use at most five blocks
 * (four sets and a pair), so the search refuses to open a sixth — otherwise a
 * hand of six pairs would score better than it plays. And five blocks with no
 * pair among them costs one extra exchange, because one of those blocks has to
 * be broken to make the pair the hand still needs.
 *
 * `melds` is a count rather than the melds themselves: an exposed set is worth
 * exactly what a concealed one is here, and taking the number keeps the claim
 * evaluator from having to build a `Meld` it will throw away.
 */
function standardShanten(counts: Uint8Array, melds: number): number {
  let best = 8;
  const at = (i: number) => counts[i] ?? 0;

  /** Lift a block's tiles out of the count, keep walking, put them back. */
  function without(
    tiles: readonly number[],
    i: number,
    sets: number,
    blocks: number,
    hasPair: boolean,
  ): void {
    for (const t of tiles) counts[t] = at(t) - 1;
    walk(i, sets, blocks, hasPair);
    for (const t of tiles) counts[t] = at(t) + 1;
  }

  function walk(from: number, sets: number, blocks: number, hasPair: boolean): void {
    let i = from;
    while (i < 27 && at(i) === 0) i++;

    if (i === 27) {
      let st = 8 - 2 * sets - blocks;
      if (sets + blocks === 5 && !hasPair) st += 1;
      if (st < best) best = st;
      return;
    }

    // Already at four sets and a pair's worth of blocks: nothing left to open,
    // so the rest of the hand is floaters and the walk can only finish.
    const canOpen = sets + blocks < 5;
    const rank = i % 9;

    if (canOpen && at(i) >= 3) without([i, i, i], i, sets + 1, blocks, hasPair);
    if (canOpen && rank <= 6 && at(i + 1) > 0 && at(i + 2) > 0) {
      without([i, i + 1, i + 2], i, sets + 1, blocks, hasPair);
    }
    if (canOpen && at(i) >= 2) without([i, i], i, sets, blocks + 1, true);
    if (canOpen && rank <= 7 && at(i + 1) > 0) without([i, i + 1], i, sets, blocks + 1, hasPair);
    if (canOpen && rank <= 6 && at(i + 2) > 0) without([i, i + 2], i, sets, blocks + 1, hasPair);

    // The tile belongs to no block: a floater the hand will eventually shed.
    without([i], i, sets, blocks, hasPair);
  }

  walk(0, melds, 0, false);
  return best;
}

/**
 * Seven pairs, which in this ruleset counts a four-of-a-kind as two pairs — the
 * Root fan is defined on exactly that, so `floor(count / 2)` is the right sum
 * and the usual "needs seven distinct types" correction does not apply here.
 */
function sevenPairsShanten(counts: Uint8Array): number {
  let pairs = 0;
  for (const c of counts) pairs += Math.floor(c / 2);
  return 6 - Math.min(7, pairs);
}

const cache = new Map<string, Shanten>();
/** Bounded so a long-lived server process cannot grow one entry per hand ever held. */
const CACHE_LIMIT = 20_000;

/**
 * Distance from a win, for a hand of any size the game can produce — 13-tile
 * standing hands, the 14 a draw makes, and the over-full hand a claim leaves
 * before its discard.
 */
export function handShanten(
  hand: readonly TileId[],
  melds: number,
  voidedSuit: Suit | null,
): Shanten {
  const counts = countsOf(hand, voidedSuit);
  const key = `${melds}|${counts.join('')}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const standard = standardShanten(counts, melds);
  // Melding forecloses seven pairs — the shape is by definition concealed.
  const sevenPairs = melds === 0 ? sevenPairsShanten(counts) : Number.POSITIVE_INFINITY;
  const result: Shanten = { standard, sevenPairs, best: Math.min(standard, sevenPairs) };

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, result);
  return result;
}

/**
 * The tile types whose arrival would bring the hand closer to a win, and how
 * many copies of each are still unaccounted for.
 *
 * This is the below-tenpai answer the engine's `ukeire` cannot give, and it is
 * the expensive call in the bot: 27 shanten evaluations. Callers narrow to the
 * discards that already tie on shanten before asking.
 */
export function acceptance(
  hand: readonly TileId[],
  melds: number,
  voidedSuit: Suit | null,
  unseen: (type: TileType) => number,
): number {
  const base = handShanten(hand, melds, voidedSuit).best;
  const voidIndex = voidedSuit === null ? -1 : VOID_SUIT_INDEX[voidedSuit];
  let total = 0;

  for (let type = 0; type < 27; type++) {
    if (Math.floor(type / 9) === voidIndex) continue;
    const live = unseen(type);
    if (live <= 0) continue;
    // Any copy stands for the type; the fourth is the one `isTenpai` uses as its
    // probe for the same reason.
    const probe = (type * 4 + 3) as TileId;
    if (handShanten([...hand, probe], melds, voidedSuit).best < base) total += live;
  }

  return total;
}
