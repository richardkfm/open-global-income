import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildServer } from './server.js';
import { clearUsers } from '../core/users.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

beforeEach(() => {
  clearUsers();
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

// --- Rulesets ---

describe('GET /v1/income/rulesets', () => {
  it('returns all rulesets', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/rulesets' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);

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

// --- Users ---

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
    // Create user first
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/users',
      payload: { country_code: 'NG' },
    });
    const userId = createRes.json().data.id;

    // Get income
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
