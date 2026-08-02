import { useT } from '../i18n/useT.js';
import { TileBack } from './Tile.js';

/** Stacks along one wall. Four walls, two tiles a stack, is the 56 the deal leaves. */
export const WALL_STACKS_PER_SIDE = 7;
export const WALL_SIDES = 4;
export const WALL_STACKS = WALL_SIDES * WALL_STACKS_PER_SIDE;
export const WALL_TILES = WALL_STACKS * 2;

/**
 * The geometry, all as percentages of the diagram's square, so the whole thing
 * scales with it and nothing here depends on a pixel.
 *
 * A tile's *length* is whichever of its dimensions runs along its wall — width on
 * the north and south walls, height on the east and west ones — so the four walls
 * come out the same length and the frame is square.
 */
const TILE = 10.6;
/** The art's own 210:255. */
const RATIO = 210 / 255;
/** Stacks sit flush, lapped exactly as the hand laps. */
const LAP = 0.225;
/** How much of the tile beneath a stacked one still shows. */
const RISE = 0.42;

const PITCH = TILE * (1 - LAP);
const LENGTH = PITCH * (WALL_STACKS_PER_SIDE - 1) + TILE;
const START = (100 - LENGTH) / 2;

/** North and south: the length is the width, so the depth is the height. */
const NS_W = TILE;
const NS_H = TILE / RATIO;
const NS_RISE = NS_H * RISE;
/** East and west: the length is the height, so the depth is the width. */
const EW_H = TILE;
const EW_W = TILE * RATIO;
const EW_RISE = EW_W * RISE;

export const WALL_NS_DEPTH = NS_H + NS_RISE;
export const WALL_EW_DEPTH = EW_W + EW_RISE;

/** One drawn tile: where it sits in the square, and whether it is still there. */
export type WallSlot = { left: number; top: number; width: number; filled: boolean };

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

/**
 * Every tile of the wall, placed. Two per stack: `layer` 0 is the one sitting on
 * top, drawn offset towards the outside of the ring, and 1 is the one under it,
 * nearer the middle. They come out in painting order — later stacks lap over
 * earlier ones, and the lower tile of a stack covers the upper one, which is what
 * makes a stack read as a stack rather than two tiles.
 */
export function wallSlots(remaining: number): WallSlot[] {
  const stacks = wallStacks(remaining);
  const slots: WallSlot[] = [];
  for (let side = 0; side < WALL_SIDES; side++) {
    for (let i = 0; i < WALL_STACKS_PER_SIDE; i++) {
      const held = stacks[side * WALL_STACKS_PER_SIDE + i] ?? 0;
      const along = START + i * PITCH;
      for (let layer = 0; layer < 2; layer++) {
        // A stack of one has had its top tile taken, so layer 1 is what survives.
        const filled = held >= 2 - layer;
        if (side === 0) slots.push({ left: along, top: layer * NS_RISE, width: NS_W, filled });
        else if (side === 1)
          slots.push({ left: 100 - EW_W - layer * EW_RISE, top: along, width: EW_W, filled });
        else if (side === 2)
          slots.push({ left: along, top: 100 - NS_H - layer * NS_RISE, width: NS_W, filled });
        else slots.push({ left: layer * EW_RISE, top: along, width: EW_W, filled });
      }
    }
  }
  return slots;
}

/**
 * The wall as four walls round the table, each a flush run of stacks two tiles
 * high, emptying as the round is drawn. Every slot stays visible whether or not
 * it still holds a tile: a wall that only shrinks gives you nothing to measure
 * what is left against, which is what the single strip this replaced got wrong.
 *
 * Absolutely positioned over the well, so it costs no height in a row that has
 * none to give, and `pointer-events: none` so it can't take a tap from the
 * history button underneath it.
 */
export function WallDiagram({ remaining }: { remaining: number }) {
  const t = useT();
  return (
    <div className="wall-diagram" role="img" aria-label={t('play.wall', { n: remaining })}>
      {wallSlots(remaining).map((slot, i) => (
        <div
          key={i}
          className={slot.filled ? 'wall-cell' : 'wall-cell is-empty'}
          style={{ left: `${slot.left}%`, top: `${slot.top}%`, width: `${slot.width}%` }}
        >
          {slot.filled ? <TileBack fill /> : null}
        </div>
      ))}
    </div>
  );
}

/** The east/west walls read as `EW_H` tall; exported only so the tests can say so. */
export const WALL_EW_H = EW_H;
