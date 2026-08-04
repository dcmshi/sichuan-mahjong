import type { GameEvent } from '@sichuan-mahjong/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useAnimationPace } from '../hooks/useAnimation.js';
import { useStore } from '../store/index.js';
import { Tile } from './Tile.js';

/**
 * How long the tile takes to cross, at the `fast` setting. Long enough to
 * follow, short enough not to sit in front of the board it just changed; the
 * player's animation preference scales it from here. (N4)
 */
const FLIGHT_MS = 420;

type Box = { left: number; top: number; width: number };

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width };
};

type Flight = { id: number; tile: number; from: Box; to: Box };

/**
 * The claimed tile, flying from the discard to the meld that took it.
 *
 * A pung or kong used to happen by the board simply being different on the next
 * view — the tile left someone's tray and appeared in a meld with nothing
 * connecting the two, which is the hardest thing to follow when three bots are
 * playing at pace.
 *
 * **A fixed overlay, deliberately.** `e2e/viewport.spec.ts` asserts that no
 * `.tile` inside a `.discard-tray` ever has a box outside that tray's, sampled
 * every ~130ms for 90s — so animating the tray tile itself fails CI, and fails
 * it intermittently, which is the worst way to find out. The trays are left
 * untouched and a copy makes the journey above the board.
 *
 * Geometry is measured from the DOM when the claim lands rather than tracked in
 * state: both endpoints already exist as elements, and claims are rare enough
 * that a pair of `getBoundingClientRect` calls costs nothing.
 */
export function ClaimFlight() {
  const lastEvents = useStore(s => s.lastEvents);
  const { skip, scale } = useAnimationPace();
  const [flights, setFlights] = useState<Flight[]>([]);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const durationMs = FLIGHT_MS * scale;

  useEffect(() => {
    if (skip) return;
    // `hu` also emits a `claimed`, but a winning tile goes into a revealed hand
    // rather than a meld row, and the round-end screen is about to take over.
    const claims = lastEvents.filter(
      (e): e is Extract<GameEvent, { e: 'claimed' }> => e.e === 'claimed' && e.kind !== 'hu',
    );
    if (claims.length === 0) return;

    const added: Flight[] = [];
    for (const c of claims) {
      const fromEl = document.querySelector('.last-discard-tile');
      const toEl = document.querySelector(`[data-meld-zone="${c.seat}"]`);
      // Either anchor can be missing — the well drops the last discard once it
      // is taken, and a seat with no melds yet has no row to aim at. Skip rather
      // than animate to a guessed point.
      if (!fromEl || !toEl || c.tile === null) continue;
      added.push({ id: c.tile * 10 + c.seat, tile: c.tile, from: boxOf(fromEl), to: boxOf(toEl) });
    }
    if (added.length === 0) return;

    setFlights(prev => [...prev, ...added]);
    const ids = new Set(added.map(a => a.id));
    // Timed out rather than cleared on animation complete: under reduced motion
    // Framer skips the animation, so a completion callback would never fire and
    // the copy would sit on the board for the rest of the round. (F20's lesson)
    //
    // Held in a ref and cleared only on unmount, *not* by this effect's cleanup.
    // `lastEvents` is a fresh array reference on every server push, so a
    // per-run cleanup cancelled the pending timer and the next run returned at
    // the `claims.length === 0` guard without rescheduling it — leaving the
    // flown tile parked over the board, at its destination width, for the rest
    // of the round. Same fault as the event feed's stuck lines.
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setFlights(prev => prev.filter(f => !ids.has(f.id)));
    }, durationMs + 60);
    timers.current.add(timer);
  }, [lastEvents, skip, durationMs]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return (
    <AnimatePresence>
      {flights.map(f => (
        <motion.div
          key={f.id}
          // tile-lap with an animated width, matching FlyingDiscard: both boxes
          // measured here are pitches, so a tile drawn any other way takes off
          // 22.5% smaller than the tile it left.
          className="tile-lap fixed left-0 top-0 z-30 pointer-events-none"
          aria-hidden="true"
          // A tile in transit, so a screenshot taken now is of a board mid-move.
          // Shared with OwnZone's FlyingDiscard: `layout-probe.mjs` waits for
          // both to be gone. A `data-` hook and not the class beside it, per the
          // rule a Tailwind rename has broken four projects over.
          data-tile-flight="true"
          initial={{ x: f.from.left, y: f.from.top, width: f.from.width }}
          animate={{ x: f.to.left, y: f.to.top, width: f.to.width }}
          exit={{ opacity: 0 }}
          transition={{ duration: durationMs / 1000, ease: [0.22, 0.8, 0.3, 1] }}
        >
          <Tile id={f.tile} interactive={false} fill />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
