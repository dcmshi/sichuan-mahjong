import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(() => 1),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn(() => []),
  deleteLiveRoom: vi.fn(),
  getGame: vi.fn(),
  getDb: vi.fn(() => null),
}));

const { GameRoom, restoreRoomsFromDisk, getRoom, validateRoomSnapshot } = await import(
  '../src/room.js'
);
const persistence = await import('../src/persistence.js');

function startedSnapshot(code: string) {
  const room = new GameRoom(code, [
    { name: 'B0', isBot: true, connected: false },
    { name: 'B1', isBot: true, connected: false },
    { name: 'B2', isBot: true, connected: false },
    { name: 'B3', isBot: true, connected: false },
  ]);
  room.start();
  return JSON.parse(JSON.stringify(room.serialize()));
}

beforeEach(() => {
  vi.mocked(persistence.deleteLiveRoom).mockClear();
  vi.mocked(persistence.loadLiveRooms).mockReset();
});

describe('snapshot validation on restore', () => {
  it('accepts a snapshot written by the current version', () => {
    expect(validateRoomSnapshot(startedSnapshot('OK01'))).toEqual([]);
  });

  it('defaults a missing ledger rather than rejecting the room', () => {
    // The one field where an empty default is safe: the round loses its payment
    // breakdown, nothing else changes.
    const snap = startedSnapshot('LDG1');
    snap.state.ledger = undefined;
    expect(validateRoomSnapshot(snap)).toEqual([]);
  });

  it('names every state field the snapshot is missing', () => {
    const snap = startedSnapshot('BAD1');
    snap.state.turn = undefined;
    snap.state.drawIndex = undefined;
    expect(validateRoomSnapshot(snap).sort()).toEqual(['state.drawIndex', 'state.turn']);
  });

  it('names missing player fields, which corrupt a hand silently', () => {
    // pendingFirstDiscard was renamed in A35; an older snapshot restores it as
    // undefined, which reads as "has a pending tile" and soft-locks the seat.
    const snap = startedSnapshot('BAD2');
    snap.state.players[2].pendingFirstDiscard = undefined;
    expect(validateRoomSnapshot(snap)).toEqual(['players[2].pendingFirstDiscard']);
  });

  it('rejects a structurally wrong snapshot instead of throwing', () => {
    expect(validateRoomSnapshot(null).length).toBeGreaterThan(0);
    expect(validateRoomSnapshot({ state: null }).length).toBeGreaterThan(0);
    const short = startedSnapshot('BAD3');
    short.state.players = short.state.players.slice(0, 3);
    expect(validateRoomSnapshot(short)).toContain('state.players (expected 4)');
  });
});

describe('restoreRoomsFromDisk', () => {
  it('skips an incompatible room and drops its row so it cannot fail forever', () => {
    const bad = startedSnapshot('OLD1');
    bad.state.turn = undefined;
    vi.mocked(persistence.loadLiveRooms).mockReturnValue([{ code: 'OLD1', snapshot: bad }]);

    expect(restoreRoomsFromDisk()).toBe(0);
    expect(getRoom('OLD1')).toBeUndefined();
    expect(vi.mocked(persistence.deleteLiveRoom)).toHaveBeenCalledWith('OLD1');
  });

  it('still restores the healthy rooms alongside an incompatible one', () => {
    const bad = startedSnapshot('OLD2');
    bad.state.turn = undefined;
    const good = startedSnapshot('NEW2');
    vi.mocked(persistence.loadLiveRooms).mockReturnValue([
      { code: 'OLD2', snapshot: bad },
      { code: 'NEW2', snapshot: good },
    ]);

    expect(restoreRoomsFromDisk()).toBe(1);
    expect(getRoom('NEW2')).toBeDefined();
    expect(getRoom('OLD2')).toBeUndefined();
  });
});
