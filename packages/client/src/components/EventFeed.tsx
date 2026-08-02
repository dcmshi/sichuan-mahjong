import type { GameEvent, PlayerView, Seat } from '@sichuan-mahjong/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useSound } from '../hooks/useSound.js';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';

const VISIBLE_MS = 3500;
// Two, not three: the feed is anchored to the top of the play well and a third
// line reached down into the well's centred "Last discard" label.
const MAX_LINES = 2;

export type FeedSound = 'discard' | 'claim' | 'kong' | 'hu' | null;

/**
 * Sound to play for an incoming event. The local player's own taps already
 * make noise at the point of the tap, so their events are silent here —
 * before this, opponents' moves made no sound at all. (F7)
 */
export function soundForEvent(e: GameEvent, youSeat: Seat): FeedSound {
  if ('seat' in e && e.seat === youSeat) return null;
  switch (e.e) {
    case 'discarded':
      return 'discard';
    case 'claimed':
      return e.kind === 'hu' ? 'hu' : e.kind === 'kong' ? 'kong' : 'claim';
    case 'kongDeclared':
      return 'kong';
    case 'hu':
      return 'hu';
    default:
      return null;
  }
}

/**
 * Catalog key + subject seat for the events worth announcing. Discards are
 * deliberately absent: they happen every turn and would drown the feed.
 */
export function feedLineFor(e: GameEvent): { key: string; seat: Seat } | null {
  switch (e.e) {
    // A won claim emits both `hu` and `claimed{kind:'hu'}`; announce it once.
    case 'claimed':
      return e.kind === 'hu' ? null : { key: `event.${e.kind}`, seat: e.seat };
    case 'kongDeclared':
      return { key: 'event.kong', seat: e.seat };
    case 'hu':
      return { key: 'event.hu', seat: e.seat };
    default:
      return null;
  }
}

/** Transient log of what just happened, with sound for opponents' moves. (F7) */
export function EventFeed({ view }: { view: PlayerView }) {
  const lastEvents = useStore(s => s.lastEvents);
  const [lines, setLines] = useState<{ id: number; text: string }[]>([]);
  const nextId = useRef(0);
  const play = useSound();
  const t = useT();

  const you = view.you.seat;
  // Read through a ref so the effect stays keyed on the event batch alone —
  // a fresh view arrives with every server push and would otherwise re-announce.
  const ctx = useRef({ view, play, t });
  ctx.current = { view, play, t };

  useEffect(() => {
    if (lastEvents.length === 0) return;
    const { view: v, play: p, t: tr } = ctx.current;
    const nameOf = (seat: Seat) =>
      seat === v.you.seat ? v.you.name : (v.others.find(o => o.seat === seat)?.name ?? '');

    const added: { id: number; text: string }[] = [];
    for (const e of lastEvents) {
      const sound = soundForEvent(e, you);
      if (sound) p(sound);
      const line = feedLineFor(e);
      if (line)
        added.push({ id: nextId.current++, text: tr(line.key, { name: nameOf(line.seat) }) });
    }
    if (added.length === 0) return;

    setLines(prev => [...prev, ...added].slice(-MAX_LINES));
    const ids = new Set(added.map(a => a.id));
    const timer = setTimeout(() => setLines(prev => prev.filter(l => !ids.has(l.id))), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [lastEvents, you]);

  // Positioned inside the play well by its parent: as a viewport-fixed overlay
  // it sat on top of the opponent-across name and hand.
  return (
    // aria-live because these lines are the only notice that someone ponged,
    // konged or declared Hu, and they fade after a few seconds — a screen-reader
    // user had no way to learn a claim had happened at all. Polite, not
    // assertive: it is commentary, and it must not cut across the claim panel's
    // own countdown.
    <div
      className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none max-w-full"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {lines.map(l => (
          <motion.div
            key={l.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            // event-feed-line: on a short viewport (index.css) only the last
            // of these stays visible — the well has no room to spare for a
            // second line once the side columns stop setting its height. (R1)
            className="event-feed-line px-2 py-1 rounded-lg bg-black/55 text-[11px] font-semibold text-green-100"
          >
            {l.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
