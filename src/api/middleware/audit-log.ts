import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { logAuditEntry } from '../../db/audit.js';
import { config } from '../../config.js';

const auditLogPlugin: FastifyPluginAsync = async (app) => {
  const enabled = config.audit.enabled;

  if (!enabled) return;

  app.addHook('onResponse', async (request, reply) => {
    // Skip logging for docs/static routes
    if (request.url.startsWith('/docs')) return;

    logAuditEntry({
      apiKeyId: request.apiKey?.id ?? null,
      method: request.method,
      path: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: reply.elapsedTime,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  });
};

export const auditLog = fp(auditLogPlugin, { name: 'audit-log' });
