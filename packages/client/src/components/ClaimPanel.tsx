import type { GameAction, Seat } from '@sichuan-mahjong/engine';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSound } from '../hooks/useSound.js';
import { useT } from '../i18n/useT.js';
import { sendAction } from '../ws/client.js';

type Props = {
  seat: Seat;
  legalActions: GameAction[];
  claimDeadline: number;
  windowMs: number;
  /**
   * The bar's height, so the board can hold that much clear beneath the hand.
   * Reported rather than assumed: which buttons are offered varies with the
   * claim, so the bar is 43px with none and ~95px with a row of them. (N8)
   */
  onHeight: (px: number) => void;
};

/** Share of the claim window still to run, as a percentage. */
export function claimProgress(remainingMs: number, windowMs: number): number {
  if (windowMs <= 0) return 0;
  return Math.max(0, Math.min(100, (remainingMs / windowMs) * 100));
}

/**
 * Milliseconds left when the window is first seen.
 *
 * claimDeadline is a server timestamp, and the bar used to be driven by
 * comparing it against Date.now(): negligible on a LAN, but any real clock skew
 * over Tailscale either stretched the bar over minutes or pinned it at empty.
 * Trust the deadline only while it lands inside a plausible range — which also
 * lets a mid-window reconnect resume part-drained — and otherwise assume a
 * fresh window and count down locally. (F25)
 */
export function initialRemaining(claimDeadline: number, windowMs: number, now: number): number {
  const fromDeadline = claimDeadline - now;
  return fromDeadline > 0 && fromDeadline <= windowMs ? fromDeadline : windowMs;
}

export function ClaimPanel({ seat, legalActions, claimDeadline, windowMs, onHeight }: Props) {
  const [pct, setPct] = useState(100);
  const barRef = useRef<HTMLDivElement | null>(null);
  // One claim per window. The panel used to stay fully armed until the server's
  // next view arrived, so on a slow connection a second tap sent the action
  // again — and Hu twice is not the same as Hu once.
  const [sent, setSent] = useState(false);
  const t = useT();
  const play = useSound();

  useEffect(() => {
    setSent(false);
    const startRemaining = initialRemaining(claimDeadline, windowMs, Date.now());
    // Elapsed time comes from the monotonic clock, so a system clock adjustment
    // mid-window can't jump the bar.
    const startedAt = performance.now();
    setPct(claimProgress(startRemaining, windowMs));

    const id = setInterval(() => {
      const remaining = startRemaining - (performance.now() - startedAt);
      setPct(claimProgress(remaining, windowMs));
      if (remaining <= 0) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [claimDeadline, windowMs]);

  const canHu = legalActions.some(a => a.t === 'claim' && a.claim.kind === 'hu');
  const canKong = legalActions.some(a => a.t === 'claim' && a.claim.kind === 'kong');
  const canPung = legalActions.some(a => a.t === 'claim' && a.claim.kind === 'pung');
  const canPass = legalActions.some(a => a.t === 'pass');
  const secondsLeft = Math.ceil((pct / 100) * (windowMs / 1000));

  function act(action: GameAction) {
    if (sent) return;
    setSent(true);
    // Every other action you take makes a noise; claiming was the one that
    // didn't, so the loudest move in the game was the quietest.
    play(action.t === 'pass' ? 'tile' : 'claim');
    sendAction({ t: 'action', action });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: the button flags are not read here — they are what changes the height being measured
  useLayoutEffect(() => {
    onHeight(barRef.current?.offsetHeight ?? 0);
    return () => onHeight(0);
  }, [onHeight, canHu, canKong, canPung, canPass]);

  return (
    // Felt palette, not the gray chrome it used to wear — the claim bar read as
    // a foreign element against the jade-and-amber board. (F14)
    //
    // Stays `fixed`, and the board pads instead. In flow it covered nothing, but
    // it added a row to a column that on CI's metrics was already at the limit,
    // and `viewport.spec.ts` rightly failed the play screen for overflowing.
    // Padding the root reduces the content height of an `h-dvh` border-box
    // element, so the `flex-1 min-h-0` middle row gives the space back and the
    // column height does not change. (N8)
    <div
      ref={barRef}
      className="claim-panel fixed bottom-0 left-0 right-0 bg-green-950/95 backdrop-blur text-white p-3 border-t border-amber-400/30 z-20"
    >
      {/* The bar is decorative: a progressbar role would have to be focusable to
          be valid, and a tab stop in front of the claim buttons is the last thing
          you want in a timed decision. The countdown is spoken instead, below. */}
      <div
        className="w-full h-1.5 bg-black/40 rounded-full mb-3 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="h-full bg-amber-400 rounded-full transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Announced only over the last few seconds. A live region ticking every
          second for the whole window would bury the buttons it is warning about. */}
      <output className="sr-only" aria-live="polite">
        {secondsLeft <= 3 ? t('claim.secondsLeft', { n: secondsLeft }) : ''}
      </output>

      {/* Action buttons */}
      <div className="flex gap-2 justify-center">
        {canHu && (
          <button
            type="button"
            className="flex-1 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-xl font-bold text-lg disabled:opacity-40"
            onClick={() => act({ t: 'claim', seat, claim: { kind: 'hu' } })}
            disabled={sent}
          >
            {t('claim.hu')}
          </button>
        )}
        {canKong && (
          <button
            type="button"
            className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 rounded-xl font-bold text-lg disabled:opacity-40"
            onClick={() => act({ t: 'claim', seat, claim: { kind: 'kong' } })}
            disabled={sent}
          >
            {t('claim.kong')}
          </button>
        )}
        {canPung && (
          <button
            type="button"
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-xl font-bold text-lg disabled:opacity-40"
            onClick={() => act({ t: 'claim', seat, claim: { kind: 'pung' } })}
            disabled={sent}
          >
            {t('claim.pung')}
          </button>
        )}
        {canPass && (
          <button
            type="button"
            className="flex-1 py-3 bg-green-800 hover:bg-green-700 active:bg-green-900 rounded-xl font-bold text-lg disabled:opacity-40"
            onClick={() => act({ t: 'pass', seat })}
            disabled={sent}
          >
            {t('claim.pass')}
          </button>
        )}
      </div>
    </div>
  );
}
