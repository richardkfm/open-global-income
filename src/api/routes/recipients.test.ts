import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { getTestDb, closeDb } from '../../db/database.js';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function enroll(overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/v1/recipients',
    payload: { countryCode: 'DE', paymentMethod: 'sepa', ...overrides },
  });
}

// ── POST /v1/recipients ───────────────────────────────────────────────────────

describe('POST /v1/recipients', () => {
  it('creates a recipient with status pending', async () => {
    const res = await enroll();
    expect(res.statusCode).toBe(201);
    const { data } = res.json();
    expect(data.status).toBe('pending');
    expect(data.countryCode).toBe('DE');
    expect(data.paymentMethod).toBe('sepa');
    expect(typeof data.id).toBe('string');
    expect(typeof data.createdAt).toBe('string');
  });

  it('upcases countryCode', async () => {
    const res = await enroll({ countryCode: 'nl' });
    expect(res.json().data.countryCode).toBe('NL');
  });

  it('stores accountHash and routingRef', async () => {
    const res = await enroll({
      accountHash: 'abc123hash',
      routingRef: '...4321',
    });
    const { data } = res.json();
    expect(data.accountHash).toBe('abc123hash');
    expect(data.routingRef).toBe('...4321');
  });

  it('stores identityProvider', async () => {
    const res = await enroll({ identityProvider: 'digid' });
    expect(res.json().data.identityProvider).toBe('digid');
  });

  it('returns 400 when countryCode is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      payload: { paymentMethod: 'sepa' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_PARAMETER');
  });

  it('returns 400 for invalid paymentMethod', async () => {
    const res = await enroll({ paymentMethod: 'pigeon_post' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('returns 409 on duplicate accountHash in same country', async () => {
    const hash = `unique-hash-${Date.now()}`;
    await enroll({ accountHash: hash });
    const dup = await enroll({ accountHash: hash });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('DUPLICATE_RECIPIENT');
    expect(typeof dup.json().error.existingId).toBe('string');
  });

  it('allows same accountHash in different countries', async () => {
    const hash = `cross-country-hash-${Date.now()}`;
    const r1 = await enroll({ countryCode: 'DE', accountHash: hash });
    const r2 = await enroll({ countryCode: 'NL', accountHash: hash });
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
  });

  it('creates recipient with no accountHash (enrollment before verification)', async () => {
    const res = await enroll({ paymentMethod: 'sepa' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.accountHash).toBeNull();
  });
});

// ── GET /v1/recipients ────────────────────────────────────────────────────────

describe('GET /v1/recipients', () => {
  it('returns a paginated list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/recipients' });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.pagination.total).toBe('number');
    expect(typeof data.pagination.page).toBe('number');
    expect(data.pagination.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('filters by countryCode', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/recipients?countryCode=DE' });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items as Array<{ countryCode: string }>;
    items.forEach((r) => expect(r.countryCode).toBe('DE'));
  });

  it('filters by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/recipients?status=pending' });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items as Array<{ status: string }>;
    items.forEach((r) => expect(r.status).toBe('pending'));
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/recipients?status=unknown' });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /v1/recipients/:id ────────────────────────────────────────────────────

describe('GET /v1/recipients/:id', () => {
  it('returns the recipient by id', async () => {
    const created = (await enroll()).json().data;
    const res = await app.inject({ method: 'GET', url: `/v1/recipients/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(created.id);
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/recipients/nonexistent-id' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

// ── POST /v1/recipients/check-duplicate ───────────────────────────────────────

describe('POST /v1/recipients/check-duplicate', () => {
  it('returns isDuplicate: false for unknown hash', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients/check-duplicate',
      payload: { countryCode: 'DE', accountHash: 'never-seen-before-hash' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.isDuplicate).toBe(false);
    expect(res.json().data.existingRecipientId).toBeNull();
  });

  it('returns isDuplicate: true with existing id when hash is enrolled', async () => {
    const hash = `dup-check-hash-${Date.now()}`;
    const created = (await enroll({ accountHash: hash })).json().data;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients/check-duplicate',
      payload: { countryCode: 'DE', accountHash: hash },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.isDuplicate).toBe(true);
    expect(data.existingRecipientId).toBe(created.id);
    expect(data.status).toBe('pending');
  });

  it('returns 400 when countryCode is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients/check-duplicate',
      payload: { accountHash: 'some-hash' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when accountHash is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients/check-duplicate',
      payload: { countryCode: 'DE' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── PATCH /v1/recipients/:id ──────────────────────────────────────────────────

describe('PATCH /v1/recipients/:id', () => {
  it('transitions pending → verified', async () => {
    const id = (await enroll()).json().data.id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/recipients/${id}`,
      payload: {
        status: 'verified',
        accountHash: 'final-hash-abc',
        identityProvider: 'digid',
        verifiedAt: '2026-04-12T10:00:00Z',
        routingRef: '...4321',
      },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.status).toBe('verified');
    expect(data.accountHash).toBe('final-hash-abc');
    expect(data.identityProvider).toBe('digid');
    expect(data.routingRef).toBe('...4321');
  });

  it('transitions verified → suspended', async () => {
    const id = (await enroll()).json().data.id;
    await app.inject({ method: 'PATCH', url: `/v1/recipients/${id}`, payload: { status: 'verified' } });
    const res = await app.inject({ method: 'PATCH', url: `/v1/recipients/${id}`, payload: { status: 'suspended' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('suspended');
  });

  it('transitions suspended → pending (re-enrollment)', async () => {
    const id = (await enroll()).json().data.id;
    await app.inject({ method: 'PATCH', url: `/v1/recipients/${id}`, payload: { status: 'verified' } });
    await app.inject({ method: 'PATCH', url: `/v1/recipients/${id}`, payload: { status: 'suspended' } });
    const res = await app.inject({ method: 'PATCH', url: `/v1/recipients/${id}`, payload: { status: 'pending' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('pending');
  });

  it('returns 422 for invalid transition (pending → suspended → verified)', async () => {
    const id = (await enroll()).json().data.id;
    await app.inject({ method: 'PATCH', url: `/v1/recipients/${id}`, payload: { status: 'suspended' } });
    const res = await app.inject({ method: 'PATCH', url: `/v1/recipients/${id}`, payload: { status: 'verified' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_TRANSITION');
  });

  it('returns 409 when updating accountHash to one already used by another recipient', async () => {
    const hash = `conflict-hash-${Date.now()}`;
    await enroll({ accountHash: hash });
    const id2 = (await enroll()).json().data.id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/recipients/${id2}`,
      payload: { accountHash: hash },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 for invalid paymentMethod', async () => {
    const id = (await enroll()).json().data.id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/recipients/${id}`,
      payload: { paymentMethod: 'carrier_pigeon' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for unknown recipient', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/recipients/no-such-id',
      payload: { status: 'verified' },
    });
    expect(res.statusCode).toBe(404);
  });
});
