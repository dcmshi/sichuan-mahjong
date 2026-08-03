import { useCallback, useRef } from 'react';
import { LONG_PRESS_MS } from './useLongPress.js';

/**
 * A tap on a pile of tiles.
 *
 * The tiles inside carry their own long press — it opens the 2× tile preview —
 * and a press that reaches that threshold still ends in a `click` on the way
 * back up, which would bubble here and leave a modal sitting behind the preview.
 * So a press held that long is swallowed, on the same threshold that opened the
 * preview. Keyboard activation fires no pointer events and is never suppressed.
 */
export function usePileTap(onTap: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    cancel();
    heldRef.current = false;
    timerRef.current = setTimeout(() => {
      heldRef.current = true;
    }, LONG_PRESS_MS);
  }, [cancel]);

  // The suppression is consumed here rather than left standing, or the press
  // after a long one inherits it.
  const onClick = useCallback(() => {
    const held = heldRef.current;
    heldRef.current = false;
    if (!held) onTap();
  }, [onTap]);

  return {
    onPointerDown,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick,
  };
}
