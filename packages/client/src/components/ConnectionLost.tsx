import { useState } from 'react';
import { useT } from '../i18n/useT.js';
import { loadSession } from '../session.js';
import { useStore } from '../store/index.js';
import { connectGame, makeWsUrl } from '../ws/client.js';

/**
 * Shown once the socket has given up reconnecting. Without it the app sat on
 * "Reconnecting…" forever against a dead room or an expired token. (F6)
 */
export function ConnectionLost() {
  const lost = useStore(s => s.connectionLost);
  const resetSession = useStore(s => s.resetSession);
  const [retrying, setRetrying] = useState(false);
  const t = useT();

  if (!lost) return null;

  // The retry budget running out is not proof the seat is gone — a phone in a
  // tunnel spends it in seconds. Offer the stored token before the exit that
  // throws it away, since resetSession is irreversible and this is not.
  const saved = loadSession();

  function tryAgain() {
    if (!saved) return;
    setRetrying(true);
    useStore.setState({
      code: saved.code,
      playerName: saved.name,
      token: saved.token,
      isHost: saved.isHost,
    });
    // A token connect needs no `join`: the server rebinds the seat and pushes
    // the current view. Opening the socket clears connectionLost on its own.
    connectGame(makeWsUrl(saved.code, saved.token), () => {});
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex flex-col items-center justify-center gap-5 p-6 text-white text-center">
      <p className="text-lg font-semibold">{t('common.connectionLost')}</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {saved && (
          <button
            type="button"
            className="px-6 py-3 min-h-11 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold disabled:opacity-50"
            onClick={tryAgain}
            disabled={retrying}
          >
            {retrying ? t('common.reconnecting') : t('common.tryAgain')}
          </button>
        )}
        <button
          type="button"
          className={[
            'px-6 py-3 min-h-11 rounded-xl font-bold',
            saved ? 'bg-white/10 hover:bg-white/20' : 'bg-amber-500 hover:bg-amber-400',
          ].join(' ')}
          onClick={() => resetSession()}
        >
          {t('common.backToMenu')}
        </button>
      </div>
    </div>
  );
}
