import type { FastifyPluginAsync } from 'fastify';
import {
  createChannel,
  listChannels,
  getChannelById,
  createDisbursement,
  getDisbursementById,
  listDisbursements,
  updateDisbursementStatus,
  addLogEntry,
  getLogEntries,
} from '../../db/disbursements-db.js';
import { getProvider, listProviders } from '../../disbursements/providers/registry.js';
import { dispatchEvent } from '../../webhooks/dispatcher.js';
import { parsePagination, buildPaginationMeta } from '../pagination.js';
import type { DisbursementChannelType } from '../../core/types.js';

const VALID_CHANNEL_TYPES: DisbursementChannelType[] = [
  'mobile_money',
  'bank_transfer',
  'crypto',
];

const VALID_STATUSES = ['draft', 'approved', 'processing', 'completed', 'failed'];

export const disbursementsRoute: FastifyPluginAsync = async (app) => {
  // ── GET /v1/disbursements/channels ─────────────────────────────────────────

  app.get('/disbursements/channels', async (_request, reply) => {
    const channels = listChannels();
    return reply.send({
      ok: true,
      data: {
        channels,
        providers: listProviders(),
      },
    });
  });

  // ── POST /v1/disbursements/channels ────────────────────────────────────────

  app.post<{ Body: Record<string, unknown> }>(
    '/disbursements/channels',
    async (request, reply) => {
      const { name, type, provider, countryCode, config } = request.body ?? {};

      if (typeof name !== 'string' || !name.trim()) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'name' is required" },
        });
      }
      if (!VALID_CHANNEL_TYPES.includes(type as DisbursementChannelType)) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: `'type' must be one of: ${VALID_CHANNEL_TYPES.join(', ')}`,
          },
        });
      }
      if (typeof provider !== 'string' || !provider.trim()) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'provider' is required" },
        });
      }
      if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'config' must be an object" },
        });
      }

      const disbursementProvider = getProvider(provider as string);
      if (!disbursementProvider) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'UNKNOWN_PROVIDER',
            message: `Unknown provider '${String(provider)}'. Available: ${listProviders()
              .map((p) => p.providerId)
              .join(', ')}`,
          },
        });
      }

      const validation = await disbursementProvider.validateConfig(
        config as Record<string, unknown>,
      );
      if (!validation.valid) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_CONFIG',
            message: validation.error ?? 'Invalid provider configuration',
          },
        });
      }

      const channel = createChannel({
        name: name.trim(),
        type: type as DisbursementChannelType,
        provider: provider as string,
        countryCode: typeof countryCode === 'string' ? countryCode.toUpperCase() : null,
        config: config as Record<string, unknown>,
      });

      return reply.status(201).send({ ok: true, data: channel });
    },
  );

  // ── POST /v1/disbursements ─────────────────────────────────────────────────

  app.post<{ Body: Record<string, unknown> }>(
    '/disbursements',
    async (request, reply) => {
      const { channelId, countryCode, recipientCount, amountPerRecipient, totalAmount, currency, simulationId } =
        request.body ?? {};

      if (typeof channelId !== 'string' || !channelId) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'channelId' is required" },
        });
      }
      if (typeof countryCode !== 'string' || !countryCode) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'countryCode' is required" },
        });
      }
      if (typeof recipientCount !== 'number' || !Number.isInteger(recipientCount) || recipientCount < 1) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: "'recipientCount' must be a positive integer",
          },
        });
      }
      if (typeof amountPerRecipient !== 'string' || !amountPerRecipient) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: "'amountPerRecipient' is required (string)",
          },
        });
      }
      if (typeof totalAmount !== 'string' || !totalAmount) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'totalAmount' is required (string)" },
        });
      }
      if (typeof currency !== 'string' || !currency) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'currency' is required" },
        });
      }

      const channel = getChannelById(channelId as string);
      if (!channel) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Channel '${channelId}' not found` },
        });
      }

      const apiKeyId = (request as { apiKeyId?: string }).apiKeyId;
      const disbursement = createDisbursement({
        simulationId: typeof simulationId === 'string' ? simulationId : null,
        channelId: channelId as string,
        countryCode: (countryCode as string).toUpperCase(),
        recipientCount: recipientCount as number,
        amountPerRecipient: amountPerRecipient as string,
        totalAmount: totalAmount as string,
        currency: (currency as string).toUpperCase(),
        apiKeyId,
      });

      addLogEntry(disbursement.id, 'created');

      void dispatchEvent('disbursement.created', {
        id: disbursement.id,
        channelId: disbursement.channelId,
        countryCode: disbursement.countryCode,
        recipientCount: disbursement.recipientCount,
        currency: disbursement.currency,
        createdAt: disbursement.createdAt,
      });

      return reply.status(201).send({ ok: true, data: disbursement });
    },
  );

  // ── POST /v1/disbursements/:id/approve ─────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    '/disbursements/:id/approve',
    async (request, reply) => {
      const disbursement = getDisbursementById(request.params.id);
      if (!disbursement) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Disbursement not found' },
        });
      }
      if (disbursement.status !== 'draft') {
        return reply.status(409).send({
          ok: false,
          error: {
            code: 'INVALID_TRANSITION',
            message: `Cannot approve a disbursement with status '${disbursement.status}' (must be 'draft')`,
          },
        });
      }

      const updated = updateDisbursementStatus(disbursement.id, 'approved');
      addLogEntry(disbursement.id, 'approved');

      void dispatchEvent('disbursement.approved', {
        id: disbursement.id,
        channelId: disbursement.channelId,
        countryCode: disbursement.countryCode,
        approvedAt: updated?.approvedAt,
      });

      return reply.send({ ok: true, data: updated });
    },
  );

  // ── POST /v1/disbursements/:id/submit ──────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    '/disbursements/:id/submit',
    async (request, reply) => {
      const disbursement = getDisbursementById(request.params.id);
      if (!disbursement) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Disbursement not found' },
        });
      }
      if (disbursement.status !== 'approved') {
        return reply.status(409).send({
          ok: false,
          error: {
            code: 'INVALID_TRANSITION',
            message: `Cannot submit a disbursement with status '${disbursement.status}' (must be 'approved')`,
          },
        });
      }

      const channel = getChannelById(disbursement.channelId);
      if (!channel) {
        return reply.status(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Associated channel not found' },
        });
      }

      const provider = getProvider(channel.provider);
      if (!provider) {
        return reply.status(500).send({
          ok: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: `Provider '${channel.provider}' is not registered`,
          },
        });
      }

      updateDisbursementStatus(disbursement.id, 'processing');
      addLogEntry(disbursement.id, 'submitted');

      let result;
      try {
        result = await provider.submit(disbursement);
      } catch (err) {
        updateDisbursementStatus(disbursement.id, 'failed');
        addLogEntry(disbursement.id, 'failed', {
          error: err instanceof Error ? err.message : String(err),
        });

        void dispatchEvent('disbursement.failed', {
          id: disbursement.id,
          channelId: disbursement.channelId,
          error: err instanceof Error ? err.message : String(err),
        });

        return reply.status(502).send({
          ok: false,
          error: {
            code: 'PROVIDER_ERROR',
            message: err instanceof Error ? err.message : 'Provider submission failed',
          },
        });
      }

      updateDisbursementStatus(disbursement.id, 'completed');
      addLogEntry(disbursement.id, 'confirmed', {
        externalId: result.externalId,
        providerStatus: result.status,
      });

      const final = getDisbursementById(disbursement.id);

      void dispatchEvent('disbursement.completed', {
        id: disbursement.id,
        channelId: disbursement.channelId,
        countryCode: disbursement.countryCode,
        externalId: result.externalId,
        completedAt: final?.completedAt,
      });

      return reply.send({
        ok: true,
        data: {
          disbursement: final,
          result,
        },
      });
    },
  );

  // ── GET /v1/disbursements/:id ──────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/disbursements/:id', async (request, reply) => {
    const disbursement = getDisbursementById(request.params.id);
    if (!disbursement) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Disbursement not found' },
      });
    }
    const log = getLogEntries(disbursement.id);
    return reply.send({ ok: true, data: { disbursement, log } });
  });

  // ── GET /v1/disbursements ──────────────────────────────────────────────────

  app.get<{ Querystring: { page?: string; limit?: string; status?: string; channelId?: string } }>(
    '/disbursements',
    async (request, reply) => {
      const pg = parsePagination(request.query);
      const { status, channelId } = request.query;

      if (status && !VALID_STATUSES.includes(status)) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: `'status' must be one of: ${VALID_STATUSES.join(', ')}`,
          },
        });
      }

      const { disbursements, total } = listDisbursements({
        limit: pg.limit,
        offset: pg.offset,
        status,
        channelId,
      });

      return reply.send({
        ok: true,
        data: {
          disbursements,
          pagination: buildPaginationMeta(pg, total),
        },
      });
    },
  );
};
