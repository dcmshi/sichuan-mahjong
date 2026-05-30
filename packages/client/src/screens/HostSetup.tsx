import { useState } from 'react';
import { useStore } from '../store/index.js';
import { makeWsUrl, connectGame, sendAction } from '../ws/client.js';
import { useT } from '../i18n/useT.js';
import type { Seat } from '@sichuan-mahjong/engine';

export function HostSetup() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inLobby, setInLobby] = useState(false);
  const [botLevel, setBotLevel] = useState<'easy' | 'medium'>('easy');

  const t = useT();
  const code = useStore(s => s.code);
  const seat = useStore(s => s.seat);
  const lobbyPlayers = useStore(s => s.lobbyPlayers);
  const canStart = useStore(s => s.canStart);
  const reconnecting = useStore(s => s.reconnecting);
  const goTo = useStore(s => s.goTo);

  async function createAndJoin() {
    if (!name.trim()) { setError('join.errName'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/lobby', { method: 'POST' });
      if (!res.ok) throw new Error('server error');
      const { code: newCode, hostToken } = await res.json() as { code: string; hostToken: string };
      const store = useStore.getState();
      store.setCode(newCode);
      store.setPlayerName(name.trim());

      const ws = connectGame(makeWsUrl(newCode, hostToken), (msg) => {
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
      <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center gap-6 p-6 text-white">
        <div className="text-4xl">🀄</div>
        <h2 className="text-2xl font-bold">{t('host.title')}</h2>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <input
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-lg focus:outline-none focus:border-amber-400"
            placeholder={t('join.name')}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void createAndJoin()}
            maxLength={20}
            autoFocus
          />
          {error && <p className="text-red-400 text-sm">{t(error)}</p>}
          <button
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-50"
            onClick={() => void createAndJoin()}
            disabled={loading}
          >
            {loading ? t('host.creating') : t('host.create')}
          </button>
          <button
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

  return (
    <div className="min-h-screen bg-green-900 flex flex-col p-4 text-white gap-4">
      <div className="flex items-center gap-3 mt-2">
        <span className="text-2xl font-mono font-bold text-amber-400 tracking-widest">{code}</span>
        <span className="text-green-300 text-sm">← share code</span>
      </div>

      <div className="bg-black/30 rounded-xl p-3">
        <p className="text-green-300 text-xs mb-1">{t('host.shareUrl')}</p>
        <p className="font-mono text-sm break-all text-amber-300">{shareUrl}</p>
        <button
          className="mt-1 text-xs text-green-400 underline"
          onClick={() => void navigator.clipboard.writeText(shareUrl)}
        >
          {t('host.copy')}
        </button>
      </div>

      {/* Difficulty for newly added bots */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-300">{t('host.botLevel')}:</span>
        <div className="inline-flex rounded-lg overflow-hidden border border-white/20">
          {(['easy', 'medium'] as const).map(level => (
            <button
              key={level}
              onClick={() => setBotLevel(level)}
              className={[
                'px-3 py-1 font-semibold transition-colors',
                botLevel === level ? 'bg-amber-400 text-black' : 'bg-black/20 text-white/70 hover:text-white',
              ].join(' ')}
            >
              {t(level === 'easy' ? 'host.easy' : 'host.hard')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => {
          const p = lobbyPlayers[i];
          const isMe = i === seat;
          return (
            <div key={i} className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2.5">
              <span className="text-green-400 text-sm w-14">{t(`wind.${i}`)}</span>
              {p?.name ? (
                <>
                  <span className="font-semibold flex-1">{p.name}{isMe && <span className="ml-1 text-xs text-amber-400">{t('common.you')}</span>}</span>
                  {p.isBot && (
                    <button
                      className="text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded"
                      onClick={() => sendAction({ t: 'kickBot', seat: i as Seat })}
                    >
                      {t('host.kick')}
                    </button>
                  )}
                  {!p.isBot && p.connected && <span className="text-green-400 text-xs">●</span>}
                </>
              ) : (
                <>
                  <span className="text-white/40 italic text-sm flex-1">{t('host.empty')}</span>
                  <button
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
        className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 rounded-xl font-bold text-lg mt-auto disabled:opacity-40"
        onClick={() => sendAction({ t: 'startGame' })}
        disabled={!canStart}
      >
        {canStart ? t('host.start') : t('host.waitingPlayers')}
      </button>

      {reconnecting && (
        <p className="text-center text-amber-400 text-sm animate-pulse">{t('common.reconnecting')}</p>
      )}
    </div>
  );
}
