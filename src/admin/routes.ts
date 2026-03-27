import type { FastifyPluginAsync } from 'fastify';
import { renderLogin } from './views/login.js';
import { renderDashboard, type DashboardData } from './views/dashboard.js';
import { renderApiKeys } from './views/api-keys.js';
import { renderAuditLog, renderAuditTable } from './views/audit.js';
import { renderSimulatePage, renderSimulationPreview, renderComparisonTable } from './views/simulate.js';
import { renderPilotsPage, renderPilotDetailPage } from './views/pilots.js';
import { renderCountryList, renderCountryDetail, type CountryListItem } from './views/countries.js';
import { renderRegionList, renderRegionDetail } from './views/regions.js';
import { renderFundingPage, renderFundingPreview } from './views/funding.js';
import { renderImpactPage, renderImpactPreview, renderAnalysesTable } from './views/impact.js';
import { listApiKeys, createApiKey, revokeApiKey, type ApiKeyTier } from '../db/api-keys.js';
import { getRecentAuditEntries, getAuditStats } from '../db/audit.js';
import { getAllCountries, getCountryByCode, getDataVersion, getCountryDataCompleteness, getAllRegions, getRegionById, getRegionsDataVersion } from '../data/loader.js';
import { buildRegionAdjustedCountry } from '../core/regions.js';
import { calculateEntitlement } from '../core/rules.js';
import { getDb } from '../db/database.js';
import { calculateSimulation } from '../core/simulations.js';
import { listSimulations, saveSimulation, deleteSimulation, getSimulationById } from '../db/simulations-db.js';
import { createPilot, getPilotById, listPilots, updatePilot, linkDisbursement, getPilotDisbursementIds } from '../db/pilots-db.js';
import { getDisbursementById } from '../db/disbursements-db.js';
import { calculateFundingScenario } from '../core/funding.js';
import { listFundingScenarios, saveFundingScenario, deleteFundingScenario } from '../db/funding-db.js';
import { calculateImpactAnalysis } from '../core/impact.js';
import { listImpactAnalyses, saveImpactAnalysis, deleteImpactAnalysis } from '../db/impact-db.js';
import { renderDataSourcesPage, renderDataSourceDetail } from './views/data-sources.js';
import { listDataSources, getDataSourceById, createDataSource, updateDataSource, deleteDataSource, seedDefaultDataSources } from '../db/data-sources-db.js';
import {
  ensureDefaultAdmin,
  findAdminUser,
  verifyPassword,
  createSession,
  findSession,
  deleteSession,
  deleteExpiredSessions,
  SESSION_TTL_STANDARD,
  SESSION_TTL_REMEMBER,
} from '../db/admin-auth.js';
import type { SimulationParameters, TargetGroup, PilotStatus, ImpactParameters } from '../core/types.js';

// ---------------------------------------------------------------------------
// Brute-force protection — in-memory per-IP attempt tracker
// ---------------------------------------------------------------------------

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord { count: number; resetAt: number }
const loginAttempts = new Map<string, AttemptRecord>();

function getClientIp(request: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  return request.ip ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) { loginAttempts.delete(ip); return false; }
  return rec.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedAttempt(ip: string): void {
  const rec = loginAttempts.get(ip);
  if (!rec || Date.now() > rec.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: Date.now() + LOCKOUT_MS });
  } else {
    rec.count += 1;
  }
}

function clearAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function getSessionToken(request: { headers: Record<string, string | string[] | undefined> }): string | null {
  const cookie = request.headers.cookie as string | undefined;
  if (!cookie) return null;
  const match = cookie.match(/ogi_session=([^;]+)/);
  return match ? match[1] : null;
}

function getAuthenticatedUserId(request: { headers: Record<string, string | string[] | undefined> }): string | null {
  const token = getSessionToken(request);
  if (!token) return null;
  const session = findSession(token);
  return session ? session.userId : null;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // Seed the default admin user from env vars on startup
  ensureDefaultAdmin();

  // ── Login page ─────────────────────────────────────────────────────────────

  app.get('/login', async (request, reply) => {
    if (getAuthenticatedUserId(request)) {
      return reply.redirect('/admin');
    }
    return reply.type('text/html').send(renderLogin());
  });

  // ── Login handler ──────────────────────────────────────────────────────────

  app.post<{ Body: { username?: string; password?: string; rememberMe?: string } }>(
    '/login',
    async (request, reply) => {
      const ip = getClientIp(request);
      const username = (request.body?.username ?? '').trim();
      const password = request.body?.password ?? '';
      const rememberMe = request.body?.rememberMe === '1';

      // Rate limit check
      if (isRateLimited(ip)) {
        return reply
          .type('text/html')
          .send(renderLogin('Too many failed attempts. Please wait 15 minutes before trying again.', username));
      }

      // Validate credentials
      const user = findAdminUser(username);
      const valid = user !== null && verifyPassword(password, user.passwordHash);

      if (!valid) {
        recordFailedAttempt(ip);
        return reply
          .type('text/html')
          .send(renderLogin('Invalid username or password.', username));
      }

      // Success
      clearAttempts(ip);
      deleteExpiredSessions();

      const token = createSession(user.id, rememberMe);
      const maxAge = rememberMe ? SESSION_TTL_REMEMBER : SESSION_TTL_STANDARD;

      return reply
        .header('set-cookie', `ogi_session=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`)
        .redirect('/admin');
    },
  );

  // ── Logout ─────────────────────────────────────────────────────────────────

  app.get('/logout', async (request, reply) => {
    const token = getSessionToken(request);
    if (token) deleteSession(token);
    return reply
      .header('set-cookie', 'ogi_session=; Path=/admin; HttpOnly; Max-Age=0')
      .redirect('/admin/login');
  });

  // ── Auth guard for all other admin routes ──────────────────────────────────

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/admin/login' || request.url === '/admin/logout') return;
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
      return reply.redirect('/admin/login');
    }
  });

  // ── Dashboard ──────────────────────────────────────────────────────────────

  app.get('/', async (_request, reply) => {
    const db = getDb();
    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    const keyCount = (db.prepare('SELECT COUNT(*) as count FROM api_keys').get() as { count: number }).count;
    const auditStats = getAuditStats();

    const data: DashboardData = {
      totalCountries: getAllCountries().length,
      totalUsers: userCount,
      totalApiKeys: keyCount,
      totalRequests: auditStats.totalRequests,
      last24hRequests: auditStats.last24hRequests,
      topEndpoints: auditStats.topEndpoints,
      dataVersion: getDataVersion(),
    };

    return reply.type('text/html').send(renderDashboard(data));
  });

  // ── API Keys ───────────────────────────────────────────────────────────────

  app.get('/api-keys', async (request, reply) => {
    const keys = listApiKeys();
    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;
    return reply.type('text/html').send(renderApiKeys(keys, flash));
  });

  app.post<{ Body: { name?: string; tier?: string } }>('/api-keys', async (request, reply) => {
    const name = request.body?.name;
    const tier = (request.body?.tier ?? 'free') as ApiKeyTier;

    if (!name) {
      return reply.redirect('/admin/api-keys?flash=Name+is+required');
    }

    const { rawKey } = createApiKey(name, tier);
    return reply.redirect(`/admin/api-keys?flash=Key+created:+${encodeURIComponent(rawKey)}`);
  });

  app.post<{ Params: { id: string } }>('/api-keys/:id/revoke', async (request, reply) => {
    revokeApiKey(request.params.id);
    return reply.redirect('/admin/api-keys?flash=Key+revoked');
  });

  // ── Audit log ──────────────────────────────────────────────────────────────

  app.get('/audit', async (_request, reply) => {
    const entries = getRecentAuditEntries(100);
    return reply.type('text/html').send(renderAuditLog(entries));
  });

  app.get('/audit/table', async (_request, reply) => {
    const entries = getRecentAuditEntries(100);
    return reply.type('text/html').send(renderAuditTable(entries));
  });

  // ── Simulate ───────────────────────────────────────────────────────────────

  app.get('/simulate', async (request, reply) => {
    const countries = getAllCountries();
    const { simulations } = listSimulations(20, 0);
    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;
    return reply.type('text/html').send(renderSimulatePage(countries, simulations, flash));
  });

  app.post<{
    Body: { country?: string; coverage?: string; durationMonths?: string; targetGroup?: string };
  }>('/simulate/preview', async (request, reply) => {
    const body = request.body ?? {};
    const countryCode = (body.country ?? '').toUpperCase();
    const coverage = Math.min(1, Math.max(0, parseFloat(body.coverage ?? '20') / 100));
    const durationMonths = Math.min(120, Math.max(1, parseInt(body.durationMonths ?? '12', 10)));
    const targetGroup = (body.targetGroup ?? 'all') as TargetGroup;

    const country = getCountryByCode(countryCode);
    if (!country) {
      return reply
        .type('text/html')
        .send(`<p style="color:var(--danger)">Country '${countryCode}' not found</p>`);
    }

    const params: SimulationParameters = {
      country: countryCode,
      coverage,
      targetGroup,
      durationMonths,
      adjustments: { floorOverride: null, householdSize: null },
    };

    const result = calculateSimulation(country, params, getDataVersion());
    return reply.type('text/html').send(renderSimulationPreview(result, undefined, country));
  });

  app.post<{
    Body: { countries?: string | string[]; coverage?: string; durationMonths?: string };
  }>('/simulate/compare', async (request, reply) => {
    const body = request.body ?? {};
    const rawCountries = Array.isArray(body.countries)
      ? body.countries
      : body.countries
        ? [body.countries]
        : [];
    const coverage = Math.min(1, Math.max(0, parseFloat(body.coverage ?? '20') / 100));
    const durationMonths = Math.min(120, Math.max(1, parseInt(body.durationMonths ?? '12', 10)));
    const dataVersion = getDataVersion();

    const results = [];
    for (const code of rawCountries) {
      const country = getCountryByCode(code.toUpperCase());
      if (!country) continue;
      const params: SimulationParameters = {
        country: country.code,
        coverage,
        targetGroup: 'all',
        durationMonths,
        adjustments: { floorOverride: null, householdSize: null },
      };
      results.push(calculateSimulation(country, params, dataVersion));
    }

    results.sort((a, b) => a.simulation.cost.annualPppUsd - b.simulation.cost.annualPppUsd);
    return reply.type('text/html').send(renderComparisonTable(results));
  });

  app.post<{ Body: { name?: string; simulationJson?: string } }>(
    '/simulate/save',
    async (request, reply) => {
      const { name, simulationJson } = request.body ?? {};
      if (!simulationJson) {
        return reply.redirect('/admin/simulate?flash=Missing+simulation+data');
      }

      try {
        const result = JSON.parse(simulationJson);
        const countryCode = result.country?.code ?? 'XX';
        const params: SimulationParameters = {
          country: countryCode,
          coverage: result.simulation?.coverageRate ?? 1,
          targetGroup: 'all',
          durationMonths: 12,
          adjustments: { floorOverride: null, householdSize: null },
        };
        saveSimulation(name ?? null, countryCode, params, result);
        return reply.redirect('/admin/simulate?flash=Simulation+saved');
      } catch {
        return reply.redirect('/admin/simulate?flash=Failed+to+save+simulation');
      }
    },
  );

  app.post<{ Body: { id?: string } }>('/simulate/delete', async (request, reply) => {
    const id = request.body?.id;
    if (id) deleteSimulation(id);
    return reply.redirect('/admin/simulate?flash=Simulation+deleted');
  });

  // ── Pilots ─────────────────────────────────────────────────────────────────

  app.get('/pilots', async (request, reply) => {
    const { pilots } = listPilots({ limit: 100, offset: 0 });
    const countries = getAllCountries();
    const { simulations } = listSimulations(100, 0);
    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;
    return reply.type('text/html').send(renderPilotsPage(pilots, countries, simulations, flash));
  });

  app.get<{ Params: { id: string } }>('/pilots/:id', async (request, reply) => {
    const pilot = getPilotById(request.params.id);
    if (!pilot) {
      return reply.redirect('/admin/pilots?flash=Pilot+not+found');
    }
    const disbursementIds = getPilotDisbursementIds(pilot.id);
    const disbursements = disbursementIds
      .map((did) => getDisbursementById(did))
      .filter((d) => d !== null);
    const simulation = pilot.simulationId ? getSimulationById(pilot.simulationId) : null;
    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;
    return reply
      .type('text/html')
      .send(renderPilotDetailPage(pilot, disbursements, simulation, flash));
  });

  app.post<{
    Body: {
      name?: string;
      countryCode?: string;
      simulationId?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
      targetRecipients?: string;
    };
  }>('/pilots/create', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.name?.trim() || !body.countryCode?.trim()) {
      return reply.redirect('/admin/pilots?flash=Name+and+country+are+required');
    }
    createPilot({
      name: body.name.trim(),
      countryCode: body.countryCode.toUpperCase(),
      description: body.description?.trim() || null,
      simulationId: body.simulationId?.trim() || null,
      startDate: body.startDate?.trim() || null,
      endDate: body.endDate?.trim() || null,
      targetRecipients: body.targetRecipients ? parseInt(body.targetRecipients, 10) || null : null,
    });
    return reply.redirect('/admin/pilots?flash=Pilot+created');
  });

  app.post<{ Params: { id: string }; Body: { status?: string } }>(
    '/pilots/:id/status',
    async (request, reply) => {
      const pilot = getPilotById(request.params.id);
      if (!pilot) {
        return reply.redirect('/admin/pilots?flash=Pilot+not+found');
      }
      const newStatus = request.body?.status;
      if (!newStatus) {
        return reply.redirect(`/admin/pilots/${pilot.id}?flash=No+status+provided`);
      }
      updatePilot(pilot.id, { status: newStatus as PilotStatus });
      return reply.redirect(
        `/admin/pilots/${pilot.id}?flash=Status+updated+to+${encodeURIComponent(newStatus)}`,
      );
    },
  );

  app.post<{ Params: { id: string }; Body: { disbursementId?: string } }>(
    '/pilots/:id/link-disbursement',
    async (request, reply) => {
      const pilot = getPilotById(request.params.id);
      if (!pilot) {
        return reply.redirect('/admin/pilots?flash=Pilot+not+found');
      }
      const disbursementId = request.body?.disbursementId?.trim();
      if (!disbursementId) {
        return reply.redirect(`/admin/pilots/${pilot.id}?flash=Disbursement+ID+required`);
      }
      const disbursement = getDisbursementById(disbursementId);
      if (!disbursement) {
        return reply.redirect(`/admin/pilots/${pilot.id}?flash=Disbursement+not+found`);
      }
      linkDisbursement(pilot.id, disbursementId);
      return reply.redirect(`/admin/pilots/${pilot.id}?flash=Disbursement+linked`);
    },
  );

  // ── Funding Scenario Builder ───────────────────────────────────────────────

  app.get('/funding', async (request, reply) => {
    const countries = getAllCountries();
    const { simulations } = listSimulations(100, 0);
    const { scenarios } = listFundingScenarios(100, 0);
    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;
    return reply.type('text/html').send(renderFundingPage(countries, simulations, scenarios, flash));
  });

  app.post<{
    Body: {
      simulationId?: string;
      country?: string;
      coverage?: string;
      durationMonths?: string;
      targetGroup?: string;
      enable_income_tax?: string;
      income_tax_rate?: string;
      enable_vat?: string;
      vat_points?: string;
      enable_carbon?: string;
      carbon_rate?: string;
      enable_wealth?: string;
      wealth_rate?: string;
      enable_ftt?: string;
      ftt_rate?: string;
      enable_automation?: string;
      automation_rate?: string;
      enable_redirect?: string;
      redirect_pct?: string;
    };
  }>('/funding/preview', async (request, reply) => {
    const body = request.body ?? {};

    // Build mechanisms from form inputs
    const mechanisms: Array<import('../core/types.js').FundingMechanismInput> = [];

    if (body.enable_income_tax === '1') {
      mechanisms.push({
        type: 'income_tax_surcharge',
        rate: parseFloat(body.income_tax_rate ?? '3') / 100,
      });
    }
    if (body.enable_vat === '1') {
      mechanisms.push({
        type: 'vat_increase',
        points: parseFloat(body.vat_points ?? '2'),
      });
    }
    if (body.enable_carbon === '1') {
      mechanisms.push({
        type: 'carbon_tax',
        dollarPerTon: parseFloat(body.carbon_rate ?? '25'),
      });
    }
    if (body.enable_wealth === '1') {
      mechanisms.push({
        type: 'wealth_tax',
        rate: parseFloat(body.wealth_rate ?? '1') / 100,
      });
    }
    if (body.enable_ftt === '1') {
      mechanisms.push({
        type: 'financial_transaction_tax',
        rate: parseFloat(body.ftt_rate ?? '0.1') / 100,
      });
    }
    if (body.enable_automation === '1') {
      mechanisms.push({
        type: 'automation_tax',
        rate: parseFloat(body.automation_rate ?? '3') / 100,
      });
    }
    if (body.enable_redirect === '1') {
      mechanisms.push({
        type: 'redirect_social_spending',
        percent: parseFloat(body.redirect_pct ?? '30') / 100,
      });
    }

    if (mechanisms.length === 0) {
      return reply
        .type('text/html')
        .send('<p style="color:var(--danger);margin-top:1rem">Please enable at least one funding mechanism.</p>');
    }

    // Resolve simulation
    let simulation;
    let country;
    let simulationId: string | null = null;

    if (body.simulationId) {
      const saved = getSimulationById(body.simulationId);
      if (!saved) {
        return reply
          .type('text/html')
          .send('<p style="color:var(--danger);margin-top:1rem">Simulation not found.</p>');
      }
      simulationId = saved.id;
      country = getCountryByCode(saved.countryCode);
      if (!country) {
        return reply
          .type('text/html')
          .send('<p style="color:var(--danger);margin-top:1rem">Country data not found for simulation.</p>');
      }
      simulation = saved.results;
    } else {
      const countryCode = (body.country ?? '').toUpperCase();
      country = getCountryByCode(countryCode);
      if (!country) {
        return reply
          .type('text/html')
          .send(`<p style="color:var(--danger);margin-top:1rem">Country '${countryCode}' not found.</p>`);
      }
      const coverage = Math.min(1, Math.max(0, parseFloat(body.coverage ?? '20') / 100));
      const durationMonths = Math.min(120, Math.max(1, parseInt(body.durationMonths ?? '12', 10)));
      const targetGroup = (body.targetGroup ?? 'all') as TargetGroup;
      const params: SimulationParameters = {
        country: country.code,
        coverage,
        targetGroup,
        durationMonths,
        adjustments: { floorOverride: null, householdSize: null },
      };
      simulation = calculateSimulation(country, params, getDataVersion());
    }

    const result = calculateFundingScenario(
      country,
      simulation,
      mechanisms,
      getDataVersion(),
      simulationId,
    );

    return reply.type('text/html').send(renderFundingPreview(result, country));
  });

  app.post<{ Body: { name?: string; resultJson?: string } }>(
    '/funding/save',
    async (request, reply) => {
      const { name, resultJson } = request.body ?? {};
      if (!resultJson) {
        return reply.redirect('/admin/funding?flash=Missing+scenario+data');
      }
      try {
        const result = JSON.parse(resultJson) as import('../core/types.js').FundingScenarioResult;
        const mechanisms = result.mechanisms.map((m) => {
          switch (m.mechanism) {
            case 'income_tax_surcharge':
              return { type: 'income_tax_surcharge' as const, rate: 0 };
            case 'vat_increase':
              return { type: 'vat_increase' as const, points: 0 };
            case 'carbon_tax':
              return { type: 'carbon_tax' as const, dollarPerTon: 0 };
            case 'wealth_tax':
              return { type: 'wealth_tax' as const, rate: 0 };
            case 'financial_transaction_tax':
              return { type: 'financial_transaction_tax' as const, rate: 0 };
            case 'automation_tax':
              return { type: 'automation_tax' as const, rate: 0 };
            case 'redirect_social_spending':
              return { type: 'redirect_social_spending' as const, percent: 0 };
          }
        });
        saveFundingScenario(
          name ?? null,
          result.simulationId ?? null,
          result.country.code,
          mechanisms,
          result,
        );
        return reply.redirect('/admin/funding?flash=Scenario+saved');
      } catch {
        return reply.redirect('/admin/funding?flash=Failed+to+save+scenario');
      }
    },
  );

  app.post<{ Body: { id?: string } }>('/funding/delete', async (request, reply) => {
    const id = request.body?.id;
    if (id) deleteFundingScenario(id);
    return reply.redirect('/admin/funding?flash=Scenario+deleted');
  });

  app.post<{ Body: { resultJson?: string } }>('/funding/export', async (request, reply) => {
    const { resultJson } = request.body ?? {};
    if (!resultJson) {
      return reply.status(400).send({ ok: false, error: { message: 'No data' } });
    }
    try {
      const data = JSON.parse(resultJson);
      return reply
        .header('content-type', 'application/json')
        .header('content-disposition', `attachment; filename="funding-scenario-${data.country?.code ?? 'export'}.json"`)
        .send(JSON.stringify(data, null, 2));
    } catch {
      return reply.status(400).send({ ok: false, error: { message: 'Invalid data' } });
    }
  });

  // ── Economic Impact ────────────────────────────────────────────────────────

  app.get('/impact', async (request, reply) => {
    const countries = getAllCountries();
    const { simulations } = listSimulations(100, 0);
    const { analyses } = listImpactAnalyses(100, 0);
    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;
    return reply.type('text/html').send(renderImpactPage(countries, simulations, analyses, flash));
  });

  app.post<{ Body: Record<string, unknown>; Querystring: { save?: string } }>(
    '/impact/preview',
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const shouldSave = (request.query as Record<string, string>).save === '1';

      const simulationId = typeof body.simulationId === 'string' ? body.simulationId : null;
      const countryCode = typeof body.country === 'string' ? (body.country as string).toUpperCase() : '';
      const coverage = typeof body.coverage === 'number' ? body.coverage : 0.2;
      const targetGroup = (typeof body.targetGroup === 'string' ? body.targetGroup : 'bottom_quintile') as TargetGroup;
      const durationMonths = typeof body.durationMonths === 'number' ? body.durationMonths : 12;
      const name = typeof body.name === 'string' ? body.name || null : null;

      let simulation;
      let country;
      let resolvedSimulationId: string | null = simulationId;

      if (simulationId) {
        const saved = getSimulationById(simulationId);
        if (!saved) {
          return reply.type('text/html').send('<p style="color:var(--danger)">Simulation not found.</p>');
        }
        country = getCountryByCode(saved.countryCode);
        if (!country) {
          return reply.type('text/html').send('<p style="color:var(--danger)">Country data not found.</p>');
        }
        simulation = saved.results;
      } else {
        if (!countryCode) {
          return reply.type('text/html').send('<p style="color:var(--danger)">Country required.</p>');
        }
        country = getCountryByCode(countryCode);
        if (!country) {
          return reply.type('text/html').send(`<p style="color:var(--danger)">Country '${countryCode}' not found.</p>`);
        }
        const params: SimulationParameters = {
          country: country.code,
          coverage: Math.min(1, Math.max(0, coverage)),
          targetGroup,
          durationMonths: Math.min(120, Math.max(1, durationMonths)),
          adjustments: { floorOverride: null, householdSize: null },
        };
        simulation = calculateSimulation(country, params, getDataVersion());
        resolvedSimulationId = null;
      }

      const impactParams: ImpactParameters = {
        country: country.code,
        coverage: Math.min(1, Math.max(0, coverage)),
        targetGroup,
        durationMonths: Math.min(120, Math.max(1, durationMonths)),
        floorOverride: null,
        simulationId: resolvedSimulationId,
      };

      const result = calculateImpactAnalysis(country, simulation, impactParams, getDataVersion());

      let savedFlag = false;
      if (shouldSave) {
        saveImpactAnalysis(name, resolvedSimulationId, country.code, impactParams, result);
        savedFlag = true;
      }

      return reply.type('text/html').send(renderImpactPreview(result, savedFlag));
    },
  );

  app.get('/impact/table', async (_request, reply) => {
    const { analyses } = listImpactAnalyses(100, 0);
    return reply.type('text/html').send(renderAnalysesTable(analyses));
  });

  app.post<{ Body: { id?: string } }>('/impact/delete', async (request, reply) => {
    const id = request.body?.id;
    if (id) deleteImpactAnalysis(id);
    return reply.redirect('/admin/impact?flash=Analysis+deleted');
  });

  app.post<{ Body: { resultJson?: string } }>('/impact/export', async (request, reply) => {
    const { resultJson } = request.body ?? {};
    if (!resultJson) {
      return reply.status(400).send({ ok: false, error: { message: 'No data' } });
    }
    try {
      const data = JSON.parse(resultJson);
      const code = (data.country?.code ?? 'export').toLowerCase();
      return reply
        .header('content-type', 'application/json')
        .header('content-disposition', `attachment; filename="impact-brief-${code}.json"`)
        .send(JSON.stringify(data, null, 2));
    } catch {
      return reply.status(400).send({ ok: false, error: { message: 'Invalid data' } });
    }
  });

  // ── Countries ──────────────────────────────────────────────────────────────

  app.get('/countries', async (_request, reply) => {
    const countries = getAllCountries();
    const items: CountryListItem[] = countries.map((c) => ({
      country: c,
      completeness: getCountryDataCompleteness(c.code) ?? {
        total: 17,
        available: 0,
        unavailable: 0,
        notFetched: 17,
        unavailableFields: [],
        notFetchedFields: [],
        missingFields: [],
        presentFields: [],
      },
    }));
    return reply
      .type('text/html')
      .send(renderCountryList(items, getDataVersion()));
  });

  app.get<{ Params: { code: string } }>('/countries/:code', async (request, reply) => {
    const code = request.params.code.toUpperCase();
    const country = getCountryByCode(code);
    if (!country) {
      return reply.redirect('/admin/countries?flash=Country+not+found');
    }
    const completeness = getCountryDataCompleteness(code) ?? {
      total: 17,
      available: 0,
      unavailable: 0,
      notFetched: 17,
      unavailableFields: [],
      notFetchedFields: [],
      missingFields: [],
      presentFields: [],
    };
    const allCountries = getAllCountries();
    return reply
      .type('text/html')
      .send(renderCountryDetail(country, completeness, allCountries, getDataVersion()));
  });

  // ── Regions ──────────────────────────────────────────────────────────────

  app.get('/regions', async (_request, reply) => {
    const regions = getAllRegions();
    return reply
      .type('text/html')
      .send(renderRegionList(regions, getRegionsDataVersion()));
  });

  app.get<{ Params: { id: string } }>('/regions/:id', async (request, reply) => {
    const region = getRegionById(request.params.id);
    if (!region) {
      return reply.redirect('/admin/regions?flash=Region+not+found');
    }
    const country = getCountryByCode(region.countryCode);
    if (!country) {
      return reply.redirect('/admin/regions?flash=Country+data+not+found');
    }
    const dataVersion = getDataVersion();
    const nationalEntitlement = calculateEntitlement(country, dataVersion);
    const adjustedCountry = buildRegionAdjustedCountry(country, region);
    const regionalEntitlement = calculateEntitlement(adjustedCountry, dataVersion);
    return reply
      .type('text/html')
      .send(renderRegionDetail(
        region,
        country.stats.pppConversionFactor,
        nationalEntitlement.localCurrencyPerMonth,
        regionalEntitlement.localCurrencyPerMonth,
        getRegionsDataVersion(),
      ));
  });

  // ── Data Sources ──────────────────────────────────────────────────────────

  app.get<{ Querystring: { flash?: string } }>('/data-sources', async (request, reply) => {
    seedDefaultDataSources();
    const sources = listDataSources();
    return reply.type('text/html').send(renderDataSourcesPage(sources, request.query.flash));
  });

  app.get<{ Params: { id: string } }>('/data-sources/:id', async (request, reply) => {
    const source = getDataSourceById(request.params.id);
    if (!source) {
      return reply.redirect('/admin/data-sources?flash=Source+not+found');
    }
    return reply.type('text/html').send(renderDataSourceDetail(source));
  });

  app.post<{ Body: { name?: string; type?: string; provider?: string; url?: string; description?: string; data_year?: string } }>(
    '/data-sources',
    async (request, reply) => {
      const { name, type, provider, url, description, data_year } = request.body ?? {};
      if (!name || !type || !provider) {
        return reply.redirect('/admin/data-sources?flash=Name,+type,+and+provider+are+required');
      }
      createDataSource({
        name,
        type: type as 'api' | 'upload' | 'manual',
        provider,
        url: url || undefined,
        description: description || undefined,
        data_year: data_year || undefined,
      });
      return reply.redirect('/admin/data-sources?flash=Data+source+added');
    },
  );

  app.post<{ Params: { id: string }; Body: { name?: string; url?: string; description?: string; data_year?: string; status?: string } }>(
    '/data-sources/:id/edit',
    async (request, reply) => {
      const { name, url, description, data_year, status } = request.body ?? {};
      const source = getDataSourceById(request.params.id);
      if (!source) {
        return reply.redirect('/admin/data-sources?flash=Source+not+found');
      }
      updateDataSource(request.params.id, {
        ...(name ? { name } : {}),
        ...(url !== undefined ? { url } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(data_year !== undefined ? { data_year } : {}),
        ...(status ? { status: status as 'active' | 'disabled' } : {}),
      });
      return reply.redirect(`/admin/data-sources/${request.params.id}`);
    },
  );

  app.post<{ Params: { id: string } }>('/data-sources/:id/refresh', async (request, reply) => {
    const source = getDataSourceById(request.params.id);
    if (!source) {
      return reply.redirect('/admin/data-sources?flash=Source+not+found');
    }
    // Update last_fetched_at timestamp (actual fetch integration is provider-specific)
    updateDataSource(request.params.id, {
      last_fetched_at: new Date().toISOString(),
    });
    return reply.redirect(`/admin/data-sources?flash=Data+refresh+triggered+for+${encodeURIComponent(source.name)}`);
  });

  app.post<{ Params: { id: string } }>('/data-sources/:id/delete', async (request, reply) => {
    deleteDataSource(request.params.id);
    return reply.redirect('/admin/data-sources?flash=Data+source+deleted');
  });
};
