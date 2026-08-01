import type { PlayerView } from '@sichuan-mahjong/engine';
import { HandCountChip } from './HandCountChip.js';
import { Tile, TileBack } from './Tile.js';

/** A side opponent's column (left or right of the well). */
export function OpponentSide({
  view,
  relSeat,
  side,
}: { view: PlayerView; relSeat: 0 | 1 | 2; side: 'left' | 'right' }) {
  const opp = view.others[relSeat];
  const lastDiscardTile = view.lastDiscard?.from === opp.seat ? view.lastDiscard.tile : null;
  return (
    <div
      className={`flex flex-col min-h-0 h-full gap-1 ${side === 'right' ? 'items-end' : 'items-start'}`}
    >
      <div
        className={[
          'text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
          view.turn === opp.seat
            ? 'bg-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.7)]'
            : 'bg-black/25 text-green-200',
        ].join(' ')}
      >
        {opp.name}
        {opp.status === 'hu' ? ' 🏆' : ''}
      </div>
      {/* A short overlapped stack plus the count, not one back per tile: thirteen
          stacked backs stood ~500px tall, which set the height of the whole
          middle row and pushed the player's own hand off a phone screen. The
          number is also easier to read than counting slivers. Stays vertical —
          this seat's hand faces you edge-on, and 80px has no room for a row. */}
      <div className="flex-shrink-0">
        <HandCountChip count={opp.handCount} />
      </div>
      {/* Grows downward, two flush tiles wide, scrolling inside the column.
          The old single sideways row cut a tile in half at 80px — and worse, on
          the right the column is a flex parent, so `max-w-full` resolved against
          min-content instead of 80px and the tray rendered 211.6px wide, spilling
          132px across the well. Two 32px tiles fit 80px exactly, so nothing is
          ever cut mid-tile, and flex-1 min-h-0 means this can never set the middle
          row's height the way thirteen backs once did. */}
      {(opp.discards.length > 0 || opp.pendingFirstDiscard) && (
        <div className="flex flex-wrap w-20 flex-1 min-h-0 overflow-y-auto discard-tray">
          {opp.pendingFirstDiscard && <TileBack size="sm" flat />}
          {opp.discards.slice(-6).map(id => (
            <Tile key={id} id={id} size="sm" flat lastDiscard={id === lastDiscardTile} />
          ))}
        </div>
      )}
    </div>
  );
}
