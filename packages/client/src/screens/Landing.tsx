import { useEffect, useRef, useState } from 'react';
import { HowToPlay } from '../components/HowToPlay.js';
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
} from '../ws/client.js';

/** How long to wait for the server to accept a stored token before giving up. */
const REJOIN_TIMEOUT_MS = 6000;

export function Landing() {
  const [rejoining, setRejoining] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
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

  // The rejoin deadline below outlived this screen. Its guard is "are we still
  // on landing", which is true again the moment a player who rejoined
  // successfully walks back out to the menu — so a good rejoin followed by a
  // Leave inside six seconds closed the fresh connection and raised "Could not
  // rejoin." over it. Landing unmounts on every screen change, so cancelling
  // here is the whole fix. (A65)
  const rejoinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (rejoinTimer.current) clearTimeout(rejoinTimer.current);
    },
    [],
  );

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
    rejoinTimer.current = setTimeout(() => {
      rejoinTimer.current = null;
      if (useStore.getState().screen !== 'landing') return;
      closeConnection();
      clearSession();
      setRejoining(false);
      useStore
        .getState()
        .handleServerMsg({ t: 'error', code: 'rejoin_failed', message: 'Could not rejoin.' });
    }, REJOIN_TIMEOUT_MS);
  }

  return (
    <div className="min-h-dvh bg-green-900 flex flex-col items-center justify-center gap-8 p-6 text-white">
      <div className="absolute top-4 right-4">
        <LangSwitch />
      </div>
      <div className="text-center">
        <div className="text-6xl mb-2" aria-hidden="true">
          🀄
        </div>
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
        {/* Beside Join rather than at the foot of the page: watching is a way of
            entering a game, and as a low-contrast text row under the hint it read
            as a footnote rather than a fourth door in. */}
        <button
          type="button"
          className="w-full py-4 bg-white/10 hover:bg-white/20 active:bg-white/5 rounded-2xl font-bold text-xl text-white shadow-lg"
          onClick={() => goTo('spectateForm')}
        >
          {t('landing.watch')}
        </button>
        {/* Goes to its own setup screen, the way Host does. It used to start the
            game on this tap, with the settings folded into a disclosure link
            below — which was a centred 12px underline in the same visual class
            as "About & Credits" at the foot of the page. The first person who
            went looking for it did not find it and reported the feature as
            missing, which is the only test an affordance gets. */}
        <button
          type="button"
          className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 rounded-2xl font-bold text-xl text-white shadow-lg"
          onClick={() => goTo('practiceSetup')}
        >
          {t('landing.practice')}
        </button>
      </div>

      <p className="text-green-400 text-xs text-center max-w-xs">{t('landing.hostHint')}</p>

      {/* The same overlay the play screen's ? opens, reached before a game exists:
          the rules were only readable from inside a round, which is the one place
          you already have something else to do. Reuses `htp.title` rather than a
          new key — it is the name of the thing being opened. */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          className="text-green-500 hover:text-green-300 text-xs underline"
          onClick={() => goTo('about')}
        >
          {t('landing.about')}
        </button>
        <button
          type="button"
          className="text-green-500 hover:text-green-300 text-xs underline"
          onClick={() => setShowHowToPlay(true)}
        >
          {t('htp.title')}
        </button>
        {/* Below About & Credits on purpose, not beside it. Sponsorship covers
            the code and not the tile art — somebody else's work under CC-BY-SA —
            and there is no room in a link to say so, so the qualification lives
            one row up and one tap away, on the screen that carries the
            attribution. Ordering is the whole of that decision. (N35) */}
        <div className="flex items-center gap-2 text-[11px] text-green-600 mt-1">
          <a
            href="https://github.com/sponsors/dcmshi"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-green-300 hover:underline"
          >
            {t('landing.support')}
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/dcmshi/sichuan-mahjong"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-green-300 hover:underline"
          >
            {t('landing.source')}
          </a>
        </div>
      </div>

      {showHowToPlay && <HowToPlay onClose={() => setShowHowToPlay(false)} />}
    </div>
  );
}
