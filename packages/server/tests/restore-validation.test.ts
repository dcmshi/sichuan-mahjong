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

/**
 * A snapshot with every field present and the wrong *kinds* in them. (A69)
 *
 * The check above was presence-only: `Object.keys` of a fresh game, tested for
 * `!== undefined`. Every mutation below therefore passed it and restored into
 * the live registry, and they fail in three different ways — none of which is
 * "rejected":
 *
 *  - `hand` as a **string** is the worst: no error anywhere, and `projectView`
 *    reports a 13-tile hand as 3. That is exactly the silent corruption the
 *    original comment says the validation exists to prevent.
 *  - `hand` as an **object**, or `melds` as a number, makes `projectView` throw
 *    — so the room kills every socket that touches it. And because it restored
 *    *successfully*, its row is never dropped: it comes back on every boot,
 *    which is the repeating-restore-error failure this file was written for.
 *  - `turn` or `config` as a string leaves a room that is merely inert.
 *
 * The kinds come from the same fresh-game probe the field list does, so this
 * stays self-maintaining. Fields that are `null` in a fresh game are exempt —
 * `lastDiscard` and friends are legitimately either, and a fresh deal cannot say
 * which — so the gap left is the shallow one.
 */
describe('snapshot field kinds (A69)', () => {
  const bad = (mutate: (s: Record<string, unknown>) => void, code = 'KIND') => {
    const s = startedSnapshot(code);
    mutate(s);
    return validateRoomSnapshot(s);
  };
  const state = (s: Record<string, unknown>) => s.state as Record<string, unknown>;
  const seat0 = (s: Record<string, unknown>) =>
    (state(s).players as Record<string, unknown>[])[0] as Record<string, unknown>;

  it('refuses a hand that is not an array, however plausible it looks', () => {
    // A string has a .length, which is why this one reads as a short hand
    // rather than as an error.
    expect(
      bad(s => {
        seat0(s).hand = 'abc';
      }),
    ).toContain('players[0].hand (expected array)');
    expect(
      bad(s => {
        seat0(s).hand = { 0: 1 };
      }),
    ).toContain('players[0].hand (expected array)');
  });

  it('refuses the other per-seat collections too', () => {
    expect(
      bad(s => {
        seat0(s).melds = 7;
      }),
    ).toContain('players[0].melds (expected array)');
    expect(
      bad(s => {
        seat0(s).discards = 'xx';
      }),
    ).toContain('players[0].discards (expected array)');
  });

  it('refuses a wall or a config of the wrong kind', () => {
    expect(
      bad(s => {
        state(s).wall = 'nope';
      }),
    ).toContain('state.wall (expected array)');
    expect(
      bad(s => {
        state(s).config = 'x';
      }),
    ).toContain('state.config (expected object)');
  });

  it('refuses a turn that is not a number', () => {
    expect(
      bad(s => {
        state(s).turn = 'banana';
      }),
    ).toContain('state.turn (expected number)');
  });

  it('still accepts a healthy snapshot, and the nullable fields once populated', () => {
    const s = startedSnapshot('KIND2');
    // These are null in a fresh game and objects in a live one; neither may be
    // rejected, which is why the kind check exempts them.
    state(s).lastDiscard = { tile: 4, from: 1, afterKong: false };
    seat0(s).voidedSuit = 'sou';
    seat0(s).voidDiscardTile = 12;
    expect(validateRoomSnapshot(s)).toEqual([]);
  });
});

/**
 * The envelope around `state`, which nothing looked at. (A69)
 *
 * `restore` reaches straight into `slots.map`, `isHumanSeat` and `tokens`, so a
 * row missing any of them was dropped by the try/catch — correct, but it logs
 * "restore threw" rather than naming the field, and the row's own `code` was
 * trusted over the column it was stored under.
 */
describe('snapshot envelope (A69)', () => {
  it('names a missing or short slots / isHumanSeat / tokens', () => {
    const short = startedSnapshot('ENV1');
    short.slots = short.slots.slice(0, 2);
    expect(validateRoomSnapshot(short)).toContain('slots (expected 4)');

    const noTokens = startedSnapshot('ENV2');
    noTokens.tokens = undefined;
    expect(validateRoomSnapshot(noTokens)).toContain('tokens (expected an array)');

    const noHumans = startedSnapshot('ENV3');
    noHumans.isHumanSeat = undefined;
    expect(validateRoomSnapshot(noHumans)).toContain('isHumanSeat (expected 4)');
  });

  it('refuses a snapshot that names a different code than its row', () => {
    // The row's key is authoritative. `restore` registers under `snap.code`, so
    // a disagreement puts the room in memory under one code and leaves its row
    // under another — unreachable by deleteRoom, and restored again every boot.
    const s = startedSnapshot('ROW1');
    s.code = 'OTHR';
    expect(validateRoomSnapshot(s, 'ROW1')).toContain('code (row says ROW1, snapshot says OTHR)');
    // …and it is only checked when the caller supplies the row's key.
    expect(validateRoomSnapshot(s)).toEqual([]);
  });

  it('drops a mismatched row rather than registering it under the wrong key', () => {
    const s = startedSnapshot('ROW2');
    s.code = 'OTHR';
    vi.mocked(persistence.loadLiveRooms).mockReturnValue([{ code: 'ROW2', snapshot: s }]);

    expect(restoreRoomsFromDisk()).toBe(0);
    expect(getRoom('ROW2')).toBeUndefined();
    expect(getRoom('OTHR'), 'registered under the snapshot’s own code').toBeUndefined();
    expect(vi.mocked(persistence.deleteLiveRoom)).toHaveBeenCalledWith('ROW2');
  });

  it('drops a kind-corrupt row instead of restoring it on every boot', () => {
    const s = startedSnapshot('BOOT');
    (s.state.players as Record<string, unknown>[])[0]!.hand = 'abc';
    vi.mocked(persistence.loadLiveRooms).mockReturnValue([{ code: 'BOOT', snapshot: s }]);

    expect(restoreRoomsFromDisk()).toBe(0);
    expect(getRoom('BOOT')).toBeUndefined();
    // Dropped from disk, so the next boot does not meet it again.
    expect(vi.mocked(persistence.deleteLiveRoom)).toHaveBeenCalledWith('BOOT');
  });
});
