import { useCallback, useRef } from 'react';

/**
 * How long a press has to last to count as a long one. Exported because
 * `usePileTap` has to swallow the click that follows a press this long — a tile
 * and the pile it sits in would otherwise both answer one gesture. (N33)
 */
export const LONG_PRESS_MS = 500;

export function useLongPress(onLongPress: () => void, onPress?: () => void, delay = LONG_PRESS_MS) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  // Tracks whether pointer-up already handled the press, so the synthetic click event can skip it.
  const pointerHandledRef = useRef(false);

  const start = useCallback(() => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const end = useCallback(() => {
    cancel();
    if (!firedRef.current && onPress) {
      pointerHandledRef.current = true;
      onPress();
      // click event fires synchronously after pointerup; reset after it drains.
      setTimeout(() => {
        pointerHandledRef.current = false;
      }, 100);
    }
  }, [cancel, onPress]);

  return {
    onPointerDown: start,
    onPointerUp: end,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    pointerHandledRef,
  };
}
