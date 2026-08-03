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
 * Which catalog key names the thrower, for each of the two stages.
 *
 * Your own case needs its own *sentence*, not your name substituted into someone
 * else's: `nameOf` returns the string "You", so the third-person templates came
 * out as "You is East" and "You rolls for the wall break". The seating stage was
 * fixed when it shipped and the wall stage was missed (N15) — so both live here
 * now, together, where the next stage added has an obvious place to join them and
 * a test that covers it.
 *
 * Exported and pure because the client suite runs without a DOM: the browser
 * cannot be relied on to *reach* the case, since who throws is decided by the
 * seating dice and the local player is East only a quarter of the time.
 */
export function throwerKey(stage: 'seating' | 'wall', dealer: Seat, youSeat: Seat): string {
  const yours = dealer === youSeat;
  if (stage === 'seating') return yours ? 'dice.youAreEast' : 'dice.isEast';
  return yours ? 'dice.wallTitleYou' : 'dice.wallTitle';
}

/**
 * A seat's wind, which is its distance from East *against* the seat index.
 *
 * This read `wind.${wallSeat}` — the absolute index — so it was only right when
 * the dealer happened to be seat 0, and East rotates every round. Winds run in
 * play order, and play runs counterclockwise by decreasing seat, so South is
 * `dealer - 1`: the seat to East's right, which is where a table seats them.
 * (N22)
 *
 * Pure and exported for the same reason `throwerKey` is: the local player is East
 * only a quarter of the time, and the dealer is seat 0 only a quarter of the
 * time, so the browser reaches the wrong-looking cases by luck.
 */
export function windOfSeat(seat: Seat, dealer: Seat): number {
  return (dealer - seat + 4) % 4;
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const key = diceKey(view);
  const seatingRolls = decidingRound(view);
  const isDealStart = view.phase === 'huan' || view.phase === 'voidDeclare';
  const rollMs = ROLL_MS * scale;
  const stageMs = rollMs + HOLD_MS * scale;
  const seatingRounds = view.dice.seating?.length ?? 0;

  // Cancel on unmount, and *only* on unmount. The stage timers outlive every
  // re-run of the arming effect below, which is the whole point — see N25.
  useEffect(
    () => () => {
      for (const id of timers.current) clearTimeout(id);
      timers.current = [];
    },
    [],
  );

  // Every dependency here is a primitive, and that is load-bearing rather than
  // tidy. The server pushes a fresh view many times a round, so `view.dice` is a
  // new object reference each time; depending on it re-ran this effect, whose
  // cleanup cancelled the stage timers — and the `shown.current` guard then
  // returned early without rescheduling them, parking the overlay on its first
  // stage for the rest of the round.
  //
  // **That fix was not enough, and the second version is why the timers moved to
  // a ref above.** `isDealStart` is a primitive, but it is one that *changes*
  // mid-animation: the phase leaves `voidDeclare` the moment all four seats have
  // declared, which at 3.6s of dice on the medium pace is sooner than the reveal
  // finishes for anyone who declares promptly. React then ran this effect's
  // cleanup, cancelling the two stage timers, and re-entered the body only to
  // return at the guard below — leaving `stage` non-null with nothing left to
  // clear it, and the overlay dimming the board for the rest of the round.
  //
  // So re-running this is harmless now: `shown.current === key` already stops it
  // arming twice, and nothing it does can cancel a reveal already in flight. (N25)
  useEffect(() => {
    if (skip || !isDealStart) return;
    if (shown.current === key) return;
    shown.current = key;

    // A new deal supersedes the previous reveal, and this is also what keeps the
    // handle list from growing by two a round across a long match.
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];

    const hasSeating = seatingRounds > 0;
    setStage(hasSeating ? 'seating' : 'wall');

    // Timers rather than animation callbacks: under reduced motion Framer skips
    // the animation outright, and a completion callback that never fires would
    // leave the overlay parked over the board. (F20's lesson, again)
    if (hasSeating) {
      timers.current.push(setTimeout(() => setStage('wall'), stageMs));
      timers.current.push(setTimeout(() => setStage(null), stageMs * 2));
    } else {
      timers.current.push(setTimeout(() => setStage(null), stageMs));
    }
  }, [key, skip, isDealStart, stageMs, seatingRounds]);

  return (
    <AnimatePresence>
      {stage !== null && (
        <motion.div
          // What the e2e guard reads. It is `pointer-events-none`, so an overlay
          // parked over the board blocks no click and every spec passed with it
          // sitting there — the assertion has to be that it is *gone*. (N25)
          data-dice-overlay="true"
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
                {/* See `throwerKey`: your own seat needs its own sentence, because
                    `nameOf` returns "You" and this template reads third-person. */}
                <div className="text-lg font-semibold text-amber-300">
                  {t(throwerKey('seating', view.dealer, view.you.seat), {
                    name: nameOf(view.dealer),
                  })}
                </div>
                {seatingRounds > 1 && (
                  <div className="text-xs text-white/50">{t('dice.afterTie')}</div>
                )}
              </>
            )}

            {stage === 'wall' && (
              <>
                <div className="text-sm text-white/70">
                  {t(throwerKey('wall', view.dealer, view.you.seat), {
                    name: nameOf(view.dealer),
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <Die value={view.dice.wall.a} durationMs={rollMs} />
                  <Die value={view.dice.wall.b} durationMs={rollMs} delayMs={80} />
                </div>
                <div className="text-base text-white/90">
                  {t('dice.wallResult', {
                    wind: t(`wind.${windOfSeat(view.dice.wallSeat, view.dealer)}`),
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
