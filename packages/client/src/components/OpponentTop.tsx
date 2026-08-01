import type { PlayerView } from '@sichuan-mahjong/engine';
import { HandCountChip } from './HandCountChip.js';
import { MeldDisplay } from './MeldDisplay.js';
import { Tile, TileBack } from './Tile.js';

/** The opponent seated across the table. */
export function OpponentTop({ view, relSeat }: { view: PlayerView; relSeat: 0 | 1 | 2 }) {
  const opp = view.others[relSeat];
  const lastDiscardTile = view.lastDiscard?.from === opp.seat ? view.lastDiscard.tile : null;
  return (
    <div className="flex flex-col items-center gap-1 w-full min-w-0">
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
      {/* Used to be 14 shrink-to-fit backs, one per tile — real information is
          never in the backs (see HandCountChip), and the row was wide enough to
          clip off both screen edges before it shrank. (F4, R2.2) */}
      <HandCountChip count={opp.handCount} />
      {/* One row that scrolls, not a wrapping block: three pungs are ~300px and
          a 320px phone wrapped them onto a second 47px row, which is height the
          play screen has none of. The inner w-max still centres while it fits —
          centring the scroller itself would put the leftmost meld out of reach
          once it doesn't. pt-1 keeps the kong badge (-top-1) out of the clip
          that comes with overflow-x. (R6) */}
      {opp.melds.length > 0 && (
        <div className="max-w-full overflow-x-auto pt-1">
          <div className="flex flex-nowrap gap-1 w-max mx-auto">
            {opp.melds.map((m, i) => (
              <MeldDisplay key={i} meld={m} />
            ))}
          </div>
        </div>
      )}
      {/* A single non-wrapping row, not the full wrapping history: the discard
          that drives claims is also rendered large in the well, and this
          column is full-width, so a row holds plenty — no scroll needed
          (contrast OpponentSide, whose 80px column can't fit one). (R2.3) */}
      {(opp.discards.length > 0 || opp.pendingFirstDiscard) && (
        <div className="flex gap-0.5 max-w-full overflow-x-hidden discard-tray">
          {/* Their void tile is face down until they flip it on their first turn (A37) */}
          {opp.pendingFirstDiscard && <TileBack size="sm" />}
          {opp.discards.slice(-8).map(id => (
            <Tile key={id} id={id} size="sm" lastDiscard={id === lastDiscardTile} />
          ))}
        </div>
      )}
    </div>
  );
}
