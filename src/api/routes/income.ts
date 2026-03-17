import type { FastifyPluginAsync } from 'fastify';
import { getCountryByCode, getDataVersion } from '../../data/loader.js';
import { calculateEntitlement } from '../../core/rules.js';

export const incomeRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { country?: string } }>(
    '/calc',
    async (request, reply) => {
      const countryParam = request.query.country;

      if (!countryParam) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: "Query parameter 'country' is required",
          },
        });
      }

      const country = getCountryByCode(countryParam);

      if (!country) {
        return reply.status(404).send({
          ok: false,
          error: {
            code: 'COUNTRY_NOT_FOUND',
            message: `No data available for country code '${countryParam.toUpperCase()}'`,
          },
        });
      }

      const entitlement = calculateEntitlement(country, getDataVersion());

      return { ok: true, data: entitlement };
    },
  );
};
