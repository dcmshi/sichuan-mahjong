import type { PlayerView, Seat } from '@sichuan-mahjong/engine';
import { WALL_SIZE } from '@sichuan-mahjong/engine';
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
 *
 * Because every length here is a percentage, lapping harder and growing `TILE`
 * together leaves the wall the same fraction of the square while making each tile
 * a bigger fraction of it — so the *square* can shrink for the same drawn tile
 * size, which is where the well's free space comes from. `.wall-diagram`'s
 * `width` in index.css is the other half of that trade.
 */
const TILE = 10.6;
/** The art's own 210:255. */
const RATIO = 210 / 255;
/**
 * How much of each stack the next one covers — the 22.5% body band, as the hand
 * and the trays use.
 *
 * **Lapping harder was tried and reverted; the three constants below are coupled
 * and the trade does not come out.** A harder lap shortens a wall, which pushes
 * its ends away from the corner where the next wall begins — so `TILE` has to
 * grow to keep the frame closed (at 22.5% it closes near `TILE = 12.5`, at 50%
 * near 15). Bigger tiles make each wall *thicker*, and a wall's thickness is
 * subtracted from the frame's interior twice. At `LAP = 0.5, TILE = 15` the clear
 * middle went 143px → 126px on a 390px phone and the top wall painted across the
 * "Last discard" label.
 *
 * Shrinking the square to match does not help either, because **this frame's
 * interior *is* the well's centre** — see `.wall-diagram` in index.css. So the
 * corner whitespace and the packed look cannot both be had: closing the corners
 * costs the middle, and the middle is used.
 */
const LAP = 0.225;
/** How much of the tile beneath a stacked one still shows. */
const RISE = 0.42;

const PITCH = TILE * (1 - LAP);
const LENGTH = PITCH * (WALL_STACKS_PER_SIDE - 1) + TILE;
const START = (100 - LENGTH) / 2;

/** Exported so the tests assert on the lap rather than restating its value. */
export const WALL_LAP = LAP;

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
 * What the diagram needs to draw itself: where the break fell, and how far each
 * end has been eaten into.
 */
export type WallState = {
  /** Ring position 0..27 of the stack the break falls on, viewer-relative. */
  head: number;
  /** Tiles taken from the head end since the deal. */
  drawnHead: number;
  /** Tiles taken from the tail end — the kong replacements. */
  drawnTail: number;
};

/**
 * Screen side of a seat, as the board arranges them.
 *
 * `projectView` orders `others` counterclockwise from the viewer and `Game.tsx`
 * puts `others[2]` (seat+1) on the left, `others[1]` (seat+2) across, and
 * `others[0]` (seat+3) on the right. So relative seat 0,1,2,3 maps to sides
 * bottom, left, top, right. There is no exported helper for this in the engine —
 * the mapping is the client's, so it lives here with the thing that needs it.
 */
export function sideOfSeat(seat: Seat, youSeat: Seat): number {
  return [2, 3, 0, 1][(seat - youSeat + 4) % 4] as number;
}

/**
 * Where the break falls, as a ring position in the diagram.
 *
 * The two do not share a scale: `breakOffset` indexes the 108-tile wall, and the
 * diagram is 28 stacks because 4 × 7 × 2 = 56 is what the deal *leaves*, not what
 * the wall was. So this maps proportionally rather than by index — the ring
 * position keeps its place around the table and its place along the wall, which
 * is what a player can actually read off it. The rotation by `youSeat` is what
 * turns an absolute seat into a screen side, exactly as `sideOfSeat` does.
 *
 * **The rotation adds where it used to subtract**, which is the client half of
 * N22. The engine puts seat `s`'s wall in array quarter `(4 - s) % 4`, so that
 * consuming the array forwards travels counterclockwise round the table the way
 * play does; relative quarter is therefore `absolute + youSeat`, not
 * `absolute - youSeat`. Get this sign wrong and the break opens on the wrong
 * player's wall — silently, since every value is still in range.
 */
export function wallHead(breakOffset: number, youSeat: Seat): number {
  const absolute = Math.round((breakOffset / WALL_SIZE) * WALL_STACKS);
  return (((absolute + youSeat * WALL_STACKS_PER_SIDE) % WALL_STACKS) + WALL_STACKS) % WALL_STACKS;
}

/**
 * Tiles still standing in each stack, indexed by ring position.
 *
 * Both ends move. The head walks forward from the break, two tiles a stack; the
 * tail walks *backward* from the stack before it, because `kongDrawIndex` starts
 * at the last tile and decrements — a kong replacement comes off the far end.
 * Collapsing the two into one count and taking it all off one corner is what made
 * a round with two kongs draw a wall that was wrong at both ends. (N14)
 *
 * Exported to be tested: the client suite runs in Node with no DOM.
 */
export function wallStacks(state: WallState): number[] {
  const head = ((state.head % WALL_STACKS) + WALL_STACKS) % WALL_STACKS;
  const fromHead = Math.max(0, Math.min(state.drawnHead, WALL_TILES));
  // Clamped against what the head has already taken, so the two ends can never
  // claim the same tile and report more standing than the wall holds.
  const fromTail = Math.max(0, Math.min(state.drawnTail, WALL_TILES - fromHead));

  return Array.from({ length: WALL_STACKS }, (_, ring) => {
    const forward = (ring - head + WALL_STACKS) % WALL_STACKS;
    const backward = WALL_STACKS - 1 - forward;
    const takenFront = Math.max(0, Math.min(2, fromHead - forward * 2));
    const takenBack = Math.max(0, Math.min(2, fromTail - backward * 2));
    return Math.max(0, 2 - takenFront - takenBack);
  });
}

/**
 * Ring position → the side it sits on and the slot along that side.
 *
 * The walk is a genuine ring, which it was not before: `wallSlots` used to run
 * top left-to-right, right top-to-bottom, bottom **left-to-right**, left
 * top-to-bottom, so it jumped from the bottom-right corner back to the
 * bottom-left. That is invisible while the head is pinned to a corner and stops
 * being invisible the moment the dice move it. (N14)
 *
 * **And it went round the table the wrong way.** Sides used to advance bottom →
 * left → top → right, which on screen is clockwise, while the turn passes to the
 * player on your right — counterclockwise. So the wall opened one way and play
 * travelled the other. They now both go bottom → right → top → left, matching
 * `sideOfSeat`: relative seat 3, the next to play, is on side 1. (N22)
 *
 * Each side's direction is still chosen so one side's exit corner is the next
 * side's entry — which under the new order means the reversed pair is top and
 * right rather than bottom and left.
 */
export function ringSlot(ring: number): { side: number; i: number } {
  const side = [2, 1, 0, 3][Math.floor(ring / WALL_STACKS_PER_SIDE)] as number;
  const k = ring % WALL_STACKS_PER_SIDE;
  // Bottom runs left-to-right into the bottom-right corner, right runs up into
  // the top-right, top runs right-to-left, left runs down and closes the loop.
  const i = side === 0 || side === 1 ? WALL_STACKS_PER_SIDE - 1 - k : k;
  return { side, i };
}

/**
 * Every tile of the wall, placed. Two per stack: `layer` 0 is the one sitting on
 * top, drawn offset towards the outside of the ring, and 1 is the one under it,
 * nearer the middle. They come out in painting order — later stacks lap over
 * earlier ones, and the lower tile of a stack covers the upper one, which is what
 * makes a stack read as a stack rather than two tiles.
 */
export function wallSlots(state: WallState): WallSlot[] {
  const stacks = wallStacks(state);
  const slots: WallSlot[] = [];
  // Painting order is the ring's, not the screen's: a stack has to lap the one
  // before it in the direction the wall is walked, or the run reads backwards.
  for (let ring = 0; ring < WALL_STACKS; ring++) {
    const { side, i } = ringSlot(ring);
    const held = stacks[ring] ?? 0;
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
  return slots;
}

/** Everything the diagram needs, read off a view. */
export function wallStateOf(view: Pick<PlayerView, 'dice' | 'wallDrawn' | 'you'>): WallState {
  return {
    head: wallHead(view.dice.breakOffset, view.you.seat),
    drawnHead: view.wallDrawn.head,
    drawnTail: view.wallDrawn.tail,
  };
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
export function WallDiagram({ remaining, state }: { remaining: number; state: WallState }) {
  const t = useT();
  return (
    <div className="wall-diagram" role="img" aria-label={t('play.wall', { n: remaining })}>
      {wallSlots(state).map((slot, i) => (
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
