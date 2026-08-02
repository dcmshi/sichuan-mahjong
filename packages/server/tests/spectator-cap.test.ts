import { describe, expect, it, vi } from 'vitest';
// node:sqlite is a native built-in; Vite 5 can't bundle it — mock before any imports touch it
vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(),
  getGame: vi.fn().mockReturnValue(null),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn().mockReturnValue([]),
  deleteLiveRoom: vi.fn(),
}));
import type { WebSocket } from '@fastify/websocket';
import { MAX_SPECTATORS, createRoom } from '../src/room.js';
import type { RoomSlot } from '../src/room.js';

const BOT_SLOTS: RoomSlot[] = [0, 1, 2, 3].map(i => ({
  name: `Bot ${i}`,
  isBot: true,
  connected: false,
}));

// The room only ever calls `send` on an OPEN socket, and these never open, so a
// stub with a closed readyState is enough to exercise the ceiling.
const fakeSocket = () => ({ readyState: 0, send: () => {} }) as unknown as WebSocket;

describe('spectator ceiling (L1)', () => {
  it('accepts spectators up to MAX_SPECTATORS and refuses the next', () => {
    const room = createRoom('SPCA', BOT_SLOTS);
    const accepted = Array.from({ length: MAX_SPECTATORS }, () => room.addSpectator(fakeSocket()));
    expect(accepted.every(Boolean)).toBe(true);
    expect(room.addSpectator(fakeSocket())).toBe(false);
  });

  it('frees a slot when a spectator leaves', () => {
    const room = createRoom('SPCB', BOT_SLOTS);
    const held = Array.from({ length: MAX_SPECTATORS }, () => {
      const ws = fakeSocket();
      room.addSpectator(ws);
      return ws;
    });
    expect(room.addSpectator(fakeSocket())).toBe(false);
    room.removeSpectator(held[0] as WebSocket);
    expect(room.addSpectator(fakeSocket())).toBe(true);
  });

  it('caps each room independently', () => {
    const a = createRoom('SPCC', BOT_SLOTS);
    const b = createRoom('SPCD', BOT_SLOTS);
    for (let i = 0; i < MAX_SPECTATORS; i++) a.addSpectator(fakeSocket());
    expect(a.addSpectator(fakeSocket())).toBe(false);
    expect(b.addSpectator(fakeSocket())).toBe(true);
  });
});
