import type { BotPace, PlayerView } from '@sichuan-mahjong/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { botPaceControl } from '../src/components/SettingsMenu.js';
import { type Lang, catalog } from '../src/i18n/index.js';
import { useStore } from '../src/store/index.js';

/**
 * The ⚙ menu's bot pace, which shipped as a hardcoded `useState('normal')` and
 * so told a host who chose slow that the table was on normal. (N24)
 *
 * These are the only tests that see the control decided honestly: client tests
 * have no DOM, and the Playwright suite runs the server with `--bot-delay 150`,
 * so every e2e run reaches only the pinned branch.
 */

const pace = (over: Partial<BotPace> = {}): BotPace => ({
  speed: 'normal',
  pinned: false,
  ...over,
});

describe('botPaceControl', () => {
  it('shows the speed the server reports, not a default', () => {
    const c = botPaceControl(pace({ speed: 'slow' }), true, true);
    expect(c.show && c.selected).toBe('slow');
    // The whole bug in one assertion: the old control returned 'normal' here.
    expect(c.show && c.selected).not.toBe('normal');
  });

  it('hides until the first view push arrives', () => {
    // Null is "not told yet", and the control's history is that a guess in this
    // position is indistinguishable from a fact.
    expect(botPaceControl(null, true, true)).toEqual({ show: false });
  });

  it('stays host-only, and stays hidden at a table with no bots', () => {
    expect(botPaceControl(pace(), false, true)).toEqual({ show: false });
    expect(botPaceControl(pace(), true, false)).toEqual({ show: false });
  });

  it('disables itself and says why when the process pins the pace', () => {
    // `--bot-delay` / `SM_BOT_DELAY_MS` outrank the room, so every button here
    // would be a tap the server discards.
    const c = botPaceControl(pace({ speed: 'fast', pinned: true }), true, true);
    expect(c).toEqual({
      show: true,
      selected: 'fast',
      disabled: true,
      hint: 'settings.botSpeedPinned',
    });
  });

  it('is live, and says the pace is the table’s, when nothing is pinned', () => {
    const c = botPaceControl(pace({ speed: 'slow' }), true, true);
    expect(c.show && c.disabled).toBe(false);
    expect(c.show && c.hint).toBe('settings.botSpeedTable');
  });

  it('uses hint keys that exist in every catalog', () => {
    // The parity test covers the catalogs against each other; this covers the
    // two keys this control can name against all of them.
    for (const lang of ['en', 'zh-Hans', 'zh-Hant'] as Lang[]) {
      expect(catalog[lang]['settings.botSpeedTable']).toBeTruthy();
      expect(catalog[lang]['settings.botSpeedPinned']).toBeTruthy();
    }
  });
});

describe('the store takes the pace off the view push', () => {
  beforeEach(() => useStore.setState({ botPace: null }));

  const viewMsg = (botPace: BotPace) => ({
    t: 'view' as const,
    view: { others: [] } as unknown as PlayerView,
    events: [],
    botPace,
  });

  it('records what arrived', () => {
    useStore.getState().handleServerMsg(viewMsg(pace({ speed: 'slow' })));
    expect(useStore.getState().botPace).toEqual({ speed: 'slow', pinned: false });
  });

  it('follows a mid-match repace rather than latching the first value', () => {
    // The host changes the pace; the server re-pushes. A menu holding its own
    // copy would still be showing the old one.
    useStore.getState().handleServerMsg(viewMsg(pace({ speed: 'slow' })));
    useStore.getState().handleServerMsg(viewMsg(pace({ speed: 'fast' })));
    expect(useStore.getState().botPace?.speed).toBe('fast');
  });

  it('is cleared with the rest of the session', () => {
    // Otherwise the next room inherits the last one's pace until its first push.
    useStore.getState().handleServerMsg(viewMsg(pace({ speed: 'slow' })));
    useStore.getState().resetSession();
    expect(useStore.getState().botPace).toBeNull();
  });
});
