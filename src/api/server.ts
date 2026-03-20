import Fastify from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyFormBody from '@fastify/formbody';
import { apiKeyAuth } from './middleware/api-key-auth.js';
import { auditLog } from './middleware/audit-log.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { healthRoute } from './routes/health.js';
import { incomeRoute } from './routes/income.js';
import { rulesetsRoute } from './routes/rulesets.js';
import { countriesRoute } from './routes/countries.js';
import { usersRoute } from './routes/users.js';
import { simulateRoute } from './routes/simulate.js';
import { simulationsRoute } from './routes/simulations.js';
import { disbursementsRoute } from './routes/disbursements.js';
import { pilotsRoute } from './routes/pilots.js';
import { adminRoutes } from '../admin/routes.js';

export interface ServerOptions {
  rateLimitMax?: number;
  rateLimitWindow?: number;
}

export function buildServer(opts?: ServerOptions) {
  const logLevel = process.env.LOG_LEVEL ?? 'info';
  const app = Fastify({
    logger: {
      level: logLevel,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            host: request.hostname,
            remoteAddress: request.ip,
          };
        },
        res(reply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
    },
  });

  // Security headers — CSP disabled so Swagger UI at /docs can load
  // its inline scripts and styles. This is standard for API servers that
  // serve Swagger UI; re-enable CSP if the server starts serving user content.
  app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });

  // CORS
  app.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: (process.env.CORS_METHODS ?? 'GET,POST,OPTIONS').split(','),
  });

  // Rate limiting
  const rateLimitMax =
    opts?.rateLimitMax ??
    parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10);
  const rateLimitWindow =
    opts?.rateLimitWindow ??
    parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);

  app.register(fastifyRateLimit, {
    max: rateLimitMax,
    timeWindow: rateLimitWindow,
    allowList: (req) =>
      req.url === '/health' || (req.url?.startsWith('/admin') ?? false),
  });

  // Form body parser (for admin POST forms)
  app.register(fastifyFormBody);

  // OpenAPI spec generation
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Open Global Income API',
        description:
          'Open standard and reference implementation for a global income entitlement calculation model',
        version: '0.1.3',
      },
      servers: [{ url: '/' }],
    },
  });

  // Swagger UI at /docs
  app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // Global error handler — consistent error response shape
  app.setErrorHandler((error, _request, reply) => {
    const statusCode =
      (error as { statusCode?: number }).statusCode ?? 500;
    const message =
      (error as { message?: string }).message ?? 'Unknown error';

    if (statusCode >= 500) {
      app.log.error(error);
    }

    // Rate limit errors come with statusCode 429
    if (statusCode === 429) {
      return reply.status(429).send({
        ok: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Maximum ${rateLimitMax} requests per ${rateLimitWindow / 1000}s window.`,
        },
      });
    }

    // Fastify validation errors
    const code =
      statusCode >= 500
        ? 'INTERNAL_ERROR'
        : (error as { validation?: unknown }).validation
          ? 'VALIDATION_ERROR'
          : 'BAD_REQUEST';

    return reply.status(statusCode).send({
      ok: false,
      error: {
        code,
        message: statusCode >= 500 ? 'An internal error occurred' : message,
      },
    });
  });

  // Global 404 handler
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist',
      },
    });
  });

  // Prometheus metrics
  if (process.env.ENABLE_METRICS !== 'false') {
    app.register(metricsMiddleware);
  }

  // API key authentication (before routes)
  app.register(apiKeyAuth);

  // Audit logging (after auth, before routes)
  app.register(auditLog);

  // Routes
  app.register(healthRoute);
  app.register(incomeRoute, { prefix: '/v1/income' });
  app.register(rulesetsRoute, { prefix: '/v1/income' });
  app.register(countriesRoute, { prefix: '/v1/income' });
  app.register(usersRoute, { prefix: '/v1' });
  app.register(simulateRoute, { prefix: '/v1' });
  app.register(simulationsRoute, { prefix: '/v1' });
  app.register(disbursementsRoute, { prefix: '/v1' });
  app.register(pilotsRoute, { prefix: '/v1' });

  // Admin UI (feature-flagged)
  if (process.env.ENABLE_ADMIN === 'true') {
    app.register(adminRoutes, { prefix: '/admin' });
  }

  return app;
}
