import { randomUUID, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { getDb } from './database.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminRole = 'admin' | 'editor' | 'viewer';

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: AdminRole;
  active: boolean;
  locale: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface AdminInvite {
  id: string;
  email: string;
  role: AdminRole;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
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
// Row mapping helpers
// ---------------------------------------------------------------------------

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
  email: string | null;
  display_name: string | null;
  role: string;
  active: number;
  locale: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string | null;
}

function rowToAdminUser(row: AdminUserRow): AdminUser & { passwordHash: string } {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    email: row.email,
    displayName: row.display_name,
    role: (row.role ?? 'admin') as AdminRole,
    active: row.active !== 0,
    locale: row.locale ?? 'en',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Admin user CRUD
// ---------------------------------------------------------------------------

export function createAdminUser(
  username: string,
  password: string,
  opts?: { email?: string; displayName?: string; role?: AdminRole; invitedBy?: string },
): AdminUser {
  const db = getDb();
  const id = randomUUID();
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO admin_users (id, username, password_hash, email, display_name, role, invited_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, username, passwordHash, opts?.email ?? null, opts?.displayName ?? null, opts?.role ?? 'admin', opts?.invitedBy ?? null, now);
  return {
    id,
    username,
    email: opts?.email ?? null,
    displayName: opts?.displayName ?? null,
    role: opts?.role ?? 'admin',
    active: true,
    locale: 'en',
    createdAt: now,
    updatedAt: null,
  };
}

export function findAdminUser(username: string): (AdminUser & { passwordHash: string }) | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM admin_users WHERE username = ?`)
    .get(username) as AdminUserRow | undefined;
  if (!row) return null;
  return rowToAdminUser(row);
}

export function findAdminUserById(id: string): (AdminUser & { passwordHash: string }) | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM admin_users WHERE id = ?`)
    .get(id) as AdminUserRow | undefined;
  if (!row) return null;
  return rowToAdminUser(row);
}

export function listAdminUsers(): AdminUser[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM admin_users ORDER BY created_at`)
    .all() as AdminUserRow[];
  return rows.map((r) => {
    const { passwordHash: _, ...user } = rowToAdminUser(r);
    return user;
  });
}

export function updateAdminUser(
  id: string,
  updates: { email?: string; displayName?: string; role?: AdminRole; active?: boolean; locale?: string },
): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.email !== undefined) { sets.push('email = ?'); values.push(updates.email); }
  if (updates.displayName !== undefined) { sets.push('display_name = ?'); values.push(updates.displayName); }
  if (updates.role !== undefined) { sets.push('role = ?'); values.push(updates.role); }
  if (updates.active !== undefined) { sets.push('active = ?'); values.push(updates.active ? 1 : 0); }
  if (updates.locale !== undefined) { sets.push('locale = ?'); values.push(updates.locale); }

  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE admin_users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function changeAdminPassword(id: string, newPassword: string): void {
  const db = getDb();
  const hash = hashPassword(newPassword);
  db.prepare(`UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(hash, new Date().toISOString(), id);
}

/** Seed the default admin user from env vars if none exists. Idempotent. */
export function ensureDefaultAdmin(): void {
  const db = getDb();
  const count = (db.prepare(`SELECT COUNT(*) as c FROM admin_users`).get() as { c: number }).c;
  if (count > 0) return;
  // Read env vars at call time (not import time) for test compatibility
  const username = process.env.ADMIN_USERNAME ?? config.admin.username;
  const password = process.env.ADMIN_PASSWORD ?? config.admin.password;
  createAdminUser(username, password, { role: 'admin' });
}

// ---------------------------------------------------------------------------
// Invitation management
// ---------------------------------------------------------------------------

const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

export function createInvite(email: string, role: AdminRole, invitedBy: string): { invite: AdminInvite; rawToken: string } {
  const db = getDb();
  const id = randomUUID();
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO admin_invites (id, email, token_hash, role, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, email, tokenHash, role, invitedBy, expiresAt);

  const invite: AdminInvite = { id, email, role, invitedBy, expiresAt, acceptedAt: null, createdAt: new Date().toISOString() };
  return { invite, rawToken };
}

export function findInviteByToken(rawToken: string): AdminInvite | null {
  const db = getDb();
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const row = db.prepare(
    `SELECT id, email, role, invited_by, expires_at, accepted_at, created_at FROM admin_invites WHERE token_hash = ?`,
  ).get(tokenHash) as { id: string; email: string; role: string; invited_by: string; expires_at: string; accepted_at: string | null; created_at: string } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role as AdminRole,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

export function acceptInvite(inviteId: string): void {
  const db = getDb();
  db.prepare(`UPDATE admin_invites SET accepted_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), inviteId);
}

export function listInvites(): AdminInvite[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, email, role, invited_by, expires_at, accepted_at, created_at FROM admin_invites ORDER BY created_at DESC`,
  ).all() as Array<{ id: string; email: string; role: string; invited_by: string; expires_at: string; accepted_at: string | null; created_at: string }>;
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as AdminRole,
    invitedBy: r.invited_by,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at,
    createdAt: r.created_at,
  }));
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
