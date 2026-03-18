import type { FastifyPluginAsync } from 'fastify';
import { getCountryByCode, getDataVersion } from '../../data/loader.js';
import { calculateSimulation } from '../../core/simulations.js';
import type { SimulationParameters, TargetGroup } from '../../core/types.js';

const VALID_TARGET_GROUPS: TargetGroup[] = ['all', 'bottom_quintile'];
const COMPARE_MAX_COUNTRIES = 20;

function parseSimulationBody(body: Record<string, unknown>): {
  ok: true;
  params: SimulationParameters;
} | { ok: false; code: string; message: string } {
  const { country, coverage, targetGroup, durationMonths, adjustments } = body as {
    country?: unknown;
    coverage?: unknown;
    targetGroup?: unknown;
    durationMonths?: unknown;
    adjustments?: unknown;
  };

  if (typeof country !== 'string' || !country) {
    return { ok: false, code: 'MISSING_PARAMETER', message: "Field 'country' is required" };
  }

  if (typeof coverage !== 'number' || coverage < 0 || coverage > 1) {
    return {
      ok: false,
      code: 'INVALID_PARAMETER',
      message: "'coverage' must be a number between 0 and 1",
    };
  }

  const tg = (targetGroup as string) ?? 'all';
  if (!VALID_TARGET_GROUPS.includes(tg as TargetGroup)) {
    return {
      ok: false,
      code: 'INVALID_PARAMETER',
      message: `'targetGroup' must be one of: ${VALID_TARGET_GROUPS.join(', ')}`,
    };
  }

  const duration = (durationMonths as number) ?? 12;
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 120) {
    return {
      ok: false,
      code: 'INVALID_PARAMETER',
      message: "'durationMonths' must be an integer between 1 and 120",
    };
  }

  const adj = (adjustments as Record<string, unknown>) ?? {};
  const floorOverride = adj.floorOverride === null ? null : (adj.floorOverride as number | null) ?? null;
  const householdSize = adj.householdSize === null ? null : (adj.householdSize as number | null) ?? null;

  if (floorOverride !== null && (typeof floorOverride !== 'number' || floorOverride <= 0)) {
    return {
      ok: false,
      code: 'INVALID_PARAMETER',
      message: "'adjustments.floorOverride' must be a positive number or null",
    };
  }

  return {
    ok: true,
    params: {
      country: country.toUpperCase(),
      coverage,
      targetGroup: tg as TargetGroup,
      durationMonths: duration,
      adjustments: { floorOverride, householdSize },
    },
  };
}

export const simulateRoute: FastifyPluginAsync = async (app) => {
  /** Run a budget simulation for a single country */
  app.post<{ Body: Record<string, unknown> }>('/simulate', async (request, reply) => {
    const parsed = parseSimulationBody(request.body ?? {});
    if (!parsed.ok) {
      return reply.status(400).send({ ok: false, error: { code: parsed.code, message: parsed.message } });
    }

    const country = getCountryByCode(parsed.params.country);
    if (!country) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'COUNTRY_NOT_FOUND',
          message: `No data available for country code '${parsed.params.country}'`,
        },
      });
    }

    const result = calculateSimulation(country, parsed.params, getDataVersion());
    return { ok: true, data: result };
  });

  /** Compare the same scenario across multiple countries */
  app.post<{
    Body: {
      countries?: unknown;
      coverage?: unknown;
      targetGroup?: unknown;
      durationMonths?: unknown;
    };
  }>('/simulate/compare', async (request, reply) => {
    const body = request.body ?? {};
    const { countries, coverage, targetGroup, durationMonths } = body;

    if (!Array.isArray(countries) || countries.length === 0) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'MISSING_PARAMETER',
          message: "Field 'countries' must be a non-empty array",
        },
      });
    }

    if (countries.length > COMPARE_MAX_COUNTRIES) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'TOO_MANY_COUNTRIES',
          message: `Maximum ${COMPARE_MAX_COUNTRIES} countries per comparison request`,
        },
      });
    }

    // Validate shared parameters
    const parsed = parseSimulationBody({
      country: countries[0] ?? 'XX',
      coverage,
      targetGroup,
      durationMonths,
      adjustments: { floorOverride: null, householdSize: null },
    });
    if (!parsed.ok) {
      return reply.status(400).send({ ok: false, error: { code: parsed.code, message: parsed.message } });
    }

    const dataVersion = getDataVersion();
    const results = [];
    const errors = [];

    for (const code of countries) {
      if (typeof code !== 'string') {
        errors.push({ countryCode: String(code), error: 'Country code must be a string' });
        continue;
      }
      const country = getCountryByCode(code);
      if (!country) {
        errors.push({ countryCode: code.toUpperCase(), error: 'Country not found' });
        continue;
      }
      const params: SimulationParameters = { ...parsed.params, country: country.code };
      results.push(calculateSimulation(country, params, dataVersion));
    }

    // Sort by annual cost ascending
    results.sort((a, b) => a.simulation.cost.annualPppUsd - b.simulation.cost.annualPppUsd);

    return {
      ok: true,
      data: {
        count: results.length,
        results,
        ...(errors.length > 0 ? { errors } : {}),
      },
    };
  });
};
