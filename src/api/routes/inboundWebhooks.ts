import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { getProvider } from '../../disbursements/providers/registry.js';
import { listChannels, getDisbursementByExternalId, updateDisbursementStatus, addLogEntry, setExternalId } from '../../db/disbursements-db.js';
import { dispatchEvent } from '../../webhooks/dispatcher.js';

/** Maximum age of a callback timestamp before it is rejected as a replay (ms) */
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

/** Default header name used for HMAC-SHA256 signatures when the provider doesn't specify one */
const DEFAULT_SIGNATURE_HEADER = 'x-webhook-signature';

function verifyHmac(rawBody: string, secret: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  // Strip optional 'sha256=' prefix
  const candidate = signature.replace(/^sha256=/, '');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(candidate, 'hex'));
  } catch {
    return false;
  }
}

export const inboundWebhooksRoute: FastifyPluginAsync = async (app) => {
  // Receive request body as raw string so we can verify HMAC before deserializing.
  // This content-type parser is scoped to this plugin only.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  /**
   * POST /v1/webhooks/inbound/:provider
   *
   * Receives callbacks from payment providers and advances disbursement status.
   * Verifies HMAC-SHA256 signature before processing any payload.
   */
  app.post<{ Params: { provider: string } }>(
    '/webhooks/inbound/:provider',
    async (request, reply) => {
      const providerId = request.params.provider;
      const provider = getProvider(providerId);

      if (!provider || typeof provider.parseCallback !== 'function') {
        // Return 200 to avoid leaking which providers are registered
        return reply.status(200).send({ ok: true });
      }

      const rawBody = request.body as string;
      const headers = request.headers as Record<string, string>;

      // ── Signature verification ─────────────────────────────────────────────
      const sigHeader = provider.signatureHeader ?? DEFAULT_SIGNATURE_HEADER;
      const signature = headers[sigHeader] ?? '';

      if (!signature) {
        return reply.status(401).send({
          ok: false,
          error: { code: 'MISSING_SIGNATURE', message: 'Missing signature header' },
        });
      }

      // Try each active channel for this provider — find one whose webhookSecret
      // matches the incoming signature.
      const channels = listChannels().filter((c) => c.provider === providerId && c.active);
      const matchedChannel = channels.find((channel) => {
        const secret = channel.config.webhookSecret;
        if (typeof secret !== 'string' || !secret) return false;
        return verifyHmac(rawBody, secret, signature);
      });

      if (!matchedChannel) {
        return reply.status(401).send({
          ok: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed' },
        });
      }

      // ── Payload parsing ────────────────────────────────────────────────────
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
        });
      }

      const callbackEvent = await provider.parseCallback!(headers, parsedBody);

      // Provider returned null → not an actionable event; acknowledge silently
      if (!callbackEvent) {
        return reply.status(200).send({ ok: true });
      }

      // ── Replay protection ──────────────────────────────────────────────────
      const eventTime = new Date(callbackEvent.timestamp).getTime();
      if (isNaN(eventTime) || Math.abs(Date.now() - eventTime) > REPLAY_WINDOW_MS) {
        return reply.status(401).send({
          ok: false,
          error: {
            code: 'REPLAY_DETECTED',
            message: 'Callback timestamp is outside the allowed ±5 minute window',
          },
        });
      }

      // ── Disbursement lookup ────────────────────────────────────────────────
      const disbursement = getDisbursementByExternalId(callbackEvent.externalId);

      if (!disbursement) {
        // Return 200 to avoid leaking information about stored external IDs
        request.log.warn(
          { externalId: callbackEvent.externalId, provider: providerId },
          'inbound_webhook: unknown externalId — ignoring',
        );
        return reply.status(200).send({ ok: true });
      }

      // Only advance from 'processing' state — idempotent for already-terminal states
      if (disbursement.status !== 'processing') {
        return reply.status(200).send({ ok: true });
      }

      // ── Status transition ──────────────────────────────────────────────────
      const newStatus = callbackEvent.status === 'confirmed' ? 'completed' : 'failed';

      // Ensure externalId is stored (may already be set from submit, but set it here too)
      if (!disbursement.externalId) {
        setExternalId(disbursement.id, callbackEvent.externalId);
      }

      updateDisbursementStatus(disbursement.id, newStatus);
      addLogEntry(disbursement.id, callbackEvent.status, {
        externalId: callbackEvent.externalId,
        provider: providerId,
        channelId: matchedChannel.id,
        callbackDetails: callbackEvent.details,
      });

      // ── Outbound webhook ───────────────────────────────────────────────────
      const outboundEvent =
        callbackEvent.status === 'confirmed' ? 'disbursement.confirmed' : 'disbursement.failed';

      void dispatchEvent(outboundEvent, {
        id: disbursement.id,
        channelId: disbursement.channelId,
        countryCode: disbursement.countryCode,
        externalId: callbackEvent.externalId,
        provider: providerId,
      });

      return reply.status(200).send({ ok: true });
    },
  );
};
