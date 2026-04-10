import type { FastifyPluginAsync } from 'fastify';
import { getCountryByCode, getDataVersion } from '../../data/loader.js';
import { calculateEntitlement } from '../../core/rules.js';
import { config } from '../../config.js';

export const incomeRoute: FastifyPluginAsync = async (app) => {
  /** Calculate entitlement for a single country */
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

  /** Batch calculate entitlements for multiple countries */
  app.post<{ Body: { countries?: string[] } }>(
    '/batch',
    async (request, reply) => {
      const countries = request.body?.countries;

      if (!Array.isArray(countries) || countries.length === 0) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: "Request body must include a non-empty 'countries' array",
          },
        });
      }

      if (countries.length > config.api.batchMaxItems) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'BATCH_TOO_LARGE',
            message: `Maximum ${config.api.batchMaxItems} countries per batch request`,
          },
        });
      }

      const dataVersion = getDataVersion();
      const results = countries.map((code) => {
        if (typeof code !== 'string') {
          return {
            countryCode: String(code),
            error: {
              code: 'MISSING_PARAMETER',
              message: 'Country code must be a string',
            },
          };
        }

        const country = getCountryByCode(code);
        if (!country) {
          return {
            countryCode: code.toUpperCase(),
            error: {
              code: 'COUNTRY_NOT_FOUND',
              message: `No data available for country code '${code.toUpperCase()}'`,
            },
          };
        }

        return calculateEntitlement(country, dataVersion);
      });

      return { ok: true, data: { count: results.length, results } };
    },
  );
};
