import { describe, expect, it, vi } from 'vitest';
import { createLobby, getLobby } from '../src/lobby.js';
import { createRoom, getRoom, sweepIdleRooms } from '../src/room.js';
import type { RoomSlot } from '../src/room.js';
import { issueToken, resolveToken } from '../src/tokens.js';
import { sweepStaleLobbies } from '../src/ws.js';

const HOUR = 60 * 60_000;

const BOT_SLOTS: RoomSlot[] = [0, 1, 2, 3].map(i => ({
  name: `Bot ${i}`,
  isBot: true,
  connected: false,
}));

describe('stale-state GC (A29)', () => {
  it('sweeps an old never-started lobby and revokes its tokens', () => {
    const hostToken = issueToken('__pending__', 0, 'host');
    const lobby = createLobby(hostToken);
    const data = resolveToken(hostToken);
    if (data) data.code = lobby.code;
    lobby.createdAt = Date.now() - 3 * HOUR;

    expect(sweepStaleLobbies(2 * HOUR)).toBe(1);
    expect(getLobby(lobby.code)).toBeUndefined();
    expect(resolveToken(hostToken)).toBeUndefined();
  });

  it('spares young lobbies and lobbies with a connected human', () => {
    const young = createLobby(issueToken('__pending__', 0, 'host'));

    const occupied = createLobby(issueToken('__pending__', 0, 'host'));
    occupied.createdAt = Date.now() - 3 * HOUR;
    occupied.slots[1] = {
      name: 'Ada',
      isBot: false,
      token: issueToken(occupied.code, 1, 'player'),
      connected: true,
    };

    sweepStaleLobbies(2 * HOUR);
    expect(getLobby(young.code)).toBeDefined();
    expect(getLobby(occupied.code)).toBeDefined();
  });

  it('ends rooms idle past the TTL and spares active ones', () => {
    const room = createRoom('GC29', BOT_SLOTS);
    const token = issueToken('GC29', 1, 'player');

    // Fresh room, generous TTL → survives.
    expect(sweepIdleRooms(24 * HOUR)).toBe(0);
    expect(getRoom('GC29')).toBe(room);

    // Evaluate 25h in the future: now idle past the TTL → torn down.
    expect(sweepIdleRooms(24 * HOUR, Date.now() + 25 * HOUR)).toBe(1);
    expect(getRoom('GC29')).toBeUndefined();
    expect(resolveToken(token)).toBeUndefined();
  });
});

/**
 * A stall and an abandonment look the same to the sweep unless it looks. (A80)
 *
 * A68 was a room with `turnDrawNeeded` true and no timer pending: nothing owed
 * the table a move, nothing was rejected, nothing was logged. It is fixed, but
 * the class is not — and the idle sweep is the only thing that ever meets such
 * a room. This is what makes the next one findable in a log search rather than
 * arriving months later as "the game froze once".
 */
describe('the sweep distinguishes a stall from an abandonment (A80)', () => {
  const fakeWs = () =>
    ({ readyState: 1, OPEN: 1, send() {} }) as unknown as import('@fastify/websocket').WebSocket;

  it('reports an unfinished round with players connected as an error', () => {
    const room = createRoom('STAL', [
      { name: 'Human', isBot: false, connected: false },
      { name: 'B1', isBot: true, connected: false },
      { name: 'B2', isBot: true, connected: false },
      { name: 'B3', isBot: true, connected: false },
    ]);
    room.connect(0, fakeWs());
    room.start();

    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation(m => void errors.push(String(m)));
    try {
      // Far past the TTL. The room registry is module-level and shared with the
      // other suites in this file, so assert on *this* room rather than on a
      // count that depends on what else happens to be registered.
      expect(sweepIdleRooms(0, Date.now() + 10 * 60 * 60_000)).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
    expect(errors.join('\n')).toMatch(/STAL.*still in.*1 player/s);
  });

  it('keeps an ordinary abandonment at log level', () => {
    const room = createRoom('ABND', [
      { name: 'B0', isBot: true, connected: false },
      { name: 'B1', isBot: true, connected: false },
      { name: 'B2', isBot: true, connected: false },
      { name: 'B3', isBot: true, connected: false },
    ]);
    room.start();

    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation(m => void errors.push(String(m)));
    try {
      sweepIdleRooms(0, Date.now() + 10 * 60 * 60_000);
    } finally {
      spy.mockRestore();
    }
    // Nobody was connected, so nobody was left waiting — housekeeping, not a bug.
    expect(errors.filter(e => e.includes('ABND'))).toEqual([]);
  });
});
