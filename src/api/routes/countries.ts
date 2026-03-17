import type { FastifyPluginAsync } from 'fastify';
import { getAllCountries, getDataVersion } from '../../data/loader.js';

export const countriesRoute: FastifyPluginAsync = async (app) => {
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
};
