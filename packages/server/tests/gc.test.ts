import { describe, expect, it } from 'vitest';
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
