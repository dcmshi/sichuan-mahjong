import { afterEach, describe, expect, it } from 'vitest';
import { parseCli } from '../src/cli.js';
import { BOT_SPEEDS, botPaceMs, isBotSpeed, setBotPaceMs } from '../src/room.js';

/**
 * The bot pace is what makes a bot circuit followable (O2). The host picks a
 * speed in the lobby, and `--bot-delay` (or the env seam the suites use) pins the
 * whole process regardless — so the interesting cases are that precedence and the
 * boundaries: `0` is a real choice and must not be mistaken for "unset", and an
 * unparseable flag must leave the default alone rather than resolve to a number
 * nobody asked for.
 */
describe('bot pace', () => {
  const original = botPaceMs();
  afterEach(() => setBotPaceMs(original));

  it('is what the suite pinned, not the human-facing default', () => {
    // vitest.config.ts sets SM_BOT_DELAY_MS=150 so full-round tests stay quick;
    // if that seam ever breaks, this suite silently grows by minutes.
    expect(botPaceMs()).toBe(150);
  });

  it('lets an explicit pace outrank every lobby speed', () => {
    // Otherwise a room whose host picked "slow" would ignore --bot-delay, and the
    // Playwright suite would play whole rounds at 1.8s a move.
    for (const speed of ['slow', 'normal', 'fast'] as const) {
      expect(botPaceMs(speed)).toBe(150);
    }
  });

  it('orders the three speeds the way their names claim', () => {
    // What an unpinned process hands each room. It can't be asserted through
    // botPaceMs here — this suite runs with SM_BOT_DELAY_MS set, and there is
    // deliberately no way to un-pin an override at runtime.
    expect(BOT_SPEEDS.slow).toBeGreaterThan(BOT_SPEEDS.normal);
    expect(BOT_SPEEDS.normal).toBeGreaterThan(BOT_SPEEDS.fast);
    expect(BOT_SPEEDS.fast).toBeGreaterThan(0);
  });

  it('takes only the three speeds off the wire', () => {
    expect(isBotSpeed('slow')).toBe(true);
    expect(isBotSpeed('turbo')).toBe(false);
    expect(isBotSpeed(900)).toBe(false);
    expect(isBotSpeed(undefined)).toBe(false);
    expect(Object.keys(BOT_SPEEDS).every(isBotSpeed)).toBe(true);
  });

  it('accepts 0 — instant bots are a legitimate setting', () => {
    setBotPaceMs(0);
    expect(botPaceMs()).toBe(0);
  });

  it('clamps out of range and non-finite values', () => {
    setBotPaceMs(-500);
    expect(botPaceMs()).toBe(0);
    setBotPaceMs(60_000);
    expect(botPaceMs()).toBe(5000);
    setBotPaceMs(Number.NaN);
    expect(botPaceMs()).toBe(BOT_SPEEDS.normal); // falls back to the documented default
    setBotPaceMs(812.6);
    expect(botPaceMs()).toBe(813);
  });

  it('parses --bot-delay, and distinguishes 0 from absent', () => {
    expect(parseCli([]).botDelayMs).toBeNull();
    expect(parseCli(['--bot-delay', '0']).botDelayMs).toBe(0);
    expect(parseCli(['--bot-delay', '1200']).botDelayMs).toBe(1200);
    // Junk leaves the server default alone — the alternative is a typo silently
    // pinning the pace to something arbitrary. (A negative never reaches this
    // code: `parseArgs` is strict, so `--bot-delay -3` reads `-3` as an unknown
    // short option and parseCli exits with the usage text.)
    expect(parseCli(['--bot-delay', 'fast']).botDelayMs).toBeNull();
  });
});
