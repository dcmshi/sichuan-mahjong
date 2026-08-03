import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.js';
import { WALL_SIZE } from '../src/dice.js';
import { DEALT_TILES, type Seat, createGame } from '../src/state.js';
import { projectSpectatorView, projectView } from '../src/views.js';

const PLAYERS = [
  { name: 'A', isBot: false },
  { name: 'B', isBot: false },
  { name: 'C', isBot: false },
  { name: 'D', isBot: false },
] as [
  { name: string; isBot: boolean },
  { name: string; isBot: boolean },
  { name: string; isBot: boolean },
  { name: string; isBot: boolean },
];

const game = () => createGame('wall-drawn', PLAYERS, { enableHuanSanZhang: false }, 0 as Seat);

/**
 * N14. `wallDrawn` is a projected field, and the hop from state to view is the
 * kind that fails silently — the diagram would simply keep drawing the wall the
 * old way and nothing would say so. So this asserts the hop, not only the sums.
 */
describe('wallDrawn — the wall’s two open ends', () => {
  it('reaches the player view, and the spectator view', () => {
    const s = game();
    expect(projectView(s, 0 as Seat).wallDrawn).toBeDefined();
    expect(projectSpectatorView(s).wallDrawn).toBeDefined();
  });

  it('starts with the dealer’s fourteenth tile off the head and nothing off the tail', () => {
    const s = game();
    // Four hands of thirteen come off before play; the dealer's extra tile is a
    // draw like any other, which is what makes the head count 1 rather than 0.
    expect(s.drawIndex).toBe(DEALT_TILES + 1);
    expect(projectView(s, 0 as Seat).wallDrawn).toEqual({ head: 1, tail: 0 });
  });

  it('always adds up to what wallRemaining says is left', () => {
    let s = game();
    for (let i = 0; i < 4; i++) {
      const seat = i as Seat;
      const firstDiscard = s.players[seat]!.hand.find(t => Math.floor(t / 36) === 0) ?? null;
      const r = applyAction(s, { t: 'declareVoid', seat, suit: 'man', firstDiscard });
      if (r.ok) s = r.state;
    }
    const v = projectView(s, 0 as Seat);
    const capacity = WALL_SIZE - DEALT_TILES;
    expect(capacity - v.wallDrawn.head - v.wallDrawn.tail).toBe(v.wallRemaining);
  });

  it('counts the tail from the far end, where kong replacements come from', () => {
    const s = game();
    // kongDrawIndex decrements, so the tail count is the distance it has walked
    // back from the last tile.
    const shifted = { ...s, kongDrawIndex: s.kongDrawIndex - 3 };
    expect(projectView(shifted, 0 as Seat).wallDrawn.tail).toBe(3);
    expect(projectView(shifted, 0 as Seat).wallRemaining).toBe(
      s.kongDrawIndex - 3 - s.drawIndex + 1,
    );
  });

  it('never reports a negative count', () => {
    const s = game();
    const impossible = { ...s, drawIndex: 0, kongDrawIndex: WALL_SIZE + 5 };
    const v = projectView(impossible, 0 as Seat);
    expect(v.wallDrawn.head).toBeGreaterThanOrEqual(0);
    expect(v.wallDrawn.tail).toBeGreaterThanOrEqual(0);
  });
});
