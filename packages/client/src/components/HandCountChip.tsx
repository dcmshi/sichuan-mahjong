import { TileBack } from './Tile.js';

/**
 * Opponent hands are public only as a count (`PublicPlayer.handCount`) — the
 * server never sends their concealed tiles — so any representation is free to
 * be as compact as it likes. A short overlapped stack plus the count reads
 * faster than counting slivers and, unlike one tile back per tile, doesn't set
 * the height of the row it sits in. Shared by the across and side opponent
 * displays. (R2.2)
 */
export function HandCountChip({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-col">
        {Array.from({ length: Math.min(count, 3) }, (_, i) => (
          <div key={i} className={i > 0 ? '-mt-7' : ''}>
            <TileBack size="sm" />
          </div>
        ))}
      </div>
      <span className="text-[11px] font-semibold text-green-200">×{count}</span>
    </div>
  );
}
