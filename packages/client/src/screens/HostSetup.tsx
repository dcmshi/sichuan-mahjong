import { useState } from 'react';
import { useStore } from '../store/index.js';
import { WsClient, makeWsUrl, setWsClient, sendAction } from '../ws/client.js';

const SEAT_WINDS = ['East', 'South', 'West', 'North'];

export function HostSetup() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inLobby, setInLobby] = useState(false);

  const store = useStore();

  async function createAndJoin() {
    if (!name.trim()) { setError('Enter your name'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/lobby', { method: 'POST' });
      if (!res.ok) throw new Error('server error');
      const { code, hostToken } = await res.json() as { code: string; hostToken: string };
      store.setCode(code);
      store.setPlayerName(name.trim());

      const ws = new WsClient(makeWsUrl(code, hostToken), {
        onMessage: (msg) => {
          store.handleServerMsg(msg);
          if (msg.t === 'joined') setInLobby(true);
        },
        onConnect: () => store.setConnected(true),
        onDisconnect: () => store.setReconnecting(true),
      });
      setWsClient(ws);
      ws.send({ t: 'join', name: name.trim() });
    } catch {
      setError('Could not create lobby — is the server running?');
    } finally {
      setLoading(false);
    }
  }

  if (!inLobby) {
    return (
      <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center gap-6 p-6 text-white">
        <div className="text-4xl">🀄</div>
        <h2 className="text-2xl font-bold">Host a Game</h2>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <input
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-lg focus:outline-none focus:border-amber-400"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void createAndJoin()}
            maxLength={20}
            autoFocus
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-50"
            onClick={() => void createAndJoin()}
            disabled={loading}
          >
            {loading ? 'Creating…' : 'Create Lobby'}
          </button>
          <button
            className="py-2 text-white/60 hover:text-white"
            onClick={() => store.goTo('landing')}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/j/${store.code}`;

  return (
    <div className="min-h-screen bg-green-900 flex flex-col p-4 text-white gap-4">
      <div className="flex items-center gap-3 mt-2">
        <span className="text-2xl font-mono font-bold text-amber-400 tracking-widest">{store.code}</span>
        <span className="text-green-300 text-sm">← share code</span>
      </div>

      <div className="bg-black/30 rounded-xl p-3">
        <p className="text-green-300 text-xs mb-1">Share URL:</p>
        <p className="font-mono text-sm break-all text-amber-300">{shareUrl}</p>
        <button
          className="mt-1 text-xs text-green-400 underline"
          onClick={() => void navigator.clipboard.writeText(shareUrl)}
        >
          Copy
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {SEAT_WINDS.map((wind, i) => {
          const p = store.lobbyPlayers[i];
          return (
            <div key={i} className="flex items-center gap-3 bg-black/20 rounded-xl px-3 py-2.5">
              <span className="text-green-400 text-sm w-14">{wind}</span>
              {p?.name ? (
                <span className="font-semibold">{p.name}</span>
              ) : (
                <span className="text-white/40 italic text-sm">waiting…</span>
              )}
              {p?.connected && <span className="ml-auto text-green-400 text-xs">●</span>}
            </div>
          );
        })}
      </div>

      <button
        className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 rounded-xl font-bold text-lg mt-auto disabled:opacity-40"
        onClick={() => sendAction({ t: 'startGame' })}
        disabled={!store.canStart}
      >
        {store.canStart ? 'Start Game' : 'Waiting for players…'}
      </button>

      {store.reconnecting && (
        <p className="text-center text-amber-400 text-sm animate-pulse">Reconnecting…</p>
      )}
    </div>
  );
}
