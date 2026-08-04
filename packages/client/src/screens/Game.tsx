import { tileFromType, tileTypeOf } from '@sichuan-mahjong/engine';
import type { PlayerView, Seat, Suit, TileId } from '@sichuan-mahjong/engine';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { ClaimFlight } from '../components/ClaimFlight.js';
import { ClaimPanel } from '../components/ClaimPanel.js';
import { DiceOverlay } from '../components/DiceOverlay.js';
import { DiscardPileModal } from '../components/DiscardPileModal.js';
import { EventFeed } from '../components/EventFeed.js';
import { LangSwitch } from '../components/LangSwitch.js';
import { OpponentSide } from '../components/OpponentSide.js';
import { OpponentTop } from '../components/OpponentTop.js';
import { OwnZone } from '../components/OwnZone.js';
import { PlayHistory } from '../components/PlayHistory.js';
import { PlayTopBar } from '../components/PlayTopBar.js';
import { ReconnectingBanner } from '../components/ReconnectingBanner.js';
import { RotateOverlay } from '../components/RotateOverlay.js';
import { Tile, tileLabel } from '../components/Tile.js';
import { WallDiagram, wallStateOf } from '../components/WallDiagram.js';
import { playerAt, splitPile } from '../discardPile.js';
import { useSound } from '../hooks/useSound.js';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';
import { handBySuit, voidChoice } from '../voidSelection.js';
import { sendAction } from '../ws/client.js';

// ---------------------------------------------------------------------------
// Huan phase
// ---------------------------------------------------------------------------

function HuanPhase({ view }: { view: PlayerView }) {
  const [selected, setSelected] = useState<TileId[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const seat = view.you.seat;
  const play = useSound();
  const t = useT();
  // A rejected submit would otherwise strand the player on "Waiting…" forever. (F1)
  const errorSeq = useStore(s => s.lastError?.seq);
  useEffect(() => {
    if (errorSeq !== undefined) setSubmitted(false);
  }, [errorSeq]);

  function toggle(id: TileId) {
    play('tile');
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(t => t !== id);
      if (prev.length >= 3) return prev;
      const suit = tileFromType(tileTypeOf(id)).suit;
      if (prev.length > 0 && tileFromType(tileTypeOf(prev[0]!)).suit !== suit) return prev;
      return [...prev, id];
    });
  }

  function submit() {
    if (selected.length !== 3) return;
    sendAction({
      t: 'action',
      action: { t: 'huanSelect', seat, tiles: selected as [TileId, TileId, TileId] },
    });
    setSubmitted(true);
  }

  // The local flag gives instant feedback; the view is what survives a reconnect
  // or a refresh-and-rejoin, which would otherwise redisplay the picker to a
  // player who has already chosen.
  if (submitted || view.you.hasSubmittedHuan) {
    return (
      <div className="min-h-dvh board-felt flex flex-col items-center justify-center gap-4 text-white p-6">
        <p className="text-xl animate-pulse">{t('common.waitingPlayers')}</p>
      </div>
    );
  }

  const selectedSuit = selected.length > 0 ? tileFromType(tileTypeOf(selected[0]!)).suit : null;

  return (
    <div className="min-h-dvh board-felt flex flex-col p-4 text-white gap-4">
      <div className="flex items-center justify-between mt-2 gap-2">
        <h2 className="text-xl font-bold">{t('huan.title')}</h2>
        <LangSwitch />
      </div>
      <p className="text-green-300 text-sm">{t('huan.hint')}</p>
      <div className="flex flex-wrap gap-1.5">
        {view.you.hand.map(id => {
          const isSelected = selected.includes(id);
          const { suit } = tileFromType(tileTypeOf(id));
          const disabled = !isSelected && selected.length >= 3;
          const wrongSuit = !isSelected && selectedSuit !== null && suit !== selectedSuit;
          // Dimmed tiles used to keep their handler: `toggle` played the tap
          // sound and *then* returned the selection unchanged, so a tile you
          // cannot pick answered a tap with a confirming click and no movement.
          // Withholding onClick makes Tile non-interactive outright.
          const inert = disabled || wrongSuit;
          return (
            <div key={id} className={inert ? 'opacity-30' : ''}>
              {/* Spread rather than `onClick={inert ? undefined : toggle}`:
                  exactOptionalPropertyTypes rejects an explicit undefined. */}
              <Tile
                id={id}
                selected={isSelected}
                size="lg"
                {...(inert ? {} : { onClick: toggle })}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-auto">
        <button
          type="button"
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-40"
          onClick={submit}
          disabled={selected.length !== 3}
        >
          {selected.length === 3
            ? t('huan.confirm')
            : t('huan.selectMore', { n: 3 - selected.length })}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Void declare phase
// ---------------------------------------------------------------------------

function VoidDeclarePhase({ view }: { view: PlayerView }) {
  const [chosenSuit, setChosenSuit] = useState<Suit | null>(null);
  const [picked, setPicked] = useState<TileId | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const seat = view.you.seat;
  const play = useSound();
  const t = useT();
  // As in HuanPhase: don't leave a rejected submit stuck on "Waiting…". (F1)
  const errorSeq = useStore(s => s.lastError?.seq);
  useEffect(() => {
    if (errorSeq !== undefined) setSubmitted(false);
  }, [errorSeq]);

  const counts = handBySuit(view.you.hand);
  const choice = voidChoice(counts, chosenSuit, picked);

  // Tapping a tile answers both questions at once: which suit goes, and which of
  // its tiles leads. The buttons answer the first alone and `voidChoice` supplies
  // the default for the second — they carry the three counts the comparison is
  // made on, and a suit you hold none of has no tile to tap. What changed in N30
  // is that the default is now marked and named rather than computed in `submit`.
  function pickTile(id: TileId) {
    play('tile');
    setChosenSuit(tileFromType(tileTypeOf(id)).suit);
    setPicked(id);
  }

  function pickSuit(suit: Suit) {
    if (suit === chosenSuit) return;
    setChosenSuit(suit);
    setPicked(null);
  }

  function submit() {
    if (choice.kind !== 'ready') return;
    sendAction({
      t: 'action',
      action: { t: 'declareVoid', seat, suit: choice.suit, firstDiscard: choice.firstDiscard },
    });
    setSubmitted(true);
  }

  // As in HuanPhase: the view is the source of truth across a reconnect.
  if (submitted || view.you.hasDeclaredVoid) {
    return (
      <div className="min-h-dvh board-felt flex flex-col items-center justify-center gap-4 text-white p-6">
        <p className="text-xl animate-pulse">{t('common.waitingPlayers')}</p>
      </div>
    );
  }

  const SUIT_COLORS: Record<Suit, string> = {
    man: 'bg-red-700 hover:bg-red-600 border-red-500',
    pin: 'bg-emerald-700 hover:bg-emerald-600 border-emerald-500',
    sou: 'bg-blue-700 hover:bg-blue-600 border-blue-500',
  };

  // The mark takes each suit's *button* colour, so the marked tiles and the
  // button you pressed are visibly the same choice. A text colour, not a ring:
  // `.tile-mark-flash` draws the ring from `currentColor` so it can pulse.
  // Written out rather than built from the suit name because Tailwind only ships
  // classes it can see.
  const SUIT_MARKS: Record<Suit, string> = {
    man: 'text-red-500',
    pin: 'text-emerald-500',
    sou: 'text-blue-500',
  };

  return (
    // h-dvh with the hand scrolling inside it, not min-h-dvh: showing the whole
    // hand costs a third row of tiles at 320px, and Confirm must not be the thing
    // that goes off the bottom to make room for them. (R3's lesson)
    <div className="h-dvh board-felt flex flex-col p-4 text-white gap-4 overflow-y-auto">
      <div className="flex items-center justify-between mt-2 gap-2">
        <h2 className="text-xl font-bold">{t('void.title')}</h2>
        <LangSwitch />
      </div>
      <p className="text-green-300 text-sm">{t('void.hint')}</p>
      <div className="flex gap-3">
        {(['man', 'pin', 'sou'] as Suit[]).map(suit => (
          <button
            type="button"
            key={suit}
            className={[
              'flex-1 py-4 rounded-xl border-2 font-bold text-lg transition-all',
              SUIT_COLORS[suit],
              // The mark is drawn *inside* the button and the button doesn't
              // grow. Both were outside before — a 4px ring plus `scale-105`,
              // which widened it by 14px — and since the three sit in one
              // `gap-3` row, whichever you picked ate 7px out of the gap beside
              // it: 5px against the untouched 12px on the other side.
              chosenSuit === suit ? 'shadow-[inset_0_0_0_4px_#fbbf24]' : 'opacity-80',
            ].join(' ')}
            onClick={() => pickSuit(suit)}
          >
            <div>{t(`suit.${suit}.full`)}</div>
            <div className="text-sm font-normal opacity-80">
              {t('void.tilesCount', { n: counts[suit].length })}
            </div>
          </button>
        ))}
      </div>
      {/* The whole hand, always — this used to list only the chosen suit, which
          meant deciding blind: the choice is a comparison between three suits, and
          you can't compare what isn't on screen. The suit you pick is marked in
          its button's colour instead of being the only thing shown. */}
      <div className="min-h-0 overflow-y-auto">
        <p className="text-sm text-green-300 mb-2">{t('void.yourHand')}</p>
        {/* pb-1 so the last row's flash ring has somewhere to be drawn: it is a
            3px spread on the tile's own box, and this container scrolls, so on
            the bottom row it was clipped by the scroller's edge. pt-2 is the same
            bargain for the lift — a transform moves no box, so the top row's 8px
            has to come from padding inside the scroller. */}
        <div className="flex flex-wrap justify-center gap-1 pt-2 pb-1">
          {view.you.hand.map(id => {
            const { suit } = tileFromType(tileTypeOf(id));
            const marked = suit === chosenSuit;
            // Read off the choice, not off `picked`: the tile that leads is
            // marked whether you named it or took the default, which is what
            // keeps the default from being the silent one N30 found.
            const isFirst = choice.kind === 'ready' && id === choice.firstDiscard;
            return (
              <motion.div
                key={id}
                // The e2e spec reads this to know whether a tile gets separated
                // face down, which is what turn 1 has to flip (A35). It used to
                // count the tiles in this container — fine when only the chosen
                // suit was rendered, wrong now that the whole hand is.
                data-void-tile={marked ? 'true' : undefined}
                data-void-first={isFirst ? 'true' : undefined}
                // The mark is drawn outside the tile and moves no box; 3px rather
                // than 2 because pin's emerald is the one colour sitting on green
                // felt, and it needs the extra pixel to read as clearly as the red
                // and the blue. `tile-mark` matches the tile's corner.
                //
                // The picked tile takes amber and stops pulsing instead of adding a
                // second ring: the suit's pulse says "all of these go", and this one
                // says "this one goes first" — two rings on one tile would say
                // neither. The lift is on this box rather than on the Tile, because
                // the ring is drawn here and a tile lifting out of its own mark
                // reads as broken.
                className={[
                  'void-hand-tile',
                  marked ? 'tile-mark' : '',
                  isFirst ? 'tile-mark-pick' : '',
                  marked && !isFirst ? `tile-mark-flash ${SUIT_MARKS[suit]}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                animate={{ y: isFirst ? -8 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              >
                <Tile id={id} fill onClick={pickTile} />
              </motion.div>
            );
          })}
        </div>
        {chosenSuit && counts[chosenSuit].length === 0 && (
          <p className="text-white/60 italic text-sm mt-2">{t('void.none')}</p>
        )}
      </div>
      <div className="mt-auto pt-2">
        <button
          type="button"
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-40"
          onClick={submit}
          disabled={choice.kind !== 'ready'}
        >
          {choice.kind === 'noSuit' && t('void.choose')}
          {choice.kind === 'ready' && (
            <>
              <div>{t('void.confirm', { suit: t(`suit.${choice.suit}`) })}</div>
              {/* What the tap committed you to, said out loud: the tile leaves the
                  hand face down and is your opening play, which no other screen
                  gets a chance to tell you. */}
              <div className="text-xs font-normal opacity-90">
                {choice.firstDiscard === null
                  ? t('void.indicator')
                  : t('void.firstDiscard', { tile: tileLabel(choice.firstDiscard, t) })}
              </div>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Play phase
// ---------------------------------------------------------------------------

function PlayPhase({ view }: { view: PlayerView }) {
  const [showHistory, setShowHistory] = useState(false);
  // Which seat's pile is open, held here rather than in each zone: the modal has
  // to render outside every `.discard-tray` subtree (N33), and one piece of state
  // is also what stops two piles opening at once.
  const [openPile, setOpenPile] = useState<Seat | null>(null);
  // Held clear beneath the hand while a claim window is open, because the bar is
  // fixed and reserves nothing of its own. (N8)
  const [claimBarHeight, setClaimBarHeight] = useState(0);
  const t = useT();
  const seat = view.you.seat;

  // Opening a pile is a `useState` up here, so the tap re-rendered every zone on
  // the board before the modal's own tiles even mounted — measured at 126–236ms
  // to a painted modal on a 4×-throttled phone. The four zones are memoised, and
  // memo only bites if the handler keeps its identity across that toggle: keyed
  // on the *seat number*, which is fixed for the round, rather than on `view`,
  // which is a fresh object on every server push. (N38)
  const [rightSeat, topSeat, leftSeat] = [
    view.others[0].seat,
    view.others[1].seat,
    view.others[2].seat,
  ];
  const openRightPile = useCallback(() => setOpenPile(rightSeat), [rightSeat]);
  const openTopPile = useCallback(() => setOpenPile(topSeat), [topSeat]);
  const openLeftPile = useCallback(() => setOpenPile(leftSeat), [leftSeat]);
  const openOwnPile = useCallback(() => setOpenPile(seat), [seat]);

  const inClaimWindow = view.claimDeadline !== null;
  const lastDiscardTile = view.lastDiscard?.tile ?? null;
  // "You discarded", not "David discarded" — your own rows read the way the top
  // bar already talks about you.
  const nameOf = (s: Seat) =>
    s === seat ? t('history.you') : (view.others.find(o => o.seat === s)?.name ?? '');

  return (
    // h-dvh (not min-h-dvh): the middle row's flex-1 min-h-0 below only has
    // slack to give up if the root is capped to the viewport instead of free
    // to grow past it. overflow-y-auto stays as a fallback — anything that
    // still doesn't fit degrades to today's scrolling instead of clipping,
    // honouring the overflow-hidden fix that let landscape reach its lower
    // half in the first place. (F13, R1)
    // paddingBottom, not a row: the bar is fixed, so in flow it would add height
    // to a column that already fits exactly on the smallest phone. Padding an
    // `h-dvh` border-box element reduces its content height instead, and the
    // middle row's `flex-1 min-h-0` gives the space back. (N8)
    <div
      className="h-dvh board-felt flex flex-col text-white overflow-y-auto overflow-x-hidden"
      style={inClaimWindow ? { paddingBottom: claimBarHeight } : undefined}
    >
      <ReconnectingBanner />
      <ClaimFlight />

      <PlayTopBar view={view} />

      {/* Opponent across, full width. The side columns deliberately do **not**
          reach up into this band: taking 80px a side for them narrowed this
          seat's river to 128px on a 320px phone, which drew its nine tiles at
          15.9px of art against a ~24px readability floor — the squash moved
          rather than went away. See docs/layout_investigation.md. */}
      <div className="py-2 px-3">
        <OpponentTop view={view} relSeat={1} onOpenPile={openTopPile} />
      </div>

      {/* Middle row — the row's height used to be set entirely by the side
          columns (687px before the side-opponent hand-back shrink, still
          281px on an iPhone SE after it), so flex-1 min-h-0 only pays off
          once OpponentSide's tray stops wrapping (R2.3): that's what lets
          this row fall to what the well actually needs. */}
      <div className="flex flex-1 min-h-0 gap-2 px-2">
        <div className="w-20 md:w-28 lg:w-32 flex-shrink-0">
          <OpponentSide view={view} relSeat={2} side="left" onOpenPile={openLeftPile} />
        </div>
        <div className="relative flex-1 flex flex-col items-center justify-center gap-1 play-well p-2 min-h-0">
          {/* What just happened, plus sound for opponents' moves — inside the
              well so it can never cover a hand or a control. Drops to one
              line on a short viewport (index.css): it's pointer-events-none,
              so it can't scroll internally to make room for more. */}
          <EventFeed view={view} />
          {/* The wall, above the discard it feeds — which is where it sits on a
              table. The exact count is in the top bar; this is for reading how
              much round is left without doing arithmetic. */}
          <WallDiagram remaining={view.wallRemaining} state={wallStateOf(view)} />
          {lastDiscardTile !== null && (
            <div className="flex flex-col items-center">
              {/* Spoken, not drawn. This tile is alone at the centre of the wall's
                  mouth, amber-glowing, and it scales in as it lands — a caption
                  above it repeated what all three of those already say, and it
                  competed with the tile for the one place on the board the eye
                  goes first. The 20px it cost is most of what pays for the larger
                  tile below, so the group's footprint is unchanged. */}
              <span className="sr-only">{t('play.lastDiscard')}</span>
              <motion.div
                key={lastDiscardTile}
                initial={{ scale: 1.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                {/* lg on a tall viewport, md on a short one (index.css) — once
                    the side columns stop setting the row's height, the well's
                    own minimum content is what it bottoms out at instead. */}
                {/* Nothing special: it is the same art the hand and trays draw,
                    just with no neighbour to lap over. The glossier-singleton
                    problem that O4 chased was an artefact of the hand being flat
                    while this one was not. */}
                <div className="last-discard-tile">
                  <Tile id={lastDiscardTile} lastDiscard fill />
                </div>
              </motion.div>
            </div>
          )}
          {/* The "Void: 万 Wàn" line stood here and is gone. (N42)
              Your declaration is now a ringed tile at the head of your own river,
              which names the suit by showing it — the same statement the line was
              making in words, in the place a table makes it.

              It was also the thing pushing the well's composition off: as a
              sibling of the discard inside a `justify-center` column its ~20px
              lifted the tile 10px above the well's centre, and the wall frame is
              centred on that same axis, so the one tile that should sit dead
              centre in the mouth was riding into the top wall on every viewport
              (320×568 overlapped by 0.3px, which the probe caught).

              One case loses the statement: a seat that declared a suit it held
              none of never flips a declaration, so no tile is ever drawn for it.
              `firstDiscardIsVoid` stays false there. */}
          {/* In the well, not the top bar: a fourth icon up there truncated the
              turn indicator to "Y...", and the bar has no width to spare. Here it
              is absolutely positioned, so it costs no height either — and the
              middle of the board is the empty space anyway. (O2) */}
          <button
            type="button"
            className="absolute bottom-0 right-0 min-h-10 min-w-10 flex items-center justify-center text-white/40 hover:text-white text-base"
            onClick={() => setShowHistory(true)}
            title={t('play.history')}
            aria-label={t('play.history')}
          >
            🗒
          </button>
        </div>
        {/* Plain block, not `flex justify-end`: as a flex parent this made
            OpponentSide size to min-content, so the tray's `max-w-full` resolved
            against 211.6px instead of this column's 80px and spilled across the
            well. The left column never had the bug because it was always a block. */}
        <div className="w-20 md:w-28 lg:w-32 flex-shrink-0">
          <OpponentSide view={view} relSeat={0} side="right" onOpenPile={openRightPile} />
        </div>
      </div>

      <OwnZone view={view} onOpenPile={openOwnPile} />

      {/* Claim panel */}
      {inClaimWindow && view.claimDeadline !== null && (
        <ClaimPanel
          seat={seat}
          legalActions={view.yourLegalActions}
          claimDeadline={view.claimDeadline}
          windowMs={view.config.claimWindowMs}
          onHeight={setClaimBarHeight}
        />
      )}

      {showHistory && <PlayHistory nameOf={nameOf} onClose={() => setShowHistory(false)} />}

      {openPile !== null &&
        (() => {
          const p = playerAt(view, openPile);
          if (!p) return null;
          const { voidDiscard, pile } = splitPile(p);
          return (
            <DiscardPileModal
              name={nameOf(openPile)}
              voidDiscard={voidDiscard}
              pile={pile}
              lastDiscard={view.lastDiscard?.from === openPile ? view.lastDiscard.tile : null}
              onClose={() => setOpenPile(null)}
            />
          );
        })()}

      {/* Landscape phones only (index.css); see RotateOverlay.tsx (R4 Phase 1). */}
      <RotateOverlay />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game dispatcher
// ---------------------------------------------------------------------------

export function Game() {
  const view = useStore(s => s.view);
  const t = useT();
  if (!view)
    return (
      <div className="min-h-dvh board-felt flex items-center justify-center text-white">
        <p className="animate-pulse">{t('play.loading')}</p>
      </div>
    );

  // Above the phase branch, because the throws happen before the deal is played
  // and the deal opens on huan or voidDeclare depending on a house rule. The
  // overlay decides for itself when it has something to show. (N2)
  const nameOf = (s: Seat) =>
    s === view.you.seat ? t('history.you') : (view.others.find(o => o.seat === s)?.name ?? '');

  return (
    <>
      <DiceOverlay view={view} nameOf={nameOf} />
      {view.phase === 'huan' ? (
        <HuanPhase view={view} />
      ) : view.phase === 'voidDeclare' ? (
        <VoidDeclarePhase view={view} />
      ) : (
        <PlayPhase view={view} />
      )}
    </>
  );
}
