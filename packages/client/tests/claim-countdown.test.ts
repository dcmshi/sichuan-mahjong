import { describe, expect, it } from 'vitest';
import { claimProgress, initialRemaining } from '../src/components/ClaimPanel.js';

const WINDOW = 3000;

describe('claim countdown (F25)', () => {
  it('uses the server deadline when the clocks agree', () => {
    const now = 1_000_000;
    expect(initialRemaining(now + WINDOW, WINDOW, now)).toBe(WINDOW);
  });

  it('resumes part-drained for a client that joins mid-window', () => {
    const now = 1_000_000;
    expect(initialRemaining(now + 1200, WINDOW, now)).toBe(1200);
    expect(claimProgress(1200, WINDOW)).toBe(40);
  });

  it('ignores a deadline that clock skew has made nonsense of', () => {
    const now = 1_000_000;
    // Client clock 30s behind the server: the old math stretched a 3s bar
    // across 33 seconds.
    expect(initialRemaining(now + 33_000, WINDOW, now)).toBe(WINDOW);
    // Client clock 30s ahead: the old math pinned the bar at empty.
    expect(initialRemaining(now - 27_000, WINDOW, now)).toBe(WINDOW);
  });

  it('clamps the bar to 0..100', () => {
    expect(claimProgress(-500, WINDOW)).toBe(0);
    expect(claimProgress(WINDOW * 2, WINDOW)).toBe(100);
    expect(claimProgress(1500, WINDOW)).toBe(50);
    expect(claimProgress(1000, 0)).toBe(0);
  });
});
