import type { PlayerView } from '@sichuan-mahjong/engine';
import { memo } from 'react';
import { splitPile } from '../discardPile.js';
import { usePileTap } from '../hooks/usePileTap.js';
import { useT } from '../i18n/useT.js';
import { HandCountChip } from './HandCountChip.js';
import { MeldDisplay } from './MeldDisplay.js';
import { Tile, TileBack } from './Tile.js';

/**
 * How many cells the across seat's river draws before it starts counting.
 *
 * Nine, unchanged since R2.3 — this zone is full-width, so its constraint is the
 * screen edge rather than a column. The declaration now occupies one of the nine
 * instead of a 43px row of its own.
 */
const TOP_TRAY_CAP = 9;

/** The opponent seated across the table. Memoised for the reason in `OpponentSide`. */
function OpponentTopImpl({
  view,
  relSeat,
  onOpenPile,
}: { view: PlayerView; relSeat: 0 | 1 | 2; onOpenPile: () => void }) {
  const t = useT();
  const pileTap = usePileTap(onOpenPile);
  const opp = view.others[relSeat];
  const lastDiscardTile = view.lastDiscard?.from === opp.seat ? view.lastDiscard.tile : null;
  const { voidDiscard: voidDiscardTile, pile: pileDiscards } = splitPile(opp);

  // Nine cells across, the declaration among them and pinned: what the cap drops
  // is the oldest *ordinary* discards, never the one tile that says what this
  // seat declared. Same shape as the side seats' river (see `OpponentSide`).
  const head = opp.pendingFirstDiscard || voidDiscardTile !== null;
  const room = TOP_TRAY_CAP - (head ? 1 : 0);
  const shown = pileDiscards.slice(-room);
  const hidden = pileDiscards.length - shown.length;
  const cells: ({ id: number; declared: boolean } | null)[] = [
    ...(head ? [voidDiscardTile === null ? null : { id: voidDiscardTile, declared: true }] : []),
    ...shown.map(id => ({ id, declared: false })),
  ];

  // Age order in the DOM, which the tray's 180° turn lays out right-to-left —
  // and that is correct, because this seat faces *down* the screen. Their right
  // hand points to the screen's left, so their river runs leftward from the right
  // end, exactly as yours runs rightward from the left. N43 reversed this on the
  // theory that every seat should read the way you read; a table does not work
  // that way, and the rule is in `OpponentSide`. (N44)
  //
  // It never wraps — `TOP_TRAY_CAP` is 9 in a full-width zone — so the "rows
  // stack upward" half of that rule has nothing to act on here.

  return (
    <div className="flex flex-col items-center gap-1 w-full min-w-0">
      {/* Name, hand count and melds all on one row. (N38)

          Stacked they were three rows of 21 + 39 + 47 = 107px, of a zone that was
          a constant 227px on every phone — and the middle row beneath is the
          board's only `flex-1`, so every px this zone holds is one the side
          columns don't get. Side by side they are 47px, the height of the tallest
          of the three, and nothing is crowded: the row is 296–406px wide and the
          name and count take ~125 of it. The melds keep the scroller they have
          always had, so four of them scroll rather than wrap — they just start
          scrolling sooner.

          pt-1 keeps the kong badge (-top-1) out of the clip that comes with
          overflow-x. (R6) */}
      <div className="flex items-center gap-2 max-w-full pt-1">
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
        {/* Used to be 14 shrink-to-fit backs, one per tile — real information is
            never in the backs (see HandCountChip), and the row was wide enough to
            clip off both screen edges before it shrank. (F4, R2.2) Overlapped
            sideways, because this is the seat whose hand faces you as a row. */}
        <div className="flex-shrink-0">
          <HandCountChip count={opp.handCount} orientation="horizontal" />
        </div>
        {opp.melds.length > 0 && (
          <div className="min-w-0 overflow-x-auto">
            <div className="flex flex-nowrap gap-1 w-max" data-meld-zone={opp.seat}>
              {opp.melds.map((m, i) => (
                <MeldDisplay key={i} meld={m} />
              ))}
            </div>
          </div>
        )}
      </div>
      {/* A single non-wrapping row, not the full wrapping history: the discard
          that drives claims is also rendered large in the well, and this
          column is full-width, so a row holds plenty — no scroll needed
          (contrast OpponentSide, whose 80px column can't fit one). (R2.3) */}
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
      {/* The void declaration heads the river rather than sitting in a row of its
          own. (N38, replacing N37's placement.) It *is* this seat's first
          discard, which is where a table puts it, and it keeps its white glow so
          it still reads as the one public statement rather than an ordinary
          throw. The row it used to occupy was 43px of a zone that measures a
          constant 227px on every phone — and the middle row below is the board's
          only `flex-1`, so that 43px came straight out of the side columns, which
          get 80px in total on a 320×568 phone. Face down until its owner flips
          it on their first turn (A37). */}
      {(cells.length > 0 || hidden > 0) && (
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
          {hidden > 0 && (
            <span className="self-center text-[9px] text-white/50 px-1 rotate-180">+{hidden}</span>
          )}
          {cells.map((cell, i) =>
            cell === null ? (
              <TileBack key={`b${i}`} size="sm" />
            ) : (
              <Tile
                key={cell.id}
                id={cell.id}
                size="sm"
                {...(cell.declared ? { voidDiscard: true } : {})}
                lastDiscard={cell.id === lastDiscardTile}
              />
            ),
          )}
        </button>
      )}
    </div>
  );
}

export const OpponentTop = memo(OpponentTopImpl);
