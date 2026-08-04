import { beforeEach, describe, expect, it, vi } from 'vitest';

// Persistence is mocked the same way `restore-validation.test.ts` does it: the
// snapshots this suite restores are handed straight to `loadLiveRooms`, so no
// database is involved and the disk is never touched.
const snapshots: Array<{ code: string; snapshot: unknown }> = [];

vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(() => 1),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn(() => snapshots),
  deleteLiveRoom: vi.fn(),
  getGame: vi.fn(),
  getDb: vi.fn(() => null),
}));

const { GameRoom, restoreRoomsFromDisk, getRoom, deleteRoom } = await import('../src/room.js');
const { issueToken, issueWatchToken, isWatchToken, resolveToken } = await import(
  '../src/tokens.js'
);

function startedRoom(code: string) {
  const room = new GameRoom(code, [
    { name: 'B0', isBot: true, connected: false },
    { name: 'B1', isBot: true, connected: false },
    { name: 'B2', isBot: true, connected: false },
    { name: 'B3', isBot: true, connected: false },
  ]);
  room.start();
  return room;
}

/**
 * What a process restart looks like to these module-level stores: the room and
 * both token maps are gone, and only the snapshot survives. `deleteRoom` calls
 * `revokeTokensForCode`, which empties both — the same starting point a fresh
 * process has.
 */
function restart(code: string, snapshot: unknown) {
  deleteRoom(code);
  snapshots.length = 0;
  snapshots.push({ code, snapshot });
}

beforeEach(() => {
  snapshots.length = 0;
});

describe('tokens across a host restart (A41)', () => {
  it('restores the watch token alongside the seat tokens', () => {
    const code = 'WTC1';
    const watch = issueWatchToken(code);
    const seatToken = issueToken(code, 0, 'host');
    const room = startedRoom(code);
    const snap = JSON.parse(JSON.stringify(room.serialize()));

    restart(code, snap);
    // Both stores are empty now — this is the state the bug left permanent.
    expect(isWatchToken(code, watch)).toBe(false);
    expect(resolveToken(seatToken)).toBeUndefined();

    expect(restoreRoomsFromDisk()).toBe(1);
    expect(getRoom(code)).toBeDefined();

    // The seat token came back before A41 too; the watch token did not, so a
    // restart closed every spectator socket with `no_game` on a room the
    // players were rejoining fine.
    expect(resolveToken(seatToken)).toMatchObject({ code, seat: 0, role: 'host' });
    expect(isWatchToken(code, watch)).toBe(true);

    deleteRoom(code);
  });

  it('carries the watch token in the snapshot', () => {
    const code = 'WTC2';
    const watch = issueWatchToken(code);
    const room = startedRoom(code);

    expect(room.serialize().watchToken).toBe(watch);

    deleteRoom(code);
  });

  it('restores a room whose snapshot predates the field', () => {
    const code = 'WTC3';
    issueWatchToken(code);
    const room = startedRoom(code);
    const snap = JSON.parse(JSON.stringify(room.serialize()));
    // A snapshot written before A41 has no `watchToken` at all. It must still
    // restore — with spectating unavailable, which is what it had before.
    snap.watchToken = undefined;

    restart(code, snap);
    expect(restoreRoomsFromDisk()).toBe(1);
    expect(getRoom(code)).toBeDefined();

    deleteRoom(code);
  });

  it('restores a room that never issued a watch token', () => {
    // Only `POST /api/lobby` issues one, so a room built any other way has none
    // and `serialize` writes `undefined` rather than inventing a secret.
    const code = 'WTC4';
    const room = startedRoom(code);
    expect(room.serialize().watchToken).toBeUndefined();
    const snap = JSON.parse(JSON.stringify(room.serialize()));

    restart(code, snap);
    expect(restoreRoomsFromDisk()).toBe(1);
    expect(isWatchToken(code, 'anything')).toBe(false);

    deleteRoom(code);
  });

  it('does not let a restored watch token be used as a seat token', () => {
    // The two stores are separate precisely so a spectator secret can never
    // resolve to a chair (see `tokens.ts`). Restoring must not merge them.
    const code = 'WTC5';
    const watch = issueWatchToken(code);
    const room = startedRoom(code);
    const snap = JSON.parse(JSON.stringify(room.serialize()));

    restart(code, snap);
    restoreRoomsFromDisk();

    expect(isWatchToken(code, watch)).toBe(true);
    expect(resolveToken(watch)).toBeUndefined();

    deleteRoom(code);
  });
});
