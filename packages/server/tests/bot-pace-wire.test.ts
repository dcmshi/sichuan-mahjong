import type { ServerMsg } from '@sichuan-mahjong/engine';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { type BotSpeed, type RoomSlot, createRoom, isBotPacePinned } from '../src/room.js';

/**
 * The pace has to reach the client, which is the half that was missing. (N24)
 *
 * `GameRoom.getBotSpeed()` existed with a comment saying it was there "so a
 * joining or reconnecting client can show the right one", and had no callers —
 * so the ⚙ menu displayed a hardcoded 'normal' whatever the host had chosen.
 * These assert the value is on the wire, which is the only thing that closes it:
 * the room storing the right speed was never in doubt.
 */

const SLOTS: RoomSlot[] = [
  { name: 'You', isBot: false, connected: false },
  ...([1, 2, 3] as const).map(i => ({
    name: `Bot ${i + 1}`,
    isBot: true,
    connected: true,
    difficulty: 'easy' as const,
  })),
];

/** Captures what the room sends, which is the thing under test. */
function recorder() {
  const sent: ServerMsg[] = [];
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (raw: string) => sent.push(JSON.parse(raw) as ServerMsg),
  } as unknown as WebSocket;
  return { ws, sent, views: () => sent.filter(m => m.t === 'view') };
}

const rooms: ReturnType<typeof createRoom>[] = [];

/** Every room here starts, so every room here schedules bots. Leave none running. */
afterEach(() => {
  for (const room of rooms.splice(0)) room.endMatch();
});

function startedRoom(code: string, botSpeed?: BotSpeed) {
  const room = createRoom(code, SLOTS, {}, botSpeed);
  rooms.push(room);
  room.start();
  return room;
}

describe('the view push carries the bot pace', () => {
  it('reports the speed the lobby chose, not the default', () => {
    const room = startedRoom('BPW1', 'slow');
    const { ws, views } = recorder();
    room.connect(0, ws);

    const first = views()[0];
    expect(first?.t === 'view' && first.botPace.speed).toBe('slow');
  });

  it('reports it on the reconnect push too — the case the menu got wrong', () => {
    // A remount reset the old local state to 'normal', so a reconnecting host
    // saw the wrong pace even when the lobby value had been right on screen a
    // moment earlier.
    const room = startedRoom('BPW2', 'fast');
    const a = recorder();
    room.connect(0, a.ws);
    room.disconnect(0);
    const b = recorder();
    room.connect(0, b.ws);

    const rejoin = b.views()[0];
    expect(rejoin?.t === 'view' && rejoin.botPace.speed).toBe('fast');
  });

  it('re-pushes on a mid-match repace, rather than waiting for the next bot move', () => {
    // Without the push the host taps and nothing changes until a bot moves —
    // up to 1.8s away on slow, which is the setting most likely to be chosen.
    const room = startedRoom('BPW3', 'fast');
    const { ws, views } = recorder();
    room.connect(0, ws);
    const before = views().length;

    expect(room.setBotSpeed('slow')).toBe(true);

    const after = views();
    expect(after.length).toBeGreaterThan(before);
    const latest = after.at(-1);
    expect(latest?.t === 'view' && latest.botPace.speed).toBe('slow');
    expect(room.getBotSpeed()).toBe('slow');
  });

  it('says the pace is pinned when the process overrides it', () => {
    // This suite runs under SM_BOT_DELAY_MS=150 (vitest.config.ts), so pinned is
    // the branch reachable here — and it is the one no other test can reach at
    // all, since there is deliberately no way to un-pin an override at runtime.
    expect(isBotPacePinned()).toBe(true);

    const room = startedRoom('BPW4', 'normal');
    const { ws, views } = recorder();
    room.connect(0, ws);

    const first = views()[0];
    expect(first?.t === 'view' && first.botPace.pinned).toBe(true);
    // The host's choice still travels: the client greys the control rather than
    // showing a speed nobody picked.
    expect(first?.t === 'view' && first.botPace.speed).toBe('normal');
  });
});
