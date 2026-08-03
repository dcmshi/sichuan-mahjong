import { motion } from 'framer-motion';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';
import { seatKey } from '../wind.js';

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
  // Practice games hide the badge: labelling the only human "(you)" among three
  // bots is noise. Keyed on the flag rather than on the name matching the
  // localized practice name, which stole the badge from a real player called
  // "You" or 你.
  const isPractice = useStore(s => s.isPractice);
  const resetSession = useStore(s => s.resetSession);

  // The idle sweep can end a match mid-round, so there isn't always a round
  // result to take names from.
  const nameOf = (s: number) =>
    roundResult?.players.find(p => p.seat === s)?.name ??
    lobbyPlayers.find(p => p.seat === s)?.name ??
    t(seatKey(s));

  const standings = Object.keys(matchScores)
    .map(Number)
    .sort((a, b) => (matchScores[b] ?? 0) - (matchScores[a] ?? 0));

  return (
    <div className="min-h-dvh bg-green-900 flex flex-col items-center p-6 text-white gap-6">
      {/* Scale only, never opacity: an entrance that fades in from 0 leaves the
          element invisible anywhere the animation doesn't run. (F11) */}
      <motion.div
        className="text-5xl mt-4"
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        aria-hidden="true"
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
                {/* A chair, not a wind: these are match totals, and East rotated
                    every round that fed them. (N26) */}
                <span className="text-xs text-green-300 w-12">{t(seatKey(s))}</span>
                <span className="font-semibold flex-1">
                  {nameOf(s)}
                  {s === seat && !isPractice && (
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

      {/* Sticky for the same reason as RoundEnd: a long standings list should
          never be able to push the only exit off the bottom of the screen. */}
      <div className="sticky bottom-0 w-full -mx-6 px-6 pt-6 pb-6 mt-auto bg-gradient-to-t from-green-900 via-green-900/90 to-transparent flex flex-col items-center">
        <button
          type="button"
          className="w-full max-w-sm py-4 min-h-11 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-lg"
          onClick={() => resetSession()}
        >
          {t('common.backToMenu')}
        </button>
      </div>
    </div>
  );
}
