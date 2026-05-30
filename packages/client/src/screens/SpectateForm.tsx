import { useState } from 'react';
import { useStore } from '../store/index.js';
import { WsClient, makeSpectateUrl, setWsClient } from '../ws/client.js';

export function SpectateForm() {
  const store = useStore();
  const [code, setCode] = useState(store.code);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function watch() {
    const trimCode = code.trim().toUpperCase();
    if (trimCode.length !== 4) { setError('Enter a 4-character code'); return; }
    setError('');
    setLoading(true);
    store.setCode(trimCode);

    const ws = new WsClient(makeSpectateUrl(trimCode), {
      onMessage: (msg) => {
        if (msg.t === 'error' && msg.code === 'no_game') {
          setError('No game found for that code (it may not have started yet)');
          setLoading(false);
          ws.close();
          setWsClient(null);
          return;
        }
        // 'spectate' messages flip the screen to the read-only board.
        store.handleServerMsg(msg);
      },
      onConnect: () => store.setConnected(true),
      onDisconnect: () => store.setReconnecting(true),
    });
    setWsClient(ws);
  }

  return (
    <div className="min-h-screen board-felt flex flex-col items-center justify-center gap-6 p-6 text-white">
      <div className="text-4xl">👀</div>
      <h2 className="text-2xl font-bold">Watch a Game</h2>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <input
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-xl font-mono uppercase tracking-widest text-center focus:outline-none focus:border-amber-400"
          placeholder="CODE"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
          onKeyDown={e => e.key === 'Enter' && watch()}
          maxLength={4}
          autoFocus
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-50"
          onClick={watch}
          disabled={loading}
        >
          {loading ? 'Connecting…' : 'Watch'}
        </button>
        <button className="py-2 text-white/60 hover:text-white" onClick={() => store.goTo('landing')}>
          ← Back
        </button>
      </div>
    </div>
  );
}
