/**
 * Per-player display preferences, held in localStorage.
 *
 * These are deliberately *not* on `startGame.rules` beside `botSpeed`. Bot pace
 * is the server's — bots move on the server and everyone watches the same move
 * land at the same moment, so it has to be one value for the table. Animation
 * pace is local rendering only: every client gets the same `claimed` event and
 * draws its own copy over a board that has already updated underneath, so one
 * player watching a slow flight while another watches a fast one desyncs
 * nothing and blocks nobody. That makes it a preference rather than a rule —
 * no protocol field, no `ws.ts` narrowing, no room state.
 */

export type AnimationSpeed = 'slow' | 'medium' | 'fast';

export type AnimationPrefs = {
  speed: AnimationSpeed;
  /**
   * Skip animations entirely. Distinct from `prefers-reduced-motion`, which is
   * already honoured globally through `MotionConfig reducedMotion="user"`: that
   * is an OS-level accessibility signal and this is a taste, so they stay
   * separate controls. Conflating them would let a preference masquerade as an
   * access need — and, worse, let turning this *off* look like it should
   * override someone's system setting.
   */
  skip: boolean;
};

/**
 * Medium, not fast. The durations the app shipped with are `fast` (scale 1),
 * and they read quick enough that a claim could land before you noticed the
 * tile move — which is the thing the animations exist to fix.
 */
export const DEFAULT_ANIMATION_PREFS: AnimationPrefs = { speed: 'medium', skip: false };

/**
 * Multipliers against the shipped durations. Slow is 2×, not more: these are
 * transitions between two states of a board, and past about double the tile is
 * no longer moving so much as loitering in front of the next decision.
 */
const SPEED_SCALE: Record<AnimationSpeed, number> = { fast: 1, medium: 1.5, slow: 2 };

export function scaleFor(prefs: AnimationPrefs): number {
  return prefs.skip ? 0 : SPEED_SCALE[prefs.speed];
}

/** A base duration in ms, scaled by the player's preference. 0 when skipping. */
export function animMs(base: number, prefs: AnimationPrefs): number {
  return Math.round(base * scaleFor(prefs));
}

export function isAnimationSpeed(v: unknown): v is AnimationSpeed {
  return v === 'slow' || v === 'medium' || v === 'fast';
}

const STORAGE_KEY = 'sm-anim';

/**
 * Read back what was stored, field by field. A partially-corrupt value falls
 * back per field rather than wholesale, so an older build's entry that predates
 * one of these keys still restores the half it does carry.
 */
export function loadAnimationPrefs(): AnimationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_ANIMATION_PREFS;
    return parseAnimationPrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_ANIMATION_PREFS;
  }
}

/** Exported for the test: `loadAnimationPrefs` needs a DOM, this doesn't. */
export function parseAnimationPrefs(value: unknown): AnimationPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_ANIMATION_PREFS;
  const v = value as Record<string, unknown>;
  return {
    speed: isAnimationSpeed(v.speed) ? v.speed : DEFAULT_ANIMATION_PREFS.speed,
    skip: v.skip === true,
  };
}

export function persistAnimationPrefs(prefs: AnimationPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore — private mode, or storage full. The preference just won't stick. */
  }
}
