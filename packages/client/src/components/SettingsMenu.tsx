import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { useEscapeToClose } from '../hooks/useDismissable.js';
import { useT } from '../i18n/useT.js';
import type { AnimationSpeed } from '../prefs.js';
import { useStore } from '../store/index.js';

const SPEEDS: AnimationSpeed[] = ['slow', 'medium', 'fast'];

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
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const soundEnabled = useStore(s => s.soundEnabled);
  const toggleSound = useStore(s => s.toggleSound);
  const animation = useStore(s => s.animation);
  const setAnimationSpeed = useStore(s => s.setAnimationSpeed);
  const toggleSkipAnimations = useStore(s => s.toggleSkipAnimations);
  const t = useT();

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
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 px-3 min-h-11 hover:bg-white/5"
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
