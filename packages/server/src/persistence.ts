import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import type { GameState, GameConfig, GameAction } from '@sichuan-mahjong/engine';
import type { RoundResult } from '@sichuan-mahjong/engine';

function dataDir(): string {
  // Allow CLI --data-dir override via env var set before first DB access
  if (process.env['SICHUAN_DATA_DIR']) return process.env['SICHUAN_DATA_DIR'];
  const p = platform();
  if (p === 'win32') {
    return join(process.env['APPDATA'] ?? homedir(), 'sichuan-mahjong');
  }
  if (p === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'sichuan-mahjong');
  }
  const xdg = process.env['XDG_DATA_HOME'];
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

export function getDb(): DatabaseSync {
  if (db !== null) return db;
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(join(dir, 'games.db'));
  db.exec(DB_SCHEMA);
  return db;
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

export function saveGameWithCode(
  code: string,
  state: GameState,
  results: RoundResult,
): number {
  const database = getDb();
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
  database
    .prepare(
      'INSERT INTO live_rooms (code, snapshot_json, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(code) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at',
    )
    .run(code, JSON.stringify(snapshot), Date.now());
}

/** Load all persisted live-room snapshots (called once at server boot). */
export function loadLiveRooms(): Array<{ code: string; snapshot: unknown }> {
  const database = getDb();
  const rows = database.prepare('SELECT code, snapshot_json FROM live_rooms').all() as Array<{
    code: string;
    snapshot_json: string;
  }>;
  return rows.map(r => ({ code: r.code, snapshot: JSON.parse(r.snapshot_json) as unknown }));
}

export function deleteLiveRoom(code: string): void {
  const database = getDb();
  database.prepare('DELETE FROM live_rooms WHERE code = ?').run(code);
}

export function getGame(id: number): GameRecord | null {
  const database = getDb();
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
    results: JSON.parse(row.results) as RoundResult,
  };
}
