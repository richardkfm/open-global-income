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

// ── POST /v1/impact ──────────────────────────────────────────────────────────

describe('POST /v1/impact', () => {
  it('returns a full impact analysis for Kenya', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'bottom_quintile', durationMonths: 12 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);

    const d = body.data;
    expect(d.country.code).toBe('KE');
    expect(d.country.name).toBe('Kenya');
    expect(d.program.recipientCount).toBeGreaterThan(0);
    expect(d.program.monthlyAmountPppUsd).toBe(210);

    // Four impact dimensions
    expect(d.povertyReduction).toBeDefined();
    expect(d.purchasingPower).toBeDefined();
    expect(d.socialCoverage).toBeDefined();
    expect(d.fiscalMultiplier).toBeDefined();
    expect(d.policyBrief).toBeDefined();
  });

  it('policy brief has title containing country name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'all', durationMonths: 12 },
    });
    const body = res.json();
    expect(body.data.policyBrief.title).toContain('Kenya');
  });

  it('is case-insensitive for country code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact',
      payload: { country: 'ke', coverage: 0.2, targetGroup: 'all', durationMonths: 12 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.country.code).toBe('KE');
  });

  it('returns 404 for unknown country', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact',
      payload: { country: 'ZZ', coverage: 0.2, targetGroup: 'all', durationMonths: 12 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().ok).toBe(false);
    expect(res.json().error.code).toBe('COUNTRY_NOT_FOUND');
  });

  it('returns 400 when neither country nor simulationId is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact',
      payload: { coverage: 0.2, targetGroup: 'all', durationMonths: 12 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_PARAMETER');
  });

  it('returns 400 for invalid coverage', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact',
      payload: { country: 'KE', coverage: 1.5, targetGroup: 'all', durationMonths: 12 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 for invalid targetGroup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'top_quintile', durationMonths: 12 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('assumptions list is non-empty in response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'bottom_quintile', durationMonths: 12 },
    });
    const body = res.json();
    expect(body.data.policyBrief.assumptions.length).toBeGreaterThan(5);
  });

  it('GDP stimulus is greater than annual cost (Kenya = LMC, multiplier > 1)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'all', durationMonths: 12 },
    });
    const d = res.json().data;
    expect(d.fiscalMultiplier.estimatedGdpStimulusPppUsd).toBeGreaterThan(d.program.annualCostPppUsd);
  });
});

// ── POST /v1/impact-analyses (save) ─────────────────────────────────────────

describe('POST /v1/impact-analyses', () => {
  it('creates and saves an impact analysis', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact-analyses',
      payload: {
        name: 'Kenya test analysis',
        country: 'KE',
        coverage: 0.15,
        targetGroup: 'bottom_quintile',
        durationMonths: 12,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(body.data.name).toBe('Kenya test analysis');
    expect(body.data.countryCode).toBe('KE');
    expect(body.data.results).toBeDefined();
  });

  it('creates analysis without a name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact-analyses',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'all', durationMonths: 6 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBeNull();
  });
});

// ── GET /v1/impact-analyses ──────────────────────────────────────────────────

describe('GET /v1/impact-analyses', () => {
  it('returns a paginated list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/impact-analyses' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.analyses)).toBe(true);
    expect(typeof body.data.pagination.total).toBe('number');
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(20);
    // totalPages is always >= 1 so empty result sets still render pagination UI
    expect(body.data.pagination.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('respects limit and page query params', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/impact-analyses?limit=5&page=1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pagination.limit).toBe(5);
  });

  it('falls back to defaults for non-numeric page/limit', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/impact-analyses?limit=abc&page=xyz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(20);
  });
});

// ── GET /v1/impact-analyses/:id ──────────────────────────────────────────────

describe('GET /v1/impact-analyses/:id', () => {
  let savedId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact-analyses',
      payload: { country: 'NG', coverage: 0.1, targetGroup: 'all', durationMonths: 12 },
    });
    savedId = res.json().data.id;
  });

  it('retrieves a saved analysis by ID', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/impact-analyses/${savedId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe(savedId);
  });

  it('returns 404 for unknown ID', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/impact-analyses/nonexistent-id' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

// ── DELETE /v1/impact-analyses/:id ──────────────────────────────────────────

describe('DELETE /v1/impact-analyses/:id', () => {
  it('deletes an existing analysis', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/impact-analyses',
      payload: { country: 'ET', coverage: 0.1, targetGroup: 'all', durationMonths: 12 },
    });
    const id = create.json().data.id;

    const del = await app.inject({ method: 'DELETE', url: `/v1/impact-analyses/${id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json().data.deleted).toBe(true);

    const get = await app.inject({ method: 'GET', url: `/v1/impact-analyses/${id}` });
    expect(get.statusCode).toBe(404);
  });

  it('returns 404 when deleting nonexistent ID', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/v1/impact-analyses/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});

// ── POST /v1/impact/brief ────────────────────────────────────────────────────

describe('POST /v1/impact/brief', () => {
  it('returns a JSON brief by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact/brief',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'bottom_quintile', durationMonths: 12 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.brief).toBeDefined();
    expect(body.data.brief.title).toContain('Kenya');
    expect(body.data.brief.assumptions.length).toBeGreaterThan(5);
    expect(body.data.brief.caveats.length).toBeGreaterThan(0);
    expect(body.data.brief.dataSources.length).toBeGreaterThan(0);
  });

  it('returns plain text brief when format=text', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact/brief?format=text',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'bottom_quintile', durationMonths: 12 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.payload).toContain('HEADLINE IMPACT FIGURES');
    expect(res.payload).toContain('ASSUMPTIONS');
    expect(res.payload).toContain('DATA SOURCES');
    expect(res.payload).toContain('CAVEATS');
  });

  it('text brief includes methodology section', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact/brief?format=text',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'all', durationMonths: 12 },
    });
    expect(res.payload).toContain('METHODOLOGY');
    expect(res.payload).toContain('Poverty Model');
  });

  it('returns 404 for unknown country in brief', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/impact/brief',
      payload: { country: 'UNKNOWN', coverage: 0.2, targetGroup: 'all', durationMonths: 12 },
    });
    expect(res.statusCode).toBe(404);
  });
});
