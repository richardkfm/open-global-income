import type { FastifyPluginAsync } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { renderLogin } from './views/login.js';
import { renderDashboard, type DashboardData } from './views/dashboard.js';
import { renderApiKeys } from './views/api-keys.js';
import { renderAuditLog, renderAuditTable } from './views/audit.js';
import { renderSimulatePage, renderSimulationPreview, renderComparisonTable } from './views/simulate.js';
import { listApiKeys, createApiKey, revokeApiKey, type ApiKeyTier } from '../db/api-keys.js';
import { getRecentAuditEntries, getAuditStats } from '../db/audit.js';
import { getAllCountries, getCountryByCode, getDataVersion } from '../data/loader.js';
import { getDb } from '../db/database.js';
import { calculateSimulation } from '../core/simulations.js';
import { listSimulations, saveSimulation, deleteSimulation } from '../db/simulations-db.js';
import type { SimulationParameters, TargetGroup } from '../core/types.js';

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? 'admin';
}
const sessions = new Map<string, { createdAt: number }>();

function hashSession(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isAuthenticated(request: { headers: Record<string, string | string[] | undefined> }): boolean {
  const cookie = request.headers.cookie as string | undefined;
  if (!cookie) return false;

  const match = cookie.match(/ogi_session=([^;]+)/);
  if (!match) return false;

  const sessionHash = hashSession(match[1]);
  return sessions.has(sessionHash);
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // Login page
  app.get('/login', async (request, reply) => {
    if (isAuthenticated(request)) {
      return reply.redirect('/admin');
    }
    return reply.type('text/html').send(renderLogin());
  });

  // Login handler
  app.post<{ Body: { password?: string } }>('/login', async (request, reply) => {
    const password = request.body?.password;
    if (password === getAdminPassword()) {
      const token = randomUUID();
      const sessionHash = hashSession(token);
      sessions.set(sessionHash, { createdAt: Date.now() });

      return reply
        .header('set-cookie', `ogi_session=${token}; Path=/admin; HttpOnly; SameSite=Strict`)
        .redirect('/admin');
    }
    return reply.type('text/html').send(renderLogin('Invalid password'));
  });

  // Logout
  app.get('/logout', async (_request, reply) => {
    return reply
      .header('set-cookie', 'ogi_session=; Path=/admin; HttpOnly; Max-Age=0')
      .redirect('/admin/login');
  });

  // Auth guard for all other admin routes
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/admin/login' || request.url === '/admin/logout') return;
    if (!isAuthenticated(request)) {
      return reply.redirect('/admin/login');
    }
  });

  // Dashboard
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

  // API Keys management
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

  // Audit log
  app.get('/audit', async (_request, reply) => {
    const entries = getRecentAuditEntries(100);
    return reply.type('text/html').send(renderAuditLog(entries));
  });

  // Partial for htmx live-refresh
  app.get('/audit/table', async (_request, reply) => {
    const entries = getRecentAuditEntries(100);
    return reply.type('text/html').send(renderAuditTable(entries));
  });

  // Simulate page
  app.get('/simulate', async (request, reply) => {
    const countries = getAllCountries();
    const { simulations } = listSimulations(20, 0);
    const url = new URL(request.url, 'http://localhost');
    const flash = url.searchParams.get('flash') ?? undefined;
    return reply.type('text/html').send(renderSimulatePage(countries, simulations, flash));
  });

  // HTMX partial: run simulation and return preview fragment
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
      return reply.type('text/html').send(`<p style="color:var(--danger)">Country '${countryCode}' not found</p>`);
    }

    const params: SimulationParameters = {
      country: countryCode,
      coverage,
      targetGroup,
      durationMonths,
      adjustments: { floorOverride: null, householdSize: null },
    };

    const result = calculateSimulation(country, params, getDataVersion());
    return reply.type('text/html').send(renderSimulationPreview(result));
  });

  // HTMX partial: compare multiple countries
  app.post<{
    Body: { countries?: string | string[]; coverage?: string; durationMonths?: string };
  }>('/simulate/compare', async (request, reply) => {
    const body = request.body ?? {};
    const rawCountries = Array.isArray(body.countries)
      ? body.countries
      : body.countries ? [body.countries] : [];
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

  // Save a simulation from admin UI
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

  // Delete a saved simulation
  app.post<{ Body: { id?: string } }>('/simulate/delete', async (request, reply) => {
    const id = request.body?.id;
    if (id) deleteSimulation(id);
    return reply.redirect('/admin/simulate?flash=Simulation+deleted');
  });
};
