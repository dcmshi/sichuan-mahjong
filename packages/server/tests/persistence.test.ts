import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame } from '@sichuan-mahjong/engine';
import type { RoundResult } from '@sichuan-mahjong/engine';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The SQLite layer, against a real `node:sqlite` database. (A48)
 *
 * Every other server suite `vi.mock`s this module wholesale — reasonably, since
 * they are testing rooms and sockets — with the result that the schema, the
 * round-trips and the `normalizeFans` read migration had never executed in CI.
 * A41's bug lived one layer above this one, in the restore path these rows feed.
 *
 * `SICHUAN_DATA_DIR` has to be set before the first `getDb()`, which caches its
 * handle in a module-level binding — hence the env var before the dynamic import.
 */
const dir = mkdtempSync(join(tmpdir(), 'sm-persistence-'));
process.env.SICHUAN_DATA_DIR = dir;

const { getDb, saveGameWithCode, saveLiveRoom, loadLiveRooms, deleteLiveRoom, getGame } =
  await import('../src/persistence.js');

afterAll(() => {
  try {
    getDb()?.close();
  } catch {
    /* already closed */
  }
  rmSync(dir, { recursive: true, force: true });
});

function freshState() {
  return createGame('persist-seed', [
    { name: 'Ann', isBot: false },
    { name: 'Bo', isBot: true },
    { name: 'Cy', isBot: true },
    { name: 'Di', isBot: true },
  ]);
}

function emptyResult(roundIndex = 0): RoundResult {
  return {
    roundIndex,
    dealer: 0,
    players: [0, 1, 2, 3].map(seat => ({
      seat: seat as 0 | 1 | 2 | 3,
      name: `P${seat}`,
      scoreDelta: 0,
      hu: null,
      hand: [],
      melds: [],
      isReady: false,
      ledger: [],
    })),
  };
}

describe('the SQLite layer', () => {
  it('opens a database and creates both tables', () => {
    const db = getDb();
    expect(db).not.toBeNull();
    const names = (
      db!.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map(r => r.name);
    expect(names).toContain('games');
    expect(names).toContain('live_rooms');
  });

  it('round-trips a finished game', () => {
    const state = freshState();
    const id = saveGameWithCode('AB12', state, emptyResult(2));
    expect(id).toBeGreaterThan(0);

    const row = getGame(id);
    expect(row).not.toBeNull();
    expect(row!.code).toBe('AB12');
    expect(row!.seed).toBe(state.seed);
    // The config is stored as JSON, so this is what proves it survives the trip
    // rather than coming back as a string.
    expect(row!.config).toEqual(state.config);
    expect(row!.startedAt).toBe(state.startedAt);
    expect(row!.endedAt).toBeGreaterThanOrEqual(state.startedAt);
    expect(row!.actionLog).toEqual(state.history);
    expect(row!.results.roundIndex).toBe(2);
  });

  it('returns null for an id that was never written', () => {
    expect(getGame(999_999)).toBeNull();
  });

  // The read migration, through the database rather than as a unit. Rows written
  // before `HuRecord.fans` became structured hold the display form the engine
  // used to bake in; they are parsed back on read rather than migrated, because
  // the games table is read-only history.
  it('parses a legacy fans array back into entries on read', () => {
    const state = freshState();
    const legacy = emptyResult();
    legacy.players[0]!.hu = {
      seat: 0,
      subtype: 'normal',
      fans: ['AllPungs×2', 'Kong'] as unknown as never,
      handValue: 8,
      winningTile: 0,
      byDiscard: false,
      discarder: null,
      shape: null,
    } as (typeof legacy.players)[number]['hu'];

    const id = saveGameWithCode('LEG1', state, legacy);
    expect(getGame(id)!.results.players[0]!.hu!.fans).toEqual([
      { fan: 'AllPungs', count: 2 },
      { fan: 'Kong', count: 1 },
    ]);
  });

  // A seat with no `hu` must survive the same pass untouched — the migration maps
  // over every player, and a null there is the common case.
  it('leaves a seat that did not win alone', () => {
    const id = saveGameWithCode('LEG2', freshState(), emptyResult());
    expect(getGame(id)!.results.players.every(p => p.hu === null)).toBe(true);
  });
});

describe('live-room snapshots', () => {
  it('writes, reads back and deletes a snapshot', () => {
    saveLiveRoom('RM01', { code: 'RM01', hello: 'world' });
    const rows = loadLiveRooms();
    expect(rows.find(r => r.code === 'RM01')?.snapshot).toEqual({ code: 'RM01', hello: 'world' });

    deleteLiveRoom('RM01');
    expect(loadLiveRooms().find(r => r.code === 'RM01')).toBeUndefined();
  });

  // The room persists on a debounce and re-persists on every state change, so the
  // same code is written many times a round. `ON CONFLICT DO UPDATE` is what keeps
  // that from being a primary-key violation on the second push.
  it('replaces an existing snapshot rather than failing on the key', () => {
    saveLiveRoom('RM02', { turn: 1 });
    saveLiveRoom('RM02', { turn: 2 });
    const matching = loadLiveRooms().filter(r => r.code === 'RM02');
    expect(matching).toHaveLength(1);
    expect(matching[0]!.snapshot).toEqual({ turn: 2 });
    deleteLiveRoom('RM02');
  });

  it('deleting an absent code is a no-op', () => {
    expect(() => deleteLiveRoom('NOPE')).not.toThrow();
  });

  // What `restoreRoomsFromDisk` actually consumes: a real room snapshot, JSON
  // round-tripped through the column and back.
  it('carries a real game state through the column', () => {
    const state = freshState();
    saveLiveRoom('RM03', { code: 'RM03', state, slots: [], isHumanSeat: [], tokens: [] });
    const back = loadLiveRooms().find(r => r.code === 'RM03')!.snapshot as { state: typeof state };
    expect(back.state.seed).toBe(state.seed);
    expect(back.state.wall).toEqual(state.wall);
    expect(back.state.players[0]!.hand).toEqual(state.players[0]!.hand);
    deleteLiveRoom('RM03');
  });
});

/**
 * One unreadable row must not take the others with it. (A69)
 *
 * `restoreRoomsFromDisk` drops a row it cannot use, precisely so a bad one
 * cannot fail on every boot forever. That logic never gets to run if the *parse*
 * fails first: `loadLiveRooms` mapped `JSON.parse` over every row in one
 * expression, so a single truncated `snapshot_json` — a half-finished write, a
 * corrupted file — threw before any per-row handling, and the caller's own
 * try/catch turned it into "restored 0 rooms". Every healthy game on the disk
 * lost, and nothing dropped, so the next boot did it again.
 */
describe('a corrupt row (A69)', () => {
  it('does not stop the healthy rows loading', () => {
    const db = getDb();
    if (!db) return; // node:sqlite unavailable — the suite above already skips
    saveLiveRoom('GOOD', { code: 'GOOD', state: freshState() });
    db.prepare(
      'INSERT OR REPLACE INTO live_rooms (code, snapshot_json, updated_at) VALUES (?, ?, ?)',
    ).run('TRNC', '{"code":"TRNC","state":{"pha', Date.now());

    const rows = loadLiveRooms();
    expect(rows.map(r => r.code).sort()).toEqual(['GOOD', 'TRNC']);
    // The unreadable one comes back as a null snapshot, which validation
    // refuses by name and the restore loop then drops from disk.
    expect(rows.find(r => r.code === 'TRNC')?.snapshot).toBeNull();
    expect(rows.find(r => r.code === 'GOOD')?.snapshot).not.toBeNull();

    deleteLiveRoom('GOOD');
    deleteLiveRoom('TRNC');
  });
});
