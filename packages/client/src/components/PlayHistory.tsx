import type { GameEvent, Seat, TileId } from '@sichuan-mahjong/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEscapeToClose } from '../hooks/useDismissable.js';
import { useT } from '../i18n/useT.js';
import { type HistoryItem, useStore } from '../store/index.js';
import { Tile } from './Tile.js';

/** One row of the panel: who, what they did, and the tile it was done with. */
export type HistoryRow = { key: string; seat: Seat; tile: TileId | null };

/**
 * The row an event deserves, or null for events the panel doesn't show.
 *
 * This is where the panel differs from the transient feed: `feedLineFor` leaves
 * discards out on purpose, because announcing every one would drown the two
 * lines it has. A scrollable log has the opposite problem — a history without
 * discards is a history of almost nothing — so discards are the bulk of it here.
 *
 * Left out: draws (redacted for everyone but the drawer, and one per turn), the
 * claim window opening and closing (mechanism, not a move), and every payment
 * event (the round-end screen breaks those down properly). Exported because the
 * client suite runs in Node with no DOM.
 */
export function historyRowFor(e: GameEvent): HistoryRow | null {
  switch (e.e) {
    case 'discarded':
      return { key: 'history.discarded', seat: e.seat, tile: e.tile };
    // A won claim emits both `hu` and `claimed{kind:'hu'}`; the `hu` case below
    // is the one that reads as a win, so this lists the tile-taking claims only.
    case 'claimed':
      return e.kind === 'hu' ? null : { key: `event.${e.kind}`, seat: e.seat, tile: e.tile };
    // A concealed kong's rank stays secret until the round settles (A27), so the
    // row names the move and shows no tile rather than inventing one.
    case 'kongDeclared':
      return { key: 'event.kong', seat: e.seat, tile: e.tile };
    case 'hu':
      return { key: 'event.hu', seat: e.seat, tile: null };
    case 'falseHu':
      return { key: 'history.falseHu', seat: e.seat, tile: null };
    // Not `voidDeclared`: only your own suit survives redaction (A40), and your
    // own is already on screen under the well, so every row would either repeat
    // that or say nothing.
    default:
      return null;
  }
}

/** Newest first — the answer to "what did I just miss" is at the top, no scrolling. */
export function historyRows(items: HistoryItem[]): Array<HistoryRow & { id: number }> {
  const rows: Array<HistoryRow & { id: number }> = [];
  for (const { id, event } of items) {
    const row = historyRowFor(event);
    if (row) rows.push({ ...row, id });
  }
  return rows.reverse();
}

/**
 * The round's moves, scrollable. Bots pause ~700ms a move (O2) so a circuit can
 * be followed live, but "followed live" still assumes you were looking; this is
 * the record for when you weren't. Same bottom-sheet treatment as HowToPlay.
 */
export function PlayHistory({
  nameOf,
  onClose,
}: { nameOf: (seat: Seat) => string; onClose: () => void }) {
  useEscapeToClose(true, onClose);
  const history = useStore(s => s.history);
  const t = useT();
  const rows = historyRows(history);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
        // biome-ignore lint/a11y/useSemanticElements: a native <dialog> needs imperative
        // showModal()/close() tied to mount and unmount, and its ::backdrop sits outside
        // the Framer transition this overlay animates with.
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-green-950 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[70dvh] flex flex-col"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
            <h2 className="text-white font-bold">{t('history.title')}</h2>
            <button
              type="button"
              className="text-white/60 hover:text-white text-xl px-2"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>

          <div className="overflow-y-auto min-h-0 px-4 py-3">
            {rows.length === 0 ? (
              <p className="text-green-300/70 text-sm py-4 text-center">{t('history.empty')}</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {rows.map(row => (
                  <li key={row.id} className="flex items-center gap-2 text-sm text-green-100">
                    <span className="min-w-0 truncate">
                      {t(row.key, { name: nameOf(row.seat) })}
                    </span>
                    {row.tile !== null && <Tile id={row.tile} size="sm" interactive={false} />}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
