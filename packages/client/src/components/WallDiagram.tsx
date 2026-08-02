import { useT } from '../i18n/useT.js';
import { TileBack } from './Tile.js';

/** Stacks along one side. Four sides, two tiles a stack, is the 56 the deal leaves. */
export const WALL_STACKS_PER_SIDE = 7;
export const WALL_SIDES = 4;
export const WALL_STACKS = WALL_SIDES * WALL_STACKS_PER_SIDE;
export const WALL_TILES = WALL_STACKS * 2;

/**
 * Tiles still standing in each stack, walking the ring from the head: 2 while
 * untouched, 1 once its top tile is gone, 0 once both are. The engine only tells
 * us how many are left, not which wall they came from, so they come off in order
 * — which is how a table plays it anyway.
 *
 * Exported to be tested: the client suite runs in Node with no DOM.
 */
export function wallStacks(remaining: number): number[] {
  const left = Math.max(0, Math.min(remaining, WALL_TILES));
  const drawn = WALL_TILES - left;
  return Array.from({ length: WALL_STACKS }, (_, i) => {
    const throughThisStack = i * 2 + 2;
    return Math.max(0, Math.min(2, throughThisStack - drawn));
  });
}

/** The stacks belonging to one side, in ring order. */
export function sideStacks(stacks: number[], side: number): number[] {
  return stacks.slice(side * WALL_STACKS_PER_SIDE, (side + 1) * WALL_STACKS_PER_SIDE);
}

const SIDES = ['wall-n', 'wall-e', 'wall-s', 'wall-w'];

/**
 * The wall as four walls around the table, each two tiles deep, emptying as the
 * round is drawn. Every slot stays visible whether or not it still holds a tile:
 * a bar that only shrinks tells you nothing without something to measure it
 * against, which is what the single strip this replaced got wrong.
 *
 * Absolutely positioned over the well, so it costs no height in a row that has
 * none to give, and `pointer-events: none` so it can't take a tap from the
 * history button underneath it.
 */
export function WallDiagram({ remaining }: { remaining: number }) {
  const t = useT();
  const stacks = wallStacks(remaining);
  return (
    <div className="wall-diagram" role="img" aria-label={t('play.wall', { n: remaining })}>
      {SIDES.map((cls, side) => {
        const mine = sideStacks(stacks, side);
        return (
          <div key={cls} className={`wall-side ${cls}`}>
            {/* Two rows: the stack's top tile, then the one under it. A stack of
                one has lost its top, so the near row is what survives. */}
            {[2, 1].map(depth => (
              <div key={depth} className="wall-row">
                {mine.map((held, i) => (
                  <div key={i} className={held >= depth ? 'wall-cell' : 'wall-cell is-empty'}>
                    {held >= depth ? <TileBack fill /> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
