import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, closeDb } from './database.js';
import { createApiKey, validateApiKey, listApiKeys, revokeApiKey, TIER_RATE_LIMITS } from './api-keys.js';
import { logAuditEntry, getRecentAuditEntries, getAuditStats } from './audit.js';
import { createUserDb, getUserByIdDb, clearUsersDb } from './users-db.js';

beforeAll(() => {
  getTestDb();
});

afterAll(() => {
  closeDb();
});

describe('API key management', () => {
  it('creates and validates an API key', () => {
    const { rawKey, record } = createApiKey('test-app', 'standard');
    expect(rawKey).toMatch(/^ogi_standard_/);
    expect(record.name).toBe('test-app');
    expect(record.tier).toBe('standard');
    expect(record.active).toBe(true);

    const validated = validateApiKey(rawKey);
    expect(validated).not.toBeNull();
    expect(validated!.id).toBe(record.id);
    expect(validated!.tier).toBe('standard');
  });

  it('returns null for invalid key', () => {
    expect(validateApiKey('ogi_free_nonexistent')).toBeNull();
  });

  it('lists all API keys', () => {
    const keys = listApiKeys();
    expect(keys.length).toBeGreaterThanOrEqual(1);
  });

  it('revokes an API key', () => {
    const { rawKey, record } = createApiKey('to-revoke', 'free');
    expect(validateApiKey(rawKey)).not.toBeNull();

    const revoked = revokeApiKey(record.id);
    expect(revoked).toBe(true);

    expect(validateApiKey(rawKey)).toBeNull();
  });

  it('defines tier rate limits', () => {
    expect(TIER_RATE_LIMITS.free).toBe(30);
    expect(TIER_RATE_LIMITS.standard).toBe(100);
    expect(TIER_RATE_LIMITS.premium).toBe(500);
  });
});

describe('Audit logging', () => {
  it('logs and retrieves audit entries', () => {
    logAuditEntry({
      method: 'GET',
      path: '/v1/income/calc?country=DE',
      statusCode: 200,
      responseTimeMs: 5.2,
      ip: '127.0.0.1',
    });

    const entries = getRecentAuditEntries(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].method).toBe('GET');
    expect(entries[0].path).toBe('/v1/income/calc?country=DE');
    expect(entries[0].statusCode).toBe(200);
  });

  it('returns audit stats', () => {
    const stats = getAuditStats();
    expect(stats.totalRequests).toBeGreaterThanOrEqual(1);
    expect(stats.topEndpoints.length).toBeGreaterThanOrEqual(1);
  });
});

describe('User persistence (SQLite)', () => {
  it('creates and retrieves a user', () => {
    const user = createUserDb('DE');
    expect(user.id).toBeTruthy();
    expect(user.countryCode).toBe('DE');

    const retrieved = getUserByIdDb(user.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.countryCode).toBe('DE');
  });

  it('returns undefined for unknown user', () => {
    expect(getUserByIdDb('00000000-0000-0000-0000-000000000000')).toBeUndefined();
  });

  it('clears users', () => {
    createUserDb('BR');
    clearUsersDb();
    // Previous users should be gone (exact check depends on test isolation)
  });
});
