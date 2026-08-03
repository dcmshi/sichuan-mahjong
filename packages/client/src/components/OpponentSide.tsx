import type { PlayerView } from '@sichuan-mahjong/engine';
import { memo } from 'react';
import { splitPile } from '../discardPile.js';
import { usePileTap } from '../hooks/usePileTap.js';
import { useT } from '../i18n/useT.js';
import { HandCountChip } from './HandCountChip.js';
import { MeldChip } from './MeldDisplay.js';
import { Tile, TileBack } from './Tile.js';

/**
 * How many discards a side column draws before it starts counting instead.
 *
 * **Six, because six is what the column can actually draw.** N10 raised this to
 * ten on the arithmetic that a sideways tile is 32px against 38.9px upright and
 * the vertical lap takes 22.5% off each — a 24.8px pitch, so ten in less room
 * than the old six took. True of the *boxes* and false of the tiles: a tray tile
 * is a flex item in a column, so once the content exceeds the space the boxes
 * shrink and the art, sized off `--tile-w`, does not. It overflows, the lap eats
 * past the body band into the face, and by the end of a round the pile draws as a
 * stack of black outlines with no tile visible between them.
 *
 * Measured on a 390×844 phone: a side column gets 157–190px of tray depending on
 * its melds, and `1 + (157 − 9.6 − 32) / 24.8` is five to seven tiles at full
 * size. Ten was never among them. Six is honest at the low end, and what is over
 * it is one tap away (N33) rather than lost.
 *
 * The proper fix — fitting the count to the measured height — is N39; it needs an
 * available height that doesn't move when the count changes, which the tray's own
 * content-sized box is not. (N38)
 */
const SIDE_TRAY_CAP = 6;

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
  return (
    <div
      className={[
        'flex flex-col min-h-0 h-full gap-1',
        side === 'right' ? 'items-end tiles-face-left' : 'items-start',
      ].join(' ')}
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
          24.8px. `min-h-0` and no `flex-1`, as before: shrink when the column is
          short, never grow. (N10 also raised the cap to ten on that arithmetic;
          see SIDE_TRAY_CAP for why it is back to six.) */}
      {/* Each column grows the way its own seat lays tiles down. (N36, replacing
          the shared downward run N32 left behind.) N10 argued a column of
          sideways tiles shows no direction of its own, so both sides could share
          one; the lap says otherwise, since the band it hides is on opposite
          edges once the two seats face opposite ways. Facing the middle from the
          right of the table puts the screen's bottom edge on your left, so that
          pile reads upward — `tile-lap-v-up` turns the column and the lap
          together, and the two must move together. */}
      {/* The declaration sits *beside* the pile rather than above it. (N38)

          Height is the scarce dimension in an 80px column — it is what caps the
          pile at ten and what makes the tiles shrink before that — and stacked,
          the declaration cost a whole tile of it for a single tile of
          information. Beside, it costs none: two sideways tiles are 77.7px and
          the column is 80, which they fit only once the tray stops paying the
          0.75rem left padding that exists for a *horizontal* lap's bleed
          (`.discard-tray.tile-run-v` in index.css).

          It takes the inner side, nearest the wall drawn round the well: that is
          the far side from its owner, which is where every other seat's
          declaration sits and where a tile pushed out onto the table ends up.
          And it aligns with the pile's **oldest** end — the top of the left
          column, the bottom of the reversed right one — because it is that
          seat's first discard, not a header.

          The row is `items-stretch` so the tray still fills it and can shrink
          when the column runs short; the declaration takes `self-start` /
          `self-end` instead of stretching to a pile's height. */}
      {(pileDiscards.length > 0 || opp.pendingFirstDiscard || voidDiscardTile !== null) && (
        <div className={`flex w-20 min-h-0 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
          {pileDiscards.length > 0 && (
            <button
              type="button"
              aria-label={t('pile.open', { name: opp.name })}
              {...pileTap}
              className={`min-h-0 flex-shrink-0 cursor-pointer discard-tray tile-run-v ${
                side === 'right' ? 'tile-lap-v-up items-end' : 'tile-lap-v items-start'
              }`}
            >
              {/* The cap is for space (R1), but silently dropping the earliest
                  discards hid information that matters for reading a hand. The
                  count is free to show. First in DOM, as across the table: it
                  stands for the tiles dropped off the *old* end, and a first
                  child lands at that end in both directions — the top of the
                  left column, the bottom of the reversed right one. */}
              {pileDiscards.length > SIDE_TRAY_CAP && (
                <span className="text-[9px] text-white/50 px-1">
                  +{pileDiscards.length - SIDE_TRAY_CAP}
                </span>
              )}
              {pileDiscards.slice(-SIDE_TRAY_CAP).map(id => (
                <Tile key={id} id={id} size="sm" sideways lastDiscard={id === lastDiscardTile} />
              ))}
            </button>
          )}
          {/* The one public statement of what this seat declared, held out of the
              pile so it can be read off the front rather than hunted for. Face
              down until its owner flips it on their first turn (A37).

              `flex`, not a plain block: a `.tile` is inline-flex, so in a block
              wrapper it sits on a text baseline and carries ~6px of descender
              below it — which put the right column's declaration 6px above the
              bottom it is aligned to. */}
          {(opp.pendingFirstDiscard || voidDiscardTile !== null) && (
            <div className={`flex flex-shrink-0 ${side === 'right' ? 'self-end' : 'self-start'}`}>
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
        </div>
      )}
    </div>
  );
}

export const OpponentSide = memo(OpponentSideImpl);
