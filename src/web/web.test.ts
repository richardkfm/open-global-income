import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../api/server.js';
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

describe('Public web UI', () => {
  describe('landing page', () => {
    it('serves HTML at / without authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Open Global Income');
      expect(res.body).toContain('basic income');
    });

    it('shows the global income floor and audience sections', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.body).toContain('$210');
      expect(res.body).toContain('For journalists');
      expect(res.body).toContain('For researchers');
      expect(res.body).toContain('For policy makers');
    });

    it('links to the main sections', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.body).toContain('href="/countries"');
      expect(res.body).toContain('href="/calculator"');
      expect(res.body).toContain('href="/methodology"');
      expect(res.body).toContain('href="/data"');
    });
  });

  describe('quick country jump (/go)', () => {
    it('redirects to the country fact sheet for a valid code', async () => {
      const res = await app.inject({ method: 'GET', url: '/go?country=ke' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/countries/KE');
    });

    it('falls back to the explorer for an unknown code', async () => {
      const res = await app.inject({ method: 'GET', url: '/go?country=ZZ' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/countries');
    });
  });

  describe('country explorer', () => {
    it('lists countries with links to fact sheets', async () => {
      const res = await app.inject({ method: 'GET', url: '/countries' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('href="/countries/KE"');
      expect(res.body).toContain('Kenya');
    });

    it('sorts by the requested column', async () => {
      const res = await app.inject({ method: 'GET', url: '/countries?sort=population&dir=desc' });
      expect(res.statusCode).toBe(200);
      // India has the largest population in the dataset — its row must come first
      const indiaPos = res.body.indexOf('href="/countries/IN"');
      const kenyaPos = res.body.indexOf('href="/countries/KE"');
      expect(indiaPos).toBeGreaterThan(-1);
      expect(indiaPos).toBeLessThan(kenyaPos);
    });

    it('ignores invalid sort parameters instead of erroring', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/countries?sort=%3Cscript%3E&dir=up',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('<script>alert');
    });
  });

  describe('country fact sheet', () => {
    it('renders the full fact sheet for a country', async () => {
      const res = await app.inject({ method: 'GET', url: '/countries/KE' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Kenya');
      expect(res.body).toContain('basic income fact sheet');
      expect(res.body).toContain('Where could the money come from?');
      expect(res.body).toContain('What would it change?');
      expect(res.body).toContain('Copy citation');
    });

    it('is case-insensitive on the country code', async () => {
      const res = await app.inject({ method: 'GET', url: '/countries/ke' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Kenya');
    });

    it('includes the copyable summary paragraph with the annual cost', async () => {
      const res = await app.inject({ method: 'GET', url: '/countries/KE' });
      expect(res.body).toContain('A universal basic income of $210 per month');
      expect(res.body).toContain('% of GDP');
    });

    it('shows the regional section for countries with sub-national data', async () => {
      const res = await app.inject({ method: 'GET', url: '/countries/KE' });
      expect(res.body).toContain('Regional precision');
      expect(res.body).toContain('47 regions');
    });

    it('returns a friendly 404 page for unknown countries', async () => {
      const res = await app.inject({ method: 'GET', url: '/countries/ZZ' });
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Browse all countries');
    });

    it('shows the local adequacy estimate next to the global anchor', async () => {
      const res = await app.inject({ method: 'GET', url: '/countries/KE' });
      expect(res.body).toContain('Local adequacy estimate');
      expect(res.body).toContain('Global anchor');
    });

    it('shows the pooled international solidarity transfer for a low-income country', async () => {
      const res = await app.inject({ method: 'GET', url: '/countries/BI' });
      expect(res.body).toContain('Pooled international solidarity transfer');
      expect(res.body).toContain('domestic mechanisms together target');
    });
  });

  describe('calculator', () => {
    it('renders the empty form without a country', async () => {
      const res = await app.inject({ method: 'GET', url: '/calculator' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Cost &amp; funding calculator');
      expect(res.body).not.toContain('Recipients');
    });

    it('computes a scenario from URL parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/calculator?country=KE&coverage=50&target=bottom_half&months=12',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Recipients');
      expect(res.body).toContain('Kenya');
      expect(res.body).toContain('Estimated impact');
      // 50% coverage of the poorest half — quarter of the population
      expect(res.body).toContain('Copy scenario link');
    });

    it('includes funding results when mechanism rates are set', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/calculator?country=KE&coverage=100&target=all&months=12&f_income=5&f_carbon=30',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Funding the program');
      expect(res.body).toContain('income tax surcharge');
      expect(res.body).toContain('carbon tax');
    });

    it('clamps out-of-range parameters instead of erroring', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/calculator?country=KE&coverage=9999&months=-5&amount=abc',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Kenya');
    });

    it('ignores an unknown country code', async () => {
      const res = await app.inject({ method: 'GET', url: '/calculator?country=ZZ' });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('Estimated impact');
    });

    it('offers a one-click local adequacy estimate override once a country is computed', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/calculator?country=KE&coverage=100&target=all&months=12',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Use local adequacy estimate');
      // Suggestion only appears once a scenario exists; empty form has none.
      const empty = await app.inject({ method: 'GET', url: '/calculator' });
      expect(empty.body).not.toContain('Use local adequacy estimate');
    });

    it('renders taxation sliders wired for live htmx updates', async () => {
      const res = await app.inject({ method: 'GET', url: '/calculator' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('type="range"');
      expect(res.body).toContain('name="f_carbon"');
      expect(res.body).toContain('hx-get="/calculator"');
      expect(res.body).toContain('hx-target="#calc-results"');
      expect(res.body).toContain('id="calc-results"');
      expect(res.body).toContain('htmx.org');
    });

    it('clamps funding rates to the slider bounds', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/calculator?country=KE&f_income=50',
      });
      expect(res.statusCode).toBe(200);
      // 50% exceeds the 15% slider maximum — server clamps to match
      expect(res.body).toContain('15.0% income tax surcharge');
      expect(res.body).not.toContain('50.0% income tax surcharge');
    });
  });

  describe('compare', () => {
    it('renders the picker with no selection', async () => {
      const res = await app.inject({ method: 'GET', url: '/compare' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Compare countries');
    });

    it('compares two countries side by side', async () => {
      const res = await app.inject({ method: 'GET', url: '/compare?c=KE&c=UG' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Kenya');
      expect(res.body).toContain('Uganda');
      expect(res.body).toContain('Universal cost, % of GDP');
    });

    it('skips unknown codes and caps at four countries', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/compare?c=KE&c=ZZ&c=UG&c=GH&c=MZ&c=NG&c=IN',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Kenya');
      expect(res.body).toContain('Mozambique');
      expect(res.body).not.toContain('href="/countries/NG"');
    });
  });

  describe('methodology and data pages', () => {
    it('renders the methodology with the actual constants', async () => {
      const res = await app.inject({ method: 'GET', url: '/methodology' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('$210');
      expect(res.body).toContain('$6.85/day');
      expect(res.body).toContain('giniPenalty');
      expect(res.body).toContain('Citing these figures');
    });

    it('explains the local adequacy estimate and the international solidarity transfer', async () => {
      const res = await app.inject({ method: 'GET', url: '/methodology' });
      expect(res.body).toContain('id="adequacy"');
      expect(res.body).toContain('Local adequacy estimate');
      expect(res.body).toContain('comparability anchor');
      expect(res.body).toContain('pooled international');
    });

    it('renders the data & API page', async () => {
      const res = await app.inject({ method: 'GET', url: '/data' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('/v1/income/calc');
      expect(res.body).toContain('/data/countries.csv');
    });
  });

  describe('dataset downloads', () => {
    it('serves the CSV with computed columns', async () => {
      const res = await app.inject({ method: 'GET', url: '/data/countries.csv' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      const [header, ...rows] = res.body.split('\n');
      expect(header).toContain('entitlement_ppp_usd_per_month');
      expect(header).toContain('universal_cost_percent_gdp');
      expect(header).toContain('need_score');
      expect(rows.length).toBeGreaterThan(40);
      expect(res.body).toContain('KE,Kenya');
    });

    it('serves the JSON dataset with provenance metadata', async () => {
      const res = await app.inject({ method: 'GET', url: '/data/countries.json' });
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body) as {
        source: string;
        dataVersion: string;
        countries: Array<{ code: string; entitlement_ppp_usd_per_month: number }>;
      };
      expect(parsed.source).toBe('Open Global Income');
      expect(parsed.dataVersion).toBeTruthy();
      expect(parsed.countries.length).toBeGreaterThan(40);
      expect(parsed.countries[0].entitlement_ppp_usd_per_month).toBe(210);
    });
  });

  describe('coexistence with the rest of the platform', () => {
    it('does not shadow the API', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/income/calc?country=KE' });
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body) as { ok: boolean };
      expect(parsed.ok).toBe(true);
    });

    it('does not shadow the admin UI', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/admin/login');
    });

    it('still serves static assets', async () => {
      const res = await app.inject({ method: 'GET', url: '/css/site.css' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('site-header');
    });
  });
});
