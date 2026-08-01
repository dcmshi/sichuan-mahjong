import { afterEach, describe, expect, it } from 'vitest';
import { parseCli } from '../src/cli.js';
import { botPaceMs, setBotPaceMs } from '../src/room.js';

/**
 * The bot pace is what makes a bot circuit followable (O2). It is a single
 * process-wide value, so the interesting cases are the boundaries: `0` is a real
 * choice a host can make and must not be mistaken for "unset", and an
 * unparseable flag must leave the default in place rather than resolve to a
 * number nobody asked for.
 */
describe('bot pace', () => {
  const original = botPaceMs();
  afterEach(() => setBotPaceMs(original));

  it('is what the suite pinned, not the human-facing default', () => {
    // vitest.config.ts sets SM_BOT_DELAY_MS=150 so full-round tests stay quick;
    // if that seam ever breaks, this suite silently grows by minutes.
    expect(botPaceMs()).toBe(150);
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
    expect(botPaceMs()).toBe(700); // falls back to the documented default
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
