import type { PlayerView } from '@sichuan-mahjong/engine';
import { splitPile } from '../discardPile.js';
import { usePileTap } from '../hooks/usePileTap.js';
import { useT } from '../i18n/useT.js';
import { HandCountChip } from './HandCountChip.js';
import { MeldDisplay } from './MeldDisplay.js';
import { Tile, TileBack } from './Tile.js';

/** The opponent seated across the table. */
export function OpponentTop({
  view,
  relSeat,
  onOpenPile,
}: { view: PlayerView; relSeat: 0 | 1 | 2; onOpenPile: () => void }) {
  const t = useT();
  const pileTap = usePileTap(onOpenPile);
  const opp = view.others[relSeat];
  const lastDiscardTile = view.lastDiscard?.from === opp.seat ? view.lastDiscard.tile : null;
  const { voidDiscard: voidDiscardTile, pile: pileDiscards } = splitPile(opp);
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
          clip off both screen edges before it shrank. (F4, R2.2) Overlapped
          sideways, because this is the seat whose hand faces you as a row. */}
      <HandCountChip count={opp.handCount} orientation="horizontal" />
      {/* One row that scrolls, not a wrapping block: three pungs are ~300px and
          a 320px phone wrapped them onto a second 47px row, which is height the
          play screen has none of. The inner w-max still centres while it fits —
          centring the scroller itself would put the leftmost meld out of reach
          once it doesn't. pt-1 keeps the kong badge (-top-1) out of the clip
          that comes with overflow-x. (R6) */}
      {opp.melds.length > 0 && (
        <div className="max-w-full overflow-x-auto pt-1">
          <div className="flex flex-nowrap gap-1 w-max mx-auto" data-meld-zone={opp.seat}>
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
      {/* The void declaration, held out of the pile and set above it: it is the
              one public statement of what this seat declared, and reading it off
              the front of a wrapping pile meant hunting for it. Face down until
              its owner flips it on their first turn (A37). */}
      {/* rotate-180 for the same reason the pile below is turned (N32): this seat
          faces you, so the top of their tiles points at you. */}
      {(opp.pendingFirstDiscard || voidDiscardTile !== null) && (
        <div className="flex justify-center rotate-180">
          {voidDiscardTile === null ? (
            <TileBack size="sm" />
          ) : (
            <Tile
              id={voidDiscardTile}
              size="sm"
              voidDiscard
              lastDiscard={voidDiscardTile === lastDiscardTile}
            />
          )}
        </div>
      )}
      {/* Turned all the way round, not merely reversed. (N32, replacing N10)
          N10 mirrored the *order* so the pile grew the way theirs does, and
          deliberately stopped short of 180° on the grounds that these are drawn
          face up so you can read them. Reported anyway — a seat facing you whose
          tiles face you back is the same "four copies of one viewpoint" the
          order fixed half of. The readability that argument was protecting is
          now a tap away (N33), so the tiles sit the way they would on a table.

          One rotation on the tray rather than one per tile: it turns order, lap
          direction and the bleed padding together, which is exactly the pile
          seen from the other side — so the explicit `.reverse()` is gone, being
          what the rotation now does. A 180° turn about a box's own centre maps
          that box onto itself, so `viewport.spec.ts` reads the same rects. */}
      {pileDiscards.length > 0 && (
        <button
          type="button"
          aria-label={t('pile.open', { name: opp.name })}
          {...pileTap}
          className="flex items-start max-w-full overflow-x-hidden cursor-pointer discard-tray tile-lap rotate-180"
        >
          {/* The cap is for space (R1), but silently dropping the earliest
              discards hid information that matters for reading a hand. The
              count is free to show. First in DOM, not last: it stands for the
              tiles dropped off the *old* end, and the rotation puts what comes
              first on the right. Turned back upright — a number is read rather
              than placed on a table. */}
          {pileDiscards.length > 9 && (
            <span className="self-center text-[9px] text-white/50 px-1 rotate-180">
              +{pileDiscards.length - 9}
            </span>
          )}
          {pileDiscards.slice(-9).map(id => (
            <Tile key={id} id={id} size="sm" lastDiscard={id === lastDiscardTile} />
          ))}
        </button>
      )}
    </div>
  );
}
