import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../api/server.js';
import { getTestDb, closeDb } from '../db/database.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  getTestDb();
  process.env.ENABLE_ADMIN = 'true';
  process.env.ADMIN_USERNAME = 'testadmin';
  process.env.ADMIN_PASSWORD = 'test-pass-123';
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDb();
  delete process.env.ENABLE_ADMIN;
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
});

/** Helper: login and return the session cookie */
async function login(username = 'testadmin', password = 'test-pass-123'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/login',
    payload: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  return res.headers['set-cookie'] as string;
}

describe('Admin UI', () => {
  it('redirects unauthenticated users to login', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin/login');
  });

  it('shows login page with username and password fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/login' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('OGI Admin');
    expect(res.body).toContain('username');
    expect(res.body).toContain('password');
    expect(res.body).toContain('rememberMe');
  });

  it('rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'username=testadmin&password=wrong',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Invalid username or password');
  });

  it('rejects unknown username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'username=nobody&password=test-pass-123',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Invalid username or password');
  });

  it('pre-fills username after failed login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'username=testadmin&password=wrong',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.body).toContain('value="testadmin"');
  });

  it('authenticates with correct credentials and shows dashboard', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'username=testadmin&password=test-pass-123',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(loginRes.statusCode).toBe(302);
    expect(loginRes.headers.location).toBe('/admin');

    const cookie = loginRes.headers['set-cookie'] as string;
    expect(cookie).toContain('ogi_session=');
    expect(cookie).toContain('Max-Age=86400');

    const dashRes = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie },
    });
    expect(dashRes.statusCode).toBe(200);
    expect(dashRes.body).toContain('Dashboard');
    expect(dashRes.body).toContain('Countries');
  });

  it('sets longer Max-Age with remember-me', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'username=testadmin&password=test-pass-123&rememberMe=1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(loginRes.statusCode).toBe(302);
    const cookie = loginRes.headers['set-cookie'] as string;
    expect(cookie).toContain('Max-Age=604800');
  });

  it('shows API keys page when authenticated', async () => {
    const cookie = await login();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api-keys',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('API Keys');
    expect(res.body).toContain('Create New Key');
  });

  it('shows audit log page when authenticated', async () => {
    const cookie = await login();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Audit Log');
  });

  it('logout clears session and redirects to login', async () => {
    const cookie = await login();
    const logoutRes = await app.inject({
      method: 'GET',
      url: '/admin/logout',
      headers: { cookie },
    });
    expect(logoutRes.statusCode).toBe(302);
    expect(logoutRes.headers.location).toBe('/admin/login');

    // Session should now be invalid
    const dashRes = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie },
    });
    expect(dashRes.statusCode).toBe(302);
    expect(dashRes.headers.location).toBe('/admin/login');
  });

  it('blocks login after 5 failed attempts', async () => {
    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: 'username=testadmin&password=wrongpassword',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '10.0.0.99' },
      });
    }
    // 6th attempt should be rate-limited (even with correct credentials)
    const res = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'username=testadmin&password=test-pass-123',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '10.0.0.99' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Too many failed attempts');
  });
});

describe('Admin Countries (Phase 14)', () => {
  it('shows countries list page when authenticated', async () => {
    const cookie = await login();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/countries',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Country Economic Profiles');
    expect(res.body).toContain('Income Group');
    expect(res.body).toContain('Macro Coverage');
  });

  it('countries list includes a Countries nav link', async () => {
    const cookie = await login();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/countries',
      headers: { cookie },
    });
    expect(res.body).toContain('href="/admin/countries"');
  });

  it('shows country detail page for a valid country code', async () => {
    const cookie = await login();
    // 'US' is in the dataset and should have data
    const res = await app.inject({
      method: 'GET',
      url: '/admin/countries/US',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('United States');
    expect(res.body).toContain('Core Economics');
    expect(res.body).toContain('Fiscal Capacity');
    expect(res.body).toContain('Data Completeness');
  });

  it('handles lowercase country code in URL', async () => {
    const cookie = await login();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/countries/us',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('United States');
  });

  it('redirects to countries list for unknown country code', async () => {
    const cookie = await login();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/countries/ZZ',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/admin/countries');
  });

  it('redirects to login when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/countries' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin/login');
  });
});
