import { useT } from '../i18n/useT.js';

/**
 * Landscape phone has no play layout of its own yet (viewport-audit.md, R4
 * Phase 1) — the board needs roughly 2x the viewport height in landscape, so
 * reaching it by scrolling moves the player's own hand off screen exactly
 * when they need to tap it. Until a real landscape layout exists (R4 Phase
 * 2, deliberately out of scope here), block play with a "rotate to
 * portrait" prompt instead of leaving that scroll-away-hand trap in place.
 *
 * Visibility is entirely CSS-driven (index.css, `.rotate-overlay`) — a media
 * query rather than a resize listener, so there is no hydration flash and
 * nothing to clean up on rotation back. The breakpoint deliberately excludes
 * tablets: an iPad in landscape measures 1080x810, well outside
 * `max-height: 480px`.
 *
 * Mounted only inside the play phase (Game.tsx) — huan and void-declare
 * measured 364px and 340px against a 340px landscape viewport, close enough
 * to fitting that they don't need this, and round end is a separate screen
 * this component is never mounted under.
 */
export function RotateOverlay() {
  const t = useT();

  return (
    <div className="rotate-overlay fixed inset-0 z-50 board-felt text-white text-center p-6 gap-4">
      <div className="rotate-overlay-icon w-12 h-20 text-amber-400">
        <svg
          viewBox="0 0 32 56"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-full h-full"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="26" height="50" rx="6" />
          <line x1="12" y1="47" x2="20" y2="47" />
        </svg>
      </div>
      <p className="text-lg font-semibold">{t('play.rotateTitle')}</p>
      <p className="text-sm text-white/70 max-w-xs">{t('play.rotateHint')}</p>
    </div>
  );
}
