import { randomUUID, createHash } from 'node:crypto';
import { getDb } from './database.js';

export type ApiKeyTier = 'free' | 'standard' | 'premium';

export interface ApiKey {
  id: string;
  name: string;
  tier: ApiKeyTier;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Hash an API key for storage (never store raw keys) */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Generate a new API key. Returns the raw key (show once) and the stored record. */
export function createApiKey(name: string, tier: ApiKeyTier = 'free'): { rawKey: string; record: ApiKey } {
  const db = getDb();
  const id = randomUUID();
  const rawKey = `ogi_${tier}_${randomUUID().replace(/-/g, '')}`;
  const keyHash = hashApiKey(rawKey);

  db.prepare(
    `INSERT INTO api_keys (id, name, key_hash, tier) VALUES (?, ?, ?, ?)`,
  ).run(id, name, keyHash, tier);

  return {
    rawKey,
    record: {
      id,
      name,
      tier,
      active: true,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    },
  };
}

/** Look up an API key by its raw value. Returns null if not found or inactive. */
export function validateApiKey(rawKey: string): ApiKey | null {
  const db = getDb();
  const keyHash = hashApiKey(rawKey);

  const row = db
    .prepare(
      `SELECT id, name, tier, active, created_at, last_used_at
       FROM api_keys WHERE key_hash = ?`,
    )
    .get(keyHash) as {
      id: string;
      name: string;
      tier: ApiKeyTier;
      active: number;
      created_at: string;
      last_used_at: string | null;
    } | undefined;

  if (!row || !row.active) return null;

  // Update last_used_at
  db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);

  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    active: !!row.active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

/** List all API keys (without hashes) */
export function listApiKeys(): ApiKey[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, tier, active, created_at, last_used_at FROM api_keys ORDER BY created_at DESC`,
    )
    .all() as Array<{
      id: string;
      name: string;
      tier: ApiKeyTier;
      active: number;
      created_at: string;
      last_used_at: string | null;
    }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    tier: r.tier,
    active: !!r.active,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

/** Revoke an API key */
export function revokeApiKey(id: string): boolean {
  const db = getDb();
  const result = db.prepare(`UPDATE api_keys SET active = 0 WHERE id = ?`).run(id);
  return result.changes > 0;
}

/** Rate limit tiers: requests per minute */
export const TIER_RATE_LIMITS: Record<ApiKeyTier, number> = {
  free: 30,
  standard: 100,
  premium: 500,
};
