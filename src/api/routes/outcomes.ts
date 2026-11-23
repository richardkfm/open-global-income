import type { FastifyPluginAsync } from 'fastify';
import { getPilotById } from '../../db/pilots-db.js';
import {
  recordOutcome,
  getPilotOutcomes,
  getOutcomeComparison,
  aggregateOutcomes,
} from '../../db/outcomes-db.js';
import { getLatestImpactAnalysisBySimulation } from '../../db/impact-db.js';
import { dispatchEvent } from '../../webhooks/dispatcher.js';
import { isValidIsoDate } from '../validators.js';
import type { OutcomeCohortType, OutcomeIndicators } from '../../core/types.js';

const VALID_COHORT_TYPES: OutcomeCohortType[] = ['recipient', 'control'];
const INDICATOR_KEYS: (keyof OutcomeIndicators)[] = [
  'employmentRate',
  'averageMonthlyIncomeUsd',
  'foodSecurityScore',
  'childSchoolAttendanceRate',
  'abovePovertyLinePercent',
  'selfReportedHealthScore',
  'savingsRate',
];

/** Validate that a value is a number in [min, max] */
function validateIndicatorValue(
  key: string,
  val: unknown,
  min: number,
  max: number,
): { ok: false; message: string } | { ok: true; value: number } {
  if (typeof val !== 'number' || isNaN(val)) {
    return { ok: false, message: `'indicators.${key}' must be a number` };
  }
  if (val < min || val > max) {
    return { ok: false, message: `'indicators.${key}' must be between ${min} and ${max}` };
  }
  return { ok: true, value: val };
}

/** Parse and validate the indicators object from a request body */
function parseIndicators(raw: unknown): { ok: true; indicators: OutcomeIndicators } | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: "'indicators' must be an object" };
  }

  const obj = raw as Record<string, unknown>;
  const indicators: OutcomeIndicators = {};

  const rateKeys: (keyof OutcomeIndicators)[] = [
    'employmentRate',
    'childSchoolAttendanceRate',
    'abovePovertyLinePercent',
    'selfReportedHealthScore',
    'savingsRate',
  ];

  for (const key of rateKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const result = validateIndicatorValue(key, obj[key], 0, 1);
      if (!result.ok) return result;
      indicators[key] = result.value;
    }
  }

  if (obj.averageMonthlyIncomeUsd !== undefined && obj.averageMonthlyIncomeUsd !== null) {
    const result = validateIndicatorValue('averageMonthlyIncomeUsd', obj.averageMonthlyIncomeUsd, 0, 1_000_000);
    if (!result.ok) return result;
    indicators.averageMonthlyIncomeUsd = result.value;
  }

  if (obj.foodSecurityScore !== undefined && obj.foodSecurityScore !== null) {
    const result = validateIndicatorValue('foodSecurityScore', obj.foodSecurityScore, 0, 10);
    if (!result.ok) return result;
    indicators.foodSecurityScore = result.value;
  }

  const hasAny = INDICATOR_KEYS.some((k) => indicators[k] !== undefined);
  if (!hasAny) {
    return { ok: false, message: "'indicators' must contain at least one recognized indicator" };
  }

  return { ok: true, indicators };
}

export const outcomesRoute: FastifyPluginAsync = async (app) => {
  // ── POST /v1/pilots/:id/outcomes ─────────────────────────────────────────────

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/pilots/:id/outcomes',
    async (request, reply) => {
      const pilot = getPilotById(request.params.id);
      if (!pilot) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Pilot not found' },
        });
      }

      const { cohortType, measurementDate, indicators, sampleSize, dataSource, isBaseline } =
        request.body ?? {};

      if (!VALID_COHORT_TYPES.includes(cohortType as OutcomeCohortType)) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: `'cohortType' must be one of: ${VALID_COHORT_TYPES.join(', ')}`,
          },
        });
      }

      if (!isValidIsoDate(measurementDate)) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_PARAMETER', message: "'measurementDate' must be a valid calendar date (YYYY-MM-DD)" },
        });
      }

      const parsedIndicators = parseIndicators(indicators);
      if (!parsedIndicators.ok) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_PARAMETER', message: parsedIndicators.message },
        });
      }

      if (typeof sampleSize !== 'number' || !Number.isInteger(sampleSize) || sampleSize < 1) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_PARAMETER', message: "'sampleSize' must be a positive integer" },
        });
      }

      if (typeof dataSource !== 'string' || !dataSource.trim()) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'MISSING_PARAMETER', message: "'dataSource' is required" },
        });
      }

      const outcome = recordOutcome({
        pilotId: pilot.id,
        cohortType: cohortType as OutcomeCohortType,
        measurementDate,
        indicators: parsedIndicators.indicators,
        sampleSize,
        dataSource: dataSource.trim(),
        isBaseline: isBaseline === true,
      });

      void dispatchEvent('pilot.outcome_recorded', {
        pilotId: pilot.id,
        outcomeId: outcome.id,
        cohortType: outcome.cohortType,
        measurementDate: outcome.measurementDate,
        isBaseline: outcome.isBaseline,
      });

      return reply.status(201).send({ ok: true, data: outcome });
    },
  );

  // ── GET /v1/pilots/:id/outcomes ──────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/pilots/:id/outcomes', async (request, reply) => {
    const pilot = getPilotById(request.params.id);
    if (!pilot) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Pilot not found' },
      });
    }

    const outcomes = getPilotOutcomes(pilot.id);
    return reply.send({ ok: true, data: outcomes });
  });

  // ── GET /v1/pilots/:id/outcomes/compare ──────────────────────────────────────

  app.get<{ Params: { id: string } }>('/pilots/:id/outcomes/compare', async (request, reply) => {
    const pilot = getPilotById(request.params.id);
    if (!pilot) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Pilot not found' },
      });
    }

    // Pull projected impact from linked impact analysis if available
    let projectedImpact: {
      povertyReductionPercent: number | null;
      incomeIncreasePercent: number | null;
    } | null = null;

    if (pilot.simulationId) {
      const ia = getLatestImpactAnalysisBySimulation(pilot.simulationId);
      if (ia) {
        projectedImpact = {
          povertyReductionPercent: ia.results.povertyReduction.liftedAsPercentOfPoor ?? null,
          incomeIncreasePercent: ia.results.purchasingPower.incomeIncreasePercent ?? null,
        };
      }
    }

    const comparison = getOutcomeComparison(pilot.id, projectedImpact);
    return reply.send({ ok: true, data: comparison });
  });
};

// ── Evidence aggregate & export routes (top-level) ───────────────────────────

export const evidenceRoute: FastifyPluginAsync = async (app) => {
  // ── GET /v1/evidence/aggregate ────────────────────────────────────────────────

  app.get<{
    Querystring: {
      country?: string;
      incomeGroup?: string;
      coverageMin?: string;
      coverageMax?: string;
      cohortType?: string;
    };
  }>('/evidence/aggregate', async (request, reply) => {
    const { country, incomeGroup, coverageMin, coverageMax, cohortType } = request.query;

    if (cohortType !== undefined && !VALID_COHORT_TYPES.includes(cohortType as OutcomeCohortType)) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'INVALID_PARAMETER', message: `'cohortType' must be one of: ${VALID_COHORT_TYPES.join(', ')}` },
      });
    }

    const parsedCoverageMin = coverageMin !== undefined ? parseFloat(coverageMin) : undefined;
    const parsedCoverageMax = coverageMax !== undefined ? parseFloat(coverageMax) : undefined;

    if (parsedCoverageMin !== undefined && (isNaN(parsedCoverageMin) || parsedCoverageMin < 0 || parsedCoverageMin > 1)) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'INVALID_PARAMETER', message: "'coverageMin' must be a number between 0 and 1" },
      });
    }
    if (parsedCoverageMax !== undefined && (isNaN(parsedCoverageMax) || parsedCoverageMax < 0 || parsedCoverageMax > 1)) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'INVALID_PARAMETER', message: "'coverageMax' must be a number between 0 and 1" },
      });
    }

    const aggregate = aggregateOutcomes({
      country,
      incomeGroup,
      coverageMin: parsedCoverageMin,
      coverageMax: parsedCoverageMax,
      ...(cohortType ? { cohortType: cohortType as OutcomeCohortType } : {}),
    });

    return reply.send({ ok: true, data: aggregate });
  });

  // ── GET /v1/evidence/export ────────────────────────────────────────────────────

  app.get<{ Querystring: { format?: string; country?: string } }>(
    '/evidence/export',
    async (request, reply) => {
      const { format = 'csv', country } = request.query;

      if (!['csv', 'json'].includes(format)) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_PARAMETER', message: "'format' must be 'csv' or 'json'" },
        });
      }

      const aggregate = aggregateOutcomes({ country });

      if (format === 'json') {
        reply.header('Content-Disposition', 'attachment; filename="ogi-evidence-export.json"');
        reply.header('Content-Type', 'application/json');
        return reply.send({ ok: true, data: aggregate });
      }

      // CSV export — one row per indicator
      const rows: string[] = [
        'indicator,median,p25,p75,sample_size,program_count,generated_at',
      ];

      for (const [key, stats] of Object.entries(aggregate.indicators)) {
        if (!stats) continue;
        rows.push(
          [
            key,
            stats.median ?? '',
            stats.p25 ?? '',
            stats.p75 ?? '',
            stats.sampleSize,
            aggregate.programCount,
            aggregate.meta.generatedAt,
          ].join(','),
        );
      }

      reply.header('Content-Disposition', 'attachment; filename="ogi-evidence-export.csv"');
      reply.header('Content-Type', 'text/csv');
      return reply.send(rows.join('\n'));
    },
  );
};
