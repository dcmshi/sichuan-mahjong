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
      {opp.melds.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1 max-w-full">
          {opp.melds.map((m, i) => (
            <MeldDisplay key={i} meld={m} />
          ))}
        </div>
      )}
      {(opp.discards.length > 0 || opp.pendingFirstDiscard) && (
        <div className="flex flex-wrap gap-0.5 max-w-full discard-tray">
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
