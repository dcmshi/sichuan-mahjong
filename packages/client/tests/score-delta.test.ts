import { describe, expect, it } from 'vitest';
import { formatDelta } from '../src/components/PlayTopBar.js';

// The top-bar score chip (R2.1) folds the four-name score strip into a single
// "you" delta; this is the one bit of formatting logic worth pinning down.
describe('formatDelta', () => {
  it('sign-prefixes a positive delta', () => {
    expect(formatDelta(12)).toBe('+12');
  });

  it('leaves the minus sign JS already gives a negative delta', () => {
    expect(formatDelta(-3)).toBe('-3');
  });

  it('adds no sign for zero', () => {
    expect(formatDelta(0)).toBe('0');
  });
});
