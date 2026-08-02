import type { PlayerView, TileId } from '@sichuan-mahjong/engine';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAnimationPace } from '../hooks/useAnimation.js';
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

/**
 * How long a discarded tile takes to travel from your hand to your tray, at the
 * `fast` setting. Short enough not to sit in front of the next decision, long
 * enough to be a movement you can follow rather than a jump; the player's
 * animation preference scales both of these from here. (N4)
 */
const DISCARD_FLIGHT_MS = 280;

/** A tile in transit: where it left from, and where in the tray it's headed. */
type Flight = {
  tile: TileId;
  from: { left: number; top: number; width: number };
  to: { left: number; top: number; width: number };
};

const boxOf = (el: Element): Flight['from'] => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width };
};

/**
 * The discard, mid-air. Deliberately a fixed-position overlay rather than a
 * transform on the tray tile itself: `e2e/viewport.spec.ts` asserts that no
 * tile's box escapes its tray, sampling every ~130ms across a round, so a tray
 * tile animating in from somewhere else would fail that guard the moment a
 * sample caught it in flight. Nothing here is inside a tray.
 */
function FlyingDiscard({ flight, durationMs }: { flight: Flight; durationMs: number }) {
  return (
    <motion.div
      // tile-lap: both boxes it measures are pitches — a hand tile's and a tray
      // tile's — so the tile in flight has to be drawn the same way or it takes
      // off 22.5% smaller than the tile it left and lands smaller than the pile.
      className="tile-lap fixed left-0 top-0 z-30 pointer-events-none"
      initial={{ x: flight.from.left, y: flight.from.top, width: flight.from.width }}
      animate={{ x: flight.to.left, y: flight.to.top, width: flight.to.width }}
      transition={{ duration: durationMs / 1000, ease: [0.3, 0.7, 0.4, 1] }}
    >
      <Tile id={flight.tile} interactive={false} fill />
    </motion.div>
  );
}

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
  const { skip: skipAnimations, scale: animScale } = useAnimationPace();
  const discardFlightMs = DISCARD_FLIGHT_MS * animScale;

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
    const id = setTimeout(() => setShowHuCelebration(false), HU_CELEBRATION_MS * animScale);
    return () => clearTimeout(id);
  }, [showHuCelebration, animScale]);

  // Discard flight (hand → tray). The source box is captured at the tap, because
  // by the time the server's view comes back the hand has already re-laid out
  // without that tile; the destination can only be measured once the tray tile
  // exists, so the two halves meet here.
  const trayRef = useRef<HTMLDivElement | null>(null);
  const takeoff = useRef<{ tile: TileId; from: Flight['from'] } | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const discardKey = view.you.discards.join(',');

  // Layout effect, not effect: measure and start before the browser paints the
  // tile sitting in the tray, or you see it land and then fly.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the discard list, not the view
  useLayoutEffect(() => {
    const pending = takeoff.current;
    if (!pending) return;
    // Clear the pending takeoff even when skipping, or the next discard would
    // find a stale one waiting and fly the wrong tile.
    if (skipAnimations) {
      takeoff.current = null;
      return;
    }
    const landed = view.you.discards.at(-1);
    if (landed !== pending.tile) return; // our discard hasn't come back yet
    takeoff.current = null;
    // The newest discard is the tray's last child: discards render in order, and
    // the face-down first discard renders ahead of them.
    const target = trayRef.current?.lastElementChild;
    if (!target) return;
    setFlight({ tile: pending.tile, from: pending.from, to: boxOf(target) });
  }, [discardKey]);

  // Cleared on a timer rather than onAnimationComplete: under reduced motion
  // Framer skips the animation, and a completion callback that never fires would
  // leave the landing tile hidden for the rest of the round.
  useEffect(() => {
    if (!flight) return;
    const id = setTimeout(() => setFlight(null), discardFlightMs + 60);
    return () => clearTimeout(id);
  }, [flight, discardFlightMs]);

  // The void declaration is drawn on its own above the pile, so the pile is
  // everything after it.
  const pileDiscards = view.you.firstDiscardIsVoid ? view.you.discards.slice(1) : view.you.discards;
  const voidDiscardTile = view.you.firstDiscardIsVoid ? (view.you.discards[0] ?? null) : null;

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

  // A selection only means anything while you may discard. If the turn moves on
  // or a claim window opens with a tile raised, the lift and the "tap again to
  // discard" hint both stayed up while `handleTileTap` had already started
  // returning early — a control that looks armed and does nothing.
  useEffect(() => {
    if (!canDiscard) setSelectedTile(null);
  }, [canDiscard]);

  function handleTileTap(id: TileId, source?: Element | null) {
    if (!canDiscard) return;
    play('tile');
    if (selectedTile === id) {
      play('discard');
      if (source) takeoff.current = { tile: id, from: boxOf(source) };
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
      <AnimatePresence>{showHuCelebration && !skipAnimations && <HuCelebration />}</AnimatePresence>

      {flight && <FlyingDiscard flight={flight} durationMs={discardFlightMs} />}

      {/* Your melds. One row that scrolls, like the across opponent's (R6): this
          was a plain non-wrapping flex of fixed-width tiles, so a third or fourth
          meld ran past the screen edge and the root's `overflow-x-hidden` cut it
          off with nothing to say it was there. pt-1 keeps the kong badge out of
          the clip that comes with overflow-x. */}
      {view.you.melds.length > 0 && (
        <div className="max-w-full overflow-x-auto px-3 pt-1 pb-1">
          {/* mx-auto, as across the table: `w-max` centres while the melds fit,
              and once they don't the scroller takes over — centring the scroller
              itself would put the leftmost meld out of reach. */}
          <div className="flex flex-nowrap gap-1 w-max mx-auto" data-meld-zone={seat}>
            {view.you.melds.map((m, i) => (
              <MeldDisplay key={i} meld={m} />
            ))}
          </div>
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
          capped like an opponent's tray.
          min-h-0 + an internal scroll makes this the row that gives height back
          when the board runs out: a 320px-wide phone fits 8 `sm` tiles a row, so
          a full round wraps to three rows where a 375px one needs two, and the
          third row was 41px the play screen doesn't have. Shrinking beats
          capping — the tray keeps every row the viewport can afford and the rest
          stays one scroll away, so no discard is ever dropped. (R6) */}
      {(view.you.discards.length > 0 || view.you.pendingFirstDiscard) && (
        <div className="px-2 pt-1 flex flex-col min-h-0">
          <span className="text-[10px] text-green-300 flex-shrink-0">{t('play.yourDiscards')}</span>
          {/* The void declaration, held out of the pile and set above it: it is the
              one public statement of what this seat declared, and reading it off
              the front of a wrapping pile meant hunting for it. Face down until
              its owner flips it on their first turn (A37). */}
          {(view.you.pendingFirstDiscard || voidDiscardTile !== null) && (
            <div className="flex justify-center pt-0.5">
              {voidDiscardTile === null ? (
                <TileBack size="sm" />
              ) : (
                <Tile
                  id={voidDiscardTile}
                  size="sm"
                  voidDiscard
                  lastDiscard={
                    view.lastDiscard?.from === seat && voidDiscardTile === lastDiscardTile
                  }
                />
              )}
            </div>
          )}
          {/* Flush, so a 320px phone fits 9 tiles a row instead of 8 and a full
              round's discards land in two rows rather than three.
              `content-start items-start` because a wrapping flex container
              defaults to `align-content: stretch` — any spare height goes into
              the lines and the tiles are drawn past their aspect ratio. */}
          {/* discard-landing hides the tile the flight is heading for, so it isn't
              drawn in the pile and in the air at the same time. */}
          <div
            ref={trayRef}
            // w-fit mx-auto, like every other seat's: the tray is drawn around
            // the pile rather than across the screen. It still wraps — fit-content
            // is min(max-content, available), so a full round fills the row and
            // spills onto a second — but three discards get a tray three tiles
            // wide instead of a bar with a hole in it. justify-center stays for
            // the last, partial row of a wrapped pile.
            className={`flex flex-wrap justify-center content-start items-start w-fit max-w-full mx-auto discard-tray tile-lap mt-0.5 min-h-0 overflow-y-auto ${
              flight ? 'discard-landing' : ''
            }`}
          >
            {pileDiscards.map(id => (
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
      <div className="px-2 py-2">
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
          // tile-run: flush, with one shadow for the strip. The 4px gaps between
          // 13 tiles were 48px of a 296px row — 16% spent on nothing — which held
          // each tile to 19.1px on a 320px phone, under the ~24px at which the
          // suit markings stop being readable. Flush at px-2 they reach 23.4px,
          // and lapping each tile over the one before it (tile-lap) spends the
          // hidden 22.5% on the art instead, which draws them at ~29px.
          //
          // w-full is what makes justify-center mean anything: `.tile-run` is
          // inline-flex, so on a window wider than 13 capped tiles it shrank to
          // its content and sat against the left edge — centred within itself,
          // which is no centring at all. Melds still want the shrink-to-fit.
          className="tile-run tile-lap w-full pb-1 list-none justify-center"
        >
          {handOrder.map(id => (
            <Reorder.Item
              key={id}
              value={id}
              // Shrink-to-fit: every tile flexes to share the row width (capped so
              // small hands don't balloon), so the whole hand fits with no scroll.
              // What the e2e spec reads to find a tile it may discard. It used
              // to key off the dimming class itself, which silently stopped
              // matching the moment that class changed value.
              data-discardable={legalDiscards.has(id) ? 'true' : undefined}
              // 75, not 60: early in a hand the void suit is the only legal
              // discard, so most of the hand is dimmed at once and 60 read as
              // "these tiles are barely here" rather than "not this turn".
              className={`flex-1 min-w-0 max-w-[42px] ${legalDiscards.has(id) ? '' : 'opacity-75'}`}
              onPointerDown={e => {
                tapStart.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={e => {
                const s = tapStart.current;
                tapStart.current = null;
                // Treat as a tap (not a drag-to-reorder) only if the pointer barely moved.
                if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 10)
                  handleTileTap(id, e.currentTarget);
              }}
              whileDrag={{ scale: 1.08, zIndex: 10 }}
            >
              {/* The list item owns tap and drag; this button is what makes the
                  tile reachable from the keyboard and gives it a spoken name. (F16) */}
              <button
                type="button"
                className="block w-full"
                aria-label={tileLabel(id, t)}
                // The lift is the only cue that a tile is armed, and it is purely
                // visual; this is the same state spoken.
                aria-pressed={selectedTile === id}
                onKeyDown={e => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  handleTileTap(id, e.currentTarget);
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
