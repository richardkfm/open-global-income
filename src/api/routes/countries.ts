import type { FastifyPluginAsync } from 'fastify';
import {
  getAllCountries,
  getCountryByCode,
  getDataVersion,
} from '../../data/loader.js';

export const countriesRoute: FastifyPluginAsync = async (app) => {
  /** List all countries with summary metadata */
  app.get('/countries', async () => {
    const countries = getAllCountries();
    const summary = countries.map((c) => ({
      code: c.code,
      name: c.name,
      incomeGroup: c.stats.incomeGroup,
      hasGiniData: c.stats.giniIndex !== null,
    }));

    return {
      ok: true,
      data: {
        dataVersion: getDataVersion(),
        count: summary.length,
        countries: summary,
      },
    };
  });

  /** Get full details for a single country */
  app.get<{ Params: { code: string } }>(
    '/countries/:code',
    async (request, reply) => {
      const country = getCountryByCode(request.params.code);

      if (!country) {
        return reply.status(404).send({
          ok: false,
          error: {
            code: 'COUNTRY_NOT_FOUND',
            message: `No data available for country code '${request.params.code.toUpperCase()}'`,
          },
        });
      }

      return {
        ok: true,
        data: {
          code: country.code,
          name: country.name,
          stats: country.stats,
          dataVersion: getDataVersion(),
        },
      };
    },
  );
};
