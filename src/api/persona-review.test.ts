/**
 * Regression tests for bugs found in the v0.2.7 persona review
 * (German UBI researcher, data journalist, federal ministry official).
 * Each `describe` names the defect it pins down.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './server.js';
import { getTestDb, closeDb } from '../db/database.js';
import { createApiKey } from '../db/api-keys.js';
import { calculateSimulation } from '../core/simulations.js';
import { getCountryByCode, getDataVersion } from '../data/loader.js';
import { isValidIban, isValidBic, toSepaCharset, sepaProvider } from '../disbursements/providers/sepa.js';
import { isValidIsoDate } from './validators.js';
import en from '../i18n/locales/en.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Disbursement } from '../core/types.js';

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

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, payload: payload as Record<string, unknown>, headers });

// ── Simulation cost: "annual" must be one program year ──────────────────────

describe('simulation annual vs total cost', () => {
  const de = getCountryByCode('DE')!;
  const base = { country: 'DE', coverage: 0.5, targetGroup: 'bottom_decile' as const, adjustments: { floorOverride: null, householdSize: null } };

  it('a 24-month scenario reports one year as annual and the whole program as total', () => {
    const r12 = calculateSimulation(de, { ...base, durationMonths: 12 }, getDataVersion());
    const r24 = calculateSimulation(de, { ...base, durationMonths: 24 }, getDataVersion());
    expect(r24.simulation.cost.annualPppUsd).toBe(r12.simulation.cost.annualPppUsd);
    expect(r24.simulation.cost.asPercentOfGdp).toBe(r12.simulation.cost.asPercentOfGdp);
    expect(r24.simulation.cost.totalPppUsd).toBeCloseTo(2 * r12.simulation.cost.annualPppUsd, 0);
  });

  it('short programs: annual equals total (cost falls within one year)', () => {
    const r6 = calculateSimulation(de, { ...base, durationMonths: 6 }, getDataVersion());
    expect(r6.simulation.cost.annualPppUsd).toBe(r6.simulation.cost.totalPppUsd);
    expect(r6.simulation.cost.annualPppUsd).toBeCloseTo(
      r6.simulation.recipientCount * r6.simulation.entitlementPerPerson.pppUsdPerMonth * 6,
      -2,
    );
  });
});

// ── Funding / fiscal routes: validate inline inputs ─────────────────────────

describe('funding routes validate inline simulation inputs', () => {
  const mech = [{ type: 'vat_increase', points: 2 }];
  it.each([
    ['/v1/simulate/fund', { country: 'DE', targetGroup: 'zzz', mechanisms: mech }],
    ['/v1/simulate/fiscal', { country: 'DE', targetGroup: 'zzz' }],
    ['/v1/simulate/fund', { country: 'DE', coverage: 5, mechanisms: mech }],
    ['/v1/simulate/fiscal', { country: 'DE', coverage: -1 }],
    ['/v1/simulate/fiscal', { country: 'DE', durationMonths: -3 }],
  ])('%s rejects %j with 400 (was 500 / negative cost)', async (url, body) => {
    const res = await post(url, body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETER');
  });

  it('still accepts a valid request', async () => {
    const res = await post('/v1/simulate/fiscal', { country: 'DE', coverage: 0.2 });
    expect(res.statusCode).toBe(200);
  });
});

// ── Saved & regional simulations: floorOverride ─────────────────────────────

describe('floorOverride handling', () => {
  it('POST /v1/simulations rejects a negative floorOverride', async () => {
    const res = await post('/v1/simulations', { country: 'DE', coverage: 0.2, adjustments: { floorOverride: -5 } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /v1/income/simulate/regional honours floorOverride', async () => {
    const res = await post('/v1/income/simulate/regional', {
      country: 'DE', regionId: 'DE-HH', coverage: 0.2, adjustments: { floorOverride: 1000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.simulation.entitlementPerPerson.pppUsdPerMonth).toBe(1000);
  });

  it('POST /v1/income/simulate/regional rejects an invalid floorOverride', async () => {
    const res = await post('/v1/income/simulate/regional', {
      country: 'DE', regionId: 'DE-HH', coverage: 0.2, adjustments: { floorOverride: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Pilots, outcomes, recipients: input validation ──────────────────────────

describe('pilot, outcome and recipient validation', () => {
  it('rejects a pilot for an unknown country', async () => {
    const res = await post('/v1/pilots', { name: 'x', countryCode: 'ZZ' });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    [{ startDate: 'garbage' }],
    [{ startDate: '2027-02-30' }],
    [{ startDate: '2029-01-01', endDate: '2027-01-01' }],
  ])('rejects pilot dates %j', async (dates) => {
    const res = await post('/v1/pilots', { name: 'x', countryCode: 'DE', ...dates });
    expect(res.statusCode).toBe(400);
  });

  it('rejects impossible outcome measurement dates', async () => {
    const pilot = (await post('/v1/pilots', { name: 'p', countryCode: 'DE' })).json().data;
    for (const measurementDate of ['2027-13-45', '2027-02-30']) {
      const res = await post(`/v1/pilots/${pilot.id}/outcomes`, {
        cohortType: 'recipient', measurementDate, indicators: { employmentRate: 0.5 }, sampleSize: 10, dataSource: 'survey',
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('POST /v1/recipients with an unknown pilotId is 404, not 500', async () => {
    const res = await post('/v1/recipients', { countryCode: 'DE', pilotId: 'does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /v1/recipients with an unknown country is 404', async () => {
    const res = await post('/v1/recipients', { countryCode: 'ZZ' });
    expect(res.statusCode).toBe(404);
  });

  it('isValidIsoDate checks the calendar, not just the shape', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2027-1-01')).toBe(false);
  });
});

// ── API key attribution ─────────────────────────────────────────────────────

describe('apiKeyId is recorded on created resources', () => {
  it('a pilot created with an API key records that key', async () => {
    const { rawKey, record } = createApiKey('attribution-test', 'standard');
    const res = await post('/v1/pilots', { name: 'keyed', countryCode: 'DE' }, { 'x-api-key': rawKey });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.apiKeyId).toBe(record.id);
  });
});

// ── Disbursements & SEPA ────────────────────────────────────────────────────

describe('disbursement and SEPA validation', () => {
  let channelId: string;

  beforeAll(async () => {
    const res = await post('/v1/disbursements/channels', {
      name: 'SEPA DE', type: 'bank_transfer', provider: 'sepa', countryCode: 'DE',
      config: { apiKey: 'SECRETKEY123', payoutAccountId: 'acc', environment: 'sandbox', webhookSecret: 'whsec' },
    });
    expect(res.statusCode).toBe(201);
    channelId = res.json().data.id;
  });

  it('never returns channel credentials in clear text', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/disbursements/channels' });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('SECRETKEY123');
    expect(body).not.toContain('whsec');
    const ch = res.json().data.channels.find((c: { id: string }) => c.id === channelId);
    expect(ch.config.apiKey).toBe('[redacted]');
    expect(ch.config.payoutAccountId).toBe('acc');
  });

  const valid = { countryCode: 'DE', recipientCount: 10, amountPerRecipient: '210.00', totalAmount: '2100.00', currency: 'EUR' };

  it.each([
    [{ amountPerRecipient: '-210' }],
    [{ totalAmount: 'NaN' }],
    [{ totalAmount: '1' }],
    [{ currency: 'EURO-DOLLAR' }],
    [{ countryCode: 'KE' }],
  ])('rejects %j', async (patch) => {
    const res = await post('/v1/disbursements', { channelId, ...valid, ...patch });
    expect(res.statusCode).toBe(400);
  });

  it('accepts a consistent disbursement', async () => {
    const res = await post('/v1/disbursements', { channelId, ...valid });
    expect(res.statusCode).toBe(201);
  });

  it('validates IBAN (mod-97) and BIC format', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('DE00INVALID')).toBe(false);
    expect(isValidIban('DE89370400440532013001')).toBe(false);
    expect(isValidBic('COBADEFFXXX')).toBe(true);
    expect(isValidBic('XX')).toBe(false);
  });

  it('SEPA channel config rejects a bad debtor IBAN/BIC', async () => {
    const base = { apiKey: 'k', payoutAccountId: 'a', environment: 'sandbox' };
    expect((await sepaProvider.validateConfig({ ...base, debtorIban: 'DE00INVALID' })).valid).toBe(false);
    expect((await sepaProvider.validateConfig({ ...base, debtorBic: 'XX' })).valid).toBe(false);
    expect((await sepaProvider.validateConfig({ ...base, debtorIban: 'DE89370400440532013000', debtorBic: 'COBADEFF' })).valid).toBe(true);
  });

  it('pain.001 free text is restricted to the SEPA character set', async () => {
    expect(toSepaCharset('Bundesamt für Soziales & Arbeit — Grundeinkommen', 70)).toBe(
      'Bundesamt fuer Soziales + Arbeit - Grundeinkommen',
    );
    const d = { id: 'd1', amountPerRecipient: '210.00', totalAmount: '2100.00', recipientCount: 10 } as Disbursement;
    const result = await sepaProvider.submit(d, { debtorName: 'Straße <Ämter>' });
    const xml = (result.payload as { iso20022Xml: string }).iso20022Xml;
    expect(xml).toContain('<Nm>Strasse Aemter</Nm>');
    expect(xml).not.toContain('—');
  });
});

// ── Evidence aggregate ──────────────────────────────────────────────────────

describe('evidence aggregate', () => {
  it('counts only programs with data, filters by income group and cohort', async () => {
    const withData = (await post('/v1/pilots', { name: 'ev', countryCode: 'NL' })).json().data;
    await post('/v1/pilots', { name: 'ev-empty', countryCode: 'NL' });
    for (const [cohortType, employmentRate] of [['recipient', 0.7], ['control', 0.5]] as const) {
      const res = await post(`/v1/pilots/${withData.id}/outcomes`, {
        cohortType, measurementDate: '2027-01-01', indicators: { employmentRate }, sampleSize: 100, dataSource: 'survey',
      });
      expect(res.statusCode).toBe(201);
    }

    const all = (await app.inject({ method: 'GET', url: '/v1/evidence/aggregate?country=NL' })).json().data;
    expect(all.programCount).toBe(1);

    const hic = (await app.inject({ method: 'GET', url: '/v1/evidence/aggregate?country=NL&incomeGroup=HIC' })).json().data;
    expect(hic.programCount).toBe(1);

    const rec = (await app.inject({ method: 'GET', url: '/v1/evidence/aggregate?country=NL&cohortType=recipient' })).json().data;
    expect(rec.indicators.employmentRate.median).toBe(0.7);

    const bad = await app.inject({ method: 'GET', url: '/v1/evidence/aggregate?cohortType=treatment' });
    expect(bad.statusCode).toBe(400);
  });
});

// ── Impact brief uses the saved simulation's parameters ─────────────────────

describe('impact brief with a saved simulation', () => {
  it('reports the saved coverage, not the 20% default', async () => {
    const saved = (await post('/v1/simulations', { country: 'DE', coverage: 0.000024 })).json().data;
    const res = await post('/v1/impact/brief', { simulationId: saved.id });
    expect(res.statusCode).toBe(200);
    const text = JSON.stringify(res.json());
    expect(text).not.toContain('20% coverage');
    expect(text).toContain('0.0024% coverage');
  });
});

// ── Admin i18n: every t('…') key used in source exists in en.ts ────────────

describe('admin translation keys', () => {
  it('every literal t() key resolves to a string', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) return walk(p);
        return p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.includes(join('i18n', 't.ts')) ? [p] : [];
      });
    const missing: string[] = [];
    for (const file of walk(root)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        let o: unknown = en;
        for (const k of m[1].split('.')) o = (o as Record<string, unknown> | undefined)?.[k];
        if (typeof o !== 'string') missing.push(m[1]);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

// ── Public site ─────────────────────────────────────────────────────────────

describe('public site copy', () => {
  it('compare page marks the extreme-poverty fallback instead of presenting it as the country line', async () => {
    // Brazil has no survey at its $6.85/day line, so its $2.15/day rate is shown and starred;
    // Germany now carries the Eurostat at-risk-of-poverty rate at its own (60% of median) line.
    const res = await app.inject({ method: 'GET', url: '/compare?c=DE&c=BR' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('$2.15/day extreme-poverty rate shown');
    expect(res.body).toMatch(/4\.6%<span class="text-muted">\*<\/span>/);
    expect(res.body).toContain('16.1%');
  });

  it('methodology lists every country with sub-national data', async () => {
    const res = await app.inject({ method: 'GET', url: '/methodology' });
    expect(res.body).not.toContain('currently Kenya, 47 counties');
    expect(res.body).toContain('Germany (16 regions)');
    expect(res.body).toContain('22 indicators');
  });
});
