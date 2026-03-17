import Fastify from 'fastify';
import { healthRoute } from './routes/health.js';
import { incomeRoute } from './routes/income.js';

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(healthRoute);
  app.register(incomeRoute, { prefix: '/v1/income' });

  return app;
}
