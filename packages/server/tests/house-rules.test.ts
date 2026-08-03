import { DEFAULT_CONFIG } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { createRoom } from '../src/room.js';
import type { RoomSlot } from '../src/room.js';
import {
  CLAIM_WINDOWS,
  botDifficultyFrom,
  claimWindowMsFrom,
  fanCapFrom,
  houseRules,
  isSeat,
} from '../src/ws.js';

const BOT_SLOTS: RoomSlot[] = [0, 1, 2, 3].map(i => ({
  name: `bot${i}`,
  isBot: true,
  connected: false,
  difficulty: 'easy' as const,
}));

/** What `houseRules` returns when the host asks for nothing. */
const DEFAULTS = { enableHuanSanZhang: false, claimWindowMs: CLAIM_WINDOWS.normal, fanCap: 3 };

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
    expect(
      houseRules({ huanSanZhang: true, enableFlowerPig: true, voidDiscardRule: 'lax' }),
    ).toEqual({
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

  it('carries the host fan cap through', () => {
    expect(houseRules({ fanCap: 4 }).fanCap).toBe(4);
    expect(houseRules({ fanCap: 3 }).fanCap).toBe(3);
  });
});

/**
 * The fan limit is a documented variant with two values, so it is the host's to
 * choose — but it is also the exponent in `2 ** fanCap`, which makes it the one
 * `rules` field where a raw integer decides the match rather than the play. (N27)
 */
describe('fanCapFrom', () => {
  it('accepts the two values the ruleset documents', () => {
    expect(fanCapFrom(3)).toBe(3);
    expect(fanCapFrom(4)).toBe(4);
  });

  // 2^30 is not a large hand, it is the whole match. Nothing but a literal 4 may
  // raise the cap.
  it('refuses every other number, however it is dressed up', () => {
    for (const junk of [0, 1, 2, 5, 30, 99, '4', 4.5, -4, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(fanCapFrom(junk), String(junk)).toBe(3);
    }
  });

  it('falls back for anything that is not a number at all', () => {
    for (const junk of [undefined, null, {}, [], 'four', true]) {
      expect(fanCapFrom(junk), String(junk)).toBe(3);
    }
  });

  // The fallback has to stay the engine default, or a host who touches nothing
  // gets a different scoring table from practice mode.
  it('falls back to the engine default', () => {
    expect(fanCapFrom(undefined)).toBe(DEFAULT_CONFIG.fanCap);
  });

  // Same hop as the claim window: narrowing correctly is no use if the room does
  // not carry it into engine state, and a wrong cap looks right until a hand caps.
  it('reaches GameState.config through createRoom', () => {
    const four = createRoom('FC41', BOT_SLOTS, houseRules({ fanCap: 4 }));
    expect(four.getState().config.fanCap).toBe(4);

    const dflt = createRoom('FC42', BOT_SLOTS, houseRules(undefined));
    expect(dflt.getState().config.fanCap).toBe(DEFAULT_CONFIG.fanCap);
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
    expect(claimWindowMsFrom('quick')).toBe(8000);
    expect(claimWindowMsFrom('normal')).toBe(15_000);
    expect(claimWindowMsFrom('relaxed')).toBe(30_000);
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

/**
 * Bot level and seat, both now arriving on their own messages rather than only
 * inside `startGame.rules` — so both get the same narrowing every other inbound
 * field gets. (N18)
 */
describe('botDifficultyFrom', () => {
  it('accepts the levels that exist', () => {
    expect(botDifficultyFrom('easy')).toBe('easy');
    expect(botDifficultyFrom('medium')).toBe('medium');
    // N19's third rung. It was in the junk list below until it shipped, which is
    // the point of validating against the levels rather than against a blocklist.
    expect(botDifficultyFrom('hard')).toBe('hard');
  });

  // A level no dispatch in room.ts recognises would seat an opponent that never
  // acts, so an unknown string has to become a real level rather than pass through.
  it('turns anything else into easy rather than passing it on', () => {
    for (const junk of ['expert', 'MEDIUM', 'Hard', '', 0, 1, null, undefined, {}, [], true]) {
      expect(botDifficultyFrom(junk), String(junk)).toBe('easy');
    }
  });
});

describe('isSeat', () => {
  it('accepts the four seats', () => {
    for (const s of [0, 1, 2, 3]) expect(isSeat(s), String(s)).toBe(true);
  });

  // `slots["0"]` reaches element 0 on a JS array, so a string seat would resolve
  // if the index were used unchecked — which is why this rejects rather than coerces.
  it('rejects strings, out-of-range and non-integers', () => {
    for (const junk of ['0', '3', -1, 4, 1.5, Number.NaN, null, undefined, {}, []]) {
      expect(isSeat(junk), String(junk)).toBe(false);
    }
  });
});
