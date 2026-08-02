import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';

/**
 * "Reconnecting…" while the socket is retrying.
 *
 * Extracted from the play screen because the play screen was the only place it
 * appeared: a spectator, or anyone sitting on the round-end scoreboard waiting
 * for the host, saw a frozen board and no explanation until ConnectionLost
 * fired the better part of a minute later.
 */
export function ReconnectingBanner() {
  const reconnecting = useStore(s => s.reconnecting);
  const t = useT();

  return (
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
  );
}
