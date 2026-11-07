/**
 * The Kenya walk-through animated in docs/assets/pipeline.svg (top of
 * README.md) quotes real figures. This suite re-derives them through the same
 * API calls the animation shows, so the picture cannot drift from the code.
 *
 * If a snapshot or formula change makes this fail on purpose, update the
 * STAGES figures in scripts/generate-readme-assets.mjs, run
 * `node scripts/generate-readme-assets.mjs`, then update the expectations here.
 */
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

describe('README pipeline scenario (Kenya, 20% coverage, 12 months)', () => {
  it('1 · Data — GET /v1/income/countries/KE', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/countries/KE' });
    expect(res.statusCode).toBe(200);
    const { stats } = res.json().data;
    expect(stats.population).toBe(54_030_000);
    expect(stats.gniPerCapitaUsd).toBe(2010);
    expect(stats.pppConversionFactor).toBe(49.37);
    expect(stats.giniIndex).toBe(38.7);
    expect(stats.incomeGroup).toBe('LMC');
  });

  it('2 · Calculation — GET /v1/income/calc?country=KE', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/income/calc?country=KE' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.pppUsdPerMonth).toBe(210);
    expect(Math.round(data.localCurrencyPerMonth)).toBe(10_368);
    expect(data.score).toBe(1);
    expect(data.meta.rulesetVersion).toBe('v1');
  });

  it('3 · Simulation — POST /v1/simulate', async () => {
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
    const { simulation } = res.json().data;
    expect((simulation.recipientCount / 1e6).toFixed(1)).toBe('10.8');
    expect((simulation.cost.annualPppUsd / 1e9).toFixed(1)).toBe('27.2');
    expect(simulation.cost.asPercentOfGdp.toFixed(1)).toBe('7.7');
  });

  it('5 · Evidence — GET /v1/evidence/export answers', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/evidence/export?format=json' });
    expect(res.statusCode).toBe(200);
  });
});
