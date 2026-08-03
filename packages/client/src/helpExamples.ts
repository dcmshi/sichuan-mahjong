import type { FanType, Rank, Suit, TileId } from '@sichuan-mahjong/engine';
import { COMPATIBILITY, tileToType } from '@sichuan-mahjong/engine';

/**
 * The hands How to Play draws to show what a win looks like, and the fan table
 * beside them.
 *
 * Pure data, and exported, for the reason everything testable in this client is:
 * there is no DOM in the suite, so the guard that these examples actually win —
 * `isWinningHand` says so — has to run against a value rather than against a
 * rendered component. A help screen showing a hand that does not win is the one
 * failure mode here, and it is invisible to a screenshot.
 */

/** One group of a laid-out hand: a chow, a pung, or the pair. */
export type ExampleGroup = TileId[];

export type ShapeExample = {
  /** Catalog suffix — `htp.shape.<key>`. */
  key: 'standard' | 'sevenPairs' | 'fullFlush';
  /** The suit this hand's owner declared void, named beside it. */
  voided: Suit;
  groups: ExampleGroup[];
};

type GroupSpec = { suit: Suit; ranks: number[] };

/**
 * Copies are allocated per tile type across the whole example rather than written
 * out, so no hand can accidentally use one physical tile twice — the full-flush
 * example holds three 9-of-dots across a chow and its pair.
 */
function build(specs: GroupSpec[]): ExampleGroup[] {
  const used = new Map<number, number>();
  return specs.map(g =>
    g.ranks.map(rank => {
      const type = tileToType({ suit: g.suit, rank: rank as Rank });
      const copy = used.get(type) ?? 0;
      used.set(type, copy + 1);
      return (type * 4 + copy) as TileId;
    }),
  );
}

export const SHAPE_EXAMPLES: ShapeExample[] = [
  {
    key: 'standard',
    voided: 'sou',
    groups: build([
      { suit: 'man', ranks: [2, 3, 4] },
      { suit: 'man', ranks: [7, 7, 7] },
      { suit: 'pin', ranks: [3, 4, 5] },
      { suit: 'pin', ranks: [9, 9, 9] },
      { suit: 'man', ranks: [5, 5] },
    ]),
  },
  {
    key: 'sevenPairs',
    voided: 'sou',
    groups: build([
      { suit: 'man', ranks: [1, 1] },
      { suit: 'man', ranks: [4, 4] },
      { suit: 'man', ranks: [6, 6] },
      { suit: 'man', ranks: [9, 9] },
      { suit: 'pin', ranks: [2, 2] },
      { suit: 'pin', ranks: [5, 5] },
      { suit: 'pin', ranks: [8, 8] },
    ]),
  },
  {
    key: 'fullFlush',
    voided: 'man',
    groups: build([
      { suit: 'pin', ranks: [1, 1, 1] },
      { suit: 'pin', ranks: [3, 4, 5] },
      { suit: 'pin', ranks: [6, 6, 6] },
      { suit: 'pin', ranks: [7, 8, 9] },
      { suit: 'pin', ranks: [9, 9] },
    ]),
  },
];

/**
 * The ten fan, ordered by what a player would steer toward rather than by the
 * enum: the two 2-fan hands first, then the ones you build, then the four that
 * depend on when the tile arrives rather than on what you hold.
 */
export const HELP_FAN_ORDER: FanType[] = [
  'FullFlush',
  'SevenPairs',
  'AllPungs',
  'GoldenWait',
  'Kong',
  'Root',
  'WinAfterKong',
  'ShootAfterKong',
  'RobbingTheKong',
  'UnderTheSea',
];

export type HelpFanRow = { fan: FanType; fanValue: number; selfMax: number };

/**
 * Values read out of the engine's own table rather than restated, so a change to
 * `COMPATIBILITY` cannot leave the help quoting a number the scorer no longer uses.
 */
export function helpFanRows(): HelpFanRow[] {
  return HELP_FAN_ORDER.map(fan => ({
    fan,
    fanValue: COMPATIBILITY[fan].fanValue,
    selfMax: COMPATIBILITY[fan].selfMax,
  }));
}
