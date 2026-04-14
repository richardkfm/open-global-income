import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';
import type { Pilot, PilotStatus, TargetingRules } from '../core/types.js';

// ── Row types ─────────────────────────────────────────────────────────────────

interface PilotRow {
  id: string;
  name: string;
  country_code: string;
  description: string | null;
  simulation_id: string | null;
  targeting_rules: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  target_recipients: number | null;
  api_key_id: string | null;
  created_at: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function rowToPilot(row: PilotRow): Pilot {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    description: row.description,
    simulationId: row.simulation_id,
    targetingRules: row.targeting_rules ? (JSON.parse(row.targeting_rules) as TargetingRules) : null,
    status: row.status as PilotStatus,
    startDate: row.start_date,
    endDate: row.end_date,
    targetRecipients: row.target_recipients,
    apiKeyId: row.api_key_id,
    createdAt: row.created_at,
  };
}

// ── Pilot CRUD ────────────────────────────────────────────────────────────────

export function createPilot(params: {
  name: string;
  countryCode: string;
  description?: string | null;
  simulationId?: string | null;
  targetingRules?: TargetingRules | null;
  startDate?: string | null;
  endDate?: string | null;
  targetRecipients?: number | null;
  apiKeyId?: string | null;
}): Pilot {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const targetingRulesJson = params.targetingRules ? JSON.stringify(params.targetingRules) : null;

  db.prepare(
    `INSERT INTO pilots (id, name, country_code, description, simulation_id, targeting_rules, status, start_date, end_date, target_recipients, api_key_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'planning', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.name,
    params.countryCode,
    params.description ?? null,
    params.simulationId ?? null,
    targetingRulesJson,
    params.startDate ?? null,
    params.endDate ?? null,
    params.targetRecipients ?? null,
    params.apiKeyId ?? null,
    now,
  );

  return {
    id,
    name: params.name,
    countryCode: params.countryCode,
    description: params.description ?? null,
    simulationId: params.simulationId ?? null,
    targetingRules: params.targetingRules ?? null,
    status: 'planning',
    startDate: params.startDate ?? null,
    endDate: params.endDate ?? null,
    targetRecipients: params.targetRecipients ?? null,
    apiKeyId: params.apiKeyId ?? null,
    createdAt: now,
  };
}

export function getPilotById(id: string): Pilot | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM pilots WHERE id = ?')
    .get(id) as PilotRow | undefined;
  return row ? rowToPilot(row) : null;
}

export function listPilots(params: {
  limit?: number;
  offset?: number;
  status?: string;
  countryCode?: string;
}): { pilots: Pilot[]; total: number } {
  const db = getDb();
  const { limit = 20, offset = 0, status, countryCode } = params;

  const conditions: string[] = [];
  const args: unknown[] = [];

  if (status) {
    conditions.push('status = ?');
    args.push(status);
  }
  if (countryCode) {
    conditions.push('country_code = ?');
    args.push(countryCode);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM pilots ${where}`).get(...args) as {
      count: number;
    }
  ).count;

  const rows = db
    .prepare(
      `SELECT * FROM pilots ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset) as PilotRow[];

  return { pilots: rows.map(rowToPilot), total };
}

export function updatePilot(
  id: string,
  fields: {
    status?: PilotStatus;
    description?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    targetRecipients?: number | null;
  },
): Pilot | null {
  const db = getDb();

  const setClauses: string[] = [];
  const args: unknown[] = [];

  if (fields.status !== undefined) {
    setClauses.push('status = ?');
    args.push(fields.status);
  }
  if (fields.description !== undefined) {
    setClauses.push('description = ?');
    args.push(fields.description);
  }
  if (fields.startDate !== undefined) {
    setClauses.push('start_date = ?');
    args.push(fields.startDate);
  }
  if (fields.endDate !== undefined) {
    setClauses.push('end_date = ?');
    args.push(fields.endDate);
  }
  if (fields.targetRecipients !== undefined) {
    setClauses.push('target_recipients = ?');
    args.push(fields.targetRecipients);
  }

  if (setClauses.length === 0) return getPilotById(id);

  args.push(id);
  db.prepare(`UPDATE pilots SET ${setClauses.join(', ')} WHERE id = ?`).run(...args);

  return getPilotById(id);
}

// ── Pilot-Disbursement links ─────────────────────────────────────────────────

export function linkDisbursement(pilotId: string, disbursementId: string): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO pilot_disbursements (pilot_id, disbursement_id) VALUES (?, ?)`,
  ).run(pilotId, disbursementId);
}

export function getPilotDisbursementIds(pilotId: string): string[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT disbursement_id FROM pilot_disbursements WHERE pilot_id = ?')
    .all(pilotId) as { disbursement_id: string }[];
  return rows.map((r) => r.disbursement_id);
}
