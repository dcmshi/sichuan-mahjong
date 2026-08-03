import { motion } from 'framer-motion';
import { ReconnectingBanner } from '../components/ReconnectingBanner.js';
import { RoundEndRow } from '../components/RoundEndRow.js';
import { useT } from '../i18n/useT.js';
import { useStore } from '../store/index.js';
import { seatKey } from '../wind.js';
import { sendAction } from '../ws/client.js';

export function RoundEnd() {
  const t = useT();
  const result = useStore(s => s.roundResult);
  const seat = useStore(s => s.seat);
  const matchScores = useStore(s => s.matchScores);
  const countedRounds = useStore(s => s.countedRounds);
  const isHost = useStore(s => s.isHost);
  const resetSession = useStore(s => s.resetSession);
  const fanCap = useStore(s => s.view?.config.fanCap ?? null);

  if (!result) return null;

  const sorted = [...result.players].sort((a, b) => b.scoreDelta - a.scoreDelta);

  return (
    <div className="min-h-dvh bg-green-900 flex flex-col items-center p-6 text-white gap-6 [@media(max-height:480px)]:gap-3">
      {/* Non-hosts sit here waiting on the host to start the next round, which
          looks identical to a dropped socket without this. */}
      <ReconnectingBanner />
      {/* Entrances animate scale/position only, never opacity: the rows used to
          mount at opacity 0 and rely on Framer to reveal them, so anywhere the
          animation didn't run the scoreboard simply never appeared. (F11) */}
      <motion.div
        className="text-5xl mt-4 [@media(max-height:480px)]:text-3xl"
        initial={{ scale: 0.6 }}
        animate={{ scale: 1, rotate: [0, -10, 10, -10, 0] }}
        transition={{ duration: 0.6 }}
        aria-hidden="true"
      >
        🏆
      </motion.div>
      <h2 className="text-2xl font-bold">{t('end.title')}</h2>
      {/* Which limit these payments were settled at. Both values are canonical
          and at the cap every payment is exactly half of the other one's, so a
          screen full of numbers that never names the basis is where the dispute
          starts. (N27) */}
      {fanCap !== null && (
        <p className="-mt-4 text-xs text-white/50">
          {t('end.fanCap', { cap: fanCap, max: 2 ** fanCap })}
        </p>
      )}

      {/* This round. Two columns from `sm` up so a tablet/landscape viewport
          spends its extra width on this instead of extra height. */}
      <div className="w-full max-w-sm sm:max-w-2xl flex flex-col gap-2">
        <p className="text-green-300 text-xs font-semibold uppercase tracking-wide">
          {t('end.thisRound')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sorted.map((p, rank) => (
            <RoundEndRow
              key={p.seat}
              player={p}
              rank={rank}
              youSeat={seat}
              dealer={result.dealer}
              defaultOpen={p.hu !== null}
            />
          ))}
        </div>
      </div>

      {/* Match totals, only once there is more than one round to total. Keyed
          off countedRounds rather than matchScores, which is already populated
          by round 1 and so showed the same numbers twice, in two sections
          sorted differently. */}
      {countedRounds.length > 1 && (
        <div className="w-full max-w-sm sm:max-w-2xl flex flex-col gap-2">
          <p className="text-green-300 text-xs font-semibold uppercase tracking-wide">
            {t('end.matchTotal')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    {/* A chair, not a wind: this total spans rounds, and East
                        moved between them. (N26) */}
                    <span className="text-xs text-green-300 w-12">{t(seatKey(p.seat))}</span>
                    <span className="flex-1 text-sm">{p.name}</span>
                    <span className={`font-bold ${total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {total > 0 ? '+' : ''}
                      {total}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Sticky so the two primary controls are reachable from any scroll
          position — on an iPhone SE they used to sit 416px below the fold.
          Full-bleed background (negative margin cancels the root's own
          padding) with a felt gradient so the scrolled content underneath
          fades out instead of clipping hard. */}
      <div className="sticky bottom-0 w-full -mx-6 px-6 pt-6 pb-6 mt-auto bg-gradient-to-t from-green-900 via-green-900/90 to-transparent flex flex-col items-center">
        <div className="flex flex-col gap-3 w-full max-w-sm">
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
    </div>
  );
}
