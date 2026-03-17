import Fastify from 'fastify';
import { healthRoute } from './routes/health.js';
import { incomeRoute } from './routes/income.js';
import { rulesetsRoute } from './routes/rulesets.js';
import { countriesRoute } from './routes/countries.js';
import { usersRoute } from './routes/users.js';

export function buildServer() {
  const app = Fastify({ logger: true });

  // Global error handler — consistent error response shape
  app.setErrorHandler((error, _request, reply) => {
    const statusCode =
      (error as { statusCode?: number }).statusCode ?? 500;
    const message =
      (error as { message?: string }).message ?? 'Unknown error';

    if (statusCode >= 500) {
      app.log.error(error);
    }

    return reply.status(statusCode).send({
      ok: false,
      error: {
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
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

  // Routes
  app.register(healthRoute);
  app.register(incomeRoute, { prefix: '/v1/income' });
  app.register(rulesetsRoute, { prefix: '/v1/income' });
  app.register(countriesRoute, { prefix: '/v1/income' });
  app.register(usersRoute, { prefix: '/v1' });

  return app;
}
