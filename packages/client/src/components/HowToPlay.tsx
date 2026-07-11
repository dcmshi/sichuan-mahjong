import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '../i18n/useT.js';

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

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-green-950 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
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
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="px-4 py-4 flex flex-col gap-5">
            {SECTION_KEYS.map(k => (
              <div key={k}>
                <h3 className="text-amber-400 font-semibold mb-1">{t(`htp.${k}.title`)}</h3>
                <p className="text-green-100 text-sm leading-relaxed whitespace-pre-line">
                  {t(`htp.${k}.body`)}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
