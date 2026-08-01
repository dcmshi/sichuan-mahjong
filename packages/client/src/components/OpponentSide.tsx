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
      className={`flex flex-col items-center gap-1 ${side === 'right' ? 'items-end' : 'items-start'}`}
    >
      <div
        className={[
          'text-xs font-semibold px-2 py-0.5 rounded-full',
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
          number is also easier to read than counting slivers. */}
      <HandCountChip count={opp.handCount} />
      {/* Single row, horizontally scrollable — not a capped non-wrapping row
          like the across opponent's: this column is only 80px wide (two `sm`
          tiles), so a non-scrolling row would throw away real information a
          player uses to judge safety. Scrolling keeps the same slice(-6)
          history reachable at the same fixed height — the mechanism a later
          phase applies to the player's own tray too. (R2.3, amended) */}
      {(opp.discards.length > 0 || opp.pendingFirstDiscard) && (
        <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto max-w-full discard-tray">
          {opp.pendingFirstDiscard && (
            <div className="flex-shrink-0">
              <TileBack size="sm" />
            </div>
          )}
          {opp.discards.slice(-6).map(id => (
            <div key={id} className="flex-shrink-0">
              <Tile id={id} size="sm" lastDiscard={id === lastDiscardTile} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
