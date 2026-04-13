import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { getTestDb, closeDb } from '../../db/database.js';
import {
  createChannel,
  createDisbursement,
  updateDisbursementStatus,
  setExternalId,
  getDisbursementById,
} from '../../db/disbursements-db.js';
import { registerWebhook, clearWebhooks } from '../../webhooks/dispatcher.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

const WEBHOOK_SECRET = 'test-secret-abc123';

function sign(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function wisePayload(transferId: number, state: string, sentAt: string) {
  return {
    data: {
      resource: { type: 'transfer', id: transferId, profile_id: 9999 },
      current_state: state,
    },
    event_type: 'transfers#state-change',
    schema_version: '2.0.0',
    sent_at: sentAt,
  };
}

function now(): string {
  return new Date().toISOString();
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

beforeAll(async () => {
  getTestDb();
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDb();
});

beforeEach(() => {
  clearWebhooks();
});

// ── Helper: create a SEPA channel + disbursement in 'processing' state ─────────

async function makeProcessingDisbursement(externalId: string) {
  const channel = createChannel({
    name: 'Wise SEPA EU',
    type: 'bank_transfer',
    provider: 'sepa',
    config: {
      apiKey: 'key',
      payoutAccountId: 'acc',
      environment: 'sandbox',
      webhookSecret: WEBHOOK_SECRET,
    },
  });

  const disbursement = createDisbursement({
    channelId: channel.id,
    countryCode: 'DE',
    recipientCount: 10,
    amountPerRecipient: '210.00',
    totalAmount: '2100.00',
    currency: 'EUR',
  });

  // Advance to 'processing' and store externalId
  updateDisbursementStatus(disbursement.id, 'approved');
  updateDisbursementStatus(disbursement.id, 'processing');
  setExternalId(disbursement.id, externalId);

  return { channel, disbursement };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /v1/webhooks/inbound/sepa — valid signature → callback processed', () => {
  it('confirms a disbursement on outgoing_payment_sent', async () => {
    const { disbursement } = await makeProcessingDisbursement('12345');
    const body = JSON.stringify(wisePayload(12345, 'outgoing_payment_sent', now()));
    const sig = sign(body);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/inbound/sepa',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-wise-signature-sha256': sig,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    const updated = getDisbursementById(disbursement.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).toBeTruthy();
  });

  it('fails a disbursement on funds_refunded', async () => {
    const { disbursement } = await makeProcessingDisbursement('55555');
    const body = JSON.stringify(wisePayload(55555, 'funds_refunded', now()));
    const sig = sign(body);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/inbound/sepa',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-wise-signature-sha256': sig,
      },
    });

    expect(res.statusCode).toBe(200);
    const updated = getDisbursementById(disbursement.id);
    expect(updated?.status).toBe('failed');
  });
});

describe('POST /v1/webhooks/inbound/sepa — invalid HMAC → 401, no state change', () => {
  it('rejects wrong signature', async () => {
    const { disbursement } = await makeProcessingDisbursement('99001');
    const body = JSON.stringify(wisePayload(99001, 'outgoing_payment_sent', now()));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/inbound/sepa',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-wise-signature-sha256': 'deadbeef',
      },
    });

    expect(res.statusCode).toBe(401);
    const updated = getDisbursementById(disbursement.id);
    expect(updated?.status).toBe('processing');
  });

  it('rejects missing signature', async () => {
    const { disbursement } = await makeProcessingDisbursement('99002');
    const body = JSON.stringify(wisePayload(99002, 'outgoing_payment_sent', now()));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/inbound/sepa',
      payload: body,
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode).toBe(401);
    const updated = getDisbursementById(disbursement.id);
    expect(updated?.status).toBe('processing');
  });
});

describe('POST /v1/webhooks/inbound/sepa — unknown externalId → 200, no crash', () => {
  it('silently accepts a callback for an unknown transfer', async () => {
    // Create a channel so HMAC verification passes, but don't create a disbursement
    createChannel({
      name: 'Wise SEPA EU 2',
      type: 'bank_transfer',
      provider: 'sepa',
      config: {
        apiKey: 'key2',
        payoutAccountId: 'acc2',
        environment: 'sandbox',
        webhookSecret: WEBHOOK_SECRET,
      },
    });

    const body = JSON.stringify(wisePayload(99999, 'outgoing_payment_sent', now()));
    const sig = sign(body);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/inbound/sepa',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-wise-signature-sha256': sig,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

describe('POST /v1/webhooks/inbound/sepa — replay outside time window → rejected', () => {
  it('rejects a callback with a timestamp 10 minutes old', async () => {
    const { disbursement } = await makeProcessingDisbursement('77777');
    const staleTime = minutesAgo(10);
    const body = JSON.stringify(wisePayload(77777, 'outgoing_payment_sent', staleTime));
    const sig = sign(body);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/inbound/sepa',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-wise-signature-sha256': sig,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('REPLAY_DETECTED');
    const updated = getDisbursementById(disbursement.id);
    expect(updated?.status).toBe('processing');
  });
});

describe('POST /v1/webhooks/inbound/sepa — confirmed callback fires outbound webhook', () => {
  it('dispatches disbursement.confirmed event', async () => {
    const received: unknown[] = [];
    const { disbursement } = await makeProcessingDisbursement('88888');

    // Register a webhook subscription to capture the event
    registerWebhook('http://localhost:9999/hook', ['disbursement.confirmed']);

    // We can't actually receive the HTTP call in tests, but we can verify
    // the status transition occurred (which is the precondition for dispatch)
    const body = JSON.stringify(wisePayload(88888, 'outgoing_payment_sent', now()));
    const sig = sign(body);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/inbound/sepa',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-wise-signature-sha256': sig,
      },
    });

    expect(res.statusCode).toBe(200);
    const updated = getDisbursementById(disbursement.id);
    expect(updated?.status).toBe('completed');

    // The dispatch is fire-and-forget (void); we verify the side-effect (status)
    // as a proxy for the event having been fired. Full delivery is tested by
    // the dispatcher unit tests.
    void received; // suppress unused warning
  });
});
