import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { GameAction, GameConfig, GameState } from '@sichuan-mahjong/engine';
import type { FanEntry, RoundResult } from '@sichuan-mahjong/engine';

// `node:sqlite` is loaded lazily (type-only import above; value via require below).
// A static value import would be evaluated at module load, so a runtime that lacks
// node:sqlite (e.g. a Bun-compiled binary on an older Bun) would crash the whole
// server on boot rather than merely losing persistence. Lazy-loading lets the game
// run with persistence disabled instead. (A17)
const nodeRequire = createRequire(import.meta.url);

function dataDir(): string {
  // Allow CLI --data-dir override via env var set before first DB access
  if (process.env.SICHUAN_DATA_DIR) return process.env.SICHUAN_DATA_DIR;
  const p = platform();
  if (p === 'win32') {
    return join(process.env.APPDATA ?? homedir(), 'sichuan-mahjong');
  }
  if (p === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'sichuan-mahjong');
  }
  const xdg = process.env.XDG_DATA_HOME;
  return join(xdg ?? join(homedir(), '.local', 'share'), 'sichuan-mahjong');
}

const DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  seed        TEXT NOT NULL,
  config_json TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL,
  action_log  TEXT NOT NULL,
  results     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_started ON games(started_at);

CREATE TABLE IF NOT EXISTS live_rooms (
  code          TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  updated_at    INTEGER NOT NULL
);
`;

let db: DatabaseSync | null = null;
let dbInitFailed = false;

/** The SQLite handle, or null if node:sqlite is unavailable (persistence disabled). */
export function getDb(): DatabaseSync | null {
  if (db !== null || dbInitFailed) return db;
  try {
    const { DatabaseSync } = nodeRequire('node:sqlite') as {
      DatabaseSync: new (path: string) => DatabaseSync;
    };
    const dir = dataDir();
    mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(join(dir, 'games.db'));
    db.exec(DB_SCHEMA);
    return db;
  } catch (err) {
    dbInitFailed = true;
    console.error(
      '[persistence] node:sqlite unavailable — persistence disabled:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export type GameRecord = {
  id: number;
  code: string;
  seed: string;
  config: GameConfig;
  startedAt: number;
  endedAt: number;
  actionLog: GameAction[];
  results: RoundResult;
};

export function saveGameWithCode(code: string, state: GameState, results: RoundResult): number {
  const database = getDb();
  if (!database) return -1;
  const stmt = database.prepare(
    'INSERT INTO games (code, seed, config_json, started_at, ended_at, action_log, results) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const info = stmt.run(
    code,
    state.seed,
    JSON.stringify(state.config),
    state.startedAt,
    Date.now(),
    JSON.stringify(state.history),
    JSON.stringify(results),
  ) as { lastInsertRowid: number | bigint };
  return Number(info.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Live-room snapshots — survive a server restart (host-shutdown resume)
// ---------------------------------------------------------------------------

/** Persist (or replace) the live snapshot for an in-progress room. */
export function saveLiveRoom(code: string, snapshot: unknown): void {
  const database = getDb();
  if (!database) return;
  database
    .prepare(
      'INSERT INTO live_rooms (code, snapshot_json, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(code) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at',
    )
    .run(code, JSON.stringify(snapshot), Date.now());
}

/**
 * Load all persisted live-room snapshots (called once at server boot).
 *
 * **Parsed per row, because one unreadable row must not take the others with
 * it.** `restoreRoomsFromDisk` drops a row it cannot use, precisely so a bad one
 * cannot fail on every boot forever — and that logic never got to run, because
 * this mapped `JSON.parse` over every row in one expression. A single truncated
 * `snapshot_json` (a half-finished write, a corrupted file) threw before any
 * per-row handling, the caller's try/catch turned it into "restored 0 rooms",
 * and every healthy game on the disk was lost with it. Nothing was dropped
 * either, so the next boot did the same thing. (A69)
 *
 * An unreadable row comes back with a `null` snapshot rather than being skipped
 * here: validation refuses it by name and the restore loop deletes it, which
 * keeps the decision to drop a row in the one place that already makes it.
 */
export function loadLiveRooms(): Array<{ code: string; snapshot: unknown }> {
  const database = getDb();
  if (!database) return [];
  const rows = database.prepare('SELECT code, snapshot_json FROM live_rooms').all() as Array<{
    code: string;
    snapshot_json: string;
  }>;
  return rows.map(r => {
    try {
      return { code: r.code, snapshot: JSON.parse(r.snapshot_json) as unknown };
    } catch (err) {
      console.error(
        `[persistence] Unreadable snapshot for room ${r.code}:`,
        err instanceof Error ? err.message : err,
      );
      return { code: r.code, snapshot: null };
    }
  });
}

export function deleteLiveRoom(code: string): void {
  const database = getDb();
  if (!database) return;
  database.prepare('DELETE FROM live_rooms WHERE code = ?').run(code);
}

/**
 * Replay rows written before `HuRecord.fans` became structured hold display
 * strings like "AllPungs×2". Parse them back on read rather than migrating the
 * table: the games table is read-only history, and a migration would rewrite a
 * user's file to fix something only the replay endpoint ever looks at.
 */
export function normalizeFans(fans: unknown): FanEntry[] {
  if (!Array.isArray(fans)) return [];
  return fans.map(f => {
    if (typeof f === 'object' && f !== null && 'fan' in f) return f as FanEntry;
    const [name, mult] = String(f).split('×');
    return { fan: name as FanEntry['fan'], count: mult ? Number(mult) : 1 };
  });
}

function withNormalizedFans(results: RoundResult): RoundResult {
  return {
    ...results,
    players: results.players.map(p =>
      p.hu ? { ...p, hu: { ...p.hu, fans: normalizeFans(p.hu.fans) } } : p,
    ),
  };
}

export function getGame(id: number): GameRecord | null {
  const database = getDb();
  if (!database) return null;
  const row = database.prepare('SELECT * FROM games WHERE id = ?').get(id) as
    | {
        id: number;
        code: string;
        seed: string;
        config_json: string;
        started_at: number;
        ended_at: number;
        action_log: string;
        results: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    seed: row.seed,
    config: JSON.parse(row.config_json) as GameConfig,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    actionLog: JSON.parse(row.action_log) as GameAction[],
    results: withNormalizedFans(JSON.parse(row.results) as RoundResult),
  };
}
