import { AnimatePresence, motion } from 'framer-motion';
import { SHAPE_EXAMPLES, helpFanRows } from '../helpExamples.js';
import { useEscapeToClose } from '../hooks/useDismissable.js';
import { useT } from '../i18n/useT.js';
import { Tile, TileRun } from './Tile.js';

const SECTION_KEYS = [
  'overview',
  'setup',
  'turn',
  'claims',
  'winning',
  'scoring',
  'kongs',
  'furiten',
] as const;

/**
 * The two winning shapes, drawn. Grouped rather than flush because the grouping
 * *is* the lesson — a flat run of 14 says the hand is complete but not why, which
 * is the same gap N16 fixes on the round-end reveal.
 */
function WinningShapes() {
  const t = useT();
  return (
    <div className="mt-3 flex flex-col gap-3">
      {SHAPE_EXAMPLES.map(ex => (
        <div key={ex.key}>
          <div className="flex flex-wrap items-center gap-y-1">
            {ex.groups.map((group, i) => (
              <TileRun key={`${ex.key}-${i}`}>
                {group.map(id => (
                  <Tile key={id} id={id} size="sm" interactive={false} />
                ))}
              </TileRun>
            ))}
          </div>
          <p className="text-green-100 text-xs leading-relaxed mt-1">
            {t(`htp.shape.${ex.key}`)}{' '}
            <span className="text-white/40">
              {t('htp.shape.voided', { suit: t(`suit.${ex.voided}.full`) })}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}

/** Every fan the scorer can award, with its value read out of `COMPATIBILITY`. */
function FanTable() {
  const t = useT();
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-green-200 text-sm font-medium">{t('htp.fan.title')}</p>
      {helpFanRows().map(row => (
        <div key={row.fan} className="flex items-baseline gap-2">
          <span className="text-amber-300/90 text-sm shrink-0">{t(`fan.${row.fan}`)}</span>
          <span className="text-white/40 text-xs shrink-0">
            {t('htp.fan.value', { n: row.fanValue })}
            {row.selfMax > 1 ? ` · ${t('htp.fan.stack', { n: row.selfMax })}` : ''}
          </span>
          <span className="text-green-100 text-xs leading-relaxed flex-1 min-w-0">
            {t(`htp.fan.${row.fan}`)}
          </span>
        </div>
      ))}
      <p className="text-white/50 text-xs leading-relaxed">{t('htp.fan.cap')}</p>
    </div>
  );
}

export function HowToPlay({ onClose }: { onClose: () => void }) {
  useEscapeToClose(true, onClose);
  const t = useT();
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
          className="bg-green-950 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85dvh] overflow-y-auto"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-green-950 flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 className="text-white font-bold text-lg">{t('htp.title')}</h2>
            <button
              type="button"
              className="text-white/60 hover:text-white text-xl px-2"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>

          <div className="px-4 py-4 flex flex-col gap-5">
            {/* The illustrations sit under the prose that already states the rule
                rather than in a section of their own: "how a hand wins" was
                written twice over already, and a fourth restatement would be the
                thing to fix, not the thing to add. */}
            {SECTION_KEYS.map(k => (
              <div key={k}>
                <h3 className="text-amber-400 font-semibold mb-1">{t(`htp.${k}.title`)}</h3>
                <p className="text-green-100 text-sm leading-relaxed whitespace-pre-line">
                  {t(`htp.${k}.body`)}
                </p>
                {k === 'winning' && <WinningShapes />}
                {k === 'scoring' && <FanTable />}
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
