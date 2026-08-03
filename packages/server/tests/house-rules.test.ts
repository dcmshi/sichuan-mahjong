import { DEFAULT_CONFIG } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { createRoom } from '../src/room.js';
import type { RoomSlot } from '../src/room.js';
import { CLAIM_WINDOWS, claimWindowMsFrom, houseRules } from '../src/ws.js';

const BOT_SLOTS: RoomSlot[] = [0, 1, 2, 3].map(i => ({
  name: `bot${i}`,
  isBot: true,
  connected: false,
  difficulty: 'easy' as const,
}));

/** What `houseRules` returns when the host asks for nothing. */
const DEFAULTS = { enableHuanSanZhang: false, claimWindowMs: CLAIM_WINDOWS.normal };

/**
 * The `rules` payload on `startGame` is the first thing a client gets to say
 * about the ruleset, so it is narrowed at the WS boundary like every other
 * inbound field. Only a literal `true` may switch a rule on — a truthy value of
 * the wrong type must not.
 */
describe('houseRules', () => {
  it('leaves the canonical ruleset alone when nothing is asked for', () => {
    expect(houseRules(undefined)).toEqual(DEFAULTS);
    expect(houseRules({})).toEqual(DEFAULTS);
    expect(houseRules(null)).toEqual(DEFAULTS);
  });

  it('turns 換三張 on only for a literal true', () => {
    expect(houseRules({ huanSanZhang: true })).toEqual({
      ...DEFAULTS,
      enableHuanSanZhang: true,
    });
    for (const truthy of ['true', 1, [], {}, 'yes', Number.POSITIVE_INFINITY]) {
      expect(houseRules({ huanSanZhang: truthy }), String(truthy)).toEqual(DEFAULTS);
    }
  });

  it('survives a frame that is not an object at all', () => {
    for (const junk of ['nope', 42, true, []]) {
      expect(houseRules(junk), String(junk)).toEqual(DEFAULTS);
    }
  });

  it('ignores fields it does not know, rather than passing them to the engine', () => {
    expect(houseRules({ huanSanZhang: true, fanCap: 99, enableFlowerPig: true })).toEqual({
      ...DEFAULTS,
      enableHuanSanZhang: true,
    });
  });

  // The point of the change: the swap is a house rule, so the shipped default is
  // the canonical deal. If this flips, every spec that drives practice mode
  // starts seeing a huan phase again.
  it('matches the engine default when unset', () => {
    expect(DEFAULT_CONFIG.enableHuanSanZhang).toBe(false);
    expect(houseRules(undefined).enableHuanSanZhang).toBe(DEFAULT_CONFIG.enableHuanSanZhang);
  });

  it('carries the host claim-window preset through as milliseconds', () => {
    expect(houseRules({ claimWindow: 'quick' }).claimWindowMs).toBe(CLAIM_WINDOWS.quick);
    expect(houseRules({ claimWindow: 'relaxed' }).claimWindowMs).toBe(CLAIM_WINDOWS.relaxed);
  });
});

/**
 * The claim window is a deadline the whole table waits on, so this is the one
 * `rules` field where a raw number would be a denial of service in one frame —
 * a day-long window freezes the room until the sweep reaps it, and zero closes
 * before a human can see it. Only the three presets may set it. (N6)
 */
describe('claimWindowMsFrom', () => {
  it('maps the three presets and nothing else', () => {
    expect(claimWindowMsFrom('quick')).toBe(5000);
    expect(claimWindowMsFrom('normal')).toBe(10_000);
    expect(claimWindowMsFrom('relaxed')).toBe(20_000);
  });

  it('refuses a raw number, however it is dressed up', () => {
    for (const junk of [0, 1, 86_400_000, '5000', -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(claimWindowMsFrom(junk), String(junk)).toBe(CLAIM_WINDOWS.normal);
    }
  });

  it('falls back to normal for anything unrecognised', () => {
    for (const junk of [undefined, null, {}, [], 'QUICK', 'instant', true]) {
      expect(claimWindowMsFrom(junk), String(junk)).toBe(CLAIM_WINDOWS.normal);
    }
  });

  // Normal must stay the engine default, or touching nothing in the lobby
  // silently changes the window every existing test was written against.
  it('normal is the engine default', () => {
    expect(CLAIM_WINDOWS.normal).toBe(DEFAULT_CONFIG.claimWindowMs);
  });

  // The hop that can fail silently: `houseRules` returning the right number is
  // no use if the room does not carry it into engine state. A wrong window here
  // looks exactly like a right one until someone times a claim.
  it('reaches GameState.config through createRoom', () => {
    const quick = createRoom('CWQ1', BOT_SLOTS, houseRules({ claimWindow: 'quick' }));
    expect(quick.getState().config.claimWindowMs).toBe(CLAIM_WINDOWS.quick);

    const dflt = createRoom('CWQ2', BOT_SLOTS, houseRules(undefined));
    expect(dflt.getState().config.claimWindowMs).toBe(CLAIM_WINDOWS.normal);
  });
});
