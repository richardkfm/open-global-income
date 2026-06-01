import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { getTestDb, closeDb } from '../../db/database.js';
import { isValidVerhoeff } from '../../identity/util.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  getTestDb();
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDb();
});

/** Append a Verhoeff check digit so a base number validates. */
function validUin(base: string): string {
  for (let d = 0; d < 10; d++) {
    if (isValidVerhoeff(base + d)) return base + d;
  }
  throw new Error('unreachable');
}

async function enroll(overrides: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/recipients',
    payload: { countryCode: 'KE', ...overrides },
  });
  return res.json().data.id as string;
}

// ── GET /v1/identity/providers ──────────────────────────────────────────────────

describe('GET /v1/identity/providers', () => {
  it('lists the registered connectors with metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/identity/providers' });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    const ids = data.providers.map((p: { providerId: string }) => p.providerId).sort();
    expect(ids).toEqual(['community-attestation', 'mobile-kyc', 'national-id', 'wallet']);
    expect(data.providers[0]).not.toHaveProperty('verify');
  });
});

// ── POST /v1/recipients/:id/verify ──────────────────────────────────────────────

describe('POST /v1/recipients/:id/verify', () => {
  it('verifies a recipient and transitions it to verified', async () => {
    const id = await enroll();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/recipients/${id}/verify`,
      payload: {
        provider: 'national-id',
        claimType: 'national_id',
        claimReference: validUin('123456789012'),
      },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.recipient.status).toBe('verified');
    expect(data.recipient.identityProvider).toBe('national-id');
    expect(data.recipient.accountHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.recipient.verifiedAt).toBeTruthy();
    expect(data.verification.verified).toBe(true);
  });

  it('never echoes the raw claim reference back', async () => {
    const id = await enroll();
    const ref = validUin('987654321098');
    const res = await app.inject({
      method: 'POST',
      url: `/v1/recipients/${id}/verify`,
      payload: { provider: 'national-id', claimType: 'national_id', claimReference: ref },
    });
    expect(JSON.stringify(res.json())).not.toContain(ref);
  });

  it('returns 422 when the claim fails validation', async () => {
    const id = await enroll();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/recipients/${id}/verify`,
      payload: { provider: 'national-id', claimType: 'national_id', claimReference: '123' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VERIFICATION_FAILED');
  });

  it('returns 404 for an unknown provider', async () => {
    const id = await enroll();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/recipients/${id}/verify`,
      payload: { provider: 'nope', claimType: 'national_id', claimReference: '123' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('UNKNOWN_PROVIDER');
  });

  it('returns 400 when the provider does not support the claim type', async () => {
    const id = await enroll();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/recipients/${id}/verify`,
      payload: { provider: 'national-id', claimType: 'wallet', claimReference: '0x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_CLAIM_TYPE');
  });

  it('returns 404 for an unknown recipient', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients/does-not-exist/verify',
      payload: { provider: 'national-id', claimType: 'national_id', claimReference: validUin('111111111111') },
    });
    expect(res.statusCode).toBe(404);
  });

  it('detects a duplicate identity across recipients (409)', async () => {
    const ref = validUin('222333444555');
    const first = await enroll();
    await app.inject({
      method: 'POST',
      url: `/v1/recipients/${first}/verify`,
      payload: { provider: 'national-id', claimType: 'national_id', claimReference: ref },
    });

    const second = await enroll();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/recipients/${second}/verify`,
      payload: { provider: 'national-id', claimType: 'national_id', claimReference: ref },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DUPLICATE_RECIPIENT');
  });

  it('refuses to verify a suspended recipient', async () => {
    const id = await enroll();
    // pending → verified → suspended
    await app.inject({
      method: 'POST',
      url: `/v1/recipients/${id}/verify`,
      payload: { provider: 'mobile-kyc', claimType: 'phone', claimReference: '+254712345678' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/v1/recipients/${id}`,
      payload: { status: 'suspended' },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/recipients/${id}/verify`,
      payload: { provider: 'mobile-kyc', claimType: 'phone', claimReference: '+254712345999' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_TRANSITION');
  });
});
