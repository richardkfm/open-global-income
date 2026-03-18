import Database from 'better-sqlite3';
import path from 'node:path';

let db: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'standard', 'premium')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    api_key_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    api_key_id TEXT,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms REAL,
    ip TEXT,
    user_agent TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_log_api_key ON audit_log(api_key_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
`;

export function getDb(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath =
    dbPath ?? process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'ogi.sqlite');

  // Ensure the data directory exists
  const dir = path.dirname(resolvedPath);
  import('node:fs').then((fs) => {
    fs.mkdirSync(dir, { recursive: true });
  });

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  return db;
}

/** Initialize with an in-memory database (for testing) */
export function getTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(SCHEMA);
  db = testDb;
  return testDb;
}

/** Close and reset the database connection */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
