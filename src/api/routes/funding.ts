import type { FastifyPluginAsync } from 'fastify';
import { getCountryByCode, getDataVersion } from '../../data/loader.js';
import { calculateSimulation } from '../../core/simulations.js';
import { calculateFundingScenario, calculateFiscalContext } from '../../core/funding.js';
import { getSimulationById } from '../../db/simulations-db.js';
import { saveFundingScenario, listFundingScenarios, getFundingScenarioById, deleteFundingScenario } from '../../db/funding-db.js';
import type { FundingMechanismInput, SimulationParameters, TargetGroup } from '../../core/types.js';
import { dispatchEvent } from '../../webhooks/dispatcher.js';

const VALID_MECHANISM_TYPES = [
  'income_tax_surcharge',
  'vat_increase',
  'carbon_tax',
  'wealth_tax',
  'financial_transaction_tax',
  'redirect_social_spending',
] as const;

function validateMechanisms(raw: unknown): { ok: true; mechanisms: FundingMechanismInput[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "'mechanisms' must be a non-empty array" };
  }
  if (raw.length > 10) {
    return { ok: false, message: 'Maximum 10 mechanisms per scenario' };
  }

  const mechanisms: FundingMechanismInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || !('type' in item)) {
      return { ok: false, message: "Each mechanism must have a 'type' field" };
    }
    const type = item.type;
    if (!VALID_MECHANISM_TYPES.includes(type as typeof VALID_MECHANISM_TYPES[number])) {
      return { ok: false, message: `Invalid mechanism type: '${type}'. Valid types: ${VALID_MECHANISM_TYPES.join(', ')}` };
    }

    switch (type) {
      case 'income_tax_surcharge':
        if (typeof item.rate !== 'number' || item.rate <= 0 || item.rate > 1) {
          return { ok: false, message: "'income_tax_surcharge.rate' must be between 0 and 1" };
        }
        mechanisms.push({ type, rate: item.rate });
        break;
      case 'vat_increase':
        if (typeof item.points !== 'number' || item.points <= 0 || item.points > 30) {
          return { ok: false, message: "'vat_increase.points' must be between 0 and 30" };
        }
        mechanisms.push({ type, points: item.points });
        break;
      case 'carbon_tax':
        if (typeof item.dollarPerTon !== 'number' || item.dollarPerTon <= 0 || item.dollarPerTon > 500) {
          return { ok: false, message: "'carbon_tax.dollarPerTon' must be between 0 and 500" };
        }
        mechanisms.push({ type, dollarPerTon: item.dollarPerTon });
        break;
      case 'wealth_tax':
        if (typeof item.rate !== 'number' || item.rate <= 0 || item.rate > 0.1) {
          return { ok: false, message: "'wealth_tax.rate' must be between 0 and 0.1 (10%)" };
        }
        mechanisms.push({ type, rate: item.rate });
        break;
      case 'financial_transaction_tax':
        if (typeof item.rate !== 'number' || item.rate <= 0 || item.rate > 0.05) {
          return { ok: false, message: "'financial_transaction_tax.rate' must be between 0 and 0.05 (5%)" };
        }
        mechanisms.push({ type, rate: item.rate });
        break;
      case 'redirect_social_spending':
        if (typeof item.percent !== 'number' || item.percent <= 0 || item.percent > 1) {
          return { ok: false, message: "'redirect_social_spending.percent' must be between 0 and 1" };
        }
        mechanisms.push({ type, percent: item.percent });
        break;
    }
  }

  return { ok: true, mechanisms };
}

export const fundingRoute: FastifyPluginAsync = async (app) => {
  /**
   * POST /v1/simulate/fiscal
   *
   * Fiscal context analysis for a country relative to a UBI simulation.
   */
  app.post<{ Body: Record<string, unknown> }>('/simulate/fiscal', async (request, reply) => {
    const body = request.body ?? {};
    const countryCode = typeof body.country === 'string' ? body.country.toUpperCase() : '';
    const simulationId = typeof body.simulationId === 'string' ? body.simulationId : null;

    if (!countryCode) {
      return reply.status(400).send({ ok: false, error: { code: 'MISSING_PARAMETER', message: "'country' is required" } });
    }

    const country = getCountryByCode(countryCode);
    if (!country) {
      return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `No data for '${countryCode}'` } });
    }

    // Get UBI cost — either from saved simulation or compute inline
    let annualCost: number;
    let asPercentOfGdp: number;

    if (simulationId) {
      const sim = getSimulationById(simulationId);
      if (!sim) {
        return reply.status(404).send({ ok: false, error: { code: 'SIMULATION_NOT_FOUND', message: `Simulation '${simulationId}' not found` } });
      }
      annualCost = sim.results.simulation.cost.annualPppUsd;
      asPercentOfGdp = sim.results.simulation.cost.asPercentOfGdp;
    } else {
      const coverage = typeof body.coverage === 'number' ? body.coverage : 0.2;
      const targetGroup = (typeof body.targetGroup === 'string' ? body.targetGroup : 'all') as TargetGroup;
      const durationMonths = typeof body.durationMonths === 'number' ? body.durationMonths : 12;
      const params: SimulationParameters = {
        country: countryCode,
        coverage,
        targetGroup,
        durationMonths,
        adjustments: { floorOverride: null, householdSize: null },
      };
      const sim = calculateSimulation(country, params, getDataVersion());
      annualCost = sim.simulation.cost.annualPppUsd;
      asPercentOfGdp = sim.simulation.cost.asPercentOfGdp;
    }

    const fiscal = calculateFiscalContext(country, annualCost);

    return {
      ok: true,
      data: {
        country: countryCode,
        ubiCost: { annualPppUsd: annualCost, asPercentOfGdp },
        fiscalContext: fiscal,
      },
    };
  });

  /**
   * POST /v1/simulate/fund
   *
   * Build a funding scenario: apply multiple mechanisms to cover a UBI simulation.
   */
  app.post<{ Body: Record<string, unknown> }>('/simulate/fund', async (request, reply) => {
    const body = request.body ?? {};

    // Resolve simulation
    const simulationId = typeof body.simulationId === 'string' ? body.simulationId : null;
    const countryCode = typeof body.country === 'string' ? body.country.toUpperCase() : '';

    const validMech = validateMechanisms(body.mechanisms);
    if (!validMech.ok) {
      return reply.status(400).send({ ok: false, error: { code: 'INVALID_PARAMETER', message: validMech.message } });
    }

    let simulation;
    let country;

    if (simulationId) {
      const saved = getSimulationById(simulationId);
      if (!saved) {
        return reply.status(404).send({ ok: false, error: { code: 'SIMULATION_NOT_FOUND', message: `Simulation '${simulationId}' not found` } });
      }
      country = getCountryByCode(saved.countryCode);
      if (!country) {
        return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `Country data missing for '${saved.countryCode}'` } });
      }
      simulation = saved.results;
    } else {
      if (!countryCode) {
        return reply.status(400).send({ ok: false, error: { code: 'MISSING_PARAMETER', message: "Either 'simulationId' or 'country' is required" } });
      }
      country = getCountryByCode(countryCode);
      if (!country) {
        return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `No data for '${countryCode}'` } });
      }
      const coverage = typeof body.coverage === 'number' ? body.coverage : 0.2;
      const targetGroup = (typeof body.targetGroup === 'string' ? body.targetGroup : 'all') as TargetGroup;
      const durationMonths = typeof body.durationMonths === 'number' ? body.durationMonths : 12;
      const params: SimulationParameters = {
        country: countryCode,
        coverage,
        targetGroup,
        durationMonths,
        adjustments: { floorOverride: null, householdSize: null },
      };
      simulation = calculateSimulation(country, params, getDataVersion());
    }

    const dataVersion = getDataVersion();
    const result = calculateFundingScenario(country, simulation, validMech.mechanisms, dataVersion, simulationId);

    return { ok: true, data: result };
  });

  /**
   * POST /v1/funding-scenarios — Save a funding scenario
   */
  app.post<{ Body: Record<string, unknown> }>('/funding-scenarios', async (request, reply) => {
    const body = request.body ?? {};
    const name = typeof body.name === 'string' ? body.name : null;
    const simulationId = typeof body.simulationId === 'string' ? body.simulationId : null;
    const countryCode = typeof body.country === 'string' ? body.country.toUpperCase() : '';

    const validMech = validateMechanisms(body.mechanisms);
    if (!validMech.ok) {
      return reply.status(400).send({ ok: false, error: { code: 'INVALID_PARAMETER', message: validMech.message } });
    }

    // Compute the scenario
    let simulation;
    let country;

    if (simulationId) {
      const saved = getSimulationById(simulationId);
      if (!saved) {
        return reply.status(404).send({ ok: false, error: { code: 'SIMULATION_NOT_FOUND', message: `Simulation '${simulationId}' not found` } });
      }
      country = getCountryByCode(saved.countryCode);
      if (!country) {
        return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `Country data missing` } });
      }
      simulation = saved.results;
    } else {
      if (!countryCode) {
        return reply.status(400).send({ ok: false, error: { code: 'MISSING_PARAMETER', message: "Either 'simulationId' or 'country' required" } });
      }
      country = getCountryByCode(countryCode);
      if (!country) {
        return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `No data for '${countryCode}'` } });
      }
      const coverage = typeof body.coverage === 'number' ? body.coverage : 0.2;
      const targetGroup = (typeof body.targetGroup === 'string' ? body.targetGroup : 'all') as TargetGroup;
      const durationMonths = typeof body.durationMonths === 'number' ? body.durationMonths : 12;
      const params: SimulationParameters = {
        country: countryCode,
        coverage,
        targetGroup,
        durationMonths,
        adjustments: { floorOverride: null, householdSize: null },
      };
      simulation = calculateSimulation(country, params, getDataVersion());
    }

    const dataVersion = getDataVersion();
    const result = calculateFundingScenario(country, simulation, validMech.mechanisms, dataVersion, simulationId);
    const saved = saveFundingScenario(name, simulationId, country.code, validMech.mechanisms, result);

    dispatchEvent('funding_scenario.created', { id: saved.id, country: country.code });

    return reply.status(201).send({ ok: true, data: saved });
  });

  /**
   * GET /v1/funding-scenarios — List saved scenarios
   */
  app.get<{ Querystring: { page?: string; limit?: string } }>('/funding-scenarios', async (request) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '20', 10)));
    const offset = (page - 1) * limit;
    const { scenarios, total } = listFundingScenarios(limit, offset);

    return {
      ok: true,
      data: { scenarios, total, page, limit },
    };
  });

  /**
   * GET /v1/funding-scenarios/:id — Get a saved scenario
   */
  app.get<{ Params: { id: string } }>('/funding-scenarios/:id', async (request, reply) => {
    const scenario = getFundingScenarioById(request.params.id);
    if (!scenario) {
      return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Funding scenario not found' } });
    }
    return { ok: true, data: scenario };
  });

  /**
   * DELETE /v1/funding-scenarios/:id — Delete a saved scenario
   */
  app.delete<{ Params: { id: string } }>('/funding-scenarios/:id', async (request, reply) => {
    const deleted = deleteFundingScenario(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Funding scenario not found' } });
    }
    return { ok: true, data: { deleted: true } };
  });
};
