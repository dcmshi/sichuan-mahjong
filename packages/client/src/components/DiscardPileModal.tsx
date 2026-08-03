import type { TileId } from '@sichuan-mahjong/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEscapeToClose } from '../hooks/useDismissable.js';
import { useT } from '../i18n/useT.js';
import { Tile } from './Tile.js';

/**
 * Every tile a seat has discarded, at a size you can read. (N33)
 *
 * The trays cap at 6 a side and 9 across and count the rest, so this is where
 * that cap stops costing anything rather than a second view of what is already
 * on screen. Three things it has to keep:
 *
 * - It renders from `PlayPhase`, never inside a tray. `viewport.spec.ts` asserts
 *   no `.tile` inside a `.discard-tray` has a box outside that tray's, and these
 *   are drawn `md` where a tray is `sm` — the same constraint that made N1's
 *   claim animation an overlay.
 * - The void declaration keeps its own row and its mark. It is the one tile in
 *   the list that means something other than "discarded", and in a flat list it
 *   would read as an ordinary first discard.
 * - Upright and unlapped, unlike the trays. A lap is how a pile on a table
 *   looks; these are being *read*, so each tile gets its own space.
 */
export function DiscardPileModal({
  name,
  voidDiscard,
  pile,
  lastDiscard,
  onClose,
}: {
  name: string;
  voidDiscard: TileId | null;
  pile: TileId[];
  lastDiscard: TileId | null;
  onClose: () => void;
}) {
  useEscapeToClose(true, onClose);
  const t = useT();
  const total = pile.length + (voidDiscard === null ? 0 : 1);

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
        // The backdrop covers the pile that was tapped, so tapping it again is
        // what dismisses this — which is how it was asked for.
        onClick={onClose}
      >
        <motion.div
          className="bg-green-950 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[70dvh] flex flex-col"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          data-pile-modal
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
            <div className="min-w-0">
              <h2 className="text-white font-bold truncate">{t('pile.title', { name })}</h2>
              <p className="text-green-300/70 text-xs">{t('pile.count', { n: total })}</p>
            </div>
            <button
              type="button"
              className="text-white/60 hover:text-white text-xl px-2"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>

          <div className="overflow-y-auto min-h-0 px-4 py-3 flex flex-col gap-3">
            {voidDiscard !== null && (
              <div className="flex flex-col gap-1">
                <p className="text-green-300 text-[10px] font-semibold uppercase tracking-wide">
                  {t('pile.void')}
                </p>
                <div className="flex">
                  <Tile
                    id={voidDiscard}
                    voidDiscard
                    lastDiscard={voidDiscard === lastDiscard}
                    interactive={false}
                  />
                </div>
              </div>
            )}
            {pile.length === 0 && voidDiscard === null ? (
              <p className="text-green-300/70 text-sm py-4 text-center">{t('pile.empty')}</p>
            ) : (
              pile.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-green-300 text-[10px] font-semibold uppercase tracking-wide">
                    {t('pile.discards')}
                  </p>
                  {/* Oldest first, left to right — reading order, not the seat's
                      own growth direction. The trays mirror themselves to the
                      table; a list is read. */}
                  <div className="flex flex-wrap gap-1.5">
                    {pile.map(id => (
                      <Tile key={id} id={id} lastDiscard={id === lastDiscard} interactive={false} />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
