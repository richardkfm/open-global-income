import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';
import type {
  SavedFundingScenario,
  FundingMechanismInput,
  FundingScenarioResult,
} from '../core/types.js';

interface FundingRow {
  id: string;
  name: string | null;
  simulation_id: string | null;
  country_code: string;
  mechanisms: string;
  results: string;
  created_at: string;
}

function rowToScenario(row: FundingRow): SavedFundingScenario {
  return {
    id: row.id,
    name: row.name,
    simulationId: row.simulation_id,
    countryCode: row.country_code,
    mechanisms: JSON.parse(row.mechanisms) as FundingMechanismInput[],
    results: JSON.parse(row.results) as FundingScenarioResult,
    createdAt: row.created_at,
  };
}

export function saveFundingScenario(
  name: string | null,
  simulationId: string | null,
  countryCode: string,
  mechanisms: FundingMechanismInput[],
  results: FundingScenarioResult,
): SavedFundingScenario {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO funding_scenarios (id, name, simulation_id, country_code, mechanisms, results, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name ?? null, simulationId ?? null, countryCode, JSON.stringify(mechanisms), JSON.stringify(results), now);

  return {
    id,
    name: name ?? null,
    simulationId: simulationId ?? null,
    countryCode,
    mechanisms,
    results,
    createdAt: now,
  };
}

export function listFundingScenarios(
  limit = 20,
  offset = 0,
): { scenarios: SavedFundingScenario[]; total: number } {
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) as count FROM funding_scenarios').get() as { count: number }
  ).count;

  const rows = db
    .prepare('SELECT * FROM funding_scenarios ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as FundingRow[];

  return { scenarios: rows.map(rowToScenario), total };
}

export function getFundingScenarioById(id: string): SavedFundingScenario | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM funding_scenarios WHERE id = ?').get(id) as FundingRow | undefined;
  return row ? rowToScenario(row) : null;
}

export function deleteFundingScenario(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM funding_scenarios WHERE id = ?').run(id);
  return result.changes > 0;
}
