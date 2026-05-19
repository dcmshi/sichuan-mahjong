import { useState } from 'react';
import { useStore } from '../store/index.js';
import { WsClient, makeWsUrl, setWsClient } from '../ws/client.js';

export function JoinForm() {
  const store = useStore();
  const [code, setCode] = useState(store.code);
  const [name, setName] = useState(store.playerName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    const trimCode = code.trim().toUpperCase();
    const trimName = name.trim();
    if (trimCode.length !== 4) { setError('Enter a 4-character code'); return; }
    if (!trimName) { setError('Enter your name'); return; }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/lobby/${trimCode}`);
      if (!res.ok) { setError('Lobby not found'); return; }

      store.setCode(trimCode);
      store.setPlayerName(trimName);

      const ws = new WsClient(makeWsUrl(trimCode, ''), {
        onMessage: (msg) => {
          store.handleServerMsg(msg);
          if (msg.t === 'joined') {
            // Reconnect with the issued token to persist seat
            ws.close();
            const ws2 = new WsClient(makeWsUrl(trimCode, msg.token), {
              onMessage: store.handleServerMsg,
              onConnect: () => store.setConnected(true),
              onDisconnect: () => store.setReconnecting(true),
            });
            setWsClient(ws2);
            store.goTo('lobby');
          }
        },
        onConnect: () => {
          store.setConnected(true);
          ws.send({ t: 'join', name: trimName });
        },
        onDisconnect: () => store.setReconnecting(true),
      });
      setWsClient(ws);
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center gap-6 p-6 text-white">
      <div className="text-4xl">🀄</div>
      <h2 className="text-2xl font-bold">Join a Game</h2>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <input
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-xl font-mono uppercase tracking-widest text-center focus:outline-none focus:border-amber-400"
          placeholder="CODE"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
          maxLength={4}
          autoFocus
        />
        <input
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-lg focus:outline-none focus:border-amber-400"
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void handleJoin()}
          maxLength={20}
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-50"
          onClick={() => void handleJoin()}
          disabled={loading}
        >
          {loading ? 'Joining…' : 'Join'}
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
