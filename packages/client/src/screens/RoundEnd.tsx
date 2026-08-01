import { motion } from 'framer-motion';
import { RoundEndRow } from '../components/RoundEndRow.js';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';
import { sendAction } from '../ws/client.js';

export function RoundEnd() {
  const t = useT();
  const result = useStore(s => s.roundResult);
  const seat = useStore(s => s.seat);
  const matchScores = useStore(s => s.matchScores);
  const isHost = useStore(s => s.isHost);
  const resetSession = useStore(s => s.resetSession);

  if (!result) return null;

  const sorted = [...result.players].sort((a, b) => b.scoreDelta - a.scoreDelta);

  return (
    <div className="min-h-dvh bg-green-900 flex flex-col items-center p-6 text-white gap-6">
      {/* Entrances animate scale/position only, never opacity: the rows used to
          mount at opacity 0 and rely on Framer to reveal them, so anywhere the
          animation didn't run the scoreboard simply never appeared. (F11) */}
      <motion.div
        className="text-5xl mt-4"
        initial={{ scale: 0.6 }}
        animate={{ scale: 1, rotate: [0, -10, 10, -10, 0] }}
        transition={{ duration: 0.6 }}
      >
        🏆
      </motion.div>
      <h2 className="text-2xl font-bold">{t('end.title')}</h2>

      {/* This round */}
      <div className="w-full max-w-sm flex flex-col gap-2">
        <p className="text-green-300 text-xs font-semibold uppercase tracking-wide">
          {t('end.thisRound')}
        </p>
        {sorted.map((p, rank) => (
          <RoundEndRow
            key={p.seat}
            player={p}
            rank={rank}
            youSeat={seat}
            defaultOpen={p.hu !== null}
          />
        ))}
      </div>

      {/* Match totals (if multiple rounds played) */}
      {Object.keys(matchScores).length > 0 && (
        <div className="w-full max-w-sm flex flex-col gap-2">
          <p className="text-green-300 text-xs font-semibold uppercase tracking-wide">
            {t('end.matchTotal')}
          </p>
          {result.players
            .slice()
            .sort((a, b) => (matchScores[b.seat] ?? 0) - (matchScores[a.seat] ?? 0))
            .map(p => {
              const total = matchScores[p.seat] ?? 0;
              return (
                <div
                  key={p.seat}
                  className="flex items-center gap-3 bg-black/15 rounded-xl px-4 py-2"
                >
                  <span className="text-xs text-green-300 w-12">{t(`wind.${p.seat}`)}</span>
                  <span className="flex-1 text-sm">{p.name}</span>
                  <span className={`font-bold ${total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {total > 0 ? '+' : ''}
                    {total}
                  </span>
                </div>
              );
            })}
        </div>
      )}

      <div className="flex flex-col gap-3 w-full max-w-sm mt-auto">
        {isHost ? (
          <>
            <button
              type="button"
              className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-lg"
              onClick={() => sendAction({ t: 'nextRound' })}
            >
              {t('end.nextRound')}
            </button>
            <button
              type="button"
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
              type="button"
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold"
              onClick={() => resetSession()}
            >
              {t('nav.leave')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
