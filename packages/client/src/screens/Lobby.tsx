import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';

export function Lobby() {
  const t = useT();
  const code = useStore(s => s.code);
  const lobbyPlayers = useStore(s => s.lobbyPlayers);
  const seat = useStore(s => s.seat);
  const reconnecting = useStore(s => s.reconnecting);
  const resetSession = useStore(s => s.resetSession);

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center gap-6 p-6 text-white">
      <div className="text-4xl">🀄</div>
      <div className="text-center">
        <h2 className="text-2xl font-bold">{t('lobby.title')}</h2>
        <p className="text-green-300 text-lg font-mono tracking-widest mt-1">{code}</p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        {[0, 1, 2, 3].map(i => {
          const p = lobbyPlayers[i];
          return (
            <div key={i} className="flex items-center gap-3 bg-black/20 rounded-xl px-3 py-2.5">
              <span className="text-green-400 text-sm w-14">{t(`wind.${i}`)}</span>
              {p?.name ? (
                <>
                  <span className="font-semibold">{p.name}</span>
                  {p.seat === seat && (
                    <span className="ml-1 text-xs text-amber-400">{t('common.you')}</span>
                  )}
                </>
              ) : (
                <span className="text-white/40 italic text-sm">{t('lobby.waiting')}</span>
              )}
              {/* A disconnected player used to render nothing at all, which
                  read as "still connecting" next to the pulsing copy. (F23) */}
              {p?.name && !p.isBot && (
                <span
                  className={`ml-auto text-xs ${p.connected ? 'text-green-400' : 'text-white/40'}`}
                >
                  {p.connected ? '●' : `○ ${t('lobby.disconnected')}`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-green-300 text-sm animate-pulse">{t('lobby.waitingHost')}</p>

      {reconnecting && (
        <p className="text-amber-400 text-sm animate-pulse">{t('common.reconnecting')}</p>
      )}

      {/* Abandoning a lobby used to mean closing the tab. (F10) */}
      <button
        type="button"
        className="py-2 px-4 min-h-11 text-white/60 hover:text-white"
        onClick={() => resetSession()}
      >
        {t('nav.leave')}
      </button>
    </div>
  );
}
