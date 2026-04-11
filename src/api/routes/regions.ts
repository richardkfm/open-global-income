import type { FastifyPluginAsync } from 'fastify';
import {
  getCountryByCode,
  getDataVersion,
  getAllRegions,
  getRegionById,
  getRegionsByCountry,
  getRegionsDataVersion,
} from '../../data/loader.js';
import { calculateEntitlement } from '../../core/rules.js';
import { calculateSimulation } from '../../core/simulations.js';
import { buildRegionAdjustedCountry, toRegionalEntitlement } from '../../core/regions.js';
import { VALID_TARGET_GROUPS } from '../validators.js';
import type { SimulationParameters, TargetGroup } from '../../core/types.js';

export const regionsRoute: FastifyPluginAsync = async (app) => {
  /** List all regions, optionally filtered by country */
  app.get<{ Querystring: { country?: string } }>('/regions', async (request) => {
    const countryFilter = request.query.country;
    const regions = countryFilter
      ? getRegionsByCountry(countryFilter)
      : getAllRegions();

    return {
      ok: true,
      data: {
        dataVersion: getRegionsDataVersion(),
        count: regions.length,
        regions: regions.map((r) => ({
          id: r.id,
          countryCode: r.countryCode,
          regionCode: r.regionCode,
          name: r.name,
          stats: r.stats,
        })),
      },
    };
  });

  /** Get full details for a single region */
  app.get<{ Params: { id: string } }>('/regions/:id', async (request, reply) => {
    const region = getRegionById(request.params.id);

    if (!region) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'REGION_NOT_FOUND',
          message: `No data available for region '${request.params.id.toUpperCase()}'`,
        },
      });
    }

    return {
      ok: true,
      data: {
        region,
        dataVersion: getRegionsDataVersion(),
      },
    };
  });

  /** Calculate regional entitlement */
  app.get<{ Querystring: { country?: string; region?: string } }>(
    '/calc/regional',
    async (request, reply) => {
      const { country: countryParam, region: regionParam } = request.query;

      if (!countryParam) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: "Query parameter 'country' is required",
          },
        });
      }

      if (!regionParam) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: "Query parameter 'region' is required",
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

      const region = getRegionById(regionParam);
      if (!region) {
        return reply.status(404).send({
          ok: false,
          error: {
            code: 'REGION_NOT_FOUND',
            message: `No data available for region '${regionParam.toUpperCase()}'`,
          },
        });
      }

      if (region.countryCode !== country.code) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'REGION_COUNTRY_MISMATCH',
            message: `Region '${region.id}' belongs to country '${region.countryCode}', not '${country.code}'`,
          },
        });
      }

      const dataVersion = getDataVersion();
      const nationalEntitlement = calculateEntitlement(country, dataVersion);
      const adjustedCountry = buildRegionAdjustedCountry(country, region);
      const regionalEntitlement = calculateEntitlement(adjustedCountry, dataVersion);
      const result = toRegionalEntitlement(regionalEntitlement, nationalEntitlement, region);

      return { ok: true, data: result };
    },
  );

  /** Run a budget simulation for a specific region */
  app.post<{ Body: Record<string, unknown> }>('/simulate/regional', async (request, reply) => {
    const body = request.body ?? {};
    const {
      country: countryParam,
      regionId: regionParam,
      coverage,
      targetGroup,
      durationMonths,
    } = body as {
      country?: unknown;
      regionId?: unknown;
      coverage?: unknown;
      targetGroup?: unknown;
      durationMonths?: unknown;
    };

    if (typeof countryParam !== 'string' || !countryParam) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'MISSING_PARAMETER', message: "Field 'country' is required" },
      });
    }

    if (typeof regionParam !== 'string' || !regionParam) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'MISSING_PARAMETER', message: "Field 'regionId' is required" },
      });
    }

    if (typeof coverage !== 'number' || coverage < 0 || coverage > 1) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'INVALID_PARAMETER', message: "'coverage' must be a number between 0 and 1" },
      });
    }

    const tg = (targetGroup as string) ?? 'all';
    if (!VALID_TARGET_GROUPS.includes(tg as TargetGroup)) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: `'targetGroup' must be one of: ${VALID_TARGET_GROUPS.join(', ')}`,
        },
      });
    }

    const duration = (durationMonths as number) ?? 12;
    if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 120) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'INVALID_PARAMETER', message: "'durationMonths' must be an integer between 1 and 120" },
      });
    }

    const country = getCountryByCode(countryParam);
    if (!country) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'COUNTRY_NOT_FOUND',
          message: `No data available for country code '${(countryParam as string).toUpperCase()}'`,
        },
      });
    }

    const region = getRegionById(regionParam as string);
    if (!region) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'REGION_NOT_FOUND',
          message: `No data available for region '${(regionParam as string).toUpperCase()}'`,
        },
      });
    }

    if (region.countryCode !== country.code) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'REGION_COUNTRY_MISMATCH',
          message: `Region '${region.id}' belongs to country '${region.countryCode}', not '${country.code}'`,
        },
      });
    }

    const adjustedCountry = buildRegionAdjustedCountry(country, region);
    const params: SimulationParameters = {
      country: country.code,
      coverage: coverage as number,
      targetGroup: tg as TargetGroup,
      durationMonths: duration as number,
      adjustments: { floorOverride: null, householdSize: null },
    };

    const result = calculateSimulation(adjustedCountry, params, getDataVersion());

    return {
      ok: true,
      data: {
        ...result,
        region: {
          id: region.id,
          name: region.name,
          costOfLivingIndex: region.stats.costOfLivingIndex,
        },
      },
    };
  });
};
