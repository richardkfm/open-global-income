import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { renderLogin } from './views/login.js';
import { renderDashboard, type DashboardData } from './views/dashboard.js';
import { renderApiKeys } from './views/api-keys.js';
import { renderAuditLog, renderAuditTable } from './views/audit.js';
import { renderSimulatePage, renderSimulationPreview, renderComparisonTable, type SimulationPreviewContext } from './views/simulate.js';
import { renderPilotsPage, renderPilotDetailPage } from './views/pilots.js';
import { renderCountryList, renderCountryDetail, type CountryListItem } from './views/countries.js';
import { renderRegionList, renderRegionDetail } from './views/regions.js';
import { renderFundingPage, renderFundingPreview } from './views/funding.js';
import { renderImpactPage, renderImpactPreview, renderAnalysesTable } from './views/impact.js';
import { listApiKeys, createApiKey, revokeApiKey, type ApiKeyTier } from '../db/api-keys.js';
import { getRecentAuditEntries, getAuditStats } from '../db/audit.js';
import { getAllCountries, getCountryByCode, getDataVersion, getCountryDataCompleteness, getAllRegions, getRegionById, getRegionsDataVersion, getFxSnapshot } from '../data/loader.js';
import { buildRegionAdjustedCountry } from '../core/regions.js';
import { calculateEntitlement } from '../core/rules.js';
import { getDb } from '../db/database.js';
import { calculateSimulation } from '../core/simulations.js';
import { listSimulations, saveSimulation, deleteSimulation, getSimulationById } from '../db/simulations-db.js';
import { createPilot, getPilotById, listPilots, updatePilot, linkDisbursement, getPilotDisbursementIds } from '../db/pilots-db.js';
import { getDisbursementById, getLogEntries } from '../db/disbursements-db.js';
import { listRecipients } from '../db/recipients-db.js';
import { RULESETS } from '../core/rulesets.js';
import { GLOBAL_INCOME_FLOOR_PPP } from '../core/constants.js';
import { calculateFundingScenario } from '../core/funding.js';
import { listFundingScenarios, saveFundingScenario, deleteFundingScenario } from '../db/funding-db.js';
import { calculateImpactAnalysis } from '../core/impact.js';
import { listImpactAnalyses, saveImpactAnalysis, deleteImpactAnalysis, getImpactAnalysisById } from '../db/impact-db.js';
import { calculateFiscalContext } from '../core/funding.js';
import { getFundingScenarioById } from '../db/funding-db.js';
import { createProgram, getProgram, listPrograms, deleteProgram } from '../db/programs-db.js';
import {
  renderProgramsList,
  renderProgramNew,
  renderProgramDetail,
  renderProgramPrint,
  type ProgramListItem,
} from './views/programs.js';
import { renderDataSourcesPage, renderDataSourceDetail } from './views/data-sources.js';
import { renderEvidencePage } from './views/evidence.js';
import { renderComparePage, renderCompareResults } from './views/compare.js';
import { renderEvidenceAggregatePage } from './views/evidence-aggregate.js';
import { recordOutcome, getPilotOutcomes, getOutcomeComparison, aggregateOutcomes } from '../db/outcomes-db.js';
import { getLatestImpactAnalysisBySimulation } from '../db/impact-db.js';
import { escapeHtml } from './views/helpers.js';
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
import type { SimulationParameters, TargetGroup, TargetingRules, PilotStatus, ImpactParameters } from '../core/types.js';

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
// Audit export helpers
// ---------------------------------------------------------------------------

function canonicalJson(obj: unknown): string {
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  if (obj !== null && typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    return (
      '{' +
      keys
        .map((k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// Targeting rules — parse flat form fields into a TargetingRules object
// ---------------------------------------------------------------------------

/**
 * Build a TargetingRules object from flat HTML form fields.
 * Returns null if no meaningful rule is present.
 * Field names:
 *   tr_preset, tr_age_min, tr_age_max, tr_urban_rural,
 *   tr_max_income, tr_identity_providers, tr_exclude_paid_days, tr_region_ids
 */
function parseFormTargetingRules(body: Record<string, string | undefined>): TargetingRules | null {
  const rules: TargetingRules = {};
  let hasAny = false;

  const preset = body.tr_preset;
  if (preset && preset !== '' && preset !== 'all') {
    rules.preset = preset as TargetGroup;
    hasAny = true;
  }

  const ageMin = body.tr_age_min ? parseInt(body.tr_age_min, 10) : NaN;
  const ageMax = body.tr_age_max ? parseInt(body.tr_age_max, 10) : NaN;
  if (!isNaN(ageMin) && !isNaN(ageMax) && ageMin >= 0 && ageMax >= ageMin) {
    rules.ageRange = [ageMin, ageMax];
    hasAny = true;
  }

  const urbanRural = body.tr_urban_rural;
  if (urbanRural === 'urban' || urbanRural === 'rural' || urbanRural === 'mixed') {
    rules.urbanRural = urbanRural;
    hasAny = true;
  }

  const maxIncome = body.tr_max_income ? parseFloat(body.tr_max_income) : NaN;
  if (!isNaN(maxIncome) && maxIncome > 0) {
    rules.maxMonthlyIncomePppUsd = maxIncome;
    hasAny = true;
  }

  const providers = body.tr_identity_providers?.trim();
  if (providers) {
    const list = providers.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
    if (list.length > 0) {
      rules.identityProviders = list;
      hasAny = true;
    }
  }

  const excludeDays = body.tr_exclude_paid_days ? parseInt(body.tr_exclude_paid_days, 10) : NaN;
  if (!isNaN(excludeDays) && excludeDays > 0) {
    rules.excludeIfPaidWithinDays = excludeDays;
    hasAny = true;
  }

  const regionIds = body.tr_region_ids?.trim();
  if (regionIds) {
    const list = regionIds.split(',').map((r) => r.trim()).filter((r) => r.length > 0);
    if (list.length > 0) {
      rules.regionIds = list;
      hasAny = true;
    }
  }

  return hasAny ? rules : null;
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
    const stats = getAuditStats();
    return reply.type('text/html').send(
      renderAuditLog(entries, {
        totalRequests: stats.totalRequests,
        last24hRequests: stats.last24hRequests,
      }),
    );
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
    Body: Record<string, string | undefined>;
  }>('/simulate/preview', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string | undefined>;
    const countryCode = (body.country ?? '').toUpperCase();
    const coverage = Math.min(1, Math.max(0, parseFloat(body.coverage ?? '20') / 100));
    const durationMonths = Math.min(120, Math.max(1, parseInt(body.durationMonths ?? '12', 10)));
    const targetGroup = (body.targetGroup ?? 'all') as TargetGroup;
    const rawTransfer = body.transferAmount ? parseFloat(body.transferAmount) : NaN;
    const floorOverride = Number.isFinite(rawTransfer) && rawTransfer > 0 ? rawTransfer : null;

    // Build targeting rules from advanced filter fields; fall back to targetGroup preset
    const extraRules = parseFormTargetingRules(body);
    const targetingRules: TargetingRules | undefined = extraRules
      ? { preset: targetGroup !== 'all' ? targetGroup : undefined, ...extraRules }
      : undefined;

    const country = getCountryByCode(countryCode);
    if (!country) {
      return reply
        .type('text/html')
        .send(`<p style="color:var(--danger)">Country '${escapeHtml(countryCode)}' not found</p>`);
    }

    const params: SimulationParameters = {
      country: countryCode,
      coverage,
      targetGroup,
      ...(targetingRules ? { targetingRules } : {}),
      durationMonths,
      adjustments: { floorOverride, householdSize: null },
    };

    // Collect form fields to carry through to the save endpoint
    const savedFormFields: Record<string, string> = {};
    for (const key of ['targetGroup', 'transferAmount', 'tr_preset', 'tr_age_min', 'tr_age_max', 'tr_urban_rural',
      'tr_max_income', 'tr_identity_providers', 'tr_exclude_paid_days', 'tr_region_ids']) {
      if (body[key]) savedFormFields[key] = body[key] as string;
    }

    const result = calculateSimulation(country, params, getDataVersion());
    const annualCost = result.simulation.cost.annualPppUsd;
    const fiscalContext = annualCost > 0 ? calculateFiscalContext(country, annualCost) : null;
    return reply.type('text/html').send(
      renderSimulationPreview(result, undefined, country, {
        savedFormFields,
        fullCountry: country,
        fiscalContext,
      }),
    );
  });

  app.post<{
    Body: { countries?: string | string[]; coverage?: string; durationMonths?: string; transferAmount?: string };
  }>('/simulate/compare', async (request, reply) => {
    const body = request.body ?? {};
    const rawCountries = Array.isArray(body.countries)
      ? body.countries
      : body.countries
        ? [body.countries]
        : [];
    const coverage = Math.min(1, Math.max(0, parseFloat(body.coverage ?? '20') / 100));
    const durationMonths = Math.min(120, Math.max(1, parseInt(body.durationMonths ?? '12', 10)));
    const rawTransfer = body.transferAmount ? parseFloat(body.transferAmount) : NaN;
    const floorOverride = Number.isFinite(rawTransfer) && rawTransfer > 0 ? rawTransfer : null;
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
        adjustments: { floorOverride, householdSize: null },
      };
      results.push(calculateSimulation(country, params, dataVersion));
    }

    results.sort((a, b) => a.simulation.cost.annualPppUsd - b.simulation.cost.annualPppUsd);
    return reply.type('text/html').send(renderComparisonTable(results));
  });

  app.post<{ Body: Record<string, string | undefined> }>(
    '/simulate/save',
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, string | undefined>;
      const { name, simulationJson } = body;
      if (!simulationJson) {
        return reply.redirect('/admin/simulate?flash=Missing+simulation+data');
      }

      try {
        const result = JSON.parse(simulationJson);
        const countryCode = result.country?.code ?? 'XX';
        const targetGroup = (body.targetGroup ?? 'all') as TargetGroup;
        const rawTransfer = body.transferAmount ? parseFloat(body.transferAmount) : NaN;
        const floorOverride = Number.isFinite(rawTransfer) && rawTransfer > 0 ? rawTransfer : null;
        const extraRules = parseFormTargetingRules(body);
        const targetingRules: TargetingRules | undefined = extraRules
          ? { preset: targetGroup !== 'all' ? targetGroup : undefined, ...extraRules }
          : undefined;
        const params: SimulationParameters = {
          country: countryCode,
          coverage: result.simulation?.coverageRate ?? 1,
          targetGroup,
          ...(targetingRules ? { targetingRules } : {}),
          durationMonths: result.simulation?.meta ? 12 : 12,
          adjustments: { floorOverride, householdSize: null },
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

  // ── Compare (multi-country pilot-site selection) ──────────────────────────

  app.get('/compare', async (request, reply) => {
    const countries = getAllCountries();
    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;
    return reply.type('text/html').send(renderComparePage(countries, flash));
  });

  app.post<{
    Body: {
      countries?: string | string[];
      coverage?: string;
      durationMonths?: string;
      targetGroup?: string;
      transferAmount?: string;
      rulesetVersion?: string;
    };
  }>('/compare/preview', async (request, reply) => {
    const body = request.body ?? {};
    const rawCountries = Array.isArray(body.countries)
      ? body.countries
      : body.countries
        ? [body.countries]
        : [];
    const coverage = Math.min(1, Math.max(0, parseFloat(body.coverage ?? '20') / 100));
    const durationMonths = Math.min(120, Math.max(1, parseInt(body.durationMonths ?? '12', 10)));
    const targetGroup = (body.targetGroup ?? 'bottom_quintile') as TargetGroup;
    const rawTransfer = body.transferAmount ? parseFloat(body.transferAmount) : NaN;
    const floorOverride = Number.isFinite(rawTransfer) && rawTransfer > 0 ? rawTransfer : null;
    const dataVersion = getDataVersion();

    const results = [];
    for (const code of rawCountries) {
      const country = getCountryByCode(code.toUpperCase());
      if (!country) continue;
      const params: SimulationParameters = {
        country: country.code,
        coverage,
        targetGroup,
        durationMonths,
        adjustments: { floorOverride, householdSize: null },
      };
      results.push(calculateSimulation(country, params, dataVersion));
    }

    return reply.type('text/html').send(renderCompareResults(results));
  });

  // ── Evidence Aggregate (cross-pilot outcomes) ─────────────────────────────

  app.get('/evidence', async (request, reply) => {
    const url = new URL(request.url, 'http://localhost');
    const incomeGroup = url.searchParams.get('incomeGroup') ?? '';
    const country = url.searchParams.get('country') ?? '';
    const minSampleSize = Math.max(0, parseInt(url.searchParams.get('minSampleSize') ?? '0', 10) || 0);

    const aggregate = aggregateOutcomes({
      country: country || undefined,
      incomeGroup: incomeGroup || undefined,
    });
    const countries = getAllCountries();

    return reply.type('text/html').send(
      renderEvidenceAggregatePage({
        aggregate,
        countries,
        filters: { incomeGroup, country, minSampleSize },
      }),
    );
  });

  app.post<{
    Body: { incomeGroup?: string; country?: string; minSampleSize?: string };
  }>('/evidence', async (request, reply) => {
    const body = request.body ?? {};
    const qs = new URLSearchParams();
    if (body.incomeGroup) qs.set('incomeGroup', body.incomeGroup);
    if (body.country) qs.set('country', body.country);
    if (body.minSampleSize) qs.set('minSampleSize', body.minSampleSize);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return reply.redirect(`/admin/evidence${suffix}`);
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

    const outcomes = getPilotOutcomes(pilot.id);
    const impactAnalysis = pilot.simulationId
      ? getLatestImpactAnalysisBySimulation(pilot.simulationId)
      : null;
    const projectedImpact = impactAnalysis
      ? {
          povertyReductionPercent: impactAnalysis.results.povertyReduction.liftedAsPercentOfPoor ?? null,
          incomeIncreasePercent: impactAnalysis.results.purchasingPower.incomeIncreasePercent ?? null,
        }
      : null;
    const comparison = outcomes.length > 0 ? getOutcomeComparison(pilot.id, projectedImpact) : null;

    return reply
      .type('text/html')
      .send(
        renderPilotDetailPage(
          pilot,
          disbursements,
          simulation,
          flash,
          outcomes,
          comparison,
          impactAnalysis,
        ),
      );
  });

  app.post<{ Body: Record<string, string | undefined> }>('/pilots/create', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string | undefined>;
    if (!body.name?.trim() || !body.countryCode?.trim()) {
      return reply.redirect('/admin/pilots?flash=Name+and+country+are+required');
    }
    const targetingRules = parseFormTargetingRules(body);
    createPilot({
      name: body.name.trim(),
      countryCode: body.countryCode.toUpperCase(),
      description: body.description?.trim() || null,
      simulationId: body.simulationId?.trim() || null,
      targetingRules,
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

  // ── GET /admin/pilots/:id/audit-export ────────────────────────────────────

  app.get<{ Params: { id: string } }>('/pilots/:id/audit-export', async (request, reply) => {
    const pilot = getPilotById(request.params.id);
    if (!pilot) {
      return reply.redirect('/admin/pilots?flash=Pilot+not+found');
    }

    const disbursementIds = getPilotDisbursementIds(pilot.id);
    const disbursements = disbursementIds
      .map((did) => getDisbursementById(did))
      .filter((d) => d !== null);

    const { items: pilotRecipients } = listRecipients({ pilotId: pilot.id, page: 1, limit: 10000 });
    const byCountry: Record<string, number> = {};
    for (const r of pilotRecipients) {
      byCountry[r.countryCode] = (byCountry[r.countryCode] ?? 0) + 1;
    }

    const activeRuleset = RULESETS.find((r) => r.active) ?? RULESETS[0];
    const dataVersion = getDataVersion();

    const disbursementsAudit = disbursements.map((d) => ({
      id: d.id,
      status: d.status,
      recipientCount: d.recipientCount,
      totalAmount: d.totalAmount,
      currency: d.currency,
      approvedAt: d.approvedAt ?? null,
      completedAt: d.completedAt ?? null,
      log: getLogEntries(d.id),
    }));

    const generatedAt = new Date().toISOString();

    const payload = {
      exportVersion: '1.0',
      generatedAt,
      pilot: {
        id: pilot.id,
        name: pilot.name,
        countryCode: pilot.countryCode,
        status: pilot.status,
        startDate: pilot.startDate ?? null,
        endDate: pilot.endDate ?? null,
        targetRecipients: pilot.targetRecipients ?? null,
        description: pilot.description ?? null,
        createdAt: pilot.createdAt,
      },
      methodology: {
        rulesetVersion: activeRuleset.version,
        dataVersion,
        formulaDescription: activeRuleset.description,
        entitlementPerRecipient: { pppUsd: GLOBAL_INCOME_FLOOR_PPP },
      },
      recipients: {
        totalEnrolled: pilotRecipients.length,
        totalVerified: pilotRecipients.filter((r) => r.status === 'verified').length,
        totalSuspended: pilotRecipients.filter((r) => r.status === 'suspended').length,
        byCountry,
      },
      disbursements: disbursementsAudit,
    };

    const sha256 = createHash('sha256').update(canonicalJson(payload)).digest('hex');

    const exportDoc = {
      ...payload,
      integrity: {
        sha256,
        signedBy: 'ogi-platform',
        algorithm: 'SHA-256',
      },
    };

    return reply
      .header('Content-Disposition', `attachment; filename="audit-export-${pilot.id}.json"`)
      .type('application/json')
      .send(JSON.stringify(exportDoc, null, 2));
  });

  // ── GET /admin/pilots/:id/evidence ────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/pilots/:id/evidence', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    if (!userId) return reply.redirect('/admin/login');

    const pilot = getPilotById(request.params.id);
    if (!pilot) return reply.redirect('/admin/pilots?flash=Pilot+not+found');

    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;

    const outcomes = getPilotOutcomes(pilot.id);

    let projectedImpact: { povertyReductionPercent: number | null; incomeIncreasePercent: number | null } | null = null;
    if (pilot.simulationId) {
      const ia = getLatestImpactAnalysisBySimulation(pilot.simulationId);
      if (ia) {
        projectedImpact = {
          povertyReductionPercent: ia.results.povertyReduction.liftedAsPercentOfPoor ?? null,
          incomeIncreasePercent: ia.results.purchasingPower.incomeIncreasePercent ?? null,
        };
      }
    }

    const comparison = outcomes.length > 0 ? getOutcomeComparison(pilot.id, projectedImpact) : null;

    return reply.type('text/html').send(renderEvidencePage(pilot, outcomes, comparison, flash));
  });

  // ── POST /admin/pilots/:id/outcomes/create ─────────────────────────────────

  app.post<{ Params: { id: string }; Body: Record<string, string> }>(
    '/pilots/:id/outcomes/create',
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      if (!userId) return reply.redirect('/admin/login');

      const pilot = getPilotById(request.params.id);
      if (!pilot) return reply.redirect('/admin/pilots?flash=Pilot+not+found');

      const {
        cohortType,
        measurementDate,
        sampleSize,
        dataSource,
        isBaseline,
        employmentRate,
        averageMonthlyIncomeUsd,
        foodSecurityScore,
        childSchoolAttendanceRate,
        abovePovertyLinePercent,
        selfReportedHealthScore,
        savingsRate,
      } = request.body ?? {};

      if (!['recipient', 'control'].includes(cohortType)) {
        return reply.redirect(
          `/admin/pilots/${pilot.id}/evidence?flash=Invalid+cohort+type`,
        );
      }
      if (!measurementDate) {
        return reply.redirect(
          `/admin/pilots/${pilot.id}/evidence?flash=Measurement+date+required`,
        );
      }
      const parsedSampleSize = parseInt(sampleSize ?? '', 10);
      if (isNaN(parsedSampleSize) || parsedSampleSize < 1) {
        return reply.redirect(
          `/admin/pilots/${pilot.id}/evidence?flash=Sample+size+must+be+a+positive+integer`,
        );
      }
      if (!dataSource?.trim()) {
        return reply.redirect(
          `/admin/pilots/${pilot.id}/evidence?flash=Data+source+required`,
        );
      }

      // Parse optional indicators
      function parseOptionalRate(val: string | undefined): number | null {
        if (!val || val.trim() === '') return null;
        const n = parseFloat(val);
        return isNaN(n) ? null : n;
      }

      const indicators = {
        employmentRate: parseOptionalRate(employmentRate),
        averageMonthlyIncomeUsd: parseOptionalRate(averageMonthlyIncomeUsd),
        foodSecurityScore: parseOptionalRate(foodSecurityScore),
        childSchoolAttendanceRate: parseOptionalRate(childSchoolAttendanceRate),
        abovePovertyLinePercent: parseOptionalRate(abovePovertyLinePercent),
        selfReportedHealthScore: parseOptionalRate(selfReportedHealthScore),
        savingsRate: parseOptionalRate(savingsRate),
      };

      const hasAny = Object.values(indicators).some((v) => v !== null);
      if (!hasAny) {
        return reply.redirect(
          `/admin/pilots/${pilot.id}/evidence?flash=At+least+one+indicator+is+required`,
        );
      }

      recordOutcome({
        pilotId: pilot.id,
        cohortType: cohortType as 'recipient' | 'control',
        measurementDate,
        indicators,
        sampleSize: parsedSampleSize,
        dataSource: dataSource.trim(),
        isBaseline: isBaseline === '1',
      });

      return reply.redirect(
        `/admin/pilots/${pilot.id}/evidence?flash=Outcome+recorded`,
      );
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
      transferAmount?: string;
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
        rate: parseFloat(body.income_tax_rate ?? '0') / 100,
      });
    }
    if (body.enable_vat === '1') {
      mechanisms.push({
        type: 'vat_increase',
        points: parseFloat(body.vat_points ?? '0'),
      });
    }
    if (body.enable_carbon === '1') {
      mechanisms.push({
        type: 'carbon_tax',
        dollarPerTon: parseFloat(body.carbon_rate ?? '0'),
      });
    }
    if (body.enable_wealth === '1') {
      mechanisms.push({
        type: 'wealth_tax',
        rate: parseFloat(body.wealth_rate ?? '0') / 100,
      });
    }
    if (body.enable_ftt === '1') {
      mechanisms.push({
        type: 'financial_transaction_tax',
        rate: parseFloat(body.ftt_rate ?? '0') / 100,
      });
    }
    if (body.enable_automation === '1') {
      mechanisms.push({
        type: 'automation_tax',
        rate: parseFloat(body.automation_rate ?? '0') / 100,
      });
    }
    if (body.enable_redirect === '1') {
      mechanisms.push({
        type: 'redirect_social_spending',
        percent: parseFloat(body.redirect_pct ?? '0') / 100,
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
          .send(`<p style="color:var(--danger);margin-top:1rem">Country '${escapeHtml(countryCode)}' not found.</p>`);
      }
      const coverage = Math.min(1, Math.max(0, parseFloat(body.coverage ?? '20') / 100));
      const durationMonths = Math.min(120, Math.max(1, parseInt(body.durationMonths ?? '12', 10)));
      const targetGroup = (body.targetGroup ?? 'all') as TargetGroup;
      const rawTransfer = body.transferAmount ? parseFloat(body.transferAmount) : NaN;
      const floorOverride = Number.isFinite(rawTransfer) && rawTransfer > 0 ? rawTransfer : null;
      const params: SimulationParameters = {
        country: country.code,
        coverage,
        targetGroup,
        durationMonths,
        adjustments: { floorOverride, householdSize: null },
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

    return reply.type('text/html').send(renderFundingPreview(result, country, mechanisms));
  });

  app.post<{ Body: { name?: string; resultJson?: string; mechanismsJson?: string } }>(
    '/funding/save',
    async (request, reply) => {
      const { name, resultJson, mechanismsJson } = request.body ?? {};
      if (!resultJson || !mechanismsJson) {
        return reply.redirect('/admin/funding?flash=Missing+scenario+data');
      }
      try {
        const result = JSON.parse(resultJson) as import('../core/types.js').FundingScenarioResult;
        const mechanisms = JSON.parse(
          mechanismsJson,
        ) as import('../core/types.js').FundingMechanismInput[];
        if (!Array.isArray(mechanisms) || mechanisms.length === 0) {
          return reply.redirect('/admin/funding?flash=No+mechanisms+to+save');
        }
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
      const rawTransfer = typeof body.transferAmount === 'number' ? body.transferAmount
        : typeof body.transferAmount === 'string' ? parseFloat(body.transferAmount) : NaN;
      const floorOverride = Number.isFinite(rawTransfer) && rawTransfer > 0 ? rawTransfer : null;

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
          return reply.type('text/html').send(`<p style="color:var(--danger)">Country '${escapeHtml(countryCode)}' not found.</p>`);
        }
        const params: SimulationParameters = {
          country: country.code,
          coverage: Math.min(1, Math.max(0, coverage)),
          targetGroup,
          durationMonths: Math.min(120, Math.max(1, durationMonths)),
          adjustments: { floorOverride, householdSize: null },
        };
        simulation = calculateSimulation(country, params, getDataVersion());
        resolvedSimulationId = null;
      }

      const impactParams: ImpactParameters = {
        country: country.code,
        coverage: Math.min(1, Math.max(0, coverage)),
        targetGroup,
        durationMonths: Math.min(120, Math.max(1, durationMonths)),
        floorOverride,
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

  // ── Programs (Program Briefs — Phase 1 UX overhaul) ───────────────────────

  app.get('/programs', async (request, reply) => {
    const { items } = listPrograms({ limit: 100, offset: 0 });
    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;

    const listItems: ProgramListItem[] = items.map((program) => {
      const country = getCountryByCode(program.countryCode);
      return {
        program,
        countryName: country?.name ?? program.countryCode,
        hasSimulation: program.simulationId != null,
        hasFunding: program.fundingScenarioId != null,
        hasImpact: program.impactAnalysisId != null,
        hasPilot: program.pilotId != null,
      };
    });

    return reply.type('text/html').send(renderProgramsList(listItems, flash));
  });

  app.get('/programs/new', async (request, reply) => {
    const countries = getAllCountries();
    const { simulations } = listSimulations(100, 0);
    const { scenarios } = listFundingScenarios(100, 0);
    const { analyses } = listImpactAnalyses(100, 0);
    const { pilots } = listPilots({ limit: 100, offset: 0 });
    const regions = getAllRegions();
    const url = new URL(request.url, 'http://localhost');
    const preselect = {
      countryCode: url.searchParams.get('country') ?? undefined,
      simulationId: url.searchParams.get('simulationId') ?? undefined,
      fundingScenarioId: url.searchParams.get('fundingScenarioId') ?? undefined,
      impactAnalysisId: url.searchParams.get('impactAnalysisId') ?? undefined,
      pilotId: url.searchParams.get('pilotId') ?? undefined,
    };
    return reply.type('text/html').send(renderProgramNew({
      countries,
      simulations,
      fundingScenarios: scenarios,
      impactAnalyses: analyses,
      pilots,
      regions,
      preselect,
    }));
  });

  app.post<{ Body: Record<string, unknown> }>(
    '/programs',
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const countryCode = typeof body.country === 'string' ? (body.country as string).toUpperCase() : '';

      if (!name || !countryCode) {
        return reply.redirect('/admin/programs/new?flash=Name+and+country+required');
      }

      const str = (k: string) => (typeof body[k] === 'string' && (body[k] as string).length > 0 ? (body[k] as string) : undefined);

      const program = createProgram({
        name,
        countryCode,
        simulationId: str('simulationId'),
        fundingScenarioId: str('fundingScenarioId'),
        impactAnalysisId: str('impactAnalysisId'),
        pilotId: str('pilotId'),
        regionId: str('regionId'),
        notes: str('notes'),
      });

      return reply.redirect(`/admin/programs/${program.id}`);
    },
  );

  function loadProgramContext(id: string) {
    const program = getProgram(id);
    if (!program) return null;
    const country = getCountryByCode(program.countryCode);
    if (!country) return null;

    const region = program.regionId ? (getRegionById(program.regionId) ?? null) : null;
    const simulation = program.simulationId ? getSimulationById(program.simulationId) : null;
    const fundingScenario = program.fundingScenarioId ? getFundingScenarioById(program.fundingScenarioId) : null;
    const impactAnalysis = program.impactAnalysisId ? getImpactAnalysisById(program.impactAnalysisId) : null;
    const pilot = program.pilotId ? getPilotById(program.pilotId) : null;

    // Derive fiscal context from whichever cost source is available.
    const annualCost = simulation?.results.simulation.cost.annualPppUsd
      ?? impactAnalysis?.results.program.annualCostPppUsd
      ?? 0;
    const fiscalContext = annualCost > 0 ? calculateFiscalContext(country, annualCost) : null;

    return {
      program,
      country,
      region,
      simulation,
      fundingScenario,
      impactAnalysis,
      pilot,
      fiscalContext,
    };
  }

  app.get<{ Params: { id: string } }>('/programs/:id', async (request, reply) => {
    const ctx = loadProgramContext(request.params.id);
    if (!ctx) {
      return reply.status(404).type('text/html').send('<p>Program brief not found.</p>');
    }
    return reply.type('text/html').send(renderProgramDetail(ctx));
  });

  app.get<{ Params: { id: string } }>('/programs/:id/print', async (request, reply) => {
    const ctx = loadProgramContext(request.params.id);
    if (!ctx) {
      return reply.status(404).type('text/html').send('<p>Program brief not found.</p>');
    }
    return reply.type('text/html').send(renderProgramPrint(ctx));
  });

  app.post<{ Params: { id: string } }>('/programs/:id/delete', async (request, reply) => {
    deleteProgram(request.params.id);
    return reply.redirect('/admin/programs?flash=Brief+deleted');
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

  app.get<{ Params: { code: string }; Querystring: { currency?: string } }>('/countries/:code', async (request, reply) => {
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
    const fxSnapshot = getFxSnapshot();
    return reply
      .type('text/html')
      .send(
        renderCountryDetail(
          country,
          completeness,
          allCountries,
          getDataVersion(),
          undefined,
          { fxSnapshot, displayCurrency: request.query.currency },
        ),
      );
  });

  // ── Regions ──────────────────────────────────────────────────────────────

  app.get('/regions', async (request, reply) => {
    const url = new URL(request.url, 'http://localhost');
    const view = (url.searchParams.get('view') ?? 'table') === 'map' ? 'map' : 'table';
    const indicator = (url.searchParams.get('indicator') ?? 'col') === 'poverty' ? 'poverty' : 'col';
    const regions = getAllRegions();
    return reply
      .type('text/html')
      .send(renderRegionList(regions, getRegionsDataVersion(), undefined, view, indicator));
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
