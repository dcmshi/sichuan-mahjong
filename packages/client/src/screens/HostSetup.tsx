import type { Seat } from '@sichuan-mahjong/engine';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';
import { connectGame, makeWatchLink, makeWsUrl, sendAction } from '../ws/client.js';

export function HostSetup() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // A rejoining host (F2) already holds a seat, so skip straight to the lobby
  // view rather than offering to create a second one.
  const [inLobby, setInLobby] = useState(
    () => useStore.getState().seat !== null && useStore.getState().code !== '',
  );
  const [botLevel, setBotLevel] = useState<'easy' | 'medium'>('easy');
  const [huanSanZhang, setHuanSanZhang] = useState(false);
  const [botSpeed, setBotSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [claimWindow, setClaimWindow] = useState<'quick' | 'normal' | 'relaxed'>('normal');
  // Which copy button last fired. The clipboard write is silent — on a phone
  // there is no cursor, no selection and no toast, so without this the tap is
  // indistinguishable from a dead button.
  const [copied, setCopied] = useState<'share' | 'watch' | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const t = useT();
  const code = useStore(s => s.code);
  const watchToken = useStore(s => s.watchToken);
  const seat = useStore(s => s.seat);
  const lobbyPlayers = useStore(s => s.lobbyPlayers);
  const canStart = useStore(s => s.canStart);
  const reconnecting = useStore(s => s.reconnecting);
  const goTo = useStore(s => s.goTo);
  const resetSession = useStore(s => s.resetSession);

  async function createAndJoin() {
    if (!name.trim()) {
      setError('join.errName');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/lobby', { method: 'POST' });
      if (!res.ok) throw new Error('server error');
      const {
        code: newCode,
        hostToken,
        watchToken,
      } = (await res.json()) as {
        code: string;
        hostToken: string;
        watchToken: string;
      };
      const store = useStore.getState();
      store.setCode(newCode);
      store.setWatchToken(watchToken);
      store.setPlayerName(name.trim());

      const ws = connectGame(makeWsUrl(newCode, hostToken), msg => {
        if (msg.t === 'joined') setInLobby(true);
      });
      ws.send({ t: 'join', name: name.trim() });
    } catch {
      setError('host.errCreate');
    } finally {
      setLoading(false);
    }
  }

  if (!inLobby) {
    return (
      <div className="min-h-dvh bg-green-900 flex flex-col items-center justify-center gap-6 p-6 text-white">
        <div className="text-4xl" aria-hidden="true">
          🀄
        </div>
        <h2 className="text-2xl font-bold">{t('host.title')}</h2>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <input
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-lg focus:outline-none focus:border-amber-400"
            placeholder={t('join.name')}
            aria-label={t('join.name')}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void createAndJoin()}
            maxLength={20}
          />
          {error && <p className="text-red-400 text-sm">{t(error)}</p>}
          <button
            type="button"
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-50"
            onClick={() => void createAndJoin()}
            disabled={loading}
          >
            {loading ? t('host.creating') : t('host.create')}
          </button>
          <button
            type="button"
            className="py-2 text-white/60 hover:text-white"
            onClick={() => goTo('landing')}
          >
            {t('nav.back')}
          </button>
        </div>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/j/${code}`;
  const watchLink = watchToken ? makeWatchLink(code, watchToken) : '';

  // Bot pace paces nothing at a table of four people. Phrased as "unless we know
  // every seat holds a human" so an empty seat — or a lobby list that hasn't
  // arrived yet — leaves the control live: a seat can be filled with a bot right
  // up to Start, and a control that appears and vanishes as seats change is worse
  // than one that greys out. (N9)
  const allHuman = lobbyPlayers.length === 4 && lobbyPlayers.every(p => p.name && !p.isBot);

  function copyText(text: string, which: 'share' | 'watch') {
    // navigator.clipboard only exists in secure contexts — on plain LAN HTTP
    // (this app's primary path) it's undefined, so the old bare writeText call
    // threw and the button silently did nothing. Legacy fallback covers HTTP
    // and any denied-permission rejection. (A34)
    const legacyCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(legacyCopy);
    } else {
      legacyCopy();
    }
    setCopied(which);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="min-h-dvh bg-green-900 flex flex-col p-4 text-white gap-4">
      <div className="flex items-center gap-3 mt-2">
        <span className="text-2xl font-mono font-bold text-amber-400 tracking-widest">{code}</span>
        <span className="text-green-300 text-sm">{t('host.shareCode')}</span>
      </div>

      <div className="bg-black/30 rounded-xl p-3">
        <p className="text-green-300 text-xs mb-1">{t('host.shareUrl')}</p>
        <p className="font-mono text-sm break-all text-amber-300">{shareUrl}</p>
        <button
          type="button"
          className="mt-1 text-xs text-green-400 underline"
          onClick={() => copyText(shareUrl, 'share')}
        >
          {copied === 'share' ? t('host.copied') : t('host.copy')}
        </button>
      </div>

      {watchLink && (
        <div className="bg-black/30 rounded-xl p-3">
          <p className="text-green-300 text-xs mb-1">{t('host.watchUrl')}</p>
          <p className="font-mono text-xs break-all text-white/70">{watchLink}</p>
          <button
            type="button"
            className="mt-1 text-xs text-green-400 underline"
            onClick={() => copyText(watchLink, 'watch')}
          >
            {copied === 'watch' ? t('host.copied') : t('host.copy')}
          </button>
          <p className="text-white/40 text-xs mt-1">{t('host.watchHint')}</p>
        </div>
      )}

      {/* Difficulty for newly added bots */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-300">{t('host.botLevel')}:</span>
        <div className="inline-flex rounded-lg overflow-hidden border border-white/20">
          {(['easy', 'medium'] as const).map(level => (
            <button
              type="button"
              key={level}
              onClick={() => setBotLevel(level)}
              className={[
                'px-3 py-1 font-semibold transition-colors',
                botLevel === level
                  ? 'bg-amber-400 text-black'
                  : 'bg-black/20 text-white/70 hover:text-white',
              ].join(' ')}
            >
              {t(level === 'easy' ? 'host.easy' : 'host.medium')}
            </button>
          ))}
        </div>
      </div>

      {/* House rules. 換三張 is a Sichuan favourite but not part of SBR (see
          GameConfig), so it is offered and starts off — the canonical ruleset is
          what you get if you touch nothing. Only the host sees this, and the
          choice rides along with startGame. */}
      <div className="flex items-start gap-3 text-sm bg-black/20 rounded-xl px-3 py-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={huanSanZhang}
          onClick={() => setHuanSanZhang(v => !v)}
          className={[
            'relative w-11 min-h-6 h-6 flex-shrink-0 rounded-full transition-colors',
            huanSanZhang ? 'bg-amber-400' : 'bg-black/40',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
              huanSanZhang ? 'left-[1.375rem]' : 'left-0.5',
            ].join(' ')}
          />
        </button>
        <span className="flex-1 min-w-0">
          <span className="font-semibold">{t('host.huanSanZhang')}</span>
          <span className="block text-xs text-green-300 leading-snug">
            {t('host.huanSanZhangHint')}
          </span>
        </span>
      </div>

      {/* Bot pace. Not a rule — it changes nothing about the game and a replay of
          the same seed is identical at any of them — so it rides alongside the
          rules rather than inside them. Slow is for following what happened;
          fast is for players who already know. */}
      <div className={`bg-black/20 rounded-xl px-3 py-2.5 text-sm ${allHuman ? 'opacity-50' : ''}`}>
        <div className="font-semibold">{t('host.botSpeed')}</div>
        <div className="text-xs text-green-300 leading-snug mb-2">
          {allHuman ? t('host.botSpeedNoBots') : t('host.botSpeedHint')}
        </div>
        <div className="flex gap-1.5">
          {(['slow', 'normal', 'fast'] as const).map(speed => (
            <button
              key={speed}
              type="button"
              aria-pressed={botSpeed === speed}
              disabled={allHuman}
              onClick={() => setBotSpeed(speed)}
              className={[
                'flex-1 min-h-10 rounded-lg font-semibold transition-colors',
                botSpeed === speed ? 'bg-amber-400 text-black' : 'bg-black/30 text-white/70',
                allHuman ? 'cursor-not-allowed' : '',
              ].join(' ')}
            >
              {t(`host.botSpeed.${speed}`)}
            </button>
          ))}
        </div>
      </div>

      {/* How long a discard stays claimable. Unlike bot pace this *is* a rule —
          it is a deadline in engine state that the whole table waits on — so it
          rides in `rules` and lands in GameConfig. Presets rather than a number:
          `houseRules` maps them server-side, so no integer off the wire can
          freeze a table or close the window before a human sees it. (N6) */}
      <div className="bg-black/20 rounded-xl px-3 py-2.5 text-sm">
        <div className="font-semibold">{t('host.claimWindow')}</div>
        <div className="text-xs text-green-300 leading-snug mb-2">{t('host.claimWindowHint')}</div>
        <div className="flex gap-1.5">
          {(['quick', 'normal', 'relaxed'] as const).map(len => (
            <button
              key={len}
              type="button"
              aria-pressed={claimWindow === len}
              onClick={() => setClaimWindow(len)}
              className={[
                'flex-1 min-h-10 rounded-lg font-semibold transition-colors',
                claimWindow === len ? 'bg-amber-400 text-black' : 'bg-black/30 text-white/70',
              ].join(' ')}
            >
              {t(`host.claimWindow.${len}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map(i => {
          const p = lobbyPlayers[i];
          const isMe = i === seat;
          return (
            <div key={i} className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2.5">
              <span className="text-green-400 text-sm w-14">{t(`wind.${i}`)}</span>
              {p?.name ? (
                <>
                  <span className="font-semibold flex-1">
                    {p.name}
                    {isMe && <span className="ml-1 text-xs text-amber-400">{t('common.you')}</span>}
                  </span>
                  {p.isBot && (
                    <button
                      type="button"
                      className="text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded"
                      onClick={() => sendAction({ t: 'kickBot', seat: i as Seat })}
                    >
                      {t('host.kick')}
                    </button>
                  )}
                  {!p.isBot && (
                    <span className={`text-xs ${p.connected ? 'text-green-400' : 'text-white/40'}`}>
                      {p.connected ? '●' : `○ ${t('lobby.disconnected')}`}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-white/40 italic text-sm flex-1">{t('host.empty')}</span>
                  <button
                    type="button"
                    className="text-xs bg-blue-700 hover:bg-blue-600 px-2 py-1 rounded"
                    onClick={() => sendAction({ t: 'addBot', difficulty: botLevel })}
                  >
                    {t('host.addBot')}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 rounded-xl font-bold text-lg mt-auto disabled:opacity-40"
        onClick={() =>
          sendAction({ t: 'startGame', rules: { huanSanZhang, botSpeed, claimWindow } })
        }
        disabled={!canStart}
      >
        {canStart ? t('host.start') : t('host.waitingPlayers')}
      </button>

      {/* Cancelling a hosted lobby used to require closing the tab, leaving the
          host's socket open until then. (F10) */}
      <button
        type="button"
        className="w-full py-2 min-h-11 text-white/60 hover:text-white"
        onClick={() => resetSession()}
      >
        {t('nav.leave')}
      </button>

      {reconnecting && (
        <p className="text-center text-amber-400 text-sm animate-pulse">
          {t('common.reconnecting')}
        </p>
      )}
    </div>
  );
}
