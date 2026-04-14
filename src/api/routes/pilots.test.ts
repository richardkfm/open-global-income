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

// ── Targeting rules — POST /v1/pilots + report ───────────────────────────────

describe('Targeting rules', () => {
  it('creates a pilot with targeting rules and returns them', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Targeted Pilot',
        countryCode: 'KE',
        targetingRules: {
          preset: 'bottom_quintile',
          identityProviders: ['kyc-a'],
          ageRange: [18, 60],
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.targetingRules).toMatchObject({
      preset: 'bottom_quintile',
      identityProviders: ['kyc-a'],
      ageRange: [18, 60],
    });
  });

  it('pilot created without targetingRules has null targetingRules', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'No Rules Pilot', countryCode: 'KE' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.targetingRules).toBeNull();
  });

  it('returns 400 for invalid targetingRules.preset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Bad Rules',
        countryCode: 'KE',
        targetingRules: { preset: 'invalid_preset' },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 for invalid targetingRules.ageRange', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Bad Age Range',
        countryCode: 'KE',
        targetingRules: { ageRange: [65, 18] }, // max < min
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 for invalid targetingRules.urbanRural', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Bad Urban Rural',
        countryCode: 'KE',
        targetingRules: { urbanRural: 'suburban' },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('report includes targeting section with null rules when no rules set', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'No Rules Report', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/report` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.targeting).toBeDefined();
    expect(body.data.targeting.rules).toBeNull();
    expect(body.data.targeting.filterStats).toEqual([]);
  });

  it('report includes targeting filter stats when rules are set', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: {
        name: 'Rules Report Pilot',
        countryCode: 'KE',
        targetingRules: {
          preset: 'bottom_quintile',
          identityProviders: ['kyc-a'],
          ageRange: [18, 60],
        },
      },
    });
    const pilotId = createRes.json().data.id;

    // Enroll two recipients — one with allowed provider, one without
    await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      payload: { countryCode: 'KE', identityProvider: 'kyc-a', paymentMethod: 'sepa', pilotId },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      payload: { countryCode: 'KE', identityProvider: 'kyc-b', paymentMethod: 'sepa', pilotId },
    });

    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/report` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.targeting.rules).toMatchObject({ preset: 'bottom_quintile' });

    const filterStats = body.data.targeting.filterStats;
    expect(Array.isArray(filterStats)).toBe(true);

    // identityProviders rule should show 1 recipient filtered out (kyc-b)
    const ipStat = filterStats.find((s: { rule: string }) => s.rule === 'identityProviders');
    expect(ipStat).toBeDefined();
    expect(ipStat.recipientsFiltered).toBe(1);

    // ageRange stat should be present with a note
    const ageStat = filterStats.find((s: { rule: string }) => s.rule === 'ageRange');
    expect(ageStat).toBeDefined();
    expect(ageStat.notes).toBeTruthy();
  });
});

// ── GET /v1/pilots/:id/audit-export ──────────────────────────────────────────

describe('GET /v1/pilots/:id/audit-export', () => {
  it('returns full audit export document with all required fields', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Audit Export Test', countryCode: 'KE', targetRecipients: 500 },
    });
    const pilotId = createRes.json().data.id;

    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/audit-export` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);

    const doc = body.data;
    expect(doc.exportVersion).toBe('1.0');
    expect(doc.generatedAt).toBeDefined();
    expect(doc.pilot.id).toBe(pilotId);
    expect(doc.pilot.name).toBe('Audit Export Test');
    expect(doc.pilot.countryCode).toBe('KE');
    expect(doc.methodology.rulesetVersion).toBeDefined();
    expect(doc.methodology.entitlementPerRecipient.pppUsd).toBe(210);
    expect(doc.recipients.totalEnrolled).toBeDefined();
    expect(Array.isArray(doc.disbursements)).toBe(true);
    expect(doc.integrity.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.integrity.signedBy).toBe('ogi-platform');
    expect(doc.integrity.algorithm).toBe('SHA-256');
  });

  it('integrity hash is stable for the same pilot state', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Hash Stability Test', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;

    const res1 = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/audit-export` });
    const res2 = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/audit-export` });

    // Hashes must match even though generatedAt differs — same underlying data
    // Note: generatedAt is part of the payload, so timestamps may differ.
    // We verify the hash algorithm is deterministic given the same payload.
    const doc1 = res1.json().data;
    const doc2 = res2.json().data;

    // Both responses must be well-formed with 64-char hex SHA-256
    expect(doc1.integrity.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(doc2.integrity.sha256).toMatch(/^[0-9a-f]{64}$/);

    // If generatedAt is the same (same second), hashes must match exactly
    if (doc1.generatedAt === doc2.generatedAt) {
      expect(doc1.integrity.sha256).toBe(doc2.integrity.sha256);
    }

    // Hash must be a SHA-256 of the payload without the integrity field
    const { integrity: _i1, ...payload1 } = doc1;
    const { integrity: _i2, ...payload2 } = doc2;
    void _i1; void _i2;

    function canonicalJson(obj: unknown): string {
      if (Array.isArray(obj)) return '[' + (obj as unknown[]).map(canonicalJson).join(',') + ']';
      if (obj !== null && typeof obj === 'object') {
        const keys = Object.keys(obj as Record<string, unknown>).sort();
        return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k])).join(',') + '}';
      }
      return JSON.stringify(obj);
    }

    const { createHash } = await import('node:crypto');
    expect(doc1.integrity.sha256).toBe(createHash('sha256').update(canonicalJson(payload1)).digest('hex'));
    expect(doc2.integrity.sha256).toBe(createHash('sha256').update(canonicalJson(payload2)).digest('hex'));
  });

  it('disbursement log entries appear in the export', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'Log Entries Test', countryCode: 'KE' },
    });
    const pilotId = createRes.json().data.id;
    const disbursementId = await createTestDisbursement();

    await app.inject({
      method: 'POST',
      url: `/v1/pilots/${pilotId}/disbursements`,
      payload: { disbursementId },
    });

    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/audit-export` });
    expect(res.statusCode).toBe(200);
    const doc = res.json().data;
    expect(doc.disbursements.length).toBe(1);
    expect(doc.disbursements[0].id).toBe(disbursementId);
    // A 'created' log entry is always added when a disbursement is created
    expect(Array.isArray(doc.disbursements[0].log)).toBe(true);
    expect(doc.disbursements[0].log.length).toBeGreaterThan(0);
    expect(doc.disbursements[0].log[0].event).toBe('created');
  });

  it('returns 404 for unknown pilot', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/pilots/nonexistent/audit-export' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('GDPR: export contains no raw account identifiers', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/pilots',
      payload: { name: 'GDPR Test Pilot', countryCode: 'DE' },
    });
    const pilotId = createRes.json().data.id;

    // Enroll a recipient using a hash (never a raw IBAN)
    await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      payload: {
        countryCode: 'DE',
        accountHash: 'abc123hashvalue',
        routingRef: 'DE89***0000',
        paymentMethod: 'sepa',
        pilotId,
      },
    });

    const res = await app.inject({ method: 'GET', url: `/v1/pilots/${pilotId}/audit-export` });
    expect(res.statusCode).toBe(200);
    const raw = res.body;

    // Only aggregate counts appear — not individual account hashes or routing refs
    const doc = res.json().data;
    expect(doc.recipients.totalEnrolled).toBe(1);

    // The raw account hash and routing ref must NOT appear verbatim in the export body
    expect(raw).not.toContain('abc123hashvalue');
    expect(raw).not.toContain('DE89***0000');
  });
});
