import { useState } from 'react';
import { useT } from '../i18n/useT.js';
import type { BotLevel, PracticePrefs } from '../prefs.js';
import { BOT_LEVELS, botLevelKey, loadPracticePrefs, persistPracticePrefs } from '../prefs.js';
import { useStore } from '../store/index.js';
import { connectGame, makeWsUrl, sendAction } from '../ws/client.js';

/** Backstop for a practice socket that opens and then says nothing. */
const PRACTICE_TIMEOUT_MS = 8000;

/** One row of the setup: a label and a segmented choice. */
function Choice<T extends string>({
  label,
  hint,
  options,
  value,
  labelFor,
  onPick,
}: {
  label: string;
  hint?: string;
  options: readonly T[];
  value: T;
  labelFor: (v: T) => string;
  onPick: (v: T) => void;
}) {
  return (
    <div>
      <div className="font-semibold">{label}</div>
      {hint && <div className="text-xs text-green-300 leading-snug mb-1.5">{hint}</div>}
      <div className="flex gap-1.5">
        {options.map(option => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onPick(option)}
            className={[
              'flex-1 min-h-10 rounded-lg font-semibold transition-colors',
              value === option ? 'bg-amber-400 text-black' : 'bg-black/30 text-white/70',
            ].join(' ')}
          >
            {labelFor(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The setup step in front of practice, matching the flow hosting a human game
 * already has: a screen you land on, choose from, and start from.
 *
 * It replaced a disclosure on the landing screen (N17), which was the wrong call.
 * That control was a centred 12px underlined link in the same visual class as
 * "About & Credits" — the first person to go looking for it did not find it and
 * reported the feature as missing. One tap to start is worth protecting, but not
 * at the cost of the settings being invisible.
 *
 * Every bot gets its own level, because a ladder of three easy opponents is the
 * one shape that teaches nothing. The choices are remembered in `prefs.ts`, so
 * the second session is still effectively two taps.
 */
export function PracticeSetup() {
  const t = useT();
  const goTo = useStore(s => s.goTo);
  const setCode = useStore(s => s.setCode);
  const setPlayerName = useStore(s => s.setPlayerName);

  const [prefs, setPrefs] = useState(loadPracticePrefs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function update(patch: Partial<PracticePrefs>) {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      persistPracticePrefs(next);
      return next;
    });
  }

  function setLevel(index: 0 | 1 | 2, level: BotLevel) {
    const botLevels = [...prefs.botLevels] as PracticePrefs['botLevels'];
    botLevels[index] = level;
    update({ botLevels });
  }

  async function start() {
    setLoading(true);
    setError('');
    useStore.getState().setIsPractice(true);
    const name = t('landing.practiceName');
    try {
      const res = await fetch('/api/lobby', { method: 'POST' });
      if (!res.ok) throw new Error('server error');
      const { code, hostToken } = (await res.json()) as { code: string; hostToken: string };
      setCode(code);
      setPlayerName(name);

      connectGame(makeWsUrl(code, hostToken), msg => {
        if (msg.t === 'joined') {
          // Seats named explicitly so this doesn't depend on `findOpenSeat`
          // order — which is the bug N18 found in the lobby's own buttons, and
          // the reason each bot can carry its own level at all. (N17/N18)
          for (const seat of [1, 2, 3] as const) {
            sendAction({ t: 'addBot', difficulty: prefs.botLevels[seat - 1]!, seat });
          }
        }
        if (msg.t === 'lobby' && msg.canStart) {
          sendAction({ t: 'startGame', rules: { botSpeed: prefs.botSpeed } });
        }
        // Only now is the lobby real. Releasing the button when the POST
        // resolved re-armed it while the socket was still opening, and a second
        // tap created a second lobby and a second game.
        if (msg.t === 'joined' || msg.t === 'error') setLoading(false);
      }).send({ t: 'join', name });

      // The socket can also fail by going quiet, which no error handler sees.
      setTimeout(() => {
        if (useStore.getState().screen !== 'practiceSetup') return;
        setLoading(false);
        setError('landing.practiceError');
      }, PRACTICE_TIMEOUT_MS);
    } catch {
      setError('landing.practiceError');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-green-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="min-h-10 min-w-10 text-white/60 hover:text-white text-xl"
            onClick={() => goTo('landing')}
            aria-label={t('common.back')}
          >
            ←
          </button>
          <h1 className="text-2xl font-bold flex-1">{t('practice.title')}</h1>
        </div>

        <p className="text-green-300 text-sm leading-snug">{t('practice.hint')}</p>

        <Choice
          label={t('host.botSpeed')}
          hint={t('host.botSpeedHint')}
          options={['slow', 'normal', 'fast'] as const}
          value={prefs.botSpeed}
          labelFor={s => t(`host.botSpeed.${s}`)}
          onPick={botSpeed => update({ botSpeed })}
        />

        <div className="flex flex-col gap-3">
          <div>
            <div className="font-semibold">{t('practice.opponents')}</div>
            <div className="text-xs text-green-300 leading-snug">{t('practice.opponentsHint')}</div>
          </div>
          {([0, 1, 2] as const).map(i => (
            <Choice
              key={i}
              label={t('practice.botN', { n: i + 2 })}
              options={BOT_LEVELS}
              value={prefs.botLevels[i]!}
              labelFor={l => t(botLevelKey(l))}
              onPick={level => setLevel(i, level)}
            />
          ))}
        </div>

        <button
          type="button"
          className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 rounded-2xl font-bold text-xl shadow-lg disabled:opacity-50"
          onClick={() => void start()}
          disabled={loading}
        >
          {loading ? t('landing.starting') : t('practice.start')}
        </button>

        {error && <p className="text-red-400 text-sm text-center">{t(error)}</p>}
        <p className="text-white/40 text-xs text-center leading-snug">
          {t('landing.practiceSetupHint')}
        </p>
      </div>
    </div>
  );
}
