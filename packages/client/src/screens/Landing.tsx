import { useEffect, useState } from 'react';
import { LangSwitch } from '../components/LangSwitch.js';
import { useT } from '../i18n/useT.js';
import { clearSession, loadSession } from '../session.js';
import { useStore } from '../store/index.js';
import {
  closeConnection,
  connectGame,
  makeSpectateUrl,
  makeWsUrl,
  parseWatchRef,
  sendAction,
} from '../ws/client.js';

/** How long to wait for the server to accept a stored token before giving up. */
const REJOIN_TIMEOUT_MS = 6000;
/** Backstop for a practice socket that opens and then says nothing. */
const PRACTICE_TIMEOUT_MS = 8000;

export function Landing() {
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState('');
  const [rejoining, setRejoining] = useState(false);
  // Read once on mount: resetSession() clears storage but shouldn't make the
  // button vanish under the finger mid-render.
  const [saved] = useState(loadSession);
  const t = useT();
  const goTo = useStore(s => s.goTo);
  const setCode = useStore(s => s.setCode);
  const setPlayerName = useStore(s => s.setPlayerName);

  // Pre-filled code from the /j/:code redirect. Read once and normalized here,
  // so the button label and the code we actually join with agree — a lowercase
  // ?code=ab12 used to render "Join ab12" beside a lobby called AB12.
  const [urlCode] = useState(() =>
    (new URLSearchParams(window.location.search).get('code') ?? '').toUpperCase(),
  );

  // A watch link (?watch=CODE.token) connects as a spectator straight away —
  // the secret is already in hand, so there is nothing left to ask for. (C5)
  useEffect(() => {
    const ref = parseWatchRef(new URLSearchParams(window.location.search).get('watch') ?? '');
    if (!ref) return;
    // Drop the secret from the address bar before anything can screenshot or
    // bookmark it; the connection below already has what it needs.
    window.history.replaceState(null, '', window.location.pathname);
    useStore.getState().setCode(ref.code);
    connectGame(makeSpectateUrl(ref.code, ref.watch), () => {});
  }, []);

  function handleJoin() {
    if (urlCode) setCode(urlCode);
    goTo('joinForm');
  }

  function rejoin() {
    if (!saved) return;
    setRejoining(true);
    useStore.setState({
      code: saved.code,
      playerName: saved.name,
      token: saved.token,
      isHost: saved.isHost,
      isPractice: saved.isPractice ?? false,
    });
    // A token connect needs no `join` message — the server rebinds the seat and
    // pushes the current view (or the lobby's `joined`) on its own.
    connectGame(makeWsUrl(saved.code, saved.token), msg => {
      if (msg.t === 'joined') goTo(saved.isHost ? 'hostSetup' : 'lobby');
    });
    // A stale token isn't rejected — the server just falls through to the
    // lobby handler and waits — so failure looks like silence.
    setTimeout(() => {
      if (useStore.getState().screen !== 'landing') return;
      closeConnection();
      clearSession();
      setRejoining(false);
      useStore
        .getState()
        .handleServerMsg({ t: 'error', code: 'rejoin_failed', message: 'Could not rejoin.' });
    }, REJOIN_TIMEOUT_MS);
  }

  async function startPractice() {
    setPracticeLoading(true);
    setPracticeError('');
    useStore.getState().setIsPractice(true);
    const name = t('landing.practiceName');
    try {
      const res = await fetch('/api/lobby', { method: 'POST' });
      if (!res.ok) throw new Error('server error');
      const { code, hostToken } = (await res.json()) as { code: string; hostToken: string };
      setCode(code);
      setPlayerName(name);

      const ws = connectGame(makeWsUrl(code, hostToken), msg => {
        if (msg.t === 'joined') {
          // Add 3 easy bots then start
          sendAction({ t: 'addBot', difficulty: 'easy' });
          sendAction({ t: 'addBot', difficulty: 'easy' });
          sendAction({ t: 'addBot', difficulty: 'easy' });
        }
        if (msg.t === 'lobby' && msg.canStart) {
          sendAction({ t: 'startGame' });
        }
        // Only now is the lobby real. Releasing the button when the POST
        // resolved re-armed it while the socket was still opening, and a second
        // tap created a second lobby and a second game.
        if (msg.t === 'joined' || msg.t === 'error') setPracticeLoading(false);
      });
      ws.send({ t: 'join', name });

      // The socket can also fail by going quiet — the same shape the rejoin path
      // guards. Without this the button would stay disabled for good.
      setTimeout(() => {
        if (useStore.getState().screen !== 'landing') return;
        setPracticeLoading(false);
        setPracticeError('landing.practiceError');
      }, PRACTICE_TIMEOUT_MS);
    } catch {
      setPracticeError('landing.practiceError');
      setPracticeLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-green-900 flex flex-col items-center justify-center gap-8 p-6 text-white">
      <div className="absolute top-4 right-4">
        <LangSwitch />
      </div>
      <div className="text-center">
        <div className="text-6xl mb-2">🀄</div>
        <h1 className="text-3xl font-bold">{t('app.title')}</h1>
        <p className="text-green-300 mt-1 text-sm">{t('app.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        {saved && (
          <button
            type="button"
            className="w-full py-4 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 rounded-2xl font-bold text-xl text-white shadow-lg disabled:opacity-50"
            onClick={rejoin}
            disabled={rejoining}
          >
            {rejoining ? t('landing.rejoining') : t('landing.rejoin', { code: saved.code })}
          </button>
        )}
        <button
          type="button"
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 rounded-2xl font-bold text-xl text-white shadow-lg"
          onClick={() => goTo('hostSetup')}
        >
          {t('landing.host')}
        </button>
        <button
          type="button"
          className="w-full py-4 bg-white/20 hover:bg-white/30 active:bg-white/10 rounded-2xl font-bold text-xl text-white shadow-lg"
          onClick={handleJoin}
        >
          {urlCode ? t('landing.joinCode', { code: urlCode }) : t('landing.join')}
        </button>
        <button
          type="button"
          className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 rounded-2xl font-bold text-xl text-white shadow-lg disabled:opacity-50"
          onClick={() => void startPractice()}
          disabled={practiceLoading}
        >
          {practiceLoading ? t('landing.starting') : t('landing.practice')}
        </button>
        {practiceError && <p className="text-red-400 text-sm text-center">{t(practiceError)}</p>}
        <button
          type="button"
          className="w-full py-3 text-white/70 hover:text-white text-sm"
          onClick={() => goTo('spectateForm')}
        >
          {t('landing.watch')}
        </button>
      </div>

      <p className="text-green-400 text-xs text-center max-w-xs">{t('landing.hostHint')}</p>

      <button
        type="button"
        className="text-green-500 hover:text-green-300 text-xs underline"
        onClick={() => goTo('about')}
      >
        {t('landing.about')}
      </button>
    </div>
  );
}
