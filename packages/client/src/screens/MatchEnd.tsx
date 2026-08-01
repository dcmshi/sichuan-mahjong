import { motion } from 'framer-motion';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';

/**
 * Final standings for the match. Before this the store reset straight to the
 * landing screen on `matchEnd`, so nobody saw who won. (F9)
 */
export function MatchEnd() {
  const t = useT();
  const matchScores = useStore(s => s.matchScores);
  const roundResult = useStore(s => s.roundResult);
  const lobbyPlayers = useStore(s => s.lobbyPlayers);
  const seat = useStore(s => s.seat);
  const resetSession = useStore(s => s.resetSession);

  // The idle sweep can end a match mid-round, so there isn't always a round
  // result to take names from.
  const nameOf = (s: number) =>
    roundResult?.players.find(p => p.seat === s)?.name ??
    lobbyPlayers.find(p => p.seat === s)?.name ??
    t(`wind.${s}`);

  const standings = Object.keys(matchScores)
    .map(Number)
    .sort((a, b) => (matchScores[b] ?? 0) - (matchScores[a] ?? 0));

  return (
    <div className="min-h-dvh bg-green-900 flex flex-col items-center p-6 text-white gap-6">
      <motion.div
        className="text-5xl mt-4"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        🏁
      </motion.div>
      <h2 className="text-2xl font-bold">{t('match.title')}</h2>

      {standings.length > 0 ? (
        <div className="w-full max-w-sm flex flex-col gap-2">
          <p className="text-green-300 text-xs font-semibold uppercase tracking-wide">
            {t('end.matchTotal')}
          </p>
          {standings.map((s, rank) => {
            const total = matchScores[s] ?? 0;
            return (
              <div
                key={s}
                className={[
                  'flex items-center gap-3 rounded-xl px-4 py-3',
                  rank === 0 ? 'bg-amber-600/60 border border-amber-400' : 'bg-black/20',
                ].join(' ')}
              >
                <span className="text-white/40 text-sm w-6">#{rank + 1}</span>
                <span className="text-xs text-green-300 w-12">{t(`wind.${s}`)}</span>
                <span className="font-semibold flex-1">
                  {nameOf(s)}
                  {s === seat && nameOf(s) !== t('landing.practiceName') && (
                    <span className="ml-1 text-xs text-amber-400">{t('common.you')}</span>
                  )}
                </span>
                <span
                  className={`font-bold text-lg ${total >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {total > 0 ? '+' : ''}
                  {total}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-green-300 text-sm text-center">{t('match.noScores')}</p>
      )}

      <button
        type="button"
        className="w-full max-w-sm py-4 min-h-11 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg mt-auto"
        onClick={() => resetSession()}
      >
        {t('common.backToMenu')}
      </button>
    </div>
  );
}
