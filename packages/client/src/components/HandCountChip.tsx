import { TileBack } from './Tile.js';

/**
 * Opponent hands are public only as a count (`PublicPlayer.handCount`) — the
 * server never sends their concealed tiles — so any representation is free to
 * be as compact as it likes. A short overlapped stack plus the count reads
 * faster than counting slivers and, unlike one tile back per tile, doesn't set
 * the height of the row it sits in. Shared by the across and side opponent
 * displays. (R2.2)
 *
 * The stack overlaps the way that seat's hand actually faces you: the opponent
 * across the table shows theirs as a row, so `horizontal` there makes the chip
 * exactly one tile tall instead of three overlapped ones — 61px to 39px in the
 * zone with the tightest height budget on the screen. The side seats face you
 * edge-on and keep the vertical stack, which is also all an 80px column has room
 * for.
 *
 * The two laps are the same *fraction* of the tile, not the same length. A back
 * is 32px wide and 38.9px tall, so one -mt-7 left 10.9px of each vertical tile
 * showing against the horizontal one's 4px — a third of a tile against an
 * eighth, in the column where height is the scarce dimension and width is not.
 * -mt-8 is the vertical match, and hands the side seats' trays 8px back. (N38)
 */
export function HandCountChip({
  count,
  orientation = 'vertical',
}: { count: number; orientation?: 'vertical' | 'horizontal' }) {
  if (count === 0) return null;
  const horizontal = orientation === 'horizontal';
  return (
    <div className="flex items-center gap-1">
      <div className={horizontal ? 'flex' : 'flex flex-col'}>
        {Array.from({ length: Math.min(count, 3) }, (_, i) => (
          <div key={i} className={i > 0 ? (horizontal ? '-ml-7' : '-mt-8') : ''}>
            <TileBack size="sm" />
          </div>
        ))}
      </div>
      <span className="text-[11px] font-semibold text-green-200">×{count}</span>
    </div>
  );
}
