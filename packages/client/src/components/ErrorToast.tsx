import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { catalog } from '../i18n/index.js';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';

const VISIBLE_MS = 4000;

/**
 * Renders the last server rejection. Mounted once at the app root so every
 * screen gets it — before this, `error` frames were logged and dropped, so a
 * full lobby or a rejected action produced no visible feedback at all. (F1)
 */
export function ErrorToast() {
  const err = useStore(s => s.lastError);
  const clearError = useStore(s => s.clearError);
  const t = useT();

  const seq = err?.seq;
  useEffect(() => {
    if (seq === undefined) return;
    const id = setTimeout(clearError, VISIBLE_MS);
    return () => clearTimeout(id);
  }, [seq, clearError]);

  // Known codes get a localized string; anything else falls back to the
  // server's own (English) message rather than showing a raw key.
  const text = err ? (catalog.en[`err.${err.code}`] ? t(`err.${err.code}`) : err.message) : '';

  return (
    <AnimatePresence>
      {err && (
        <motion.output
          key={err.seq}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-2 rounded-xl bg-red-700/95 text-white text-sm font-semibold shadow-lg text-center"
        >
          {text}
        </motion.output>
      )}
    </AnimatePresence>
  );
}
