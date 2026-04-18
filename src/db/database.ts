import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

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

  CREATE TABLE IF NOT EXISTS simulations (
    id TEXT PRIMARY KEY,
    name TEXT,
    country_code TEXT NOT NULL,
    parameters TEXT NOT NULL,
    results TEXT NOT NULL,
    api_key_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
  );

  CREATE INDEX IF NOT EXISTS idx_simulations_country ON simulations(country_code);
  CREATE INDEX IF NOT EXISTS idx_simulations_api_key ON simulations(api_key_id);

  CREATE TABLE IF NOT EXISTS disbursement_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('mobile_money', 'bank_transfer', 'crypto')),
    provider TEXT NOT NULL,
    country_code TEXT,
    config TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS disbursements (
    id TEXT PRIMARY KEY,
    simulation_id TEXT,
    channel_id TEXT NOT NULL,
    country_code TEXT NOT NULL,
    recipient_count INTEGER NOT NULL,
    amount_per_recipient TEXT NOT NULL,
    total_amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK(status IN ('draft','approved','processing','completed','failed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at TEXT,
    completed_at TEXT,
    api_key_id TEXT,
    external_id TEXT,
    FOREIGN KEY (channel_id) REFERENCES disbursement_channels(id),
    FOREIGN KEY (simulation_id) REFERENCES simulations(id),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
  );

  CREATE TABLE IF NOT EXISTS disbursement_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    disbursement_id TEXT NOT NULL,
    event TEXT NOT NULL,
    details TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (disbursement_id) REFERENCES disbursements(id)
  );

  CREATE INDEX IF NOT EXISTS idx_disbursements_status ON disbursements(status);
  CREATE INDEX IF NOT EXISTS idx_disbursements_channel ON disbursements(channel_id);
  CREATE INDEX IF NOT EXISTS idx_disbursement_log_id ON disbursement_log(disbursement_id);

  CREATE TABLE IF NOT EXISTS pilots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    description TEXT,
    simulation_id TEXT,
    targeting_rules TEXT,
    status TEXT NOT NULL DEFAULT 'planning'
      CHECK(status IN ('planning','active','paused','completed')),
    start_date TEXT,
    end_date TEXT,
    target_recipients INTEGER,
    api_key_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (simulation_id) REFERENCES simulations(id),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
  );

  CREATE TABLE IF NOT EXISTS pilot_disbursements (
    pilot_id TEXT NOT NULL,
    disbursement_id TEXT NOT NULL,
    PRIMARY KEY (pilot_id, disbursement_id),
    FOREIGN KEY (pilot_id) REFERENCES pilots(id),
    FOREIGN KEY (disbursement_id) REFERENCES disbursements(id)
  );

  CREATE INDEX IF NOT EXISTS idx_pilots_country ON pilots(country_code);
  CREATE INDEX IF NOT EXISTS idx_pilots_status ON pilots(status);

  CREATE TABLE IF NOT EXISTS funding_scenarios (
    id TEXT PRIMARY KEY,
    name TEXT,
    simulation_id TEXT,
    country_code TEXT NOT NULL,
    mechanisms TEXT NOT NULL,
    results TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (simulation_id) REFERENCES simulations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_funding_scenarios_country ON funding_scenarios(country_code);
  CREATE INDEX IF NOT EXISTS idx_funding_scenarios_simulation ON funding_scenarios(simulation_id);

  CREATE TABLE IF NOT EXISTS impact_analyses (
    id TEXT PRIMARY KEY,
    name TEXT,
    simulation_id TEXT,
    country_code TEXT NOT NULL,
    parameters TEXT NOT NULL,
    results TEXT NOT NULL,
    api_key_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (simulation_id) REFERENCES simulations(id),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
  );

  CREATE INDEX IF NOT EXISTS idx_impact_analyses_country ON impact_analyses(country_code);
  CREATE INDEX IF NOT EXISTS idx_impact_analyses_simulation ON impact_analyses(simulation_id);

  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','editor','viewer')),
    active INTEGER NOT NULL DEFAULT 1,
    locale TEXT DEFAULT 'en',
    invited_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY (invited_by) REFERENCES admin_users(id)
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES admin_users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

  CREATE TABLE IF NOT EXISTS admin_invites (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('admin','editor','viewer')),
    invited_by TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invited_by) REFERENCES admin_users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_admin_invites_token ON admin_invites(token_hash);

  CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('api','upload','manual')),
    provider TEXT NOT NULL,
    url TEXT,
    description TEXT,
    config TEXT,
    last_fetched_at TEXT,
    data_year TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','error')),
    error_message TEXT,
    countries_covered INTEGER DEFAULT 0,
    indicators_provided TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_data_sources_provider ON data_sources(provider);
  CREATE INDEX IF NOT EXISTS idx_data_sources_status ON data_sources(status);

  CREATE TABLE IF NOT EXISTS recipients (
    id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    account_hash TEXT,
    identity_provider TEXT,
    verified_at TEXT,
    payment_method TEXT CHECK(payment_method IN ('sepa', 'mobile_money', 'crypto')),
    routing_ref TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending', 'verified', 'suspended')),
    pilot_id TEXT,
    api_key_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pilot_id) REFERENCES pilots(id),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_recipients_account
    ON recipients(country_code, account_hash)
    WHERE account_hash IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_recipients_status ON recipients(status);
  CREATE INDEX IF NOT EXISTS idx_recipients_country ON recipients(country_code);
  CREATE INDEX IF NOT EXISTS idx_recipients_pilot ON recipients(pilot_id);

  CREATE TABLE IF NOT EXISTS pilot_outcomes (
    id TEXT PRIMARY KEY,
    pilot_id TEXT NOT NULL,
    cohort_type TEXT NOT NULL CHECK(cohort_type IN ('recipient', 'control')),
    measurement_date TEXT NOT NULL,
    indicators TEXT NOT NULL,
    sample_size INTEGER NOT NULL,
    data_source TEXT NOT NULL,
    is_baseline INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pilot_id) REFERENCES pilots(id)
  );

  CREATE INDEX IF NOT EXISTS idx_pilot_outcomes_pilot ON pilot_outcomes(pilot_id);
  CREATE INDEX IF NOT EXISTS idx_pilot_outcomes_date ON pilot_outcomes(measurement_date);
`;

export function getDb(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath =
    dbPath ?? config.dbPath ?? path.join(process.cwd(), 'data', 'ogi.sqlite');

  // Ensure the data directory exists before opening the database
  const dir = path.dirname(resolvedPath);
  mkdirSync(dir, { recursive: true });

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  // Migrate: add external_id column if it doesn't exist yet (safe on existing DBs)
  try {
    db.exec('ALTER TABLE disbursements ADD COLUMN external_id TEXT');
  } catch {
    // Column already exists — OK
  }

  // Migrate: add targeting_rules column to pilots if it doesn't exist yet
  try {
    db.exec('ALTER TABLE pilots ADD COLUMN targeting_rules TEXT');
  } catch {
    // Column already exists — OK
  }

  // Migrate: create pilot_outcomes table if it doesn't exist yet (Phase 23)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pilot_outcomes (
        id TEXT PRIMARY KEY,
        pilot_id TEXT NOT NULL,
        cohort_type TEXT NOT NULL CHECK(cohort_type IN ('recipient', 'control')),
        measurement_date TEXT NOT NULL,
        indicators TEXT NOT NULL,
        sample_size INTEGER NOT NULL,
        data_source TEXT NOT NULL,
        is_baseline INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (pilot_id) REFERENCES pilots(id)
      );
      CREATE INDEX IF NOT EXISTS idx_pilot_outcomes_pilot ON pilot_outcomes(pilot_id);
      CREATE INDEX IF NOT EXISTS idx_pilot_outcomes_date ON pilot_outcomes(measurement_date);
    `);
  } catch {
    // Table already exists — OK
  }

  // Migrate: create programs table if it doesn't exist yet (Phase 1 UX overhaul)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS programs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        country_code TEXT NOT NULL,
        pilot_id TEXT,
        simulation_id TEXT,
        funding_scenario_id TEXT,
        impact_analysis_id TEXT,
        region_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_programs_country ON programs(country_code);
    `);
  } catch {
    // Table already exists — OK
  }

  return db;
}

/** Initialize with an in-memory database (for testing) */
export function getTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(SCHEMA);

  // Migrate: add external_id column if it doesn't exist yet (safe on existing DBs)
  try {
    testDb.exec('ALTER TABLE disbursements ADD COLUMN external_id TEXT');
  } catch {
    // Column already exists — OK
  }

  // Migrate: add targeting_rules column to pilots if it doesn't exist yet
  try {
    testDb.exec('ALTER TABLE pilots ADD COLUMN targeting_rules TEXT');
  } catch {
    // Column already exists — OK
  }

  // Migrate: create pilot_outcomes table if it doesn't exist yet (Phase 23)
  try {
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS pilot_outcomes (
        id TEXT PRIMARY KEY,
        pilot_id TEXT NOT NULL,
        cohort_type TEXT NOT NULL CHECK(cohort_type IN ('recipient', 'control')),
        measurement_date TEXT NOT NULL,
        indicators TEXT NOT NULL,
        sample_size INTEGER NOT NULL,
        data_source TEXT NOT NULL,
        is_baseline INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (pilot_id) REFERENCES pilots(id)
      );
      CREATE INDEX IF NOT EXISTS idx_pilot_outcomes_pilot ON pilot_outcomes(pilot_id);
      CREATE INDEX IF NOT EXISTS idx_pilot_outcomes_date ON pilot_outcomes(measurement_date);
    `);
  } catch {
    // Table already exists — OK
  }

  // Migrate: create programs table if it doesn't exist yet (Phase 1 UX overhaul)
  try {
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS programs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        country_code TEXT NOT NULL,
        pilot_id TEXT,
        simulation_id TEXT,
        funding_scenario_id TEXT,
        impact_analysis_id TEXT,
        region_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_programs_country ON programs(country_code);
    `);
  } catch {
    // Table already exists — OK
  }

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
