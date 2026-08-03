import type { Rng } from './rng.js';
import type { Seat } from './state.js';
import type { TileId } from './tiles.js';

/**
 * The dice, and what they decide.
 *
 * Two throws, both with two dice:
 *
 *  1. **Seating.** Everyone throws; highest sum is East. This is not in
 *     Novikov — his §"preparatory phase" opens with East already established
 *     and never says how — but it is what the outside sources describe as
 *     standard practice, and Chinese Classical does a two-stage version of the
 *     same thing. It is the modern simplified convention, and it is on by
 *     default.
 *  2. **The wall break.** East throws again: the sum picks whose wall is
 *     dismantled, counted counterclockwise from East, and the lower die is the
 *     "indent" — how many stacks in from that wall's right end the break falls.
 *     One roll, both answers. This one *is* Novikov's.
 *
 * On the second throw his prose and his examples disagree. The prose says
 * "5 or 9 indicate East as the second player to throw dice", which almost
 * certainly means Chinese Classical's two-thrower version — East throws to name
 * a player, that player throws again, and the sums are added. But all three of
 * his worked examples derive both the wall and the indent from the first roll
 * alone and never mention a second. The examples are unambiguous and the prose
 * is not, so this implements the examples.
 *
 * **Breaking the wall elsewhere is a rotation of an already-uniform shuffle**,
 * so it changes no distribution and no fairness — it is ritual made real rather
 * than decorative, and it costs nothing but the test churn of regenerating what
 * a given seed deals.
 */

/** 108 tiles, four walls of 27. */
export const WALL_SIZE = 108;
export const TILES_PER_WALL = WALL_SIZE / 4;

/** One throw of two dice. `a` and `b` are the faces as they landed. */
export type DiePair = { a: number; b: number };

export const pairSum = (p: DiePair): number => p.a + p.b;
export const lowerDie = (p: DiePair): number => Math.min(p.a, p.b);

/**
 * One round of the seating throw. `rolls[seat]` is null for a seat not throwing
 * this round — after a tie, only the tied players throw again.
 */
export type SeatingRound = { rolls: (DiePair | null)[] };

export type DiceRecord = {
  /** Null when the seating throw is off; otherwise one entry per round thrown. */
  seating: SeatingRound[] | null;
  /** East's throw for the break. */
  wall: DiePair;
  /** The wall its sum selected, as a seat. */
  wallSeat: Seat;
  /** Stacks in from that wall's right end — the lower die. */
  indent: number;
  /** What the break actually is: how far the wall array is rotated. */
  breakOffset: number;
};

/**
 * One throw plus three re-rolls. A tie has to terminate, and re-rolling forever
 * against a seeded PRNG is a hang rather than a long wait — the same stream
 * would be replayed identically on every restore.
 */
export const MAX_SEATING_ROUNDS = 4;

const rollDie = (rng: Rng): number => rng.nextInt(6) + 1;

export function rollPair(rng: Rng): DiePair {
  return { a: rollDie(rng), b: rollDie(rng) };
}

/**
 * Everyone throws; highest sum is East. Ties re-throw among the tied players
 * only, and if they are still tied after `MAX_SEATING_ROUNDS` the lowest seat
 * among them takes it — seat order is the one tiebreak that cannot itself tie.
 */
export function throwForSeats(rng: Rng): { rounds: SeatingRound[]; east: Seat } {
  let contenders: Seat[] = [0, 1, 2, 3];
  const rounds: SeatingRound[] = [];

  for (let r = 0; r < MAX_SEATING_ROUNDS; r++) {
    const rolls: (DiePair | null)[] = [null, null, null, null];
    for (const s of contenders) rolls[s] = rollPair(rng);
    rounds.push({ rolls });

    let best = -1;
    let winners: Seat[] = [];
    for (const s of contenders) {
      const total = pairSum(rolls[s] as DiePair);
      if (total > best) {
        best = total;
        winners = [s];
      } else if (total === best) {
        winners.push(s);
      }
    }
    if (winners.length === 1) return { rounds, east: winners[0] as Seat };
    contenders = winners;
  }

  return { rounds, east: contenders[0] as Seat };
}

/**
 * East throws for the break. The sum counts counterclockwise from East —
 * 5/9 → East, 2/6/10 → South, 3/7/11 → West, 4/8/12 → North — which is
 * `(sum - 1) % 4` seats along. The lower die is the indent, in stacks, counted
 * from that wall's right end; a stack is two tiles.
 *
 * **Counterclockwise means seat-*decreasing* here, and it did not used to.**
 * `nextActiveSeat` advances the turn by `(from + 3) % 4`, and the client seats
 * `seat + 3` to the viewer's right — so play travels counterclockwise round the
 * table by decreasing seat index, and South, the seat to East's right, is
 * `dealer - 1`. This counted `dealer + step`, which named North for a sum of 2
 * and South for a sum of 4: the two were swapped against the table's own
 * geometry. (N22)
 *
 * The wall array runs the same way, for the same reason. Its four quarters are
 * consumed in ascending index order — `drawIndex` only increments — so quarter
 * `q` has to belong to seat `-q` for "the next wall opened" to be "the next seat
 * in play order". Assigning quarter `q` to seat `q` made the wall unwind
 * clockwise while play went counterclockwise, which is what made the diagram
 * open one way round the table and the turn travel the other.
 *
 * None of this changes a distribution: the wall is a uniform shuffle and the
 * break is a rotation of it, so the direction is ritual. It does change which
 * tiles a given seed deals.
 */
export function throwForWall(
  rng: Rng,
  dealer: Seat,
): Omit<DiceRecord, 'seating'> & { wall: DiePair } {
  const wall = rollPair(rng);
  const step = (pairSum(wall) - 1) % 4;
  const wallSeat = ((dealer - step + 4) % 4) as Seat;
  const indent = lowerDie(wall);
  const quarter = (4 - wallSeat) % 4;
  const breakOffset = (quarter * TILES_PER_WALL + (TILES_PER_WALL - indent * 2)) % WALL_SIZE;
  return { wall, wallSeat, indent, breakOffset };
}

/** The break, as the array operation it is. Does not mutate the input. */
export function rotateWall(wall: TileId[], offset: number): TileId[] {
  const n = wall.length;
  if (n === 0) return [];
  const k = ((offset % n) + n) % n;
  return [...wall.slice(k), ...wall.slice(0, k)];
}
