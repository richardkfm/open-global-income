import type { FastifyPluginAsync } from 'fastify';
import { listIdentityProviders } from '../../identity/providers/registry.js';

/**
 * Identity provider catalog.
 *
 * Exposes the registered, non-custodial identity connectors so operators can
 * discover which verification rails are available before enrolling recipients.
 * Recipient verification itself lives at POST /v1/recipients/:id/verify.
 */
export const identityRoute: FastifyPluginAsync = async (app) => {
  // ── GET /v1/identity/providers ─────────────────────────────────────────────

  app.get('/identity/providers', async (_request, reply) => {
    return reply.send({ ok: true, data: { providers: listIdentityProviders() } });
  });
};
