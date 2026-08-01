import type { PlayerView } from '@sichuan-mahjong/engine';
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
      {/* Shrink-to-fit like the own-hand row: 14 fixed-width backs are wider
          than a phone and used to clip off both screen edges. (F4) */}
      <div className="flex gap-0.5 w-full justify-center">
        {Array.from({ length: opp.handCount }, (_, i) => (
          <div key={i} className="flex-1 min-w-0 max-w-[2rem]">
            <TileBack fill />
          </div>
        ))}
      </div>
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
