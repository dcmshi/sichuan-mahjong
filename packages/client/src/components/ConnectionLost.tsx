import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';

/**
 * Shown once the socket has given up reconnecting. Without it the app sat on
 * "Reconnecting…" forever against a dead room or an expired token. (F6)
 */
export function ConnectionLost() {
  const lost = useStore(s => s.connectionLost);
  const resetSession = useStore(s => s.resetSession);
  const t = useT();

  if (!lost) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex flex-col items-center justify-center gap-5 p-6 text-white text-center">
      <p className="text-lg font-semibold">{t('common.connectionLost')}</p>
      <button
        type="button"
        className="px-6 py-3 min-h-11 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold"
        onClick={() => resetSession()}
      >
        {t('common.backToMenu')}
      </button>
    </div>
  );
}
