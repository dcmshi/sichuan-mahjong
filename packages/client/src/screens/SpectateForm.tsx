import { useState } from 'react';
import { useStore } from '../store/index.js';
import { makeSpectateUrl, connectGame, setWsClient } from '../ws/client.js';
import { useT } from '../i18n/useT.js';

export function SpectateForm() {
  const t = useT();
  const storedCode = useStore(s => s.code);
  const setStoreCode = useStore(s => s.setCode);
  const goTo = useStore(s => s.goTo);
  const [code, setCode] = useState(storedCode);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function watch() {
    const trimCode = code.trim().toUpperCase();
    if (trimCode.length !== 4) { setError('join.errCode'); return; }
    setError('');
    setLoading(true);
    setStoreCode(trimCode);

    // connectGame routes 'spectate' views through the store; we only add the
    // no-game error handling here. ('spectate' flips the screen to the board.)
    const ws = connectGame(makeSpectateUrl(trimCode), (msg) => {
      if (msg.t === 'error' && msg.code === 'no_game') {
        setError('spec.errNoGame');
        setLoading(false);
        ws.close();
        setWsClient(null);
      }
    });
  }

  return (
    <div className="min-h-screen board-felt flex flex-col items-center justify-center gap-6 p-6 text-white">
      <div className="text-4xl">👀</div>
      <h2 className="text-2xl font-bold">{t('spec.title')}</h2>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <input
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-xl font-mono uppercase tracking-widest text-center focus:outline-none focus:border-amber-400"
          placeholder={t('join.code')}
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
          onKeyDown={e => e.key === 'Enter' && watch()}
          maxLength={4}
          autoFocus
        />
        {error && <p className="text-red-400 text-sm text-center">{t(error)}</p>}
        <button
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg disabled:opacity-50"
          onClick={watch}
          disabled={loading}
        >
          {loading ? t('spec.connecting') : t('spec.watch')}
        </button>
        <button className="py-2 text-white/60 hover:text-white" onClick={() => goTo('landing')}>
          {t('nav.back')}
        </button>
      </div>
    </div>
  );
}
