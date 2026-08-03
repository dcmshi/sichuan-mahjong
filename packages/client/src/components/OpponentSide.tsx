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
  // The void declaration is drawn on its own above the pile, so the pile is
  // everything after it.
  const pileDiscards = opp.firstDiscardIsVoid ? opp.discards.slice(1) : opp.discards;
  const voidDiscardTile = opp.firstDiscardIsVoid ? (opp.discards[0] ?? null) : null;
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
          data-meld-zone={opp.seat}
        >
          {opp.melds.map((m, i) => (
            <MeldChip key={i} meld={m} />
          ))}
        </div>
      )}
      {/* The void declaration, held out of the pile and set above it: it is the
              one public statement of what this seat declared, and reading it off
              the front of a wrapping pile meant hunting for it. Face down until
              its owner flips it on their first turn (A37). */}
      {(opp.pendingFirstDiscard || voidDiscardTile !== null) && (
        <div className="flex justify-center w-20">
          {voidDiscardTile === null ? (
            <TileBack size="sm" sideways />
          ) : (
            <Tile
              id={voidDiscardTile}
              size="sm"
              sideways
              voidDiscard
              lastDiscard={voidDiscardTile === lastDiscardTile}
            />
          )}
        </div>
      )}
      {/* One lapped column of sideways tiles. (N10)

          This was a `flex-wrap content-start w-20 overflow-y-auto` box capped at
          six, and three things were wrong with it at once: the tiles faced the
          wrong way for a seat sitting at right angles to you, they *wrapped* into
          a ragged two-wide block rather than reading as a pile, and the whole
          thing was a **scroll region** — a scrollbar over six tiles is a layout
          that ran out of room and said so.

          Turning them fixes all three, and buys height rather than spending it: a
          sideways tile is 32px tall against 38.9px upright, and the vertical lap
          takes 22.5% of that off every tile after the first, so the pitch is
          24.8px. Ten now fit in less room than six did, with no wrap and no
          scroller — the cap is raised to match. `min-h-0` and no `flex-1`, as
          before: shrink when the column is short, never grow. */}
      {pileDiscards.length > 0 && (
        <div
          className={`flex flex-col min-h-0 discard-tray tile-run-v tile-lap-v ${
            side === 'right' ? 'items-end' : 'items-start'
          }`}
        >
          {pileDiscards.slice(-10).map(id => (
            <Tile key={id} id={id} size="sm" sideways lastDiscard={id === lastDiscardTile} />
          ))}
          {/* The cap is for space (R1), but silently dropping the earliest
              discards hid information that matters for reading a hand. The
              count is free to show. */}
          {pileDiscards.length > 10 && (
            <span className="text-[9px] text-white/50 px-1">+{pileDiscards.length - 10}</span>
          )}
        </div>
      )}
    </div>
  );
}
