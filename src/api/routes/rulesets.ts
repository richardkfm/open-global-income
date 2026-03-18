import type { FastifyPluginAsync } from 'fastify';
import { getAllRulesets, getRulesetByVersion } from '../../core/rulesets.js';

export const rulesetsRoute: FastifyPluginAsync = async (app) => {
  /** List all rulesets (active and deprecated) */
  app.get('/rulesets', async () => {
    return { ok: true, data: getAllRulesets() };
  });

  /** Get a single ruleset by version */
  app.get<{ Params: { version: string } }>(
    '/rulesets/:version',
    async (request, reply) => {
      const ruleset = getRulesetByVersion(request.params.version);

      if (!ruleset) {
        return reply.status(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `No ruleset found with version '${request.params.version}'`,
          },
        });
      }

      return { ok: true, data: ruleset };
    },
  );
};
