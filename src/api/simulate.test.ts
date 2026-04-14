import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './server.js';
import { getTestDb, closeDb } from '../db/database.js';
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

// --- POST /v1/simulate ---

describe('POST /v1/simulate', () => {
  it('returns a full simulation result for a valid country', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: {
        country: 'KE',
        coverage: 0.2,
        targetGroup: 'all',
        durationMonths: 12,
        adjustments: { floorOverride: null, householdSize: null },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);

    const { country, simulation } = body.data;
    expect(country.code).toBe('KE');
    expect(country.name).toBe('Kenya');
    expect(country.population).toBeGreaterThan(0);

    expect(simulation.recipientCount).toBeGreaterThan(0);
    expect(simulation.coverageRate).toBe(0.2);
    expect(simulation.entitlementPerPerson.pppUsdPerMonth).toBe(210);
    expect(simulation.entitlementPerPerson.localCurrencyPerMonth).toBeGreaterThan(0);
    expect(simulation.cost.monthlyLocalCurrency).toBeGreaterThan(0);
    expect(simulation.cost.annualLocalCurrency).toBeGreaterThan(0);
    expect(simulation.cost.annualPppUsd).toBeGreaterThan(0);
    expect(simulation.cost.asPercentOfGdp).toBeGreaterThan(0);
    expect(simulation.meta.rulesetVersion).toBe('v1');
  });

  it('is case-insensitive for country code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'ke', coverage: 0.2, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.country.code).toBe('KE');
  });

  it('returns 400 when country is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { coverage: 0.2, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_PARAMETER');
  });

  it('returns 404 for unknown country', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'XX', coverage: 0.2, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('COUNTRY_NOT_FOUND');
  });

  it('returns 400 when coverage is out of range', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'KE', coverage: 1.5, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 when durationMonths is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'all', durationMonths: 200, adjustments: { floorOverride: null, householdSize: null } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 for invalid targetGroup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'invalid', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('uses bottom_quintile targeting correctly', async () => {
    const allRes = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'KE', coverage: 1.0, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });
    const quintileRes = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'KE', coverage: 1.0, targetGroup: 'bottom_quintile', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });

    const allCount = allRes.json().data.simulation.recipientCount;
    const quintileCount = quintileRes.json().data.simulation.recipientCount;
    // bottom_quintile recipients should be ~20% of all
    expect(quintileCount).toBeCloseTo(allCount * 0.2, -3);
  });

  it('respects floorOverride adjustment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: 100, householdSize: null } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.simulation.entitlementPerPerson.pppUsdPerMonth).toBe(100);
  });

  it('accepts targetingRules with preset and uses it instead of targetGroup', async () => {
    const withGroup = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: {
        country: 'KE',
        coverage: 1.0,
        targetGroup: 'all',
        targetingRules: { preset: 'bottom_quintile' },
        durationMonths: 12,
        adjustments: { floorOverride: null, householdSize: null },
      },
    });
    const withPreset = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'KE', coverage: 1.0, targetGroup: 'bottom_quintile', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });

    expect(withGroup.statusCode).toBe(200);
    expect(withGroup.json().data.simulation.recipientCount).toBe(
      withPreset.json().data.simulation.recipientCount,
    );
  });

  it('targetingRules with no preset defaults to all population', async () => {
    const withRules = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: {
        country: 'KE',
        coverage: 0.5,
        targetGroup: 'all',
        targetingRules: { identityProviders: ['kyc-a'], ageRange: [18, 65] },
        durationMonths: 12,
        adjustments: { floorOverride: null, householdSize: null },
      },
    });
    const withoutRules = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'KE', coverage: 0.5, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });

    expect(withRules.statusCode).toBe(200);
    // Non-preset rules don't affect simulation recipient count estimate
    expect(withRules.json().data.simulation.recipientCount).toBe(
      withoutRules.json().data.simulation.recipientCount,
    );
  });

  it('returns 400 for invalid targetingRules.preset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: {
        country: 'KE',
        coverage: 0.2,
        targetGroup: 'all',
        targetingRules: { preset: 'invalid_preset' },
        durationMonths: 12,
        adjustments: { floorOverride: null, householdSize: null },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 for invalid targetingRules.ageRange (not an array)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: {
        country: 'KE',
        coverage: 0.2,
        targetGroup: 'all',
        targetingRules: { ageRange: 'young' },
        durationMonths: 12,
        adjustments: { floorOverride: null, householdSize: null },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 for invalid targetingRules.urbanRural', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: {
        country: 'KE',
        coverage: 0.2,
        targetGroup: 'all',
        targetingRules: { urbanRural: 'suburban' },
        durationMonths: 12,
        adjustments: { floorOverride: null, householdSize: null },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 for non-object targetingRules', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: {
        country: 'KE',
        coverage: 0.2,
        targetGroup: 'all',
        targetingRules: 'bottom_quintile',
        durationMonths: 12,
        adjustments: { floorOverride: null, householdSize: null },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('accepts full targetingRules with all valid fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: {
        country: 'KE',
        coverage: 0.2,
        targetGroup: 'all',
        targetingRules: {
          preset: 'bottom_half',
          ageRange: [18, 65],
          urbanRural: 'rural',
          maxMonthlyIncomePppUsd: 300,
          identityProviders: ['kyc-a', 'kyc-b'],
          excludeIfPaidWithinDays: 30,
          regionIds: ['KE-NAI', 'KE-MOM'],
        },
        durationMonths: 12,
        adjustments: { floorOverride: null, householdSize: null },
      },
    });
    expect(res.statusCode).toBe(200);
    // preset=bottom_half → 50% of population
    const allRes = await app.inject({
      method: 'POST',
      url: '/v1/simulate',
      payload: { country: 'KE', coverage: 0.2, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });
    expect(res.json().data.simulation.recipientCount).toBeLessThan(
      allRes.json().data.simulation.recipientCount,
    );
  });
});

// --- POST /v1/simulate/compare ---

describe('POST /v1/simulate/compare', () => {
  it('returns sorted simulation results for multiple countries', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate/compare',
      payload: { countries: ['KE', 'DE', 'BR'], coverage: 0.2, durationMonths: 12 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.count).toBe(3);
    expect(body.data.results).toHaveLength(3);

    // Should be sorted by annualPppUsd ascending
    const costs = body.data.results.map((r: { simulation: { cost: { annualPppUsd: number } } }) => r.simulation.cost.annualPppUsd);
    expect(costs[0]).toBeLessThanOrEqual(costs[1]);
    expect(costs[1]).toBeLessThanOrEqual(costs[2]);
  });

  it('returns 400 when countries array is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate/compare',
      payload: { coverage: 0.2, durationMonths: 12 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_PARAMETER');
  });

  it('returns 400 when too many countries', async () => {
    const countries = Array.from({ length: 21 }, (_, i) => `C${i}`);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate/compare',
      payload: { countries, coverage: 0.2, durationMonths: 12 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TOO_MANY_COUNTRIES');
  });

  it('skips unknown countries and includes errors', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulate/compare',
      payload: { countries: ['KE', 'XX'], coverage: 0.2, durationMonths: 12 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.count).toBe(1);
    expect(body.data.errors).toBeDefined();
    expect(body.data.errors[0].countryCode).toBe('XX');
  });
});

// --- POST /v1/simulations (save) ---

describe('POST /v1/simulations', () => {
  it('saves a simulation and returns the saved record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulations',
      payload: {
        name: 'Kenya 20% pilot',
        country: 'KE',
        coverage: 0.2,
        targetGroup: 'all',
        durationMonths: 12,
        adjustments: { floorOverride: null, householdSize: null },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(body.data.name).toBe('Kenya 20% pilot');
    expect(body.data.countryCode).toBe('KE');
    expect(body.data.parameters.coverage).toBe(0.2);
    expect(body.data.results.country.code).toBe('KE');
    expect(body.data.createdAt).toBeTruthy();
  });

  it('returns 404 for unknown country', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/simulations',
      payload: { country: 'XX', coverage: 0.2, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
    });
    expect(res.statusCode).toBe(404);
  });
});

// --- GET /v1/simulations ---

describe('GET /v1/simulations', () => {
  it('returns paginated list of simulations', async () => {
    // Save one first
    await app.inject({
      method: 'POST',
      url: '/v1/simulations',
      payload: { country: 'DE', coverage: 0.1, targetGroup: 'all', durationMonths: 6, adjustments: { floorOverride: null, householdSize: null } },
    });

    const res = await app.inject({ method: 'GET', url: '/v1/simulations' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.simulations)).toBe(true);
    expect(body.data.pagination).toBeDefined();
    expect(body.data.pagination.total).toBeGreaterThan(0);
  });

  it('supports pagination parameters', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/simulations?page=1&limit=5' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(5);
  });
});

// --- GET /v1/simulations/:id ---

describe('GET /v1/simulations/:id', () => {
  it('retrieves a saved simulation by ID', async () => {
    const saveRes = await app.inject({
      method: 'POST',
      url: '/v1/simulations',
      payload: { country: 'BR', coverage: 0.3, targetGroup: 'all', durationMonths: 6, adjustments: { floorOverride: null, householdSize: null } },
    });
    const id = saveRes.json().data.id;

    const res = await app.inject({ method: 'GET', url: `/v1/simulations/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(id);
    expect(body.data.countryCode).toBe('BR');
  });

  it('returns 404 for unknown ID', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/simulations/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

// --- DELETE /v1/simulations/:id ---

describe('DELETE /v1/simulations/:id', () => {
  it('deletes a saved simulation', async () => {
    const saveRes = await app.inject({
      method: 'POST',
      url: '/v1/simulations',
      payload: { country: 'NG', coverage: 0.1, targetGroup: 'all', durationMonths: 3, adjustments: { floorOverride: null, householdSize: null } },
    });
    const id = saveRes.json().data.id;

    const delRes = await app.inject({ method: 'DELETE', url: `/v1/simulations/${id}` });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().data.deleted).toBe(true);

    // Confirm it's gone
    const getRes = await app.inject({ method: 'GET', url: `/v1/simulations/${id}` });
    expect(getRes.statusCode).toBe(404);
  });

  it('returns 404 when deleting unknown ID', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/v1/simulations/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
  });
});
