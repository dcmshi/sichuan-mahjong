import { useEffect } from 'react';

/**
 * Escape closes an overlay.
 *
 * Every overlay in the app — how-to-play, move history, the scores dropdown,
 * the long-press tile preview — could only be dismissed by finding and tapping
 * its backdrop or close button. That is fine with a thumb and a dead end with a
 * keyboard, which is the one input method that cannot aim at a backdrop.
 *
 * Bound on the document rather than on the overlay so it works without the
 * overlay holding focus, which none of them currently take.
 */
export function useEscapeToClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}
