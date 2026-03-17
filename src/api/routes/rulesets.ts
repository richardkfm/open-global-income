import type { FastifyPluginAsync } from 'fastify';
import { getAllRulesets } from '../../core/rulesets.js';

export const rulesetsRoute: FastifyPluginAsync = async (app) => {
  app.get('/rulesets', async () => {
    return { ok: true, data: getAllRulesets() };
  });
};
