import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';
import { getCountryByCode } from '../data/loader.js';
import type {
  OutcomeRecord,
  OutcomeIndicators,
  OutcomeCohortType,
  OutcomeComparison,
  OutcomeDelta,
  EvidenceAggregate,
} from '../core/types.js';

// ── Row types ─────────────────────────────────────────────────────────────────

interface OutcomeRow {
  id: string;
  pilot_id: string;
  cohort_type: string;
  measurement_date: string;
  indicators: string;
  sample_size: number;
  data_source: string;
  is_baseline: number;
  created_at: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function rowToOutcome(row: OutcomeRow): OutcomeRecord {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    cohortType: row.cohort_type as OutcomeCohortType,
    measurementDate: row.measurement_date,
    indicators: JSON.parse(row.indicators) as OutcomeIndicators,
    sampleSize: row.sample_size,
    dataSource: row.data_source,
    isBaseline: row.is_baseline === 1,
    createdAt: row.created_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function recordOutcome(params: {
  pilotId: string;
  cohortType: OutcomeCohortType;
  measurementDate: string;
  indicators: OutcomeIndicators;
  sampleSize: number;
  dataSource: string;
  isBaseline?: boolean;
}): OutcomeRecord {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const indicatorsJson = JSON.stringify(params.indicators);
  const isBaseline = params.isBaseline ? 1 : 0;

  db.prepare(
    `INSERT INTO pilot_outcomes
      (id, pilot_id, cohort_type, measurement_date, indicators, sample_size, data_source, is_baseline, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.pilotId,
    params.cohortType,
    params.measurementDate,
    indicatorsJson,
    params.sampleSize,
    params.dataSource,
    isBaseline,
    now,
  );

  return {
    id,
    pilotId: params.pilotId,
    cohortType: params.cohortType,
    measurementDate: params.measurementDate,
    indicators: params.indicators,
    sampleSize: params.sampleSize,
    dataSource: params.dataSource,
    isBaseline: params.isBaseline ?? false,
    createdAt: now,
  };
}

export function getPilotOutcomes(pilotId: string): OutcomeRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM pilot_outcomes WHERE pilot_id = ? ORDER BY measurement_date ASC, created_at ASC`,
    )
    .all(pilotId) as OutcomeRow[];
  return rows.map(rowToOutcome);
}

export function getOutcomeById(id: string): OutcomeRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM pilot_outcomes WHERE id = ?').get(id) as OutcomeRow | undefined;
  return row ? rowToOutcome(row) : null;
}

// ── Pre/post comparison ───────────────────────────────────────────────────────

/** Compute the delta between two indicator snapshots */
function computeDelta(
  baseline: OutcomeIndicators | null,
  latest: OutcomeIndicators | null,
): OutcomeDelta | null {
  if (!baseline && !latest) return null;

  const keys: (keyof OutcomeIndicators)[] = [
    'employmentRate',
    'averageMonthlyIncomeUsd',
    'foodSecurityScore',
    'childSchoolAttendanceRate',
    'abovePovertyLinePercent',
    'selfReportedHealthScore',
    'savingsRate',
  ];

  const delta: OutcomeDelta = {};

  for (const key of keys) {
    const b = baseline?.[key] ?? null;
    const l = latest?.[key] ?? null;
    if (b !== null || l !== null) {
      delta[key] = {
        baseline: b,
        latest: l,
        change: b !== null && l !== null ? Math.round((l - b) * 10000) / 10000 : null,
      };
    }
  }

  return delta;
}

export function getOutcomeComparison(
  pilotId: string,
  projectedImpact?: { povertyReductionPercent: number | null; incomeIncreasePercent: number | null } | null,
): OutcomeComparison {
  const all = getPilotOutcomes(pilotId);

  const recipients = all.filter((r) => r.cohortType === 'recipient');
  const controls = all.filter((r) => r.cohortType === 'control');

  const recipientBaseline = recipients.find((r) => r.isBaseline) ?? null;
  const recipientLatest = recipients.filter((r) => !r.isBaseline).at(-1) ?? null;

  const controlBaseline = controls.find((r) => r.isBaseline) ?? null;
  const controlLatest = controls.filter((r) => !r.isBaseline).at(-1) ?? null;

  const hasControl = controls.length > 0;

  return {
    pilotId,
    recipient: {
      baseline: recipientBaseline,
      latest: recipientLatest,
      delta: computeDelta(
        recipientBaseline?.indicators ?? null,
        recipientLatest?.indicators ?? null,
      ),
    },
    control: hasControl
      ? {
          baseline: controlBaseline,
          latest: controlLatest,
          delta: computeDelta(
            controlBaseline?.indicators ?? null,
            controlLatest?.indicators ?? null,
          ),
        }
      : null,
    projectedImpact: projectedImpact ?? null,
    allMeasurements: all,
    meta: { generatedAt: new Date().toISOString() },
  };
}

// ── Cross-program aggregate (anonymized) ──────────────────────────────────────

interface PilotRow {
  id: string;
  country_code: string;
}

interface SimulationRow {
  results: string;
}

/** Percentile from a sorted array (0–1) */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function aggregateOutcomes(filters: {
  country?: string;
  incomeGroup?: string;
  coverageMin?: number;
  coverageMax?: number;
  cohortType?: 'recipient' | 'control';
}): EvidenceAggregate {
  const db = getDb();

  // Collect pilot IDs matching country filter
  const conditions: string[] = [];
  const args: unknown[] = [];

  if (filters.country) {
    conditions.push('p.country_code = ?');
    args.push(filters.country.toUpperCase());
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const pilotRows = db
    .prepare(`SELECT p.id, p.country_code FROM pilots p ${where}`)
    .all(...args) as PilotRow[];

  // If incomeGroup or coverage filters are set, further filter via linked simulations
  let eligiblePilotIds: Set<string>;

  if (filters.incomeGroup !== undefined || filters.coverageMin !== undefined || filters.coverageMax !== undefined) {
    eligiblePilotIds = new Set<string>();

    for (const pilot of pilotRows) {
      // Income group comes from the country dataset — saved simulation
      // results do not carry it, so reading it from there matched nothing.
      if (filters.incomeGroup && getCountryByCode(pilot.country_code)?.stats.incomeGroup !== filters.incomeGroup) {
        continue;
      }
      if (filters.coverageMin === undefined && filters.coverageMax === undefined) {
        eligiblePilotIds.add(pilot.id);
        continue;
      }

      const simRow = db
        .prepare('SELECT s.results FROM simulations s JOIN pilots p ON p.simulation_id = s.id WHERE p.id = ?')
        .get(pilot.id) as SimulationRow | undefined;

      if (!simRow) continue;

      const results = JSON.parse(simRow.results) as {
        simulation?: { coverageRate?: number };
      };

      const coverageRate = results.simulation?.coverageRate ?? null;

      if (filters.coverageMin !== undefined && coverageRate !== null && coverageRate < filters.coverageMin) continue;
      if (filters.coverageMax !== undefined && coverageRate !== null && coverageRate > filters.coverageMax) continue;

      eligiblePilotIds.add(pilot.id);
    }
  } else {
    eligiblePilotIds = new Set(pilotRows.map((p) => p.id));
  }

  const pilotIdList = [...eligiblePilotIds];
  if (pilotIdList.length === 0) {
    return {
      filters,
      programCount: 0,
      measurementCount: 0,
      indicators: {},
      meta: { generatedAt: new Date().toISOString(), dataVersion: '1.0' },
    };
  }

  // Gather all outcome records for eligible pilots
  const placeholders = pilotIdList.map(() => '?').join(',');
  const cohortClause = filters.cohortType ? ' AND cohort_type = ?' : '';
  const outcomeRows = db
    .prepare(`SELECT * FROM pilot_outcomes WHERE pilot_id IN (${placeholders})${cohortClause}`)
    .all(...pilotIdList, ...(filters.cohortType ? [filters.cohortType] : [])) as OutcomeRow[];

  const outcomes = outcomeRows.map(rowToOutcome);

  // Aggregate per indicator
  const keys: (keyof OutcomeIndicators)[] = [
    'employmentRate',
    'averageMonthlyIncomeUsd',
    'foodSecurityScore',
    'childSchoolAttendanceRate',
    'abovePovertyLinePercent',
    'selfReportedHealthScore',
    'savingsRate',
  ];

  const indicators: EvidenceAggregate['indicators'] = {};

  for (const key of keys) {
    const values = outcomes
      .map((o) => o.indicators[key])
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);

    if (values.length > 0) {
      indicators[key] = {
        median: percentile(values, 0.5),
        p25: percentile(values, 0.25),
        p75: percentile(values, 0.75),
        sampleSize: values.length,
      };
    }
  }

  return {
    filters,
    programCount: new Set(outcomes.map((o) => o.pilotId)).size,
    measurementCount: outcomes.length,
    indicators,
    meta: { generatedAt: new Date().toISOString(), dataVersion: '1.0' },
  };
}
