import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';
import type { RecipientProfile, RecipientStatus, PaymentMethod } from '../core/types.js';

// ── Row type ──────────────────────────────────────────────────────────────────

interface RecipientRow {
  id: string;
  country_code: string;
  account_hash: string | null;
  identity_provider: string | null;
  verified_at: string | null;
  payment_method: string | null;
  routing_ref: string | null;
  status: string;
  pilot_id: string | null;
  api_key_id: string | null;
  created_at: string;
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function rowToRecipient(row: RecipientRow): RecipientProfile {
  return {
    id: row.id,
    countryCode: row.country_code,
    accountHash: row.account_hash,
    identityProvider: row.identity_provider,
    verifiedAt: row.verified_at,
    paymentMethod: (row.payment_method as PaymentMethod) ?? null,
    routingRef: row.routing_ref,
    status: row.status as RecipientStatus,
    pilotId: row.pilot_id,
    apiKeyId: row.api_key_id,
    createdAt: row.created_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function createRecipient(params: {
  countryCode: string;
  accountHash?: string | null;
  identityProvider?: string | null;
  verifiedAt?: string | null;
  paymentMethod?: PaymentMethod | null;
  routingRef?: string | null;
  pilotId?: string | null;
  apiKeyId?: string | null;
}): RecipientProfile {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO recipients
       (id, country_code, account_hash, identity_provider, verified_at,
        payment_method, routing_ref, status, pilot_id, api_key_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  ).run(
    id,
    params.countryCode,
    params.accountHash ?? null,
    params.identityProvider ?? null,
    params.verifiedAt ?? null,
    params.paymentMethod ?? null,
    params.routingRef ?? null,
    params.pilotId ?? null,
    params.apiKeyId ?? null,
    now,
  );

  return rowToRecipient(
    db.prepare('SELECT * FROM recipients WHERE id = ?').get(id) as RecipientRow,
  );
}

export function getRecipientById(id: string): RecipientProfile | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM recipients WHERE id = ?').get(id) as
    | RecipientRow
    | undefined;
  return row ? rowToRecipient(row) : null;
}

export function listRecipients(params: {
  countryCode?: string;
  status?: RecipientStatus;
  pilotId?: string;
  page: number;
  limit: number;
}): { items: RecipientProfile[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.countryCode) {
    conditions.push('country_code = ?');
    values.push(params.countryCode.toUpperCase());
  }
  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }
  if (params.pilotId) {
    conditions.push('pilot_id = ?');
    values.push(params.pilotId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (params.page - 1) * params.limit;

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM recipients ${where}`).get(...values) as {
      count: number;
    }
  ).count;

  const rows = db
    .prepare(`SELECT * FROM recipients ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...values, params.limit, offset) as RecipientRow[];

  return { items: rows.map(rowToRecipient), total };
}

export function updateRecipient(
  id: string,
  updates: {
    status?: RecipientStatus;
    accountHash?: string | null;
    identityProvider?: string | null;
    verifiedAt?: string | null;
    paymentMethod?: PaymentMethod | null;
    routingRef?: string | null;
    pilotId?: string | null;
  },
): RecipientProfile | null {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.accountHash !== undefined) { fields.push('account_hash = ?'); values.push(updates.accountHash); }
  if (updates.identityProvider !== undefined) { fields.push('identity_provider = ?'); values.push(updates.identityProvider); }
  if (updates.verifiedAt !== undefined) { fields.push('verified_at = ?'); values.push(updates.verifiedAt); }
  if (updates.paymentMethod !== undefined) { fields.push('payment_method = ?'); values.push(updates.paymentMethod); }
  if (updates.routingRef !== undefined) { fields.push('routing_ref = ?'); values.push(updates.routingRef); }
  if (updates.pilotId !== undefined) { fields.push('pilot_id = ?'); values.push(updates.pilotId); }

  if (fields.length === 0) return getRecipientById(id);

  values.push(id);
  db.prepare(`UPDATE recipients SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getRecipientById(id);
}

/**
 * Check whether an accountHash is already enrolled for a given country.
 * Used for de-duplication across programs without exposing identity.
 */
export function findByAccountHash(
  countryCode: string,
  accountHash: string,
): RecipientProfile | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM recipients WHERE country_code = ? AND account_hash = ?')
    .get(countryCode.toUpperCase(), accountHash) as RecipientRow | undefined;
  return row ? rowToRecipient(row) : null;
}
