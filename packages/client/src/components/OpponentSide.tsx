import type { PlayerView } from '@sichuan-mahjong/engine';
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
      <div className="flex items-center gap-1">
        <div className="flex flex-col">
          {Array.from({ length: Math.min(opp.handCount, 3) }, (_, i) => (
            <div key={i} className={i > 0 ? '-mt-7' : ''}>
              <TileBack size="sm" />
            </div>
          ))}
        </div>
        {opp.handCount > 0 && (
          <span className="text-[11px] font-semibold text-green-200">×{opp.handCount}</span>
        )}
      </div>
      {(opp.discards.length > 0 || opp.pendingFirstDiscard) && (
        <div className="flex flex-wrap gap-0.5 discard-tray">
          {opp.pendingFirstDiscard && <TileBack size="sm" />}
          {opp.discards.slice(-6).map(id => (
            <Tile key={id} id={id} size="sm" lastDiscard={id === lastDiscardTile} />
          ))}
        </div>
      )}
    </div>
  );
}
