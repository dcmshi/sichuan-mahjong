import { DEFAULT_CONFIG } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { houseRules } from '../src/ws.js';

/**
 * The `rules` payload on `startGame` is the first thing a client gets to say
 * about the ruleset, so it is narrowed at the WS boundary like every other
 * inbound field. Only a literal `true` may switch a rule on — a truthy value of
 * the wrong type must not.
 */
describe('houseRules', () => {
  it('leaves the canonical ruleset alone when nothing is asked for', () => {
    expect(houseRules(undefined)).toEqual({ enableHuanSanZhang: false });
    expect(houseRules({})).toEqual({ enableHuanSanZhang: false });
    expect(houseRules(null)).toEqual({ enableHuanSanZhang: false });
  });

  it('turns 換三張 on only for a literal true', () => {
    expect(houseRules({ huanSanZhang: true })).toEqual({ enableHuanSanZhang: true });
    for (const truthy of ['true', 1, [], {}, 'yes', Number.POSITIVE_INFINITY]) {
      expect(houseRules({ huanSanZhang: truthy }), String(truthy)).toEqual({
        enableHuanSanZhang: false,
      });
    }
  });

  it('survives a frame that is not an object at all', () => {
    for (const junk of ['nope', 42, true, []]) {
      expect(houseRules(junk), String(junk)).toEqual({ enableHuanSanZhang: false });
    }
  });

  it('ignores fields it does not know, rather than passing them to the engine', () => {
    expect(houseRules({ huanSanZhang: true, fanCap: 99, enableFlowerPig: true })).toEqual({
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
});
