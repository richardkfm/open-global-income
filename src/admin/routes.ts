import type { FastifyPluginAsync } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { renderLogin } from './views/login.js';
import { renderDashboard, type DashboardData } from './views/dashboard.js';
import { renderApiKeys } from './views/api-keys.js';
import { renderAuditLog, renderAuditTable } from './views/audit.js';
import { listApiKeys, createApiKey, revokeApiKey, type ApiKeyTier } from '../db/api-keys.js';
import { getRecentAuditEntries, getAuditStats } from '../db/audit.js';
import { getAllCountries, getDataVersion } from '../data/loader.js';
import { getDb } from '../db/database.js';

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

  app.post<{ Params: { id: string } }>('/:id/revoke', { url: '/api-keys/:id/revoke' }, async (request, reply) => {
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
};
