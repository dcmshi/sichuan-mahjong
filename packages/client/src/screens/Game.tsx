import { tileFromType, tileTypeOf } from '@sichuan-mahjong/engine';
import type { PlayerView, Seat, Suit, TileId } from '@sichuan-mahjong/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ClaimPanel } from '../components/ClaimPanel.js';
import { EventFeed } from '../components/EventFeed.js';
import { LangSwitch } from '../components/LangSwitch.js';
import { OpponentSide } from '../components/OpponentSide.js';
import { OpponentTop } from '../components/OpponentTop.js';
import { OwnZone } from '../components/OwnZone.js';
import { PlayHistory } from '../components/PlayHistory.js';
import { PlayTopBar } from '../components/PlayTopBar.js';
import { RotateOverlay } from '../components/RotateOverlay.js';
import { Tile } from '../components/Tile.js';
import { WallGauge } from '../components/WallGauge.js';
import { useSound } from '../hooks/useSound.js';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';
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
          return (
            <div key={id} className={wrongSuit || disabled ? 'opacity-30' : ''}>
              <Tile
                id={id}
                selected={isSelected}
                size="lg"
                onClick={() => !disabled && toggle(id)}
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
  const [submitted, setSubmitted] = useState(false);
  const seat = view.you.seat;
  const t = useT();
  // As in HuanPhase: don't leave a rejected submit stuck on "Waiting…". (F1)
  const errorSeq = useStore(s => s.lastError?.seq);
  useEffect(() => {
    if (errorSeq !== undefined) setSubmitted(false);
  }, [errorSeq]);

  const counts: Record<Suit, TileId[]> = { man: [], pin: [], sou: [] };
  for (const id of view.you.hand) {
    const { suit } = tileFromType(tileTypeOf(id));
    counts[suit].push(id);
  }

  function submit() {
    if (!chosenSuit) return;
    const firstDiscard = counts[chosenSuit][0] ?? null;
    sendAction({ t: 'action', action: { t: 'declareVoid', seat, suit: chosenSuit, firstDiscard } });
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
            onClick={() => setChosenSuit(suit)}
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
            the bottom row it was clipped by the scroller's edge. */}
        <div className="flex flex-wrap justify-center gap-1 pb-1">
          {view.you.hand.map(id => {
            const { suit } = tileFromType(tileTypeOf(id));
            const marked = suit === chosenSuit;
            return (
              <div
                key={id}
                // The e2e spec reads this to know whether a tile gets separated
                // face down, which is what turn 1 has to flip (A35). It used to
                // count the tiles in this container — fine when only the chosen
                // suit was rendered, wrong now that the whole hand is.
                data-void-tile={marked ? 'true' : undefined}
                // The mark is drawn outside the tile and moves no box; 3px rather
                // than 2 because pin's emerald is the one colour sitting on green
                // felt, and it needs the extra pixel to read as clearly as the red
                // and the blue. `tile-mark` matches the tile's corner.
                className={[
                  'void-hand-tile',
                  marked ? `tile-mark tile-mark-flash ${SUIT_MARKS[suit]}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Tile id={id} fill />
              </div>
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
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-40"
          onClick={submit}
          disabled={!chosenSuit}
        >
          {chosenSuit ? t('void.confirm', { suit: t(`suit.${chosenSuit}`) }) : t('void.choose')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Play phase
// ---------------------------------------------------------------------------

function PlayPhase({ view }: { view: PlayerView }) {
  const reconnecting = useStore(s => s.reconnecting);
  const [showHistory, setShowHistory] = useState(false);
  const t = useT();
  const seat = view.you.seat;

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
    <div className="h-dvh board-felt flex flex-col text-white overflow-y-auto overflow-x-hidden">
      {/* Reconnecting toast */}
      <AnimatePresence>
        {reconnecting && (
          <motion.div
            initial={{ y: -40 }}
            animate={{ y: 0 }}
            exit={{ y: -40 }}
            className="fixed top-0 left-0 right-0 bg-amber-600 text-white text-center py-1.5 text-sm font-semibold z-30"
          >
            {t('common.reconnecting')}
          </motion.div>
        )}
      </AnimatePresence>

      <PlayTopBar view={view} />

      {/* Opponent across */}
      <div className="py-2 px-3">
        <OpponentTop view={view} relSeat={1} />
      </div>

      {/* Middle row — the row's height used to be set entirely by the side
          columns (687px before the side-opponent hand-back shrink, still
          281px on an iPhone SE after it), so flex-1 min-h-0 only pays off
          once OpponentSide's tray stops wrapping (R2.3): that's what lets
          this row fall to what the well actually needs. */}
      <div className="flex flex-1 min-h-0 gap-2 px-2">
        <div className="w-20 flex-shrink-0">
          <OpponentSide view={view} relSeat={2} side="left" />
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
          <WallGauge remaining={view.wallRemaining} />
          {lastDiscardTile !== null && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-green-300">{t('play.lastDiscard')}</span>
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
          <div className="text-xs text-white/30 mt-1">
            {view.you.voidedSuit ? t('play.void', { suit: t(`suit.${view.you.voidedSuit}`) }) : ''}
          </div>
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
        <div className="w-20 flex-shrink-0">
          <OpponentSide view={view} relSeat={0} side="right" />
        </div>
      </div>

      <OwnZone view={view} />

      {/* Claim panel */}
      {inClaimWindow && view.claimDeadline !== null && (
        <ClaimPanel
          seat={seat}
          legalActions={view.yourLegalActions}
          claimDeadline={view.claimDeadline}
          windowMs={view.config.claimWindowMs}
        />
      )}

      {showHistory && <PlayHistory nameOf={nameOf} onClose={() => setShowHistory(false)} />}

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
  if (view.phase === 'huan') return <HuanPhase view={view} />;
  if (view.phase === 'voidDeclare') return <VoidDeclarePhase view={view} />;
  return <PlayPhase view={view} />;
}
