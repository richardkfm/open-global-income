import type { FastifyPluginAsync } from 'fastify';
import {
  createRecipient,
  getRecipientById,
  listRecipients,
  updateRecipient,
  findByAccountHash,
} from '../../db/recipients-db.js';
import { parsePagination, buildPaginationMeta } from '../pagination.js';
import { recipientsToCsv } from '../../core/recipient-export.js';
import { getIdentityProvider, listIdentityProviders } from '../../identity/providers/registry.js';
import type { RecipientStatus, PaymentMethod, IdentityClaim } from '../../core/types.js';

const VALID_STATUSES: RecipientStatus[] = ['pending', 'verified', 'suspended'];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ['sepa', 'mobile_money', 'crypto'];
const VALID_CLAIM_TYPES: IdentityClaim['claimType'][] = [
  'national_id',
  'bank_account',
  'phone',
  'wallet',
  'community',
];

/** Legal status transitions: which states can a recipient move into from a given state */
const VALID_TRANSITIONS: Record<RecipientStatus, RecipientStatus[]> = {
  pending: ['verified', 'suspended'],
  verified: ['suspended'],
  suspended: ['pending'],
};

export const recipientsRoute: FastifyPluginAsync = async (app) => {
  // ── POST /v1/recipients ────────────────────────────────────────────────────

  app.post<{ Body: Record<string, unknown> }>('/recipients', async (request, reply) => {
    const { countryCode, paymentMethod, accountHash, identityProvider, routingRef, pilotId } =
      request.body ?? {};

    if (typeof countryCode !== 'string' || !countryCode.trim()) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'MISSING_PARAMETER', message: "'countryCode' is required" },
      });
    }

    if (paymentMethod !== undefined && !VALID_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: `'paymentMethod' must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
        },
      });
    }

    // Reject enrolment if accountHash is already present in the same country
    if (typeof accountHash === 'string' && accountHash.trim()) {
      const existing = findByAccountHash(countryCode.toUpperCase(), accountHash.trim());
      if (existing) {
        return reply.status(409).send({
          ok: false,
          error: {
            code: 'DUPLICATE_RECIPIENT',
            message: `An account with this hash is already enrolled in ${countryCode.toUpperCase()}`,
            existingId: existing.id,
          },
        });
      }
    }

    const apiKeyId = (request as { apiKeyId?: string }).apiKeyId;

    const recipient = createRecipient({
      countryCode: countryCode.toUpperCase(),
      accountHash: typeof accountHash === 'string' ? accountHash.trim() || null : null,
      identityProvider: typeof identityProvider === 'string' ? identityProvider.trim() || null : null,
      paymentMethod: VALID_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)
        ? (paymentMethod as PaymentMethod)
        : null,
      routingRef: typeof routingRef === 'string' ? routingRef.trim() || null : null,
      pilotId: typeof pilotId === 'string' ? pilotId : null,
      apiKeyId: apiKeyId ?? null,
    });

    return reply.status(201).send({ ok: true, data: recipient });
  });

  // ── GET /v1/recipients ─────────────────────────────────────────────────────

  app.get<{
    Querystring: { countryCode?: string; status?: string; pilotId?: string; page?: string; limit?: string };
  }>('/recipients', async (request, reply) => {
    const { countryCode, status, pilotId } = request.query;

    if (status && !VALID_STATUSES.includes(status as RecipientStatus)) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: `'status' must be one of: ${VALID_STATUSES.join(', ')}`,
        },
      });
    }

    const pagination = parsePagination(request.query);
    const { items, total } = listRecipients({
      countryCode,
      status: status as RecipientStatus | undefined,
      pilotId,
      page: pagination.page,
      limit: pagination.limit,
    });

    return reply.send({
      ok: true,
      data: { items, pagination: buildPaginationMeta(pagination, total) },
    });
  });

  // ── GET /v1/recipients/export ──────────────────────────────────────────────
  // Export the (optionally filtered) registry as CSV (default) or JSON.
  // Must be registered BEFORE /:id to avoid route conflict.

  app.get<{
    Querystring: { countryCode?: string; status?: string; pilotId?: string; format?: string };
  }>('/recipients/export', async (request, reply) => {
    const { countryCode, status, pilotId, format } = request.query;

    if (status && !VALID_STATUSES.includes(status as RecipientStatus)) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: `'status' must be one of: ${VALID_STATUSES.join(', ')}`,
        },
      });
    }
    if (format && format !== 'csv' && format !== 'json') {
      return reply.status(400).send({
        ok: false,
        error: { code: 'INVALID_PARAMETER', message: "'format' must be 'csv' or 'json'" },
      });
    }

    const filters = {
      countryCode,
      status: status as RecipientStatus | undefined,
      pilotId,
    };
    // Determine the full count, then fetch every matching row (export is not paginated).
    const { total } = listRecipients({ ...filters, page: 1, limit: 1 });
    const { items } = listRecipients({ ...filters, page: 1, limit: Math.max(total, 1) });

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      return reply
        .header('content-disposition', `attachment; filename="recipients-${stamp}.json"`)
        .send({ ok: true, data: { items, total } });
    }

    return reply
      .type('text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="recipients-${stamp}.csv"`)
      .send(recipientsToCsv(items));
  });

  // ── POST /v1/recipients/check-duplicate ────────────────────────────────────
  // Must be registered BEFORE /:id to avoid route conflict

  app.post<{ Body: Record<string, unknown> }>(
    '/recipients/check-duplicate',
    async (request, reply) => {
      const { countryCode, accountHash } = request.body ?? {};

      if (typeof countryCode !== 'string' || !countryCode.trim()) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'countryCode' is required" },
        });
      }
      if (typeof accountHash !== 'string' || !accountHash.trim()) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'accountHash' is required" },
        });
      }

      const existing = findByAccountHash(countryCode.toUpperCase(), accountHash.trim());

      return reply.send({
        ok: true,
        data: {
          isDuplicate: existing !== null,
          existingRecipientId: existing?.id ?? null,
          status: existing?.status ?? null,
          pilotId: existing?.pilotId ?? null,
        },
      });
    },
  );

  // ── GET /v1/recipients/:id ─────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/recipients/:id', async (request, reply) => {
    const recipient = getRecipientById(request.params.id);
    if (!recipient) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Recipient '${request.params.id}' not found`,
        },
      });
    }
    return reply.send({ ok: true, data: recipient });
  });

  // ── PATCH /v1/recipients/:id ───────────────────────────────────────────────

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/recipients/:id',
    async (request, reply) => {
      const recipient = getRecipientById(request.params.id);
      if (!recipient) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Recipient '${request.params.id}' not found` },
        });
      }

      const { status, paymentMethod, accountHash, identityProvider, verifiedAt, routingRef } =
        request.body ?? {};

      // Validate status transition
      if (status !== undefined) {
        if (!VALID_STATUSES.includes(status as RecipientStatus)) {
          return reply.status(400).send({
            ok: false,
            error: {
              code: 'INVALID_PARAMETER',
              message: `'status' must be one of: ${VALID_STATUSES.join(', ')}`,
            },
          });
        }
        const allowed = VALID_TRANSITIONS[recipient.status];
        if (!allowed.includes(status as RecipientStatus)) {
          return reply.status(422).send({
            ok: false,
            error: {
              code: 'INVALID_TRANSITION',
              message: `Cannot transition from '${recipient.status}' to '${status}'`,
            },
          });
        }
      }

      if (paymentMethod !== undefined && !VALID_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: `'paymentMethod' must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
          },
        });
      }

      // If setting a new accountHash, check for duplicates (excluding this recipient)
      if (typeof accountHash === 'string' && accountHash.trim() && accountHash.trim() !== recipient.accountHash) {
        const existing = findByAccountHash(
          recipient.countryCode,
          accountHash.trim(),
        );
        if (existing && existing.id !== recipient.id) {
          return reply.status(409).send({
            ok: false,
            error: {
              code: 'DUPLICATE_RECIPIENT',
              message: `An account with this hash is already enrolled in ${recipient.countryCode}`,
              existingId: existing.id,
            },
          });
        }
      }

      const updated = updateRecipient(request.params.id, {
        status: status as RecipientStatus | undefined,
        paymentMethod: paymentMethod as PaymentMethod | undefined,
        accountHash: typeof accountHash === 'string' ? accountHash.trim() || null : undefined,
        identityProvider: typeof identityProvider === 'string' ? identityProvider.trim() || null : undefined,
        verifiedAt: typeof verifiedAt === 'string' ? verifiedAt : undefined,
        routingRef: typeof routingRef === 'string' ? routingRef.trim() || null : undefined,
      });

      return reply.send({ ok: true, data: updated });
    },
  );

  // ── POST /v1/recipients/:id/verify ─────────────────────────────────────────
  // Verify a recipient against a registered identity provider. On success the
  // provider returns a non-reversible accountHash + routingRef which are stored,
  // the recipient is marked 'verified', and the raw claim is discarded — it is
  // never persisted or echoed back.

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/recipients/:id/verify',
    async (request, reply) => {
      const recipient = getRecipientById(request.params.id);
      if (!recipient) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Recipient '${request.params.id}' not found` },
        });
      }

      const { provider, claimType, claimReference } = request.body ?? {};

      if (typeof provider !== 'string' || !provider.trim()) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'provider' is required" },
        });
      }

      const connector = getIdentityProvider(provider.trim());
      if (!connector) {
        return reply.status(404).send({
          ok: false,
          error: {
            code: 'UNKNOWN_PROVIDER',
            message: `Unknown identity provider '${provider}'. Available: ${listIdentityProviders()
              .map((p) => p.providerId)
              .join(', ')}`,
          },
        });
      }

      if (typeof claimType !== 'string' || !VALID_CLAIM_TYPES.includes(claimType as IdentityClaim['claimType'])) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: `'claimType' must be one of: ${VALID_CLAIM_TYPES.join(', ')}`,
          },
        });
      }

      if (!connector.supportedClaimTypes.includes(claimType as IdentityClaim['claimType'])) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'UNSUPPORTED_CLAIM_TYPE',
            message: `Provider '${connector.providerId}' supports claim types: ${connector.supportedClaimTypes.join(', ')}`,
          },
        });
      }

      if (typeof claimReference !== 'string' || !claimReference.trim()) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'claimReference' is required" },
        });
      }

      // A suspended recipient cannot be (re-)verified without first re-enrolling.
      if (recipient.status === 'suspended') {
        return reply.status(422).send({
          ok: false,
          error: {
            code: 'INVALID_TRANSITION',
            message: "Cannot verify a 'suspended' recipient; move it back to 'pending' first",
          },
        });
      }

      const claim: IdentityClaim = {
        recipientId: recipient.id,
        countryCode: recipient.countryCode,
        claimType: claimType as IdentityClaim['claimType'],
        claimReference: claimReference.trim(),
      };

      const result = await connector.verify(claim);

      if (!result.verified || !result.accountHash) {
        return reply.status(422).send({
          ok: false,
          error: {
            code: 'VERIFICATION_FAILED',
            message: result.error ?? 'Identity verification failed',
          },
        });
      }

      // Cross-program duplicate detection on the provider-derived hash.
      const existing = findByAccountHash(recipient.countryCode, result.accountHash);
      if (existing && existing.id !== recipient.id) {
        return reply.status(409).send({
          ok: false,
          error: {
            code: 'DUPLICATE_RECIPIENT',
            message: `This identity is already enrolled in ${recipient.countryCode}`,
            existingId: existing.id,
          },
        });
      }

      const updated = updateRecipient(recipient.id, {
        status: 'verified',
        accountHash: result.accountHash,
        identityProvider: connector.providerId,
        routingRef: result.routingRef,
        verifiedAt: new Date().toISOString(),
      });

      return reply.send({
        ok: true,
        data: {
          recipient: updated,
          verification: {
            provider: connector.providerId,
            providerName: connector.providerName,
            verified: true,
            routingRef: result.routingRef,
          },
        },
      });
    },
  );
};
