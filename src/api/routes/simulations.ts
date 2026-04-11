import type { FastifyPluginAsync } from 'fastify';
import { getCountryByCode, getDataVersion } from '../../data/loader.js';
import { calculateSimulation } from '../../core/simulations.js';
import {
  saveSimulation,
  listSimulations,
  getSimulationById,
  deleteSimulation,
} from '../../db/simulations-db.js';
import { dispatchEvent } from '../../webhooks/dispatcher.js';
import { parsePagination, buildPaginationMeta } from '../pagination.js';
import { VALID_TARGET_GROUPS } from '../validators.js';
import type { SimulationParameters, TargetGroup } from '../../core/types.js';

export const simulationsRoute: FastifyPluginAsync = async (app) => {
  /** Save a simulation */
  app.post<{ Body: Record<string, unknown> }>('/simulations', async (request, reply) => {
    const body = request.body ?? {};
    const { name, country, coverage, targetGroup, durationMonths, adjustments } = body as {
      name?: unknown;
      country?: unknown;
      coverage?: unknown;
      targetGroup?: unknown;
      durationMonths?: unknown;
      adjustments?: unknown;
    };

    if (typeof country !== 'string' || !country) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'MISSING_PARAMETER', message: "Field 'country' is required" },
      });
    }

    if (typeof coverage !== 'number' || coverage < 0 || coverage > 1) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: "'coverage' must be a number between 0 and 1",
        },
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
    if (
      typeof duration !== 'number' ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 120
    ) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: "'durationMonths' must be an integer between 1 and 120",
        },
      });
    }

    const countryCode = country.toUpperCase();
    const countryData = getCountryByCode(countryCode);
    if (!countryData) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'COUNTRY_NOT_FOUND',
          message: `No data available for country code '${countryCode}'`,
        },
      });
    }

    const adj = (adjustments as Record<string, unknown>) ?? {};
    const params: SimulationParameters = {
      country: countryCode,
      coverage,
      targetGroup: tg as TargetGroup,
      durationMonths: duration,
      adjustments: {
        floorOverride: adj.floorOverride === null ? null : (adj.floorOverride as number | null) ?? null,
        householdSize: adj.householdSize === null ? null : (adj.householdSize as number | null) ?? null,
      },
    };

    const results = calculateSimulation(countryData, params, getDataVersion());
    const simulationName = typeof name === 'string' && name ? name : null;
    const apiKeyId = (request as { apiKeyId?: string }).apiKeyId;
    const saved = saveSimulation(simulationName, countryCode, params, results, apiKeyId);

    void dispatchEvent('simulation.created', {
      id: saved.id,
      name: saved.name,
      countryCode: saved.countryCode,
      createdAt: saved.createdAt,
    });

    return reply.status(201).send({ ok: true, data: saved });
  });

  /** List saved simulations (paginated) */
  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/simulations',
    async (request, reply) => {
      const pg = parsePagination(request.query);
      const { simulations, total } = listSimulations(pg.limit, pg.offset);
      return reply.send({
        ok: true,
        data: {
          simulations,
          pagination: buildPaginationMeta(pg, total),
        },
      });
    },
  );

  /** Retrieve a saved simulation by ID */
  app.get<{ Params: { id: string } }>('/simulations/:id', async (request, reply) => {
    const simulation = getSimulationById(request.params.id);
    if (!simulation) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Simulation not found' },
      });
    }
    return reply.send({ ok: true, data: simulation });
  });

  /** Delete a saved simulation by ID */
  app.delete<{ Params: { id: string } }>('/simulations/:id', async (request, reply) => {
    const deleted = deleteSimulation(request.params.id);
    if (!deleted) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Simulation not found' },
      });
    }
    return reply.send({ ok: true, data: { deleted: true } });
  });
};
