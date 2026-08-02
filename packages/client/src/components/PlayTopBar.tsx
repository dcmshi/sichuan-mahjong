import type { PlayerView } from '@sichuan-mahjong/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useT } from '../i18n/useT.js';
import { HowToPlay } from './HowToPlay.js';
import { LangSwitch } from './LangSwitch.js';
import { SettingsMenu } from './SettingsMenu.js';

/** Sign-prefixed score delta, e.g. "+12" / "-3" / "0". */
export function formatDelta(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function ScoreRow({
  name,
  delta,
  highlight = false,
}: {
  name: string;
  delta: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className={`truncate ${highlight ? 'font-semibold text-amber-300' : 'text-white/80'}`}>
        {name}
      </span>
      <span className={delta >= 0 ? 'text-green-400' : 'text-red-400'}>{formatDelta(delta)}</span>
    </div>
  );
}

/**
 * Top bar: wall count, turn indicator, and the icon cluster (scores, language,
 * sound, help). The four-name score strip used to be its own row under this
 * bar; it's glanceable-but-rarely-glanced information, so it's folded into a
 * single "you" delta here that opens the full table on tap instead of costing
 * a permanent 20px row. (R2.1)
 */
export function PlayTopBar({ view }: { view: PlayerView }) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const t = useT();
  const seat = view.you.seat;

  return (
    <div className="relative flex items-center justify-between gap-2 px-3 bg-black/30 text-xs">
      <span className="flex-shrink-0">{t('play.wall', { n: view.wallRemaining })}</span>
      <span
        className={`font-semibold min-w-0 truncate ${view.turn === seat ? 'text-amber-400' : 'text-white/60'}`}
      >
        {view.turn === seat
          ? t('play.yourTurn')
          : t('play.othersTurn', {
              name: view.others.find(o => o.seat === view.turn)?.name ?? '...',
            })}
      </span>
      {/* These were bare text with no padding — a sub-20px tap target. (F15) */}
      <div className="flex gap-1 items-center flex-shrink-0">
        <button
          type="button"
          className="min-h-10 min-w-10 px-1.5 flex items-center justify-center font-semibold"
          onClick={() => setShowScores(v => !v)}
          aria-label={t('play.scores')}
          aria-expanded={showScores}
        >
          <span className={view.you.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}>
            {formatDelta(view.you.scoreDelta)}
          </span>
        </button>
        <LangSwitch />
        <SettingsMenu />
        <button
          type="button"
          className="min-h-10 min-w-10 flex items-center justify-center text-white/50 hover:text-white"
          onClick={() => setShowHowToPlay(true)}
          title={t('play.howToPlay')}
          aria-label={t('play.howToPlay')}
        >
          ?
        </button>
      </div>

      <AnimatePresence>
        {showScores && (
          <>
            {/* Invisible tap-outside-to-close catcher — not content, so it's
                exempt from the entrance-animation rules below. */}
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              aria-label={t('common.close')}
              onClick={() => setShowScores(false)}
            />
            {/* Transform-only entrance (no opacity): if the animation is ever
                skipped, the panel is still fully visible at rest, just not
                "grown" from its start scale — never invisible. (F12/F11 in spirit) */}
            <motion.div
              className="absolute right-2 top-full mt-1 z-30 w-48 rounded-xl bg-green-950/95 backdrop-blur border border-white/10 shadow-lg overflow-hidden text-sm"
              style={{ transformOrigin: 'top right' }}
              initial={{ scaleY: 0.85, y: -6 }}
              animate={{ scaleY: 1, y: 0 }}
              exit={{ scaleY: 0.85, y: -6 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <ScoreRow name={view.you.name} delta={view.you.scoreDelta} highlight />
              {view.others.map(o => (
                <ScoreRow key={o.seat} name={o.name} delta={o.scoreDelta} />
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showHowToPlay && <HowToPlay onClose={() => setShowHowToPlay(false)} />}
    </div>
  );
}
