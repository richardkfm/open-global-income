import { randomUUID } from 'node:crypto';
import type { User, CountryCode } from '../core/types.js';
import { getDb } from './database.js';

/** Create a user in SQLite */
export function createUserDb(countryCode: CountryCode, apiKeyId?: string): User {
  const db = getDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`INSERT INTO users (id, country_code, api_key_id, created_at) VALUES (?, ?, ?, ?)`).run(
    id,
    countryCode.toUpperCase(),
    apiKeyId ?? null,
    createdAt,
  );

  return { id, countryCode: countryCode.toUpperCase(), createdAt };
}

/** Get user by ID from SQLite */
export function getUserByIdDb(id: string): User | undefined {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, country_code, created_at FROM users WHERE id = ?`)
    .get(id) as { id: string; country_code: string; created_at: string } | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    countryCode: row.country_code,
    createdAt: row.created_at,
  };
}

/** Clear all users (for testing) */
export function clearUsersDb(): void {
  const db = getDb();
  db.prepare(`DELETE FROM users`).run();
}
