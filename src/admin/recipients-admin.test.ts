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

async function login(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/login',
    payload: 'username=testadmin&password=test-pass-123',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  return res.headers['set-cookie'] as string;
}

function form(cookie: string, url: string, payload: string) {
  return app.inject({
    method: 'POST',
    url,
    payload,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
  });
}

describe('Admin recipient UI', () => {
  it('renders the identity page with recipient management sections', async () => {
    const cookie = await login();
    const res = await app.inject({ method: 'GET', url: '/admin/identity', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Identity & Recipients');
    expect(res.body).toContain('Enrol a recipient');
    expect(res.body).toContain('Bulk import recipients');
    expect(res.body).toContain('action="/admin/identity/recipients/import"');
  });

  it('enrols a single recipient and redirects to its detail page', async () => {
    const cookie = await login();
    const res = await form(cookie, '/admin/identity/recipients', 'countryCode=KE&paymentMethod=mobile_money');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/admin\/identity\/recipients\/[0-9a-f-]+/);

    const detailUrl = (res.headers.location as string).split('?')[0];
    const detail = await app.inject({ method: 'GET', url: detailUrl, headers: { cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.body).toContain('Recipient');
    expect(detail.body).toContain('KE');
    expect(detail.body).toContain('Move to verified');
    expect(detail.body).toContain('Move to suspended');
  });

  it('rejects enrolment without a country', async () => {
    const cookie = await login();
    const res = await form(cookie, '/admin/identity/recipients', 'paymentMethod=sepa');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('variant=error');
  });

  it('walks a recipient through a valid status transition and blocks an invalid one', async () => {
    const cookie = await login();
    const created = await form(cookie, '/admin/identity/recipients', 'countryCode=TZ');
    const detailUrl = (created.headers.location as string).split('?')[0];

    // pending → verified is allowed
    const ok = await form(cookie, `${detailUrl}/status`, 'status=verified');
    expect(ok.statusCode).toBe(302);
    expect(ok.headers.location).toContain('variant=success');

    // verified → pending is NOT allowed
    const bad = await form(cookie, `${detailUrl}/status`, 'status=pending');
    expect(bad.statusCode).toBe(302);
    expect(bad.headers.location).toContain('variant=error');
  });

  it('bulk imports recipients from pasted CSV and reports the result', async () => {
    const cookie = await login();
    const csv = ['countryCode,paymentMethod', 'KE,mobile_money', 'TZ,sepa', 'NG'].join('\n');
    const res = await form(cookie, '/admin/identity/recipients/import', `csv=${encodeURIComponent(csv)}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Import result');
    expect(res.body).toContain('Enrolled');
  });

  it('skips bulk-import rows whose account hash is already enrolled', async () => {
    const cookie = await login();
    const hash = `dup-hash-${Date.now()}`;
    // First import enrols the hash.
    await form(
      cookie,
      '/admin/identity/recipients/import',
      `csv=${encodeURIComponent(`countryCode,accountHash\nUG,${hash}`)}`,
    );
    // Second import with the same country+hash should be skipped.
    const res = await form(
      cookie,
      '/admin/identity/recipients/import',
      `csv=${encodeURIComponent(`countryCode,accountHash\nUG,${hash}`)}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Skipped (duplicate)');
    expect(res.body).toMatch(/Already enrolled/);
  });

  it('rejects an empty bulk import', async () => {
    const cookie = await login();
    const res = await form(cookie, '/admin/identity/recipients/import', 'csv=');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('variant=error');
  });

  it('filters the recipient list by status', async () => {
    const cookie = await login();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/identity?status=verified',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    // The verified filter option should be marked selected.
    expect(res.body).toContain('value="verified" selected');
  });

  it('redirects to the identity page for an unknown recipient', async () => {
    const cookie = await login();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/identity/recipients/does-not-exist',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/admin/identity?variant=error');
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/identity/recipients/anything' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin/login');
  });
});
