import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANIMATION_PREFS,
  DEFAULT_PRACTICE_PREFS,
  animMs,
  isAnimationSpeed,
  parseAnimationPrefs,
  parsePracticePrefs,
  scaleFor,
} from '../src/prefs.js';

/** 1.5 × this is fractional, which is the case worth pinning. */
const ODD_BASE = 333;

describe('animation preferences', () => {
  it('defaults to medium, animations on', () => {
    expect(DEFAULT_ANIMATION_PREFS).toEqual({ speed: 'medium', skip: false });
  });

  it('leaves the shipped durations alone at fast', () => {
    // The constants in OwnZone/ClaimFlight are the `fast` values, so fast has to
    // be exactly 1× or the setting silently retimes what shipped.
    expect(scaleFor({ speed: 'fast', skip: false })).toBe(1);
    expect(animMs(280, { speed: 'fast', skip: false })).toBe(280);
    expect(animMs(420, { speed: 'fast', skip: false })).toBe(420);
  });

  it('makes the default slower than fast, and slow slower again', () => {
    const fast = animMs(280, { speed: 'fast', skip: false });
    const medium = animMs(280, DEFAULT_ANIMATION_PREFS);
    const slow = animMs(280, { speed: 'slow', skip: false });
    expect(medium).toBeGreaterThan(fast);
    expect(slow).toBeGreaterThan(medium);
  });

  it('returns whole milliseconds', () => {
    expect(Number.isInteger(animMs(ODD_BASE, DEFAULT_ANIMATION_PREFS))).toBe(true);
  });

  it('collapses to zero when skipping, whatever the speed', () => {
    for (const speed of ['slow', 'medium', 'fast'] as const) {
      expect(animMs(1200, { speed, skip: true })).toBe(0);
    }
  });

  it('keeps the speed setting through a skip toggle', () => {
    // Skip is a separate axis, not a fourth speed: turning it off has to restore
    // the speed the player chose rather than the default.
    expect(parseAnimationPrefs({ speed: 'slow', skip: true }).speed).toBe('slow');
  });
});

describe('parseAnimationPrefs', () => {
  it('accepts a well-formed value', () => {
    expect(parseAnimationPrefs({ speed: 'fast', skip: true })).toEqual({
      speed: 'fast',
      skip: true,
    });
  });

  it('falls back per field rather than wholesale', () => {
    // An entry written by a build that predated `skip` still restores its speed.
    expect(parseAnimationPrefs({ speed: 'slow' })).toEqual({ speed: 'slow', skip: false });
    // And a corrupt speed doesn't discard a valid skip.
    expect(parseAnimationPrefs({ speed: 'blazing', skip: true })).toEqual({
      speed: 'medium',
      skip: true,
    });
  });

  it('takes only a literal true for skip', () => {
    // Same rule as the WS boundary: a truthy value of the wrong type is not a
    // yes. Stored JSON is less hostile than a socket frame, but it is still
    // input from outside the program.
    for (const v of ['true', 1, {}, [], 'yes']) {
      expect(parseAnimationPrefs({ speed: 'medium', skip: v }).skip).toBe(false);
    }
  });

  it('survives anything that is not an object', () => {
    for (const v of [null, undefined, 42, 'medium', []]) {
      expect(parseAnimationPrefs(v).speed).toBe('medium');
    }
  });
});

describe('isAnimationSpeed', () => {
  it('accepts exactly the three speeds', () => {
    expect(['slow', 'medium', 'fast'].every(isAnimationSpeed)).toBe(true);
    expect(isAnimationSpeed('normal')).toBe(false);
    expect(isAnimationSpeed(undefined)).toBe(false);
  });
});

/**
 * Practice setup (N17). Practice used to send `startGame` with no `rules` at all,
 * so it silently took every default and a solo player had no way to slow the bots
 * down — in the one mode where following what happened matters most.
 *
 * Stored rather than asked each session because practice has no lobby to hold the
 * choice, and re-prompting would spend the one-tap start that makes it worth having.
 */
describe('practice prefs (N17)', () => {
  it('defaults to normal pace and easy bots', () => {
    expect(DEFAULT_PRACTICE_PREFS).toEqual({ botSpeed: 'normal', botLevel: 'easy' });
  });

  it('round-trips a stored choice', () => {
    expect(parsePracticePrefs({ botSpeed: 'slow', botLevel: 'medium' })).toEqual({
      botSpeed: 'slow',
      botLevel: 'medium',
    });
  });

  // Per field, not wholesale: a build that predates one key still restores the
  // half it does carry.
  it('falls back field by field', () => {
    expect(parsePracticePrefs({ botSpeed: 'slow' })).toEqual({
      botSpeed: 'slow',
      botLevel: 'easy',
    });
    expect(parsePracticePrefs({ botLevel: 'medium' })).toEqual({
      botSpeed: 'normal',
      botLevel: 'medium',
    });
  });

  it('rejects values the server would not accept anyway', () => {
    for (const junk of ['fastest', 'NORMAL', 0, null, true, {}, []]) {
      expect(parsePracticePrefs({ botSpeed: junk }).botSpeed, String(junk)).toBe('normal');
      expect(parsePracticePrefs({ botLevel: junk }).botLevel, String(junk)).toBe('easy');
    }
  });

  it('survives a stored value that is not an object', () => {
    for (const junk of [null, 'nope', 42, [], undefined]) {
      expect(parsePracticePrefs(junk), String(junk)).toEqual(DEFAULT_PRACTICE_PREFS);
    }
  });
});
