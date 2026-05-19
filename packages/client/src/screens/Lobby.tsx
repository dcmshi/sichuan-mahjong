import { useStore } from '../store/index.js';

const SEAT_WINDS = ['East', 'South', 'West', 'North'];

export function Lobby() {
  const store = useStore();

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center gap-6 p-6 text-white">
      <div className="text-4xl">🀄</div>
      <div className="text-center">
        <h2 className="text-2xl font-bold">Lobby</h2>
        <p className="text-green-300 text-lg font-mono tracking-widest mt-1">{store.code}</p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        {SEAT_WINDS.map((wind, i) => {
          const p = store.lobbyPlayers[i];
          return (
            <div key={i} className="flex items-center gap-3 bg-black/20 rounded-xl px-3 py-2.5">
              <span className="text-green-400 text-sm w-14">{wind}</span>
              {p?.name ? (
                <>
                  <span className="font-semibold">{p.name}</span>
                  {p.seat === store.seat && <span className="ml-1 text-xs text-amber-400">(you)</span>}
                </>
              ) : (
                <span className="text-white/40 italic text-sm">waiting…</span>
              )}
              {p?.connected && <span className="ml-auto text-green-400 text-xs">●</span>}
            </div>
          );
        })}
      </div>

      <p className="text-green-300 text-sm animate-pulse">
        Waiting for host to start…
      </p>

      {store.reconnecting && (
        <p className="text-amber-400 text-sm animate-pulse">Reconnecting…</p>
      )}
    </div>
  );
}
