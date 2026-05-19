import { useStore } from '../store/index.js';

export function Landing() {
  const goTo = useStore(s => s.goTo);
  const setCode = useStore(s => s.setCode);

  // Check URL for pre-filled code (from /j/:code redirect)
  const urlCode = new URLSearchParams(window.location.search).get('code') ?? '';

  function handleJoin() {
    if (urlCode) setCode(urlCode.toUpperCase());
    goTo('joinForm');
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
      </div>

      <p className="text-green-400 text-xs text-center max-w-xs">
        Host runs the server on their machine. Friends connect over LAN or Tailscale.
      </p>
    </div>
  );
}
