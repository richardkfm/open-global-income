import type { FastifyPluginAsync } from 'fastify';
import {
  createPilot,
  getPilotById,
  listPilots,
  updatePilot,
  linkDisbursement,
  getPilotDisbursementIds,
} from '../../db/pilots-db.js';
import { getDisbursementById } from '../../db/disbursements-db.js';
import { getSimulationById } from '../../db/simulations-db.js';
import { dispatchEvent } from '../../webhooks/dispatcher.js';
import type { PilotStatus } from '../../core/types.js';

const VALID_STATUSES = ['planning', 'active', 'paused', 'completed'];

const VALID_TRANSITIONS: Record<string, string[]> = {
  planning: ['active', 'completed'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed'],
  completed: [],
};

export const pilotsRoute: FastifyPluginAsync = async (app) => {
  // ── POST /v1/pilots ─────────────────────────────────────────────────────────

  app.post<{ Body: Record<string, unknown> }>('/pilots', async (request, reply) => {
    const { name, countryCode, description, simulationId, startDate, endDate, targetRecipients } =
      request.body ?? {};

    if (typeof name !== 'string' || !name.trim()) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'MISSING_PARAMETER', message: "'name' is required" },
      });
    }
    if (typeof countryCode !== 'string' || !countryCode.trim()) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'MISSING_PARAMETER', message: "'countryCode' is required" },
      });
    }
    if (targetRecipients !== undefined && targetRecipients !== null) {
      if (typeof targetRecipients !== 'number' || !Number.isInteger(targetRecipients) || targetRecipients < 1) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: "'targetRecipients' must be a positive integer",
          },
        });
      }
    }

    if (simulationId !== undefined && simulationId !== null) {
      if (typeof simulationId !== 'string') {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_PARAMETER', message: "'simulationId' must be a string" },
        });
      }
      const sim = getSimulationById(simulationId);
      if (!sim) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Simulation '${simulationId}' not found` },
        });
      }
    }

    const apiKeyId = (request as { apiKeyId?: string }).apiKeyId;
    const pilot = createPilot({
      name: name.trim(),
      countryCode: (countryCode as string).toUpperCase(),
      description: typeof description === 'string' ? description : null,
      simulationId: typeof simulationId === 'string' ? simulationId : null,
      startDate: typeof startDate === 'string' ? startDate : null,
      endDate: typeof endDate === 'string' ? endDate : null,
      targetRecipients: typeof targetRecipients === 'number' ? targetRecipients : null,
      apiKeyId,
    });

    void dispatchEvent('pilot.created', {
      id: pilot.id,
      name: pilot.name,
      countryCode: pilot.countryCode,
      createdAt: pilot.createdAt,
    });

    return reply.status(201).send({ ok: true, data: pilot });
  });

  // ── GET /v1/pilots ──────────────────────────────────────────────────────────

  app.get<{ Querystring: { page?: string; limit?: string; status?: string; countryCode?: string } }>(
    '/pilots',
    async (request, reply) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '20', 10) || 20));
      const offset = (page - 1) * limit;

      const { status, countryCode } = request.query;

      if (status && !VALID_STATUSES.includes(status)) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: `'status' must be one of: ${VALID_STATUSES.join(', ')}`,
          },
        });
      }

      const { pilots, total } = listPilots({ limit, offset, status, countryCode });
      const totalPages = Math.ceil(total / limit);

      return reply.send({
        ok: true,
        data: {
          pilots,
          pagination: { page, limit, total, totalPages },
        },
      });
    },
  );

  // ── GET /v1/pilots/:id ──────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/pilots/:id', async (request, reply) => {
    const pilot = getPilotById(request.params.id);
    if (!pilot) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Pilot not found' },
      });
    }

    const disbursementIds = getPilotDisbursementIds(pilot.id);
    const disbursements = disbursementIds
      .map((did) => getDisbursementById(did))
      .filter((d) => d !== null);

    return reply.send({ ok: true, data: { pilot, disbursements } });
  });

  // ── PATCH /v1/pilots/:id ────────────────────────────────────────────────────

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/pilots/:id',
    async (request, reply) => {
      const pilot = getPilotById(request.params.id);
      if (!pilot) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Pilot not found' },
        });
      }

      const { status, description, startDate, endDate, targetRecipients } = request.body ?? {};

      if (status !== undefined) {
        if (!VALID_STATUSES.includes(status as string)) {
          return reply.status(400).send({
            ok: false,
            error: {
              code: 'INVALID_PARAMETER',
              message: `'status' must be one of: ${VALID_STATUSES.join(', ')}`,
            },
          });
        }

        const allowed = VALID_TRANSITIONS[pilot.status];
        if (!allowed.includes(status as string)) {
          return reply.status(409).send({
            ok: false,
            error: {
              code: 'INVALID_TRANSITION',
              message: `Cannot transition from '${pilot.status}' to '${status as string}'`,
            },
          });
        }
      }

      if (targetRecipients !== undefined && targetRecipients !== null) {
        if (typeof targetRecipients !== 'number' || !Number.isInteger(targetRecipients) || targetRecipients < 1) {
          return reply.status(400).send({
            ok: false,
            error: {
              code: 'INVALID_PARAMETER',
              message: "'targetRecipients' must be a positive integer",
            },
          });
        }
      }

      const updated = updatePilot(pilot.id, {
        status: status as PilotStatus | undefined,
        description: typeof description === 'string' ? description : undefined,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
        targetRecipients: typeof targetRecipients === 'number' ? targetRecipients : undefined,
      });

      if (status !== undefined && status !== pilot.status) {
        void dispatchEvent('pilot.status_changed', {
          id: pilot.id,
          previousStatus: pilot.status,
          newStatus: status as string,
        });
      }

      return reply.send({ ok: true, data: updated });
    },
  );

  // ── POST /v1/pilots/:id/disbursements ───────────────────────────────────────

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/pilots/:id/disbursements',
    async (request, reply) => {
      const pilot = getPilotById(request.params.id);
      if (!pilot) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Pilot not found' },
        });
      }

      const { disbursementId } = request.body ?? {};
      if (typeof disbursementId !== 'string' || !disbursementId.trim()) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'disbursementId' is required" },
        });
      }

      const disbursement = getDisbursementById(disbursementId);
      if (!disbursement) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Disbursement '${disbursementId}' not found` },
        });
      }

      linkDisbursement(pilot.id, disbursementId);
      return reply.status(201).send({ ok: true, data: { linked: true } });
    },
  );

  // ── GET /v1/pilots/:id/report ───────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/pilots/:id/report', async (request, reply) => {
    const pilot = getPilotById(request.params.id);
    if (!pilot) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Pilot not found' },
      });
    }

    const disbursementIds = getPilotDisbursementIds(pilot.id);
    const disbursements = disbursementIds
      .map((did) => getDisbursementById(did))
      .filter((d) => d !== null);

    let totalDisbursed = 0;
    let totalRecipients = 0;
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    for (const d of disbursements) {
      totalDisbursed += parseFloat(d.totalAmount) || 0;
      totalRecipients += d.recipientCount;

      if (!earliestDate || d.createdAt < earliestDate) {
        earliestDate = d.createdAt;
      }
      const endDate = d.completedAt ?? d.createdAt;
      if (!latestDate || endDate > latestDate) {
        latestDate = endDate;
      }
    }

    const averagePerRecipient =
      totalRecipients > 0 ? Math.round((totalDisbursed / totalRecipients) * 100) / 100 : 0;

    let simulationData: { id: string; projectedCost: number; variance: string } | null = null;
    if (pilot.simulationId) {
      const sim = getSimulationById(pilot.simulationId);
      if (sim) {
        const projectedCost = sim.results.simulation.cost.annualPppUsd;
        const varianceNum =
          projectedCost > 0 ? ((totalDisbursed - projectedCost) / projectedCost) * 100 : 0;
        const varianceStr =
          varianceNum >= 0
            ? `+${Math.round(varianceNum * 10) / 10}%`
            : `${Math.round(varianceNum * 10) / 10}%`;
        simulationData = {
          id: sim.id,
          projectedCost,
          variance: varianceStr,
        };
      }
    }

    const report = {
      pilot: {
        id: pilot.id,
        name: pilot.name,
        country: pilot.countryCode,
        status: pilot.status,
        startDate: pilot.startDate,
        endDate: pilot.endDate,
      },
      summary: {
        totalRecipients,
        totalDisbursed,
        disbursementCount: disbursements.length,
        averagePerRecipient,
        periodCovered: { from: earliestDate, to: latestDate },
      },
      simulation: simulationData,
      disbursements,
      meta: { generatedAt: new Date().toISOString() },
    };

    void dispatchEvent('pilot.report_generated', {
      pilotId: pilot.id,
      generatedAt: report.meta.generatedAt,
    });

    return reply.send({ ok: true, data: report });
  });
};
