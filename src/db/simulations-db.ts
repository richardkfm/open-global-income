import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';
import type { SavedSimulation, SimulationParameters, SimulationResult } from '../core/types.js';

interface SimulationRow {
  id: string;
  name: string | null;
  country_code: string;
  parameters: string;
  results: string;
  api_key_id: string | null;
  created_at: string;
}

function rowToSimulation(row: SimulationRow): SavedSimulation {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    parameters: JSON.parse(row.parameters) as SimulationParameters,
    results: JSON.parse(row.results) as SimulationResult,
    apiKeyId: row.api_key_id,
    createdAt: row.created_at,
  };
}

export function saveSimulation(
  name: string | null,
  countryCode: string,
  parameters: SimulationParameters,
  results: SimulationResult,
  apiKeyId?: string,
): SavedSimulation {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO simulations (id, name, country_code, parameters, results, api_key_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name ?? null, countryCode, JSON.stringify(parameters), JSON.stringify(results), apiKeyId ?? null, now);

  return {
    id,
    name: name ?? null,
    countryCode,
    parameters,
    results,
    apiKeyId: apiKeyId ?? null,
    createdAt: now,
  };
}

export function listSimulations(
  limit = 20,
  offset = 0,
): { simulations: SavedSimulation[]; total: number } {
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) as count FROM simulations').get() as { count: number }
  ).count;

  const rows = db
    .prepare('SELECT * FROM simulations ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as SimulationRow[];

  return { simulations: rows.map(rowToSimulation), total };
}

export function getSimulationById(id: string): SavedSimulation | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM simulations WHERE id = ?').get(id) as SimulationRow | undefined;
  return row ? rowToSimulation(row) : null;
}

export function deleteSimulation(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM simulations WHERE id = ?').run(id);
  return result.changes > 0;
}
