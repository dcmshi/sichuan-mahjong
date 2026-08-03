import type { BotPace, PlayerView } from '@sichuan-mahjong/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { useEscapeToClose } from '../hooks/useDismissable.js';
import { useT } from '../i18n/useT.js';
import type { AnimationSpeed } from '../prefs.js';
import { useStore } from '../store/index.js';
import { sendAction } from '../ws/client.js';
import { LangSwitch } from './LangSwitch.js';

const SPEEDS: AnimationSpeed[] = ['slow', 'medium', 'fast'];

type BotSpeed = 'slow' | 'normal' | 'fast';
const BOT_SPEEDS: BotSpeed[] = ['slow', 'normal', 'fast'];

export type BotPaceControl =
  | { show: false }
  | {
      show: true;
      selected: BotSpeed;
      disabled: boolean;
      hint: 'settings.botSpeedTable' | 'settings.botSpeedPinned';
    };

/**
 * Every decision the bot-pace section makes, as a value rather than as four
 * conditions spread through the JSX. (N24)
 *
 * It is a separate function because **no automated test reaches this control
 * rendered honestly.** Client tests have no DOM, and the Playwright suite runs
 * the server with `--bot-delay 150` — so every e2e run sees the pinned variant.
 * The unpinned case, which is every real deployment, is only reachable here.
 * That gap is how the hardcoded 'normal' shipped in the first place.
 */
export function botPaceControl(
  botPace: BotPace | null,
  isHost: boolean,
  tableHasBots: boolean,
): BotPaceControl {
  // Null until the first view push. Hidden rather than guessed: a guess is what
  // this control used to be.
  if (!isHost || !tableHasBots || botPace === null) return { show: false };
  return {
    show: true,
    selected: botPace.speed,
    // Pinned still shows the host's choice, greyed — the alternative is a
    // control that accepts taps the server discards.
    disabled: botPace.pinned,
    hint: botPace.pinned ? 'settings.botSpeedPinned' : 'settings.botSpeedTable',
  };
}

/**
 * Per-player display settings: sound, and the animation pace added by N4.
 *
 * **This replaced the standalone 🔊 button rather than joining it.** The icon
 * cluster shares the top bar with the turn indicator, which is the one piece of
 * text on that row a player actually needs, and on a 320px phone the cluster is
 * already wide enough that the indicator survives only by truncating. A fifth
 * 40px button would have taken the rest of it. Sound moves in here instead, so
 * the bar keeps four controls and gains a home for the next preference.
 *
 * Muting costs a second tap now. That is the right trade: it is a once-a-session
 * action, and it arrives with a label instead of an emoji you have to interpret.
 */
export function SettingsMenu({ view }: { view?: PlayerView }) {
  const [open, setOpen] = useState(false);
  const soundEnabled = useStore(s => s.soundEnabled);
  const toggleSound = useStore(s => s.toggleSound);
  const animation = useStore(s => s.animation);
  const setAnimationSpeed = useStore(s => s.setAnimationSpeed);
  const toggleSkipAnimations = useStore(s => s.toggleSkipAnimations);
  const isHost = useStore(s => s.isHost);
  const t = useT();

  // Bot pace, mid-match (N5). Host-only, because bots move on the server and
  // everyone watches the same move land — unlike everything else in this menu,
  // which is local rendering. Hidden rather than disabled when there is nothing to
  // pace: unlike the lobby's version (N9) a seat can't gain a bot mid-round, so the
  // control would never become useful and there is no state change to explain.
  //
  // **The value is the server's, read off every view push.** This was local state
  // seeded with the literal 'normal' — so a host who chose slow in the lobby saw
  // normal highlighted here, and it reset to normal on every remount, meaning it
  // also lied after a reconnect. There was nothing to read at the time; `botPace`
  // exists now. (N24)
  const botPace = useStore(s => s.botPace);
  const pace = botPaceControl(botPace, isHost, view ? view.others.some(o => o.isBot) : false);

  function pickBotSpeed(speed: BotSpeed) {
    sendAction({ t: 'setBotSpeed', botSpeed: speed });
  }

  const close = useCallback(() => setOpen(false), []);
  useEscapeToClose(open, close);

  return (
    <>
      <button
        type="button"
        className="min-h-10 min-w-10 flex items-center justify-center text-white/50 hover:text-white"
        onClick={() => setOpen(v => !v)}
        title={t('play.settings')}
        aria-label={t('play.settings')}
        aria-expanded={open}
      >
        ⚙
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Tap-outside-to-close catcher — not content, so it carries no
                entrance animation. Same pattern as the scores dropdown. */}
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              aria-label={t('common.close')}
              onClick={close}
            />
            {/* Transform-only entrance, no opacity: if the animation is skipped
                the panel is still fully visible at rest rather than invisible.
                (F12/F11) */}
            <motion.div
              className="absolute right-2 top-full mt-1 z-30 w-60 rounded-xl bg-green-950/95 backdrop-blur border border-white/10 shadow-lg overflow-hidden text-sm"
              style={{ transformOrigin: 'top right' }}
              initial={{ scaleY: 0.85, y: -6 }}
              animate={{ scaleY: 1, y: 0 }}
              exit={{ scaleY: 0.85, y: -6 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              {/* Language moved in here from the top bar, where its three 40px
                  buttons were 122px of a 320px row and the turn indicator was
                  absorbing the whole shortfall. Most players touch it once, and it
                  is a display preference like everything else in this menu — so
                  this is where it belongs, not a tax on every turn. (N7) */}
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-white/80">{t('settings.language')}</span>
                <LangSwitch />
              </div>

              <button
                type="button"
                className="w-full border-t border-white/10 flex items-center justify-between gap-3 px-3 min-h-11 hover:bg-white/5"
                onClick={toggleSound}
                aria-pressed={soundEnabled}
              >
                <span className="text-white/80">{t('settings.sound')}</span>
                <span aria-hidden="true">{soundEnabled ? '🔊' : '🔇'}</span>
              </button>

              <div className="border-t border-white/10 px-3 py-2">
                <div className="text-white/80 mb-1.5">{t('settings.animSpeed')}</div>
                <div className="flex gap-1">
                  {SPEEDS.map(speed => (
                    <button
                      key={speed}
                      type="button"
                      aria-pressed={animation.speed === speed}
                      disabled={animation.skip}
                      onClick={() => setAnimationSpeed(speed)}
                      className={[
                        'flex-1 min-h-10 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40',
                        animation.speed === speed
                          ? 'bg-amber-400 text-black'
                          : 'bg-black/30 text-white/70',
                      ].join(' ')}
                    >
                      {t(`settings.animSpeed.${speed}`)}
                    </button>
                  ))}
                </div>
              </div>

              {pace.show && (
                <div className="border-t border-white/10 px-3 py-2">
                  <div className="text-white/80 mb-1.5">{t('host.botSpeed')}</div>
                  <div className="flex gap-1">
                    {BOT_SPEEDS.map(speed => (
                      <button
                        key={speed}
                        type="button"
                        aria-pressed={pace.selected === speed}
                        disabled={pace.disabled}
                        onClick={() => pickBotSpeed(speed)}
                        className={[
                          'flex-1 min-h-10 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40',
                          pace.selected === speed
                            ? 'bg-amber-400 text-black'
                            : 'bg-black/30 text-white/70',
                        ].join(' ')}
                      >
                        {t(`host.botSpeed.${speed}`)}
                      </button>
                    ))}
                  </div>
                  {/* Pinned says the buttons show a choice that is not in force —
                      `--bot-delay` overrides every room in the process, and a
                      control that silently does nothing is worse than one that
                      explains itself. Otherwise: says it is the table's, not
                      yours, since every other control here is local and this one
                      moves the game for everybody. */}
                  <p className="text-xs text-white/40 leading-snug mt-1">{t(pace.hint)}</p>
                </div>
              )}

              <button
                type="button"
                className="w-full border-t border-white/10 px-3 py-2 min-h-11 text-left hover:bg-white/5"
                onClick={toggleSkipAnimations}
                aria-pressed={animation.skip}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-white/80">{t('settings.skipAnimations')}</span>
                  <span aria-hidden="true">{animation.skip ? '☑' : '☐'}</span>
                </span>
                {/* Says what this is *not*, because the two are easy to conflate
                    and only one of them is an accessibility setting. */}
                <span className="block text-xs text-white/40 leading-snug mt-0.5">
                  {t('settings.skipAnimationsHint')}
                </span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
