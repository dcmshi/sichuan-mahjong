import { type Variants, motion } from 'framer-motion';
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

/* One-shot mount entrance: a gentle stagger up the masthead and the doors in.
   Transform + opacity is safe here — Landing mounts once per visit, so the
   "skipped animation leaves content invisible" failure mode (F11) can't
   strand anything: worst case it renders at its final state. */
const entrance: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const entranceItem: Variants = {
  hidden: { y: 14, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

export function Landing() {
  const [rejoining, setRejoining] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  // Read once on mount: resetSession() clears storage but shouldn't make the
  // button vanish under the finger mid-render.
  const [saved] = useState(loadSession);
  const t = useT();
  const goTo = useStore(s => s.goTo);
  const setCode = useStore(s => s.setCode);

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
    <motion.div
      className="min-h-dvh bg-green-900 flex flex-col items-center justify-center gap-8 p-6 text-white"
      variants={entrance}
      initial="hidden"
      animate="show"
    >
      <div className="absolute top-4 right-4">
        <LangSwitch />
      </div>
      <motion.div className="text-center" variants={entranceItem}>
        {/* A fan of the real tile art as the masthead mark — the game introduces
            itself with its own pieces rather than an emoji. */}
        <div className="flex items-end justify-center mb-4" aria-hidden="true">
          <img
            src="/tiles/man-1.svg"
            alt=""
            className="w-11 -rotate-12 translate-y-1 [filter:drop-shadow(0_4px_6px_rgba(0,0,0,0.5))]"
          />
          <img
            src="/tiles/pin-5.svg"
            alt=""
            className="w-13 -mx-1 z-10 [filter:drop-shadow(0_6px_8px_rgba(0,0,0,0.55))]"
          />
          <img
            src="/tiles/sou-9.svg"
            alt=""
            className="w-11 rotate-12 translate-y-1 [filter:drop-shadow(0_4px_6px_rgba(0,0,0,0.5))]"
          />
        </div>
        <h1 className="heading-display text-4xl">{t('app.title')}</h1>
        <p className="text-green-300 mt-2 text-sm">{t('app.subtitle')}</p>
      </motion.div>

      <motion.div className="w-full max-w-xs" variants={entranceItem}>
        <div className="hairline-brass text-[10px] tracking-[0.3em] uppercase" aria-hidden="true">
          ◆
        </div>
      </motion.div>

      <motion.div className="flex flex-col gap-4 w-full max-w-xs -mt-4" variants={entranceItem}>
        {saved && (
          <button
            type="button"
            className="btn-outline w-full py-4 rounded-2xl font-bold text-xl disabled:opacity-50"
            onClick={rejoin}
            disabled={rejoining}
          >
            {rejoining ? t('landing.rejoining') : t('landing.rejoin', { code: saved.code })}
          </button>
        )}
        <button
          type="button"
          className="btn-brass w-full py-4 rounded-2xl font-bold text-xl"
          onClick={() => goTo('hostSetup')}
        >
          {t('landing.host')}
        </button>
        <button
          type="button"
          className="btn-outline w-full py-4 rounded-2xl font-bold text-xl"
          onClick={handleJoin}
        >
          {urlCode ? t('landing.joinCode', { code: urlCode }) : t('landing.join')}
        </button>
        {/* Beside Join rather than at the foot of the page: watching is a way of
            entering a game, and as a low-contrast text row under the hint it read
            as a footnote rather than a fourth door in. */}
        <button
          type="button"
          className="btn-outline w-full py-4 rounded-2xl font-bold text-xl"
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
          className="btn-outline w-full py-4 rounded-2xl font-bold text-xl"
          onClick={() => goTo('practiceSetup')}
        >
          {t('landing.practice')}
        </button>
      </motion.div>

      <motion.p className="text-green-400 text-xs text-center max-w-xs" variants={entranceItem}>
        {t('landing.hostHint')}
      </motion.p>

      {/* The same overlay the play screen's ? opens, reached before a game exists:
          the rules were only readable from inside a round, which is the one place
          you already have something else to do. Reuses `htp.title` rather than a
          new key — it is the name of the thing being opened. */}
      <motion.div className="flex flex-col items-center gap-2" variants={entranceItem}>
        <button
          type="button"
          className="text-green-400 hover:text-amber-300 text-xs underline"
          onClick={() => goTo('about')}
        >
          {t('landing.about')}
        </button>
        <button
          type="button"
          className="text-green-400 hover:text-amber-300 text-xs underline"
          onClick={() => setShowHowToPlay(true)}
        >
          {t('htp.title')}
        </button>
        {/* Below About & Credits on purpose, not beside it. Sponsorship covers
            the code and not the tile art — somebody else's work under CC-BY-SA —
            and there is no room in a link to say so, so the qualification lives
            one row up and one tap away, on the screen that carries the
            attribution. Ordering is the whole of that decision. (N35) */}
        <div className="flex items-center gap-2 text-[11px] text-green-500 mt-1">
          <a
            href="https://github.com/sponsors/dcmshi"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-300 hover:underline"
          >
            {t('landing.support')}
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/dcmshi/sichuan-mahjong"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-300 hover:underline"
          >
            {t('landing.source')}
          </a>
        </div>
      </motion.div>

      {showHowToPlay && <HowToPlay onClose={() => setShowHowToPlay(false)} />}
    </motion.div>
  );
}
