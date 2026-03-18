import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../api/server.js';
import { getTestDb, closeDb } from '../db/database.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  getTestDb();
  process.env.ENABLE_ADMIN = 'true';
  process.env.ADMIN_PASSWORD = 'test-pass';
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDb();
  delete process.env.ENABLE_ADMIN;
  delete process.env.ADMIN_PASSWORD;
});

describe('Admin UI', () => {
  it('redirects unauthenticated users to login', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin/login');
  });

  it('shows login page', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/login' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('OGI Admin');
    expect(res.body).toContain('password');
  });

  it('rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'password=wrong',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Invalid password');
  });

  it('authenticates with correct password and shows dashboard', async () => {
    // Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'password=test-pass',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(loginRes.statusCode).toBe(302);
    expect(loginRes.headers.location).toBe('/admin');

    // Extract session cookie
    const cookie = loginRes.headers['set-cookie'] as string;
    expect(cookie).toContain('ogi_session=');

    // Access dashboard with cookie
    const dashRes = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie },
    });
    expect(dashRes.statusCode).toBe(200);
    expect(dashRes.body).toContain('Dashboard');
    expect(dashRes.body).toContain('Countries');
  });

  it('shows API keys page when authenticated', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'password=test-pass',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const cookie = loginRes.headers['set-cookie'] as string;

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
    const loginRes = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: 'password=test-pass',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const cookie = loginRes.headers['set-cookie'] as string;

    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Audit Log');
  });
});
