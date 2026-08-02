import type { PlayerView } from '@sichuan-mahjong/engine';
import { HandCountChip } from './HandCountChip.js';
import { MeldChip } from './MeldDisplay.js';
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
      {/* Two chips a row at 80px, wrapping — four melds is the maximum a hand can
          hold. See MeldChip for why this isn't the full flush run the across
          opponent gets. */}
      {opp.melds.length > 0 && (
        <div
          className={`flex flex-wrap gap-1 w-20 flex-shrink-0 ${
            side === 'right' ? 'justify-end' : ''
          }`}
        >
          {opp.melds.map((m, i) => (
            <MeldChip key={i} meld={m} />
          ))}
        </div>
      )}
      {/* Grows downward, two flush tiles wide, scrolling inside the column.
          The old single sideways row cut a tile in half at 80px — and worse, on
          the right the column is a flex parent, so `max-w-full` resolved against
          min-content instead of 80px and the tray rendered 211.6px wide, spilling
          132px across the well. Two 32px tiles fit 80px exactly, so nothing is
          ever cut mid-tile.
          `min-h-0` with no `flex-1`: shrink-and-scroll when the column is short,
          but never *grow*. flex-1 here stretched the tray to the full column
          height, so six discards drew a tray box running most of the way down a
          tall viewport with nothing in the lower two-thirds of it.
          `content-start items-start` is the other half, and the one that was
          drawing elongated tiles: a wrapping flex container defaults to
          `align-content: stretch`, so spare cross-axis space is handed to the
          lines and the tiles grow *past* their aspect ratio. On a desktop-height
          window six discards were drawn as six very long tiles. */}
      {(opp.discards.length > 0 || opp.pendingFirstDiscard) && (
        <div className="flex flex-wrap content-start items-start w-20 min-h-0 overflow-y-auto discard-tray tile-lap">
          {opp.pendingFirstDiscard && <TileBack size="sm" />}
          {/* slice, so the void discard only carries its mark while it is still
              in the visible tail of a capped tray. */}
          {opp.discards.slice(-6).map((id, i) => (
            <Tile
              key={id}
              id={id}
              size="sm"
              lastDiscard={id === lastDiscardTile}
              voidDiscard={opp.firstDiscardIsVoid && id === opp.discards[0] && i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
