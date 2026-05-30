import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { tileTypeOf, tileFromType } from '@sichuan-mahjong/engine';
import type { PlayerView, TileId, Suit } from '@sichuan-mahjong/engine';
import { useStore } from '../store/index.js';
import { sendAction } from '../ws/client.js';
import { Tile, TileBack } from '../components/Tile.js';
import { MeldDisplay } from '../components/MeldDisplay.js';
import { ClaimPanel } from '../components/ClaimPanel.js';
import { HowToPlay } from '../components/HowToPlay.js';
import { LangSwitch } from '../components/LangSwitch.js';
import { useSound } from '../hooks/useSound.js';
import { useT } from '../i18n/useT.js';

// ---------------------------------------------------------------------------
// Huan phase
// ---------------------------------------------------------------------------

function HuanPhase({ view }: { view: PlayerView }) {
  const [selected, setSelected] = useState<TileId[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const seat = view.you.seat;
  const play = useSound();
  const t = useT();

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
    sendAction({ t: 'action', action: { t: 'huanSelect', seat, tiles: selected as [TileId, TileId, TileId] } });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen board-felt flex flex-col items-center justify-center gap-4 text-white p-6">
        <p className="text-xl animate-pulse">{t('common.waitingPlayers')}</p>
      </div>
    );
  }

  const selectedSuit = selected.length > 0 ? tileFromType(tileTypeOf(selected[0]!)).suit : null;

  return (
    <div className="min-h-screen board-felt flex flex-col p-4 text-white gap-4">
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
              <Tile id={id} selected={isSelected} size="lg" onClick={() => !disabled && toggle(id)} />
            </div>
          );
        })}
      </div>
      <div className="mt-auto">
        <button
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-40"
          onClick={submit}
          disabled={selected.length !== 3}
        >
          {selected.length === 3 ? t('huan.confirm') : t('huan.selectMore', { n: 3 - selected.length })}
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

  if (submitted) {
    return (
      <div className="min-h-screen board-felt flex flex-col items-center justify-center gap-4 text-white p-6">
        <p className="text-xl animate-pulse">{t('common.waitingPlayers')}</p>
      </div>
    );
  }

  const SUIT_COLORS: Record<Suit, string> = {
    man: 'bg-red-700 hover:bg-red-600 border-red-500',
    pin: 'bg-emerald-700 hover:bg-emerald-600 border-emerald-500',
    sou: 'bg-blue-700 hover:bg-blue-600 border-blue-500',
  };

  return (
    <div className="min-h-screen board-felt flex flex-col p-4 text-white gap-4">
      <div className="flex items-center justify-between mt-2 gap-2">
        <h2 className="text-xl font-bold">{t('void.title')}</h2>
        <LangSwitch />
      </div>
      <p className="text-green-300 text-sm">{t('void.hint')}</p>
      <div className="flex gap-3">
        {(['man', 'pin', 'sou'] as Suit[]).map(suit => (
          <button
            key={suit}
            className={[
              'flex-1 py-4 rounded-xl border-2 font-bold text-lg transition-all',
              SUIT_COLORS[suit],
              chosenSuit === suit ? 'ring-4 ring-amber-400 scale-105' : 'opacity-80',
            ].join(' ')}
            onClick={() => setChosenSuit(suit)}
          >
            <div>{t(`suit.${suit}.full`)}</div>
            <div className="text-sm font-normal opacity-80">{t('void.tilesCount', { n: counts[suit].length })}</div>
          </button>
        ))}
      </div>
      {chosenSuit && (
        <div>
          <p className="text-sm text-green-300 mb-2">{t('void.yourTiles', { suit: t(`suit.${chosenSuit}`) })}</p>
          <div className="flex flex-wrap gap-1">
            {counts[chosenSuit].map(id => <Tile key={id} id={id} size="md" />)}
            {counts[chosenSuit].length === 0 && (
              <span className="text-white/60 italic text-sm">{t('void.none')}</span>
            )}
          </div>
        </div>
      )}
      <div className="mt-auto">
        <button
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
// Opponent display
// ---------------------------------------------------------------------------

function OpponentTop({ view, relSeat }: { view: PlayerView; relSeat: 0 | 1 | 2 }) {
  const opp = view.others[relSeat];
  const lastDiscardTile = view.lastDiscard?.from === opp.seat ? view.lastDiscard.tile : null;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={[
        'text-xs font-semibold px-2 py-0.5 rounded-full',
        view.turn === opp.seat ? 'bg-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.7)]' : 'bg-black/25 text-green-200',
      ].join(' ')}>{opp.name}{opp.status === 'hu' ? ' 🏆' : ''}</div>
      <div className="flex gap-0.5">
        {Array.from({ length: opp.handCount }, (_, i) => <TileBack key={i} size="sm" />)}
      </div>
      {opp.melds.length > 0 && (
        <div className="flex gap-1">{opp.melds.map((m, i) => <MeldDisplay key={i} meld={m} />)}</div>
      )}
      {opp.discards.length > 0 && (
        <div className="flex flex-wrap gap-0.5 max-w-full discard-tray">
          {opp.discards.slice(-8).map((id, i) => (
            <Tile key={i} id={id} size="sm" lastDiscard={id === lastDiscardTile} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpponentSide({ view, relSeat, side }: { view: PlayerView; relSeat: 0 | 1 | 2; side: 'left' | 'right' }) {
  const opp = view.others[relSeat];
  const lastDiscardTile = view.lastDiscard?.from === opp.seat ? view.lastDiscard.tile : null;
  return (
    <div className={`flex flex-col items-center gap-1 ${side === 'right' ? 'items-end' : 'items-start'}`}>
      <div className={[
        'text-xs font-semibold px-2 py-0.5 rounded-full',
        view.turn === opp.seat ? 'bg-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.7)]' : 'bg-black/25 text-green-200',
      ].join(' ')}>{opp.name}{opp.status === 'hu' ? ' 🏆' : ''}</div>
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: opp.handCount }, (_, i) => <TileBack key={i} size="sm" />)}
      </div>
      {opp.discards.length > 0 && (
        <div className="flex flex-wrap gap-0.5 discard-tray">
          {opp.discards.slice(-6).map((id, i) => (
            <Tile key={i} id={id} size="sm" lastDiscard={id === lastDiscardTile} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kong buttons
// ---------------------------------------------------------------------------

function KongButtons({ view, seat }: { view: PlayerView; seat: number }) {
  const kongActions = view.yourLegalActions.filter(a => a.t === 'declareKongOnTurn');
  const play = useSound();
  const t = useT();
  if (kongActions.length === 0) return null;
  return (
    <div className="flex gap-2">
      {kongActions.map((a, i) => {
        if (a.t !== 'declareKongOnTurn') return null;
        const { suit, rank } = tileFromType(tileTypeOf(a.tile as unknown as TileId));
        return (
          <button
            key={i}
            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm font-bold text-white"
            onClick={() => { play('kong'); sendAction({ t: 'action', action: a }); }}
          >
            {t('play.kong', { label: `${suit[0]?.toUpperCase()}${rank}`, subtype: t(`kong.${a.subtype}`) })}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hu celebration overlay
// ---------------------------------------------------------------------------

function HuCelebration({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={onDone}
    >
      <motion.div
        initial={{ scale: 0.2, rotate: -20 }}
        animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
        transition={{ duration: 0.8 }}
        className="text-8xl"
      >
        🀄
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Play phase
// ---------------------------------------------------------------------------

function PlayPhase({ view }: { view: PlayerView }) {
  const [selectedTile, setSelectedTile] = useState<TileId | null>(null);
  const [showHuCelebration, setShowHuCelebration] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const reconnecting = useStore(s => s.reconnecting);
  const soundEnabled = useStore(s => s.soundEnabled);
  const toggleSound = useStore(s => s.toggleSound);
  const seat = view.you.seat;
  const play = useSound();
  const t = useT();

  // Local hand arrangement: lets the player drag tiles to organise their hand.
  // Reconciled against the server hand on every update — keep the custom order
  // for tiles still held, drop discarded/claimed ones, append newly drawn tiles.
  const hand = view.you.hand;
  const [handOrder, setHandOrder] = useState<TileId[]>(() => [...hand]);
  // Distinguish a tap (select/discard) from a drag (reorder) by pointer travel,
  // since Framer's Reorder.Item preventDefaults pointerdown and eats onClick/onTap.
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setHandOrder(prev => {
      const inHand = new Set(hand);
      const kept = prev.filter(id => inHand.has(id));
      const keptSet = new Set(kept);
      const added = hand.filter(id => !keptSet.has(id));
      return [...kept, ...added];
    });
    // hand is a fresh array each server view; reconcile whenever it changes.
  }, [hand]);

  const isMyTurn = view.turn === seat && view.phase === 'play' && view.claimDeadline === null;
  const canDiscard = isMyTurn && view.yourLegalActions.some(a => a.t === 'discard');
  const canHu = view.yourLegalActions.some(a => a.t === 'declareHuOnDraw');
  const canHeavenly = view.yourLegalActions.some(a => a.t === 'declareHeavenly');
  const inClaimWindow = view.claimDeadline !== null;
  const lastDiscardTile = view.lastDiscard?.tile ?? null;

  function handleTileTap(id: TileId) {
    if (!canDiscard) return;
    play('tile');
    if (selectedTile === id) {
      play('discard');
      sendAction({ t: 'action', action: { t: 'discard', seat, tile: id } });
      setSelectedTile(null);
    } else {
      setSelectedTile(id);
    }
  }

  function declareHu() {
    play('hu');
    setShowHuCelebration(true);
    sendAction({ t: 'action', action: { t: 'declareHuOnDraw', seat } });
  }

  function declareHeavenly() {
    play('hu');
    setShowHuCelebration(true);
    sendAction({ t: 'action', action: { t: 'declareHeavenly', seat } });
  }

  const legalDiscards = new Set(
    view.yourLegalActions.filter(a => a.t === 'discard').map(a => a.t === 'discard' ? a.tile : 0),
  );

  return (
    <div className="min-h-screen board-felt flex flex-col text-white overflow-hidden">
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

      {/* Hu celebration */}
      <AnimatePresence>
        {showHuCelebration && <HuCelebration onDone={() => setShowHuCelebration(false)} />}
      </AnimatePresence>

      {/* How to Play overlay */}
      {showHowToPlay && <HowToPlay onClose={() => setShowHowToPlay(false)} />}

      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 text-xs">
        <span>{t('play.wall', { n: view.wallRemaining })}</span>
        <span className={`font-semibold ${view.turn === seat ? 'text-amber-400' : 'text-white/60'}`}>
          {view.turn === seat ? t('play.yourTurn') : t('play.othersTurn', { name: view.others.find(o => o.seat === view.turn)?.name ?? '...' })}
        </span>
        <div className="flex gap-2 items-center">
          <LangSwitch />
          <button className="text-white/50 hover:text-white" onClick={toggleSound} title="Toggle sound">
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button className="text-white/50 hover:text-white" onClick={() => setShowHowToPlay(true)} title="How to play">
            ?
          </button>
        </div>
      </div>

      {/* Score deltas */}
      <div className="flex justify-around px-2 py-0.5 text-xs bg-black/20">
        <span className="text-white/60">{view.you.name}: <span className={view.you.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}>{view.you.scoreDelta > 0 ? '+' : ''}{view.you.scoreDelta}</span></span>
        {view.others.map(o => (
          <span key={o.seat} className="text-white/60">{o.name.slice(0, 4)}: <span className={o.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}>{o.scoreDelta > 0 ? '+' : ''}{o.scoreDelta}</span></span>
        ))}
      </div>

      {/* Opponent across */}
      <div className="flex justify-center py-2 px-3">
        <OpponentTop view={view} relSeat={1} />
      </div>

      {/* Middle row */}
      <div className="flex flex-1 gap-2 px-2">
        <div className="w-20 flex-shrink-0">
          <OpponentSide view={view} relSeat={2} side="left" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-1 play-well p-2">
          {lastDiscardTile !== null && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-green-300">{t('play.lastDiscard')}</span>
              <motion.div key={lastDiscardTile} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <Tile id={lastDiscardTile} lastDiscard size="lg" />
              </motion.div>
            </div>
          )}
          <div className="text-xs text-white/30 mt-1">
            {view.you.voidedSuit ? t('play.void', { suit: t(`suit.${view.you.voidedSuit}`) }) : ''}
          </div>
        </div>
        <div className="w-20 flex-shrink-0 flex justify-end">
          <OpponentSide view={view} relSeat={0} side="right" />
        </div>
      </div>

      {/* Your melds */}
      {view.you.melds.length > 0 && (
        <div className="flex gap-1 px-3 py-1">
          {view.you.melds.map((m, i) => <MeldDisplay key={i} meld={m} />)}
        </div>
      )}

      {/* Furiten badge */}
      {view.you.furiten && (
        <div className="mx-3 my-1 py-1 px-2 bg-red-900/70 rounded text-xs text-red-300 text-center">
          {t('play.furiten')}
        </div>
      )}

      {/* Hu / Heavenly buttons */}
      {(canHu || canHeavenly) && !inClaimWindow && (
        <div className="flex gap-2 px-3 py-1">
          {canHeavenly && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-400 rounded-xl font-bold text-black"
              onClick={declareHeavenly}
            >
              {t('play.heavenly')}
            </motion.button>
          )}
          {canHu && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl font-bold"
              onClick={declareHu}
            >
              {t('play.huSelfDraw')}
            </motion.button>
          )}
        </div>
      )}

      {/* Kong buttons */}
      {isMyTurn && !inClaimWindow && (
        <div className="px-3 py-1">
          <KongButtons view={view} seat={seat} />
        </div>
      )}

      {/* Your hand — drag tiles to rearrange; Sort resets to the standard order */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-amber-300 h-4">
            {selectedTile !== null ? t('play.tapDiscard') : ''}
          </span>
          <button
            className="text-xs px-2 py-0.5 rounded-md bg-black/25 text-white/70 hover:text-white"
            onClick={() => setHandOrder([...hand])}
            title={t('play.sort')}
          >
            ⇅ {t('play.sort')}
          </button>
        </div>
        <Reorder.Group
          axis="x"
          values={handOrder}
          onReorder={setHandOrder}
          className="flex gap-1.5 overflow-x-auto pb-1 list-none"
        >
          {handOrder.map(id => (
            <Reorder.Item
              key={id}
              value={id}
              className={`shrink-0 ${legalDiscards.has(id) ? '' : 'opacity-60'}`}
              onPointerDown={(e) => { tapStart.current = { x: e.clientX, y: e.clientY }; }}
              onPointerUp={(e) => {
                const s = tapStart.current;
                tapStart.current = null;
                // Treat as a tap (not a drag-to-reorder) only if the pointer barely moved.
                if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 10) handleTileTap(id);
              }}
              whileDrag={{ scale: 1.08, zIndex: 10 }}
            >
              <Tile id={id} selected={selectedTile === id} interactive={false} />
            </Reorder.Item>
          ))}
        </Reorder.Group>
        {view.you.status === 'hu' && (
          <motion.p
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-center text-amber-400 font-bold mt-2"
          >
            {t('play.youWon')}
          </motion.p>
        )}
      </div>

      {/* Claim panel */}
      {inClaimWindow && view.claimDeadline !== null && (
        <ClaimPanel
          seat={seat}
          legalActions={view.yourLegalActions}
          claimDeadline={view.claimDeadline}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game dispatcher
// ---------------------------------------------------------------------------

export function Game() {
  const view = useStore(s => s.view);
  const t = useT();
  if (!view) return (
    <div className="min-h-screen board-felt flex items-center justify-center text-white">
      <p className="animate-pulse">{t('play.loading')}</p>
    </div>
  );
  if (view.phase === 'huan') return <HuanPhase view={view} />;
  if (view.phase === 'voidDeclare') return <VoidDeclarePhase view={view} />;
  return <PlayPhase view={view} />;
}
