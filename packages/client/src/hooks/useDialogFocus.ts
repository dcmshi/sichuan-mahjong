import { type RefObject, useEffect } from 'react';

/** Everything inside `root` a keyboard can land on, in document order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Move focus into a dialog while it is open, keep it there, and give it back.
 *
 * The three overlays that declare `role="dialog" aria-modal="true"` did none of
 * this, and `useEscapeToClose` said so out loud: *"bound on the document rather
 * than on the overlay so it works without the overlay holding focus, which none
 * of them currently take."* Escape working was the right call; the missing half
 * is that **`aria-modal="true"` is a claim, and it was not true.** (A75)
 *
 * What it claims is that everything outside the dialog is inert. A screen
 * reader is told a dialog opened — and then the reading cursor is still on the
 * tile the user tapped, so they never hear it; Tab walks straight out of the
 * dialog into the board behind, which the same attribute has just told the
 * screen reader to ignore. The result is worse than not marking it a dialog at
 * all, because the markup and the behaviour disagree.
 *
 * Three things, which is the whole of what the attribute is promising:
 * focus enters on open, Tab and Shift+Tab cycle within, and whatever had focus
 * before gets it back on close — the last one being what stops a keyboard user
 * losing their place on the board every time they glance at a discard pile.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // Restored on unmount. Captured before we move it, obviously, but also
    // before any child can steal it during mount.
    const previous = document.activeElement as HTMLElement | null;

    const focusable = (): HTMLElement[] =>
      [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        el => el.offsetParent !== null || el === document.activeElement,
      );

    // The container itself when it has no focusable child yet — a pile modal is
    // mostly tiles, and landing on the dialog is still better than landing
    // nowhere, which is what "focus stays on the board" amounts to.
    (focusable()[0] ?? root).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      // Wrap at both ends, and pull focus back in if it has escaped already.
      if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [ref]);
}
