/**
 * PostgreSQL database adapter.
 *
 * This module provides a PostgreSQL-compatible interface that mirrors the
 * SQLite API from Phase 5. Switch between backends using the DB_BACKEND
 * environment variable ('sqlite' | 'postgres').
 *
 * Requires: npm install pg @types/pg
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *   DB_BACKEND  - 'sqlite' (default) or 'postgres'
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PgConfig {
  connectionString: string;
  ssl?: boolean;
}

export function getPgConfig(): PgConfig {
  const connectionString = config.databaseUrl;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL backend');
  }

  return {
    connectionString,
    ssl: config.dbSsl,
  };
}

/**
 * Get pending migrations that haven't been applied yet.
 * Reads .sql files from the migrations directory and returns them in order.
 */
export function getPendingMigrations(appliedVersions: Set<number>): Array<{
  version: number;
  name: string;
  sql: string;
}> {
  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = [];

  for (const file of files) {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    if (appliedVersions.has(version)) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    pending.push({ version, name: file, sql });
  }

  return pending;
}

/**
 * Determine which database backend to use.
 */
export function getDbBackend(): 'sqlite' | 'postgres' {
  return config.dbBackend;
}
