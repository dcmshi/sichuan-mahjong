import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// node:sqlite is a native built-in; Vite can't bundle it — mock before any import touches it.
vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(),
  getGame: vi.fn().mockReturnValue(null),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn().mockReturnValue([]),
  deleteLiveRoom: vi.fn(),
  getDb: vi.fn(() => null),
}));
import type { WebSocket } from '@fastify/websocket';
import type { GameConfig, Seat } from '@sichuan-mahjong/engine';
import { type BotSpeed, GameRoom, deleteRoom } from '../src/room.js';

/**
 * `GameRoom`'s timers, driven adversarially. (A68)
 *
 * The room runs five kinds of scheduled work — the claim-window deadline, the
 * per-seat bot pause, a `setImmediate` for server-issued draws, the 60s
 * reconnect grace, and a 1s persist debounce — and every prior audit checked
 * them one at a time. What none checked is what happens when two of them are in
 * flight at once, which is the only state a real table is ever in.
 *
 * The assertion that matters is **the game does not stall**: a round that stops
 * advancing with no timer left to advance it is dead, and no error is logged
 * when it happens. `drain` detects exactly that, rather than waiting for a
 * timeout and reporting "slow".
 */

const fakeWs = (): WebSocket => ({ readyState: 1, OPEN: 1, send() {} }) as unknown as WebSocket;

const allBots = (): ConstructorParameters<typeof GameRoom>[1] =>
  [0, 1, 2, 3].map(i => ({ name: `Bot${i}`, isBot: true, connected: false }));

function room(
  code: string,
  config: Partial<GameConfig> = {},
  speed: BotSpeed = 'fast',
  slots = allBots(),
) {
  return new GameRoom(code, slots, config, speed);
}

/**
 * Advance until the round ends, or until nothing is left to advance it.
 *
 * **Zero pending timers before `roundEnd` is a stall**, and it is the failure
 * this file exists to catch: the room is waiting on a callback that will never
 * come, and it looks exactly like a slow game from outside.
 */
function drain(r: GameRoom, budgetMs = 600_000): { stalled: boolean; elapsed: number } {
  let elapsed = 0;
  while (r.getState().phase !== 'roundEnd') {
    if (elapsed >= budgetMs) return { stalled: false, elapsed };
    // Let the persist debounce and anything else settle before calling it dead.
    if (vi.getTimerCount() === 0) {
      vi.advanceTimersByTime(2000);
      if (vi.getTimerCount() === 0 && r.getState().phase !== 'roundEnd') {
        return { stalled: true, elapsed };
      }
    }
    vi.advanceTimersByTime(100);
    elapsed += 100;
  }
  return { stalled: false, elapsed };
}

describe('GameRoom timers under pressure (A68)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays a round out with nothing left scheduled', () => {
    const r = room('CC01');
    r.start();
    const { stalled } = drain(r);
    expect(stalled, 'round stalled').toBe(false);
    expect(r.getState().phase).toBe('roundEnd');
    deleteRoom('CC01');
  });

  /**
   * The claim window closing from something other than the bot that was still
   * thinking about it.
   *
   * `scheduleBot` and `scheduleBotImmediate` share one `botPendingSeats` set,
   * on the stated ground that a seat only ever has one decision outstanding —
   * huan, void, claim and turn being mutually exclusive. They are not
   * mutually exclusive *across* a window closing: a seat can be sitting on a
   * pending claim decision at the moment the deadline expires and the turn
   * passes to it, and the draw that turn needs is then deduped away against the
   * claim it superseded.
   *
   * Reachable by configuration: the pace is clamped to 5s through the lobby but
   * `SM_BOT_DELAY_MS` is read straight into `paceOverride` unclamped, and the
   * shortest claim window a host can pick is 8s.
   */
  it('does not strand a seat whose claim decision was superseded by its own turn', () => {
    // Window far shorter than the bots' pause, so the deadline always wins.
    const r = room('CC02', { claimWindowMs: 50 }, 'slow');
    r.start();
    const { stalled, elapsed } = drain(r);
    expect(stalled, `stalled after ${elapsed}ms with no timer pending`).toBe(false);
    deleteRoom('CC02');
  });

  it('leaves nothing scheduled once the match ends', () => {
    const r = room('CC03');
    r.connect(0, fakeWs());
    r.start();
    vi.advanceTimersByTime(3000); // mid-round, with bot work in flight
    expect(r.getState().phase).not.toBe('roundEnd');

    r.endMatch();
    expect(vi.getTimerCount(), 'timers outliving endMatch').toBe(0);

    // And nothing fires later that could resurrect the room.
    const before = JSON.stringify(r.getState());
    vi.advanceTimersByTime(300_000);
    expect(JSON.stringify(r.getState())).toBe(before);
  });

  it('leaves nothing scheduled when the match ends inside a claim window', () => {
    const r = room('CC04', { claimWindowMs: 30_000 }, 'slow');
    r.start();
    // Run until a window is actually open, so the teardown has one to cancel.
    let guard = 0;
    while (r.getState().pendingClaims === null && guard++ < 2000) {
      if (r.getState().phase === 'roundEnd') break;
      vi.advanceTimersByTime(100);
    }
    expect(r.getState().pendingClaims, 'no claim window was reached').not.toBeNull();

    r.endMatch();
    expect(vi.getTimerCount(), 'a claim deadline survived endMatch').toBe(0);
  });

  it('survives a reconnect storm without stalling or taking the seat over early', () => {
    const slots = [
      { name: 'Human', isBot: false, connected: false },
      ...[1, 2, 3].map(i => ({ name: `Bot${i}`, isBot: true, connected: false })),
    ];
    const r = room('CC05', {}, 'fast', slots);
    r.connect(0, fakeWs());
    r.start();

    // Drop and restore seat 0 repeatedly, well inside the 60s grace each time.
    for (let i = 0; i < 12 && r.getState().phase !== 'roundEnd'; i++) {
      r.disconnect(0);
      vi.advanceTimersByTime(400);
      r.connect(0, fakeWs());
      vi.advanceTimersByTime(400);
    }
    // The human never stayed away for 60s, so the seat is still theirs.
    expect(r.getLobbyPlayers()[0]?.isBot, 'seat taken over inside the grace').toBe(false);

    // Let the grace lapse so the round can finish without a human to wait for.
    r.disconnect(0);
    vi.advanceTimersByTime(61_000);
    const { stalled } = drain(r);
    expect(stalled, 'stalled after the reconnect storm').toBe(false);
    deleteRoom('CC05');
  });

  it('ignores a stale close from a socket the seat has already replaced (A5)', () => {
    const slots = [
      { name: 'Human', isBot: false, connected: false },
      ...[1, 2, 3].map(i => ({ name: `Bot${i}`, isBot: true, connected: false })),
    ];
    const r = room('CC06', {}, 'fast', slots);
    const first = fakeWs();
    r.connect(0, first);
    r.start();

    const second = fakeWs();
    r.connect(0, second); // reconnect lands before the old socket's close arrives
    r.disconnect(0, first); // …and then it arrives

    expect(r.getLobbyPlayers()[0]?.connected, 'the live socket was evicted').toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(r.getLobbyPlayers()[0]?.isBot, 'a stale close started a takeover').toBe(false);
    deleteRoom('CC06');
  });

  /**
   * A32's case, asserted rather than assumed: `nextRound` landing while a bot
   * pause is still counting. A stale entry in `botPendingSeats` would suppress
   * the new round's first decision for that seat and stall it before a tile is
   * drawn.
   */
  it('starts the next round cleanly with bot work still in flight', () => {
    const r = room('CC07', {}, 'slow');
    r.start();
    expect(drain(r).stalled).toBe(false);

    // Round over, but a bot pause from the old round may still be pending.
    expect(r.nextRound()).toBe(true);
    const { stalled } = drain(r);
    expect(stalled, 'the new round stalled').toBe(false);
    deleteRoom('CC07');
  });

  it('resumes a restored room whose claim window expired while the server was down', () => {
    const r = room('CC08', { claimWindowMs: 15_000 }, 'slow');
    r.start();
    let guard = 0;
    while (r.getState().pendingClaims === null && guard++ < 2000) {
      if (r.getState().phase === 'roundEnd') break;
      vi.advanceTimersByTime(100);
    }
    expect(r.getState().pendingClaims).not.toBeNull();

    const snap = JSON.parse(JSON.stringify(r.serialize()));
    deleteRoom('CC08');

    // The persisted deadline is an absolute timestamp and is now long past.
    vi.advanceTimersByTime(10 * 60_000);
    const restored = GameRoom.restore(snap);
    restored.resumeAfterRestore();

    const { stalled } = drain(restored);
    expect(stalled, 'a restored room stalled').toBe(false);
    deleteRoom(snap.code);
  });

  it('does not schedule two decisions for one seat', () => {
    // scheduleNext runs on every state change *and* every connect, so a client
    // reconnecting in a loop is the cheapest way to ask for duplicate work.
    const r = room('CC09', {}, 'slow');
    r.start();
    for (let i = 0; i < 50; i++) r.connect(0, fakeWs());
    // Four seats, at most one decision each, plus the persist debounce and the
    // claim deadline. Anything beyond that is duplicate scheduling.
    expect(vi.getTimerCount()).toBeLessThanOrEqual(6);
    expect(drain(r).stalled).toBe(false);
    deleteRoom('CC09');
  });
});
