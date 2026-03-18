import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { validateApiKey, type ApiKey } from '../../db/api-keys.js';

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKey;
  }
}

const apiKeyAuthPlugin: FastifyPluginAsync = async (app) => {
  const required = process.env.API_KEY_REQUIRED === 'true';

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health, docs, and OpenAPI spec routes
    if (request.url === '/health' || request.url.startsWith('/docs')) {
      return;
    }

    const rawKey = request.headers['x-api-key'] as string | undefined;

    if (rawKey) {
      const apiKey = validateApiKey(rawKey);
      if (!apiKey) {
        return reply.status(401).send({
          ok: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'The provided API key is invalid or has been revoked',
          },
        });
      }
      request.apiKey = apiKey;
    } else if (required) {
      return reply.status(401).send({
        ok: false,
        error: {
          code: 'API_KEY_REQUIRED',
          message: 'An API key is required. Include it in the X-API-Key header.',
        },
      });
    }
  });
};

export const apiKeyAuth = fp(apiKeyAuthPlugin, { name: 'api-key-auth' });
