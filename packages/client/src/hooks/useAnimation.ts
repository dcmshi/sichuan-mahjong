import { scaleFor } from '../prefs.js';
import { useStore } from '../store/index.js';

/**
 * The player's rendering pace, as two primitives.
 *
 * Primitives on purpose: both are read inside effects that key on something
 * else (an event batch, a discard list), and a returned object would be a fresh
 * reference every render — so putting it in a dependency array would re-fire
 * those effects on every incoming view and restart animations mid-flight.
 *
 * `skip` is not "scale 0". A duration of 0 still mounts the overlay, still
 * schedules the clear timer, and still paints a frame; skipping means the
 * animation is never started at all, which is what the caller should branch on.
 */
export function useAnimationPace(): { skip: boolean; scale: number } {
  const prefs = useStore(s => s.animation);
  return { skip: prefs.skip, scale: scaleFor(prefs) };
}
