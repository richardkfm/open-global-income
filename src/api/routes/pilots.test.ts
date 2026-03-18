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

// ── Helper: create a channel + disbursement for linking tests ────────────────

async function createTestDisbursement(): Promise<string> {
  const chRes = await app.inject({
    method: 'POST',
    url: '/v1/disbursements/channels',
    payload: {
      name: 'Test Channel',
      type: 'crypto',
      provider: 'solana',
      config: { rpcUrl: 'https://api.devnet.solana.com' },
    },
  });
  const channelId = chRes.json().data.id;

  const dRes = await app.inject({
    method: 'POST',
    url: '/v1/disbursements',
    payload: {
      channelId,
      countryCode: 'KE',
      recipientCount: 1000,
      amountPerRecipient: '210.00',
      totalAmount: '210000.00',
      currency: 'USDC',
    },
  });
  return dRes.json().data.id;
}

async function createTestSimulation(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/simulations',
    payload: {
      name: 'Test Pilot Sim',
      country: 'KE',
      coverage: 0.2,
      targetGroup: 'all',
      durationMonths: 12,
      adjustments: { floorOverride: null, householdSize: null },
    },
  });
  return res.json().data.id;
}

// ── POST /v1/pilots ──────────────────────────────────────────────────────────

describe('POST /v1/pilots', () => {
  it('creates a pilot with valid data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Kenya Pilot 2026',
        countryCode: 'KE',
        description: 'A test pilot',
        targetRecipients: 10000,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe('Kenya Pilot 2026');
    expect(body.data.countryCode).toBe('KE');
    expect(body.data.status).toBe('planning');
    expect(body.data.targetRecipients).toBe(10000);
    expect(body.data.id).toBeDefined();
  });

  it('creates a pilot linked to a simulation', async () => {
    const simId = await createTestSimulation();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Sim-linked Pilot',
        countryCode: 'KE',
        simulationId: simId,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.simulationId).toBe(simId);
  });

  it('returns 400 for missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { countryCode: 'KE' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_PARAMETER');
  });

  it('returns 400 for missing countryCode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_PARAMETER');
  });

  it('returns 404 for unknown simulation ID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Bad Sim Pilot',
        countryCode: 'KE',
        simulationId: 'nonexistent-id',
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid targetRecipients', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Bad Recipients',
        countryCode: 'KE',
        targetRecipients: -5,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });
});

// ── GET /v1/pilots ───────────────────────────────────────────────────────────

describe('GET /v1/pilots', () => {
  it('returns paginated list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/pilots' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.pilots)).toBe(true);
    expect(body.data.pagination).toBeDefined();
    expect(body.data.pagination.page).toBe(1);
  });

  it('filters by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/pilots?status=planning' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const p of body.data.pilots) {
      expect(p.status).toBe('planning');
    }
  });

  it('rejects invalid status filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/pilots?status=invalid' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('respects page and limit params', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/pilots?page=1&limit=2' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.pagination.limit).toBe(2);
    expect(body.data.pilots.length).toBeLessThanOrEqual(2);
  });
});

// ── GET /v1/pilots/:id ───────────────────────────────────────────────────────

describe('GET /v1/pilots/:id', () => {
  it('returns pilot with disbursements array', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Detail Test', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.pilot.id).toBe(pilotId);
    expect(Array.isArray(body.data.disbursements)).toBe(true);
  });

  it('returns 404 for unknown ID', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/pilots/nonexistent' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

// ── PATCH /v1/pilots/:id ─────────────────────────────────────────────────────

describe('PATCH /v1/pilots/:id', () => {
  it('updates description', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Patch Test', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { description: 'Updated description' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.description).toBe('Updated description');
  });

  it('transitions planning → active', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Transition Test', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('active');
  });

  it('rejects invalid transition completed → active', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Invalid Transition', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    // planning → completed
    await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { status: 'completed' },
    });

    // completed → active (invalid)
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_TRANSITION');
  });

  it('returns 404 for unknown ID', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/pilots/nonexistent',
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects invalid status value', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Bad Status', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { status: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });
});

// ── POST /v1/pilots/:id/disbursements ────────────────────────────────────────

describe('POST /v1/pilots/:id/disbursements', () => {
  it('links a disbursement to a pilot', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Link Test', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;
    const disbursementId = await createTestDisbursement();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/pilots/${pilotId}/disbursements`,
      payload: { disbursementId },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.linked).toBe(true);

    // Verify it shows up in GET
    const getRes = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}` });
    expect(getRes.json().data.disbursements.length).toBe(1);
    expect(getRes.json().data.disbursements[0].id).toBe(disbursementId);
  });

  it('returns 404 for unknown pilot', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots/nonexistent/disbursements',
      payload: { disbursementId: 'some-id' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for unknown disbursement', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Bad Disb Link', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({
      method: 'POST',
      url: `/v1/pilots/${pilotId}/disbursements`,
      payload: { disbursementId: 'nonexistent' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for missing disbursementId', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'No Disb ID', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({
      method: 'POST',
      url: `/v1/pilots/${pilotId}/disbursements`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /v1/pilots/:id/report ────────────────────────────────────────────────

describe('GET /v1/pilots/:id/report', () => {
  it('returns report with no disbursements', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Empty Report', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/report` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.pilot.name).toBe('Empty Report');
    expect(body.data.summary.disbursementCount).toBe(0);
    expect(body.data.summary.totalDisbursed).toBe(0);
    expect(body.data.meta.generatedAt).toBeDefined();
  });

  it('returns report with linked disbursements', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Report With Disb', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;
    const disbursementId = await createTestDisbursement();

    await app.inject({
      method: 'POST',
      url: `/v1/pilots/${pilotId}/disbursements`,
      payload: { disbursementId },
    });

    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/report` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.summary.disbursementCount).toBe(1);
    expect(body.data.summary.totalDisbursed).toBe(210000);
    expect(body.data.summary.totalRecipients).toBe(1000);
    expect(body.data.summary.averagePerRecipient).toBe(210);
    expect(body.data.disbursements.length).toBe(1);
  });

  it('returns report with simulation variance', async () => {
    const simId = await createTestSimulation();
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Variance Report',
        countryCode: 'KE',
        simulationId: simId,
      },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/report` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.simulation).not.toBeNull();
    expect(body.data.simulation.id).toBe(simId);
    expect(body.data.simulation.projectedCost).toBeGreaterThan(0);
    expect(body.data.simulation.variance).toContain('%');
  });

  it('returns 404 for unknown pilot', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/pilots/nonexistent/report' });
    expect(res.statusCode).toBe(404);
  });
});

// ── Full lifecycle ───────────────────────────────────────────────────────────

describe('Pilot lifecycle (planning → active → paused → active → completed)', () => {
  let pilotId: string;
  let simId: string;

  it('create pilot linked to simulation', async () => {
    simId = await createTestSimulation();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Lifecycle Test',
        countryCode: 'KE',
        simulationId: simId,
        targetRecipients: 5000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    });
    expect(res.statusCode).toBe(201);
    pilotId = res.json().data.id;
    expect(res.json().data.status).toBe('planning');
  });

  it('activate pilot', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('active');
  });

  it('link disbursement', async () => {
    const disbursementId = await createTestDisbursement();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/pilots/${pilotId}/disbursements`,
      payload: { disbursementId },
    });
    expect(res.statusCode).toBe(201);
  });

  it('pause pilot', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { status: 'paused' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('paused');
  });

  it('resume pilot', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('active');
  });

  it('complete pilot', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('completed');
  });

  it('generate final report', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/report` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.pilot.status).toBe('completed');
    expect(body.data.summary.disbursementCount).toBe(1);
    expect(body.data.simulation).not.toBeNull();
    expect(body.data.simulation.id).toBe(simId);
  });

  it('cannot transition from completed', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/pilots/${pilotId}`,
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(409);
  });
});
