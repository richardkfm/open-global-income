import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildServer } from './server.js';
import { getTestDb, closeDb } from '../db/database.js';
import { clearUsersDb } from '../db/users-db.js';
import { createApiKey } from '../db/api-keys.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  // Use in-memory SQLite for tests
  getTestDb();
  app = buildServer();
  await app.ready();
});

beforeEach(() => {
  clearUsersDb();
});

afterAll(async () => {
  await app.close();
  closeDb();
});

// --- Health ---

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

// --- Income Calc ---

describe('GET /v1/income/calc', () => {
  it('returns entitlement for a valid country', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/calc?country=DE' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.countryCode).toBe('DE');
    expect(body.data.pppUsdPerMonth).toBe(210);
    expect(body.data.meta.rulesetVersion).toBe('v1');
  });

  it('is case-insensitive', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/calc?country=de' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.countryCode).toBe('DE');
  });

  it('returns 400 when country param is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/calc' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('MISSING_PARAMETER');
  });

  it('returns 404 for unknown country', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/calc?country=XX' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('COUNTRY_NOT_FOUND');
  });
});

// --- Batch ---

describe('POST /v1/income/batch', () => {
  it('returns entitlements for multiple valid countries', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/income/batch',
      payload: { countries: ['DE', 'BR', 'NG'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.count).toBe(3);
    expect(body.data.results).toHaveLength(3);

    const de = body.data.results[0];
    expect(de.countryCode).toBe('DE');
    expect(de.pppUsdPerMonth).toBe(210);

    const br = body.data.results[1];
    expect(br.countryCode).toBe('BR');

    const ng = body.data.results[2];
    expect(ng.countryCode).toBe('NG');
  });

  it('returns partial results when some countries are invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/income/batch',
      payload: { countries: ['DE', 'XX', 'BR'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.count).toBe(3);

    expect(body.data.results[0].countryCode).toBe('DE');
    expect(body.data.results[0].pppUsdPerMonth).toBe(210);

    expect(body.data.results[1].countryCode).toBe('XX');
    expect(body.data.results[1].error.code).toBe('COUNTRY_NOT_FOUND');

    expect(body.data.results[2].countryCode).toBe('BR');
  });

  it('returns 400 when countries array is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/income/batch',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('MISSING_PARAMETER');
  });

  it('returns 400 when countries array is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/income/batch',
      payload: { countries: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_PARAMETER');
  });

  it('handles duplicate country codes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/income/batch',
      payload: { countries: ['DE', 'DE'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.count).toBe(2);
    expect(body.data.results[0].countryCode).toBe('DE');
    expect(body.data.results[1].countryCode).toBe('DE');
  });

  it('is case-insensitive for country codes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/income/batch',
      payload: { countries: ['de', 'br'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.results[0].countryCode).toBe('DE');
    expect(body.data.results[1].countryCode).toBe('BR');
  });
});

// --- Rulesets ---

describe('GET /v1/income/rulesets', () => {
  it('returns all rulesets', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/rulesets' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);

    const active = body.data.find((r: { active: boolean }) => r.active);
    expect(active).toBeDefined();
    expect(active.version).toBe('v1');
    expect(active.parameters).toHaveProperty('globalIncomeFloorPpp');
    expect(active.formula).toBeTruthy();
  });

  it('includes deprecated stub ruleset', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/rulesets' });
    const body = res.json();
    const stub = body.data.find((r: { version: string }) => r.version === 'stub-v0.0.1');
    expect(stub).toBeDefined();
    expect(stub.active).toBe(false);
  });
});

describe('GET /v1/income/rulesets/:version', () => {
  it('returns the active v1 ruleset', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/rulesets/v1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.version).toBe('v1');
    expect(body.data.active).toBe(true);
    expect(body.data.parameters).toHaveProperty('globalIncomeFloorPpp');
    expect(body.data.formula).toBeTruthy();
  });

  it('returns the deprecated stub ruleset', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/rulesets/stub-v0.0.1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.version).toBe('stub-v0.0.1');
    expect(body.data.active).toBe(false);
  });

  it('returns 404 for unknown version', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/rulesets/v99' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// --- Countries ---

describe('GET /v1/income/countries', () => {
  it('returns list of countries with metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/countries' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.count).toBeGreaterThanOrEqual(40);
    expect(body.data.dataVersion).toMatch(/^worldbank/);

    const de = body.data.countries.find((c: { code: string }) => c.code === 'DE');
    expect(de).toBeDefined();
    expect(de.name).toBe('Germany');
    expect(de.incomeGroup).toBe('HIC');
    expect(typeof de.hasGiniData).toBe('boolean');
  });
});

describe('GET /v1/income/countries/:code', () => {
  it('returns full details for a valid country', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/countries/DE' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.code).toBe('DE');
    expect(body.data.name).toBe('Germany');
    expect(body.data.dataVersion).toMatch(/^worldbank/);

    expect(body.data.stats).toBeDefined();
    expect(body.data.stats.gdpPerCapitaUsd).toBeGreaterThan(0);
    expect(body.data.stats.gniPerCapitaUsd).toBeGreaterThan(0);
    expect(body.data.stats.pppConversionFactor).toBeGreaterThan(0);
    expect(body.data.stats.incomeGroup).toBe('HIC');
  });

  it('is case-insensitive', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/countries/de' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.code).toBe('DE');
  });

  it('returns 404 for unknown country code', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/countries/XX' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('COUNTRY_NOT_FOUND');
  });
});

// --- Users (SQLite-backed) ---

describe('POST /v1/users', () => {
  it('creates a user with valid country code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/users',
      payload: { country_code: 'DE' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(body.data.countryCode).toBe('DE');
    expect(body.data.createdAt).toBeTruthy();
  });

  it('returns 400 when country_code is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/users',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_PARAMETER');
  });

  it('returns 404 for unknown country', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/users',
      payload: { country_code: 'XX' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('COUNTRY_NOT_FOUND');
  });
});

describe('GET /v1/users/:id/income', () => {
  it('returns income entitlement for a registered user', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/users',
      payload: { country_code: 'NG' },
    });
    const userId = createRes.json().data.id;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/users/${userId}/income`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.user.id).toBe(userId);
    expect(body.data.user.countryCode).toBe('NG');
    expect(body.data.entitlement.countryCode).toBe('NG');
    expect(body.data.entitlement.pppUsdPerMonth).toBe(210);
    expect(body.data.entitlement.score).toBe(1);
  });

  it('returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/00000000-0000-0000-0000-000000000000/income',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('USER_NOT_FOUND');
  });
});

// --- API Key Authentication ---

describe('API key authentication', () => {
  it('accepts requests with a valid API key', async () => {
    const { rawKey } = createApiKey('test-key', 'standard');
    const res = await app.inject({
      method: 'GET',
      url: '/v1/income/calc?country=DE',
      headers: { 'x-api-key': rawKey },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects requests with an invalid API key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/income/calc?country=DE',
      headers: { 'x-api-key': 'ogi_free_invalidkey12345' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_API_KEY');
  });

  it('allows requests without API key when not required', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/income/calc?country=DE',
    });
    expect(res.statusCode).toBe(200);
  });
});

// --- Security headers ---

describe('Security headers', () => {
  it('includes helmet security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});

// --- CORS ---

describe('CORS', () => {
  it('includes access-control-allow-origin header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://example.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('responds to OPTIONS preflight', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/income/calc',
      headers: {
        origin: 'http://example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

// --- Rate limiting ---

describe('Rate limiting', () => {
  it('returns 429 when rate limit is exceeded', async () => {
    const limitedApp = buildServer({ rateLimitMax: 2, rateLimitWindow: 60000 });
    await limitedApp.ready();

    const res1 = await limitedApp.inject({ method: 'GET', url: '/v1/income/rulesets' });
    expect(res1.statusCode).toBe(200);

    const res2 = await limitedApp.inject({ method: 'GET', url: '/v1/income/rulesets' });
    expect(res2.statusCode).toBe(200);

    const res3 = await limitedApp.inject({ method: 'GET', url: '/v1/income/rulesets' });
    expect(res3.statusCode).toBe(429);
    const body = res3.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');

    await limitedApp.close();
  });
});

// --- OpenAPI / Swagger ---

describe('OpenAPI docs', () => {
  it('serves Swagger UI at /docs', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('serves OpenAPI JSON spec', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('Open Global Income API');
    // Version is sourced from package.json at startup — use a shape check
    // instead of hard-coding so version bumps don't require test updates.
    expect(spec.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// --- Prometheus metrics ---

describe('Prometheus metrics', () => {
  it('serves metrics at /metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('ogi_http_requests_total');
    expect(res.body).toContain('ogi_http_request_duration_seconds');
  });
});

// --- Global error handling ---

describe('Error handling', () => {
  it('returns 404 JSON for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/nonexistent' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
