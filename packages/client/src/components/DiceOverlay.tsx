import type { DiePair, PlayerView, Seat } from '@sichuan-mahjong/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useAnimationPace } from '../hooks/useAnimation.js';
import { useT } from '../i18n/useT.js';
import { Die } from './Die.js';

/** How long the dice tumble, and how long the result sits, at `fast`. */
const ROLL_MS = 900;
const HOLD_MS = 900;

type Stage = 'seating' | 'wall';

/**
 * Identity for "the throws of one round". `PlayerView` carries no round index,
 * and the dice are the only thing that changes between one deal and the next —
 * so they identify themselves. Exported for the test.
 */
export function diceKey(view: Pick<PlayerView, 'dice' | 'dealer'>): string {
  const { wall, breakOffset, seating } = view.dice;
  return `${wall.a}-${wall.b}-${breakOffset}-${view.dealer}-${seating?.length ?? 0}`;
}

/** The round that decided it — the last one thrown. */
export function decidingRound(view: PlayerView): (DiePair | null)[] | null {
  const rounds = view.dice.seating;
  if (!rounds || rounds.length === 0) return null;
  return rounds[rounds.length - 1]?.rolls ?? null;
}

/**
 * The dice, thrown where the table can see them.
 *
 * Two stages, the first only on the round that ran the seating throw: everyone
 * throws and the highest becomes East, then East throws again for the break.
 * Both results already exist in `view.dice` when this mounts — the engine
 * decided them from the seed — so this is a reveal, not a decision. That is
 * also why there is no physics: see `Die.tsx`.
 *
 * Skipped entirely when the player has animations off (N4), which is the honest
 * reading of that setting — the outcome is on the board either way, and the
 * round-start pause is exactly what someone turning animations off is asking to
 * be rid of.
 */
export function DiceOverlay({
  view,
  nameOf,
}: {
  view: PlayerView;
  nameOf: (s: Seat) => string;
}) {
  const { skip, scale } = useAnimationPace();
  const t = useT();
  const [stage, setStage] = useState<Stage | null>(null);
  const shown = useRef<string | null>(null);

  const key = diceKey(view);
  const seatingRolls = decidingRound(view);
  const isDealStart = view.phase === 'huan' || view.phase === 'voidDeclare';
  const rollMs = ROLL_MS * scale;
  const stageMs = rollMs + HOLD_MS * scale;
  const seatingRounds = view.dice.seating?.length ?? 0;

  // Every dependency here is a primitive, and that is load-bearing rather than
  // tidy. The server pushes a fresh view many times a round, so `view.dice` is a
  // new object reference each time; depending on it re-ran this effect, whose
  // cleanup cancelled the stage timers — and the `shown.current` guard then
  // returned early without rescheduling them, parking the overlay on its first
  // stage for the rest of the round.
  useEffect(() => {
    if (skip || !isDealStart) return;
    if (shown.current === key) return;
    shown.current = key;

    const hasSeating = seatingRounds > 0;
    setStage(hasSeating ? 'seating' : 'wall');

    // Timers rather than animation callbacks: under reduced motion Framer skips
    // the animation outright, and a completion callback that never fires would
    // leave the overlay parked over the board. (F20's lesson, again)
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (hasSeating) {
      timers.push(setTimeout(() => setStage('wall'), stageMs));
      timers.push(setTimeout(() => setStage(null), stageMs * 2));
    } else {
      timers.push(setTimeout(() => setStage(null), stageMs));
    }
    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, [key, skip, isDealStart, stageMs, seatingRounds]);

  return (
    <AnimatePresence>
      {stage !== null && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-sm pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            {stage === 'seating' && seatingRolls && (
              <>
                <div className="text-sm text-white/70">{t('dice.seatingTitle')}</div>
                <div className="flex flex-col gap-2">
                  {seatingRolls.map((pair, seat) =>
                    pair === null ? null : (
                      <div
                        key={`${seat}-${pair.a}-${pair.b}`}
                        className="flex items-center gap-3 justify-end"
                      >
                        {/* Fixed width, not max-width: names differ in length,
                            and without a column the dice land in a ragged edge
                            that reads as four unrelated throws. */}
                        <span
                          className={`text-sm truncate w-20 text-right ${
                            seat === view.dealer ? 'text-amber-300 font-semibold' : 'text-white/60'
                          }`}
                        >
                          {nameOf(seat as Seat)}
                        </span>
                        <Die value={pair.a} size={34} durationMs={rollMs} delayMs={seat * 70} />
                        <Die value={pair.b} size={34} durationMs={rollMs} delayMs={seat * 70} />
                      </div>
                    ),
                  )}
                </div>
                <div className="text-lg font-semibold text-amber-300">
                  {t('dice.isEast', { name: nameOf(view.dealer) })}
                </div>
                {seatingRounds > 1 && (
                  <div className="text-xs text-white/50">{t('dice.afterTie')}</div>
                )}
              </>
            )}

            {stage === 'wall' && (
              <>
                <div className="text-sm text-white/70">
                  {t('dice.wallTitle', { name: nameOf(view.dealer) })}
                </div>
                <div className="flex items-center gap-3">
                  <Die value={view.dice.wall.a} durationMs={rollMs} />
                  <Die value={view.dice.wall.b} durationMs={rollMs} delayMs={80} />
                </div>
                <div className="text-base text-white/90">
                  {t('dice.wallResult', {
                    wind: t(`wind.${view.dice.wallSeat}`),
                    n: view.dice.indent,
                  })}
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
