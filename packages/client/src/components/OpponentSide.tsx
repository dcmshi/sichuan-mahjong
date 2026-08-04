import type { PlayerView } from '@sichuan-mahjong/engine';
import { memo } from 'react';
import { splitPile } from '../discardPile.js';
import { usePileTap } from '../hooks/usePileTap.js';
import { useT } from '../i18n/useT.js';
import { HandCountChip } from './HandCountChip.js';
import { MeldChip } from './MeldDisplay.js';
import { Tile, TileBack } from './Tile.js';

/**
 * The river, as a table lays one out: **six tiles a row, then start another.**
 *
 * That is the physical convention rather than an invention — riichi.wiki's *Kawa*
 * and every client that draws one. A side seat's row runs along the screen's
 * vertical axis, so a "row" here is a column of six and the next one starts
 * beside it, growing away from its owner toward the middle of the table.
 *
 * The arithmetic is what makes it fit. Six sideways tiles lapped at 22.5% stand
 * `32 + 5 × 24.8 = 156px`, and each column is 38.9px wide — so **two of them are
 * 77.7px in an 80px column**, and twelve discards cost the height of six. One
 * long line of twelve would cost 305px, which no phone in the audit has.
 *
 * This replaces a flat cap, which was the wrong shape of answer twice: N10 raised
 * it to ten on box arithmetic that the *art* does not obey (a tray tile is a flex
 * item, so a short column shrinks its box while `.tile-sideways .tile-face` stays
 * sized off `--tile-w`), and N38 lowered it to six, which showed less rather than
 * fixing the squash.
 */
const RIVER_ROWS = 6;
const RIVER_COLS = 2;
const SIDE_TRAY_CAP = RIVER_ROWS * RIVER_COLS;

/**
 * A side opponent's column (left or right of the well).
 *
 * Memoised: `view` is a fresh object on every server push, which is exactly when
 * this should redraw — but opening a discard pile is local state in `PlayPhase`,
 * and without this that tap rebuilt both side columns on the way to the modal.
 * `onOpenPile` has to keep its identity across that toggle for it to bite; see
 * the handlers in `Game.tsx`. (N38)
 */
function OpponentSideImpl({
  view,
  relSeat,
  side,
  onOpenPile,
}: {
  view: PlayerView;
  relSeat: 0 | 1 | 2;
  side: 'left' | 'right';
  onOpenPile: () => void;
}) {
  const t = useT();
  const pileTap = usePileTap(onOpenPile);
  const opp = view.others[relSeat];
  const lastDiscardTile = view.lastDiscard?.from === opp.seat ? view.lastDiscard.tile : null;
  const { voidDiscard: voidDiscardTile, pile: pileDiscards } = splitPile(opp);

  // The river, oldest first. The void declaration is that seat's *first discard*,
  // so it heads the river rather than sitting outside it — which is both where a
  // table puts it and the only place a two-column river leaves for it, 77.7px of
  // an 80px column being the whole width. It keeps its glow, so it still reads as
  // the one public statement rather than as an ordinary first throw. Pinned: what
  // the cap drops is the *oldest ordinary* discards, never the declaration.
  const head = opp.pendingFirstDiscard || voidDiscardTile !== null;
  const room = SIDE_TRAY_CAP - (head ? 1 : 0);
  const shown = pileDiscards.slice(-room);
  const hidden = pileDiscards.length - shown.length;
  const cells: ({ id: number; declared: boolean } | null)[] = [
    ...(head ? [voidDiscardTile === null ? null : { id: voidDiscardTile, declared: true }] : []),
    ...shown.map(id => ({ id, declared: false })),
  ];
  const columns: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += RIVER_ROWS) columns.push(cells.slice(i, i + RIVER_ROWS));

  // **Each river is your own layout, turned to that seat's chair.** (N44)
  //
  // Yours runs left-to-right and wraps downward — along your right hand, then
  // toward you. Rotate that into the other three chairs and every axis follows
  // from where they sit:
  //
  //   seat    faces    a row runs      rows wrap     so the oldest tile is
  //   you     up       →  (rightward)  ↓ toward you  top-left
  //   left    right    ↓  (downward)   ← leftward    top of the *rightmost* row
  //   right   left     ↑  (upward)     → rightward   bottom of the *leftmost* row
  //   across  down     ←  (leftward)   ↑ upward      right end (see OpponentTop)
  //
  // Two things had been read off this wrongly. N42/N43 put all four in the
  // *viewer's* reading order, which is not what a table does. And before that the
  // wrap direction was on the wrong sides: the left seat grew rightward and the
  // right seat leftward, when a river grows toward its owner, not away.
  //
  // The lap needs no say in it, which is the part worth keeping straight. A row's
  // direction is fixed by the art: `rotate(90deg)` puts the body band at the
  // bottom of the left seat's tiles so its rows must run down, `rotate(-90deg)`
  // puts it at the top of the right seat's so theirs must run up (N36). Both
  // already did. Only the wrap was ever free, and it is a `flex-row-reverse`.

  return (
    <div
      className={[
        // `justify-center`, so a side seat's zone sits in the middle of the band
        // it shares with the well rather than hanging from the top of it. On a
        // short phone the content fills the column and this is a no-op; on a tall
        // one — an iPad's 676px middle row against ~200px of content — top
        // alignment left the two side seats stranded above a mostly empty well
        // while the across seat stayed at the top of the screen. Three seats round
        // a table should read as three seats, not as a row of three headers.
        //
        // No vertical padding: it used to align this column's first row with the
        // across zone's `py-2`, and centring makes that alignment come out of the
        // arithmetic instead. On a 320px phone those 8px were the difference
        // between a 24px river tile and a squashed 21.3px one.
        'flex flex-col min-h-0 h-full gap-1 justify-center',
        side === 'right' ? 'items-end tiles-face-left' : 'items-start',
      ].join(' ')}
    >
      {/* Name and hand count on one 21px row. (N38)

          N10 drew this seat's hand as a vertical stack of backs, edge-on the way
          the seat faces you, and that cost 71px — of a column that gets 154px in
          total on a 320×568 phone, before a name, a meld or a single discard. The
          name above it cost 39 more. Together they were 82px of overhead for two
          facts that fit on one line: who this is, and how many tiles they hold.
          `orientation="count"` is what makes them fit an 80px column; the backs
          were decoration, and the across seat still draws its own. */}
      <div className="flex items-center gap-0.5 w-20 md:w-28 lg:w-32 flex-shrink-0">
        <div
          className={[
            // px-1.5, not px-2. The count chip grew by a tile back (N42) and this
            // row is 80px on a phone, so the name — the row's only shrinkable
            // child — paid for all of it and truncated "Bot 2" to "Bo…". N7's
            // shape exactly: nothing errors, the text is just 0px narrower than
            // it needs. The 5px back comes off the padding rather than the glyphs.
            'text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-0 truncate',
            view.turn === opp.seat
              ? 'bg-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.7)]'
              : 'bg-black/25 text-green-200',
          ].join(' ')}
        >
          {opp.name}
          {opp.status === 'hu' ? ' 🏆' : ''}
        </div>
        <HandCountChip count={opp.handCount} orientation="count" />
      </div>
      {/* Two chips a row at 80px, wrapping — four melds is the maximum a hand can
          hold. See MeldChip for why this isn't the full flush run the across
          opponent gets.

          `pb-1` because the chip's Pung/Kong badge is `absolute -bottom-1`: it
          hangs 4px below its chip, and with the river directly beneath, that put
          an amber pill across the first discard. The row needs the 4px, not the
          badge. */}
      {opp.melds.length > 0 && (
        <div
          className={`flex flex-wrap gap-1 w-20 md:w-28 lg:w-32 flex-shrink-0 pb-1 ${
            side === 'right' ? 'justify-end' : ''
          }`}
          data-meld-zone={opp.seat}
        >
          {opp.melds.map((m, i) => (
            <MeldChip key={i} meld={m} sideways />
          ))}
        </div>
      )}
      {/* The river: columns of six, laid beside each other. See RIVER_ROWS.

          Each column runs the way its own seat lays tiles down — the left seat
          downward, the right seat upward — because the 22.5% band the lap hides
          sits on opposite edges once the two quarter turns are opposite (N36).
          The columns then grow *away* from their owner, toward the middle of the
          table: rightward for the left seat, and `flex-row-reverse` leftward for
          the right one. The tiles are sideways, so a column is 38.9px wide and
          two of them are 77.7px of an 80px column — which fits only because
          `.discard-tray.tile-run-v` drops the 0.75rem left padding that exists
          for a *horizontal* lap's bleed and buys nothing here. (N38)

          `min-h-0` and no `flex-1`, as since N10: shrink when the column is
          short, never grow. */}
      {(cells.length > 0 || hidden > 0) && (
        <button
          type="button"
          aria-label={t('pile.open', { name: opp.name })}
          {...pileTap}
          // `flex-row-reverse` on the **left** seat, which is the swap N44 is.
          // Rows wrap toward their owner, and this seat's owner is off the left
          // edge — so its first row is the rightmost, nearest the well, and later
          // ones stack away from it. The right seat is the plain direction for
          // exactly the same reason.
          className={`flex min-h-0 w-20 md:w-28 lg:w-32 cursor-pointer discard-tray discard-tray-v ${
            side === 'left' ? 'flex-row-reverse' : ''
          }`}
        >
          {/* The cap is for space (R1), but silently dropping the earliest
              discards hid information that matters for reading a hand. The count
              is free to show.

              Absolute, unlike every other tray's: two river columns are 77.7px of
              an 80px box, so a label in flow pushed the second one outside the
              tray. It marks the *old* end, which each seat puts in a different
              corner: the left seat's first row is its rightmost and runs down, so
              the old end is top-right; the right seat's is its leftmost and runs
              up, so the old end is bottom-left. */}
          {hidden > 0 && (
            <span
              className={`absolute z-[3] text-[9px] leading-none text-white/70 bg-black/60 rounded px-0.5 py-px ${
                side === 'left' ? 'top-0 right-0' : 'bottom-0 left-0'
              }`}
            >
              +{hidden}
            </span>
          )}
          {columns.map((col, ci) => (
            <div
              key={ci}
              // `justify-end` on the right seat only, and it is not cosmetic:
              // `column-reverse` puts main-start at the *bottom*, so a partial
              // column packed there and the newest column hung off the tray's
              // floor while the left seat's grew from its ceiling. Packing to
              // main-end is what makes a short column start at the top, as the
              // left seat's already does. Full columns are unaffected. (N42)
              className={`tile-run-v flex-shrink-0 ${
                side === 'right' ? 'tile-lap-v-up items-end' : 'tile-lap-v items-start'
              }`}
            >
              {col.map((cell, ri) =>
                cell === null ? (
                  // Face down until its owner flips it on their first turn (A37).
                  <TileBack key={`b${ri}`} size="sm" sideways />
                ) : (
                  <Tile
                    key={cell.id}
                    id={cell.id}
                    size="sm"
                    sideways
                    // The oldest cell of the first row. `layout-probe.mjs` reads
                    // its corner and checks it against where that seat's chair
                    // says it belongs — top-right for the left seat, bottom-left
                    // for the right one — which no DOM position can stand in for
                    // once a row-reverse and a column-reverse are both in play.
                    {...(ci === 0 && ri === 0 ? { riverFirst: true } : {})}
                    {...(cell.declared ? { voidDiscard: true } : {})}
                    lastDiscard={cell.id === lastDiscardTile}
                  />
                ),
              )}
            </div>
          ))}
        </button>
      )}
    </div>
  );
}

export const OpponentSide = memo(OpponentSideImpl);
