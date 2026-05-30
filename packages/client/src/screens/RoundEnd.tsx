import { motion } from 'framer-motion';
import { useStore } from '../store/index.js';
import { sendAction } from '../ws/client.js';
import { useT } from '../i18n/useT.js';

export function RoundEnd() {
  const store = useStore();
  const t = useT();
  const result = store.roundResult;

  if (!result) return null;

  const sorted = [...result.players].sort((a, b) => b.scoreDelta - a.scoreDelta);

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center p-6 text-white gap-6">
      <motion.div
        className="text-5xl mt-4"
        initial={{ scale: 0 }}
        animate={{ scale: 1, rotate: [0, -10, 10, -10, 0] }}
        transition={{ duration: 0.6 }}
      >
        🏆
      </motion.div>
      <h2 className="text-2xl font-bold">{t('end.title')}</h2>

      {/* This round */}
      <div className="w-full max-w-sm flex flex-col gap-2">
        <p className="text-green-300 text-xs font-semibold uppercase tracking-wide">{t('end.thisRound')}</p>
        {sorted.map((p, rank) => (
          <motion.div
            key={p.seat}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: rank * 0.1 }}
            className={[
              'flex items-center gap-3 rounded-xl px-4 py-3',
              rank === 0 ? 'bg-amber-600/60 border border-amber-400' : 'bg-black/20',
            ].join(' ')}
          >
            <span className="text-white/40 text-sm w-6">#{rank + 1}</span>
            <span className="text-xs text-green-300 w-12">{t(`wind.${p.seat}`)}</span>
            <span className="font-semibold flex-1">
              {p.name}
              {p.seat === store.seat && <span className="ml-1 text-xs text-amber-400">{t('common.you')}</span>}
            </span>
            {p.hu && (
              <span className="text-xs bg-red-700 px-1.5 py-0.5 rounded">{t('end.hu')}</span>
            )}
            <span className={`font-bold text-lg ${p.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {p.scoreDelta > 0 ? '+' : ''}{p.scoreDelta}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Match totals (if multiple rounds played) */}
      {Object.keys(store.matchScores).length > 0 && (
        <div className="w-full max-w-sm flex flex-col gap-2">
          <p className="text-green-300 text-xs font-semibold uppercase tracking-wide">{t('end.matchTotal')}</p>
          {result.players
            .slice()
            .sort((a, b) => (store.matchScores[b.seat] ?? 0) - (store.matchScores[a.seat] ?? 0))
            .map(p => {
              const total = store.matchScores[p.seat] ?? 0;
              return (
                <div key={p.seat} className="flex items-center gap-3 bg-black/15 rounded-xl px-4 py-2">
                  <span className="text-xs text-green-300 w-12">{t(`wind.${p.seat}`)}</span>
                  <span className="flex-1 text-sm">{p.name}</span>
                  <span className={`font-bold ${total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {total > 0 ? '+' : ''}{total}
                  </span>
                </div>
              );
            })}
        </div>
      )}

      <div className="flex flex-col gap-3 w-full max-w-sm mt-auto">
        {store.isHost ? (
          <>
            <button
              className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-lg"
              onClick={() => sendAction({ t: 'nextRound' })}
            >
              {t('end.nextRound')}
            </button>
            <button
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold"
              onClick={() => sendAction({ t: 'endMatch' })}
            >
              {t('end.endMatch')}
            </button>
          </>
        ) : (
          <>
            <p className="text-center text-green-300 text-sm">{t('end.waitingHost')}</p>
            <button
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold"
              onClick={() => store.resetSession()}
            >
              {t('nav.leave')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
