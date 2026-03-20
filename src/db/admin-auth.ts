import { randomUUID, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { getDb } from './database.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  username: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2 via native node:crypto — no extra dependencies)
// Stored format: pbkdf2:100000:<salt_hex>:<hash_hex>
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32; // bytes
const PBKDF2_DIGEST = 'sha512';

export function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `pbkdf2:${PBKDF2_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const [, iterStr, salt, expectedHash] = parts;
  const iterations = parseInt(iterStr, 10);
  if (!iterations || !salt || !expectedHash) return false;
  const derived = pbkdf2Sync(password, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  // Constant-time comparison
  return timingSafeEqual(derived, expectedHash);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ---------------------------------------------------------------------------
// Admin user CRUD
// ---------------------------------------------------------------------------

export function createAdminUser(username: string, password: string): AdminUser {
  const db = getDb();
  const id = randomUUID();
  const passwordHash = hashPassword(password);
  db.prepare(
    `INSERT INTO admin_users (id, username, password_hash) VALUES (?, ?, ?)`,
  ).run(id, username, passwordHash);
  return { id, username, createdAt: new Date().toISOString() };
}

export function findAdminUser(username: string): (AdminUser & { passwordHash: string }) | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, username, password_hash, created_at FROM admin_users WHERE username = ?`)
    .get(username) as { id: string; username: string; password_hash: string; created_at: string } | undefined;
  if (!row) return null;
  return { id: row.id, username: row.username, passwordHash: row.password_hash, createdAt: row.created_at };
}

/** Seed the default admin user from env vars if none exists. Idempotent. */
export function ensureDefaultAdmin(): void {
  const db = getDb();
  const count = (db.prepare(`SELECT COUNT(*) as c FROM admin_users`).get() as { c: number }).c;
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'admin';
  createAdminUser(username, password);
}

// ---------------------------------------------------------------------------
// Session management (DB-backed, with expiry)
// ---------------------------------------------------------------------------

const SESSION_TTL_STANDARD = 24 * 60 * 60; // 24 hours in seconds
const SESSION_TTL_REMEMBER = 7 * 24 * 60 * 60; // 7 days in seconds

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Create a new session. Returns the raw (unhashed) token — store in cookie. */
export function createSession(userId: string, rememberMe: boolean): string {
  const db = getDb();
  const id = randomUUID();
  const token = randomUUID();
  const tokenHash = hashToken(token);
  const ttl = rememberMe ? SESSION_TTL_REMEMBER : SESSION_TTL_STANDARD;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  db.prepare(
    `INSERT INTO admin_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
  ).run(id, userId, tokenHash, expiresAt);
  return token;
}

export interface SessionInfo {
  userId: string;
  expiresAt: string;
}

/** Look up a session by its raw token. Returns null if not found or expired. */
export function findSession(rawToken: string): SessionInfo | null {
  const db = getDb();
  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(`SELECT user_id, expires_at FROM admin_sessions WHERE token_hash = ?`)
    .get(tokenHash) as { user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    // Expired — clean it up
    db.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }
  return { userId: row.user_id, expiresAt: row.expires_at };
}

/** Delete a session (logout). */
export function deleteSession(rawToken: string): void {
  const db = getDb();
  const tokenHash = hashToken(rawToken);
  db.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`).run(tokenHash);
}

/** Purge all expired sessions. Call periodically to keep the table tidy. */
export function deleteExpiredSessions(): void {
  const db = getDb();
  db.prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`).run();
}

export { SESSION_TTL_STANDARD, SESSION_TTL_REMEMBER };
