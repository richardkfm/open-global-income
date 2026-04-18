import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProgramRecord {
  id: string;
  name: string;
  countryCode: string;
  pilotId?: string;
  simulationId?: string;
  fundingScenarioId?: string;
  impactAnalysisId?: string;
  regionId?: string;
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

interface ProgramRow {
  id: string;
  name: string;
  country_code: string;
  pilot_id: string | null;
  simulation_id: string | null;
  funding_scenario_id: string | null;
  impact_analysis_id: string | null;
  region_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function rowToProgram(row: ProgramRow): ProgramRecord {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    ...(row.pilot_id != null ? { pilotId: row.pilot_id } : {}),
    ...(row.simulation_id != null ? { simulationId: row.simulation_id } : {}),
    ...(row.funding_scenario_id != null ? { fundingScenarioId: row.funding_scenario_id } : {}),
    ...(row.impact_analysis_id != null ? { impactAnalysisId: row.impact_analysis_id } : {}),
    ...(row.region_id != null ? { regionId: row.region_id } : {}),
    ...(row.notes != null ? { notes: row.notes } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function createProgram(
  input: Omit<ProgramRecord, 'id' | 'createdAt' | 'updatedAt'>,
): ProgramRecord {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO programs
       (id, name, country_code, pilot_id, simulation_id, funding_scenario_id,
        impact_analysis_id, region_id, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.countryCode,
    input.pilotId ?? null,
    input.simulationId ?? null,
    input.fundingScenarioId ?? null,
    input.impactAnalysisId ?? null,
    input.regionId ?? null,
    input.notes ?? null,
    now,
    now,
  );

  return { id, ...input, createdAt: now, updatedAt: now };
}

export function getProgram(id: string): ProgramRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM programs WHERE id = ?')
    .get(id) as ProgramRow | undefined;
  return row ? rowToProgram(row) : null;
}

export function listPrograms(
  opts: { limit?: number; offset?: number; countryCode?: string } = {},
): { items: ProgramRecord[]; total: number } {
  const db = getDb();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  if (opts.countryCode) {
    const total = (
      db
        .prepare('SELECT COUNT(*) as count FROM programs WHERE country_code = ?')
        .get(opts.countryCode) as { count: number }
    ).count;

    const rows = db
      .prepare(
        'SELECT * FROM programs WHERE country_code = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?',
      )
      .all(opts.countryCode, limit, offset) as ProgramRow[];

    return { items: rows.map(rowToProgram), total };
  }

  const total = (
    db.prepare('SELECT COUNT(*) as count FROM programs').get() as { count: number }
  ).count;

  const rows = db
    .prepare('SELECT * FROM programs ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as ProgramRow[];

  return { items: rows.map(rowToProgram), total };
}

export function updateProgram(
  id: string,
  patch: Partial<Omit<ProgramRecord, 'id' | 'createdAt'>>,
): ProgramRecord | null {
  const db = getDb();
  const existing = getProgram(id);
  if (!existing) return null;

  const now = new Date().toISOString();

  // Build the merged record
  const merged: Omit<ProgramRecord, 'id' | 'createdAt'> = {
    name: patch.name ?? existing.name,
    countryCode: patch.countryCode ?? existing.countryCode,
    pilotId: 'pilotId' in patch ? patch.pilotId : existing.pilotId,
    simulationId: 'simulationId' in patch ? patch.simulationId : existing.simulationId,
    fundingScenarioId:
      'fundingScenarioId' in patch ? patch.fundingScenarioId : existing.fundingScenarioId,
    impactAnalysisId:
      'impactAnalysisId' in patch ? patch.impactAnalysisId : existing.impactAnalysisId,
    regionId: 'regionId' in patch ? patch.regionId : existing.regionId,
    notes: 'notes' in patch ? patch.notes : existing.notes,
    updatedAt: now,
  };

  db.prepare(
    `UPDATE programs SET
       name = ?, country_code = ?, pilot_id = ?, simulation_id = ?,
       funding_scenario_id = ?, impact_analysis_id = ?, region_id = ?,
       notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    merged.name,
    merged.countryCode,
    merged.pilotId ?? null,
    merged.simulationId ?? null,
    merged.fundingScenarioId ?? null,
    merged.impactAnalysisId ?? null,
    merged.regionId ?? null,
    merged.notes ?? null,
    now,
    id,
  );

  return { id, ...merged, createdAt: existing.createdAt };
}

export function deleteProgram(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM programs WHERE id = ?').run(id);
  return result.changes > 0;
}
