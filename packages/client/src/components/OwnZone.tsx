import type { PlayerView, TileId } from '@sichuan-mahjong/engine';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSound } from '../hooks/useSound.js';
import { useT } from '../i18n/useT.js';
import { sendAction } from '../ws/client.js';
import { KongButtons } from './KongButtons.js';
import { MeldDisplay } from './MeldDisplay.js';
import { Tile, TileBack, tileLabel } from './Tile.js';

/**
 * Dismissal used to hang off onAnimationComplete of the *outer* fade-in
 * (~0.3s), so the overlay started exiting a third of the way through the 0.8s
 * emoji animation. The owner now times it out instead, which also survives
 * reduced motion skipping the animation entirely. (F20)
 */
const HU_CELEBRATION_MS = 1200;

function HuCelebration() {
  return (
    <motion.div
      className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
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

/**
 * Your melds, discards, and hand — plus everything that acts on them (flip,
 * kong, Hu/Heavenly declare, sort). Pulled out of `PlayPhase` so the play
 * screen doesn't keep growing as one file; the game logic and gesture wiring
 * live here, `PlayPhase` only arranges zones.
 *
 * Your own discard tray is never capped like an opponent's: furiten — whether
 * you may win on a discard — is decided by what you've already discarded, so
 * truncating it would remove information you need to reason about your own
 * hand. (see `docs/viewport-audit.md`, "Constraints a redesign has to respect")
 */
export function OwnZone({ view }: { view: PlayerView }) {
  const [selectedTile, setSelectedTile] = useState<TileId | null>(null);
  const [showHuCelebration, setShowHuCelebration] = useState(false);
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
  // Reconcile on hand *contents* (handKey), not the fresh-every-push `hand` array
  // reference, so the player's manual drag order isn't reset on every server view.
  const handKey = hand.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on handKey, not hand
  useEffect(() => {
    setHandOrder(prev => {
      const inHand = new Set(hand);
      const kept = prev.filter(id => inHand.has(id));
      const keptSet = new Set(kept);
      const added = hand.filter(id => !keptSet.has(id));
      return [...kept, ...added];
    });
  }, [handKey]);

  useEffect(() => {
    if (!showHuCelebration) return;
    const id = setTimeout(() => setShowHuCelebration(false), HU_CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [showHuCelebration]);

  const isMyTurn = view.turn === seat && view.phase === 'play' && view.claimDeadline === null;
  const canDiscard = isMyTurn && view.yourLegalActions.some(a => a.t === 'discard');
  // The tile set aside at void declaration is the mandatory first discard: on this
  // turn it's flipped instead of discarding from hand. (A35)
  const canFlip = isMyTurn && view.yourLegalActions.some(a => a.t === 'flipFirstDiscard');
  const pendingFlipTile = view.you.pendingFirstDiscardTile;
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

  function flipFirstDiscard() {
    play('discard');
    sendAction({ t: 'action', action: { t: 'flipFirstDiscard', seat } });
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

  // Recompute only when the server sends a new set of legal actions, not on
  // every render (OwnZone re-renders on each incoming view).
  const legalDiscards = useMemo(
    () =>
      new Set(
        view.yourLegalActions
          .filter(a => a.t === 'discard')
          .map(a => (a.t === 'discard' ? a.tile : 0)),
      ),
    [view.yourLegalActions],
  );

  return (
    <>
      {/* Hu celebration */}
      <AnimatePresence>{showHuCelebration && <HuCelebration />}</AnimatePresence>

      {/* Your melds */}
      {view.you.melds.length > 0 && (
        <div className="flex gap-1 px-3 py-1">
          {view.you.melds.map((m, i) => (
            <MeldDisplay key={i} meld={m} />
          ))}
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
              type="button"
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-400 rounded-xl font-bold text-black"
              onClick={declareHeavenly}
            >
              {t('play.heavenly')}
            </motion.button>
          )}
          {canHu && (
            <motion.button
              type="button"
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

      {/* First-discard flip — the one discard the player doesn't get to choose (A35) */}
      {canFlip && !inClaimWindow && (
        <div className="mx-3 my-1 p-2 rounded-xl bg-black/30 flex items-center gap-3">
          {pendingFlipTile !== null && <Tile id={pendingFlipTile} size="md" interactive={false} />}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-green-300 leading-snug">{t('play.flipHint')}</p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            className="px-3 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-black text-sm flex-shrink-0"
            onClick={flipFirstDiscard}
          >
            {t('play.flipFirstDiscard')}
          </motion.button>
        </div>
      )}

      {/* Your discards — furiten is computed from these, and the badge above is
          unreadable without them. (F3) Full history, always wrapping — never
          capped like an opponent's tray. */}
      {(view.you.discards.length > 0 || view.you.pendingFirstDiscard) && (
        <div className="px-3 pt-1">
          <span className="text-[10px] text-green-300">{t('play.yourDiscards')}</span>
          <div className="flex flex-wrap gap-0.5 discard-tray mt-0.5">
            {/* Face down until you flip it on your first turn (A37) */}
            {view.you.pendingFirstDiscard && <TileBack size="sm" />}
            {view.you.discards.map(id => (
              <Tile
                key={id}
                id={id}
                size="sm"
                lastDiscard={view.lastDiscard?.from === seat && id === lastDiscardTile}
              />
            ))}
          </div>
        </div>
      )}

      {/* Your hand — drag tiles to rearrange; Sort resets to the standard order */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-amber-300 h-4">
            {selectedTile !== null ? t('play.tapDiscard') : ''}
          </span>
          <button
            type="button"
            className="text-xs px-3 min-h-10 rounded-md bg-black/25 text-white/70 hover:text-white"
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
          className="flex gap-1 pb-1 list-none justify-center"
        >
          {handOrder.map(id => (
            <Reorder.Item
              key={id}
              value={id}
              // Shrink-to-fit: every tile flexes to share the row width (capped so
              // small hands don't balloon), so the whole hand fits with no scroll.
              className={`flex-1 min-w-0 max-w-[42px] ${legalDiscards.has(id) ? '' : 'opacity-60'}`}
              onPointerDown={e => {
                tapStart.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={e => {
                const s = tapStart.current;
                tapStart.current = null;
                // Treat as a tap (not a drag-to-reorder) only if the pointer barely moved.
                if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 10) handleTileTap(id);
              }}
              whileDrag={{ scale: 1.08, zIndex: 10 }}
            >
              {/* The list item owns tap and drag; this button is what makes the
                  tile reachable from the keyboard and gives it a spoken name. (F16) */}
              <button
                type="button"
                className="block w-full"
                aria-label={tileLabel(id, t)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  handleTileTap(id);
                }}
              >
                <Tile id={id} selected={selectedTile === id} interactive={false} fill />
              </button>
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
    </>
  );
}
