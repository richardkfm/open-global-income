import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';
import type {
  SavedImpactAnalysis,
  ImpactParameters,
  ImpactAnalysisResult,
} from '../core/types.js';

interface ImpactRow {
  id: string;
  name: string | null;
  simulation_id: string | null;
  country_code: string;
  parameters: string;
  results: string;
  api_key_id: string | null;
  created_at: string;
}

function rowToAnalysis(row: ImpactRow): SavedImpactAnalysis {
  return {
    id: row.id,
    name: row.name,
    simulationId: row.simulation_id,
    countryCode: row.country_code,
    parameters: JSON.parse(row.parameters) as ImpactParameters,
    results: JSON.parse(row.results) as ImpactAnalysisResult,
    apiKeyId: row.api_key_id,
    createdAt: row.created_at,
  };
}

export function saveImpactAnalysis(
  name: string | null,
  simulationId: string | null,
  countryCode: string,
  parameters: ImpactParameters,
  results: ImpactAnalysisResult,
  apiKeyId: string | null = null,
): SavedImpactAnalysis {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO impact_analyses
       (id, name, simulation_id, country_code, parameters, results, api_key_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    name ?? null,
    simulationId ?? null,
    countryCode,
    JSON.stringify(parameters),
    JSON.stringify(results),
    apiKeyId ?? null,
    now,
  );

  return {
    id,
    name: name ?? null,
    simulationId: simulationId ?? null,
    countryCode,
    parameters,
    results,
    apiKeyId,
    createdAt: now,
  };
}

export function listImpactAnalyses(
  limit = 20,
  offset = 0,
): { analyses: SavedImpactAnalysis[]; total: number } {
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) as count FROM impact_analyses').get() as { count: number }
  ).count;

  const rows = db
    .prepare('SELECT * FROM impact_analyses ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as ImpactRow[];

  return { analyses: rows.map(rowToAnalysis), total };
}

export function getImpactAnalysisById(id: string): SavedImpactAnalysis | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM impact_analyses WHERE id = ?')
    .get(id) as ImpactRow | undefined;
  return row ? rowToAnalysis(row) : null;
}

export function deleteImpactAnalysis(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM impact_analyses WHERE id = ?').run(id);
  return result.changes > 0;
}
