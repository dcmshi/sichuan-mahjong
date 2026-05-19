import { useState } from 'react';
import { useStore } from '../store/index.js';
import { WsClient, makeWsUrl, setWsClient, sendAction } from '../ws/client.js';

export function Landing() {
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState('');
  const store = useStore();
  const { goTo, setCode, setPlayerName } = store;

  // Check URL for pre-filled code (from /j/:code redirect)
  const urlCode = new URLSearchParams(window.location.search).get('code') ?? '';

  function handleJoin() {
    if (urlCode) setCode(urlCode.toUpperCase());
    goTo('joinForm');
  }

  async function startPractice() {
    setPracticeLoading(true);
    setPracticeError('');
    const name = 'You';
    try {
      const res = await fetch('/api/lobby', { method: 'POST' });
      if (!res.ok) throw new Error('server error');
      const { code, hostToken } = await res.json() as { code: string; hostToken: string };
      setCode(code);
      setPlayerName(name);

      const ws = new WsClient(makeWsUrl(code, hostToken), {
        onMessage: (msg) => {
          store.handleServerMsg(msg);
          if (msg.t === 'joined') {
            // Add 3 bots then start
            sendAction({ t: 'addBot', difficulty: 'easy' });
            sendAction({ t: 'addBot', difficulty: 'easy' });
            sendAction({ t: 'addBot', difficulty: 'easy' });
          }
          if (msg.t === 'lobby' && msg.canStart) {
            sendAction({ t: 'startGame' });
          }
        },
        onConnect: () => store.setConnected(true),
        onDisconnect: () => store.setReconnecting(true),
      });
      setWsClient(ws);
      ws.send({ t: 'join', name });
    } catch {
      setPracticeError('Could not start practice — is the server running?');
    } finally {
      setPracticeLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center gap-8 p-6 text-white">
      <div className="text-center">
        <div className="text-6xl mb-2">🀄</div>
        <h1 className="text-3xl font-bold">Sichuan Mahjong</h1>
        <p className="text-green-300 mt-1 text-sm">Bloody Rules — 血战到底</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 rounded-2xl font-bold text-xl text-white shadow-lg"
          onClick={() => goTo('hostSetup')}
        >
          Host a Game
        </button>
        <button
          className="w-full py-4 bg-white/20 hover:bg-white/30 active:bg-white/10 rounded-2xl font-bold text-xl text-white shadow-lg"
          onClick={handleJoin}
        >
          {urlCode ? `Join ${urlCode}` : 'Join a Game'}
        </button>
        <button
          className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 rounded-2xl font-bold text-xl text-white shadow-lg disabled:opacity-50"
          onClick={() => void startPractice()}
          disabled={practiceLoading}
        >
          {practiceLoading ? 'Starting…' : 'Practice (vs Bots)'}
        </button>
        {practiceError && <p className="text-red-400 text-sm text-center">{practiceError}</p>}
      </div>

      <p className="text-green-400 text-xs text-center max-w-xs">
        Host runs the server on their machine. Friends connect over LAN or Tailscale.
      </p>

      <button
        className="text-green-500 hover:text-green-300 text-xs underline"
        onClick={() => goTo('about')}
      >
        About &amp; Credits
      </button>
    </div>
  );
}
