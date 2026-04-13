import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';
import type {
  DisbursementChannel,
  DisbursementChannelType,
  Disbursement,
  DisbursementStatus,
  DisbursementLogEntry,
  DisbursementLogEvent,
} from '../core/types.js';

// ── Row types ─────────────────────────────────────────────────────────────────

interface ChannelRow {
  id: string;
  name: string;
  type: string;
  provider: string;
  country_code: string | null;
  config: string;
  active: number;
  created_at: string;
}

interface DisbursementRow {
  id: string;
  simulation_id: string | null;
  channel_id: string;
  country_code: string;
  recipient_count: number;
  amount_per_recipient: string;
  total_amount: string;
  currency: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  completed_at: string | null;
  api_key_id: string | null;
  external_id: string | null;
}

interface LogRow {
  id: number;
  disbursement_id: string;
  event: string;
  details: string | null;
  timestamp: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function rowToChannel(row: ChannelRow): DisbursementChannel {
  return {
    id: row.id,
    name: row.name,
    type: row.type as DisbursementChannelType,
    provider: row.provider,
    countryCode: row.country_code,
    config: JSON.parse(row.config) as Record<string, unknown>,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

function rowToDisbursement(row: DisbursementRow): Disbursement {
  return {
    id: row.id,
    simulationId: row.simulation_id,
    channelId: row.channel_id,
    countryCode: row.country_code,
    recipientCount: row.recipient_count,
    amountPerRecipient: row.amount_per_recipient,
    totalAmount: row.total_amount,
    currency: row.currency,
    status: row.status as DisbursementStatus,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    completedAt: row.completed_at,
    externalId: row.external_id,
    apiKeyId: row.api_key_id,
  };
}

function rowToLog(row: LogRow): DisbursementLogEntry {
  return {
    id: row.id,
    disbursementId: row.disbursement_id,
    event: row.event as DisbursementLogEvent,
    details: row.details ? (JSON.parse(row.details) as Record<string, unknown>) : null,
    timestamp: row.timestamp,
  };
}

// ── Channel CRUD ──────────────────────────────────────────────────────────────

export function createChannel(params: {
  name: string;
  type: DisbursementChannelType;
  provider: string;
  countryCode?: string | null;
  config: Record<string, unknown>;
}): DisbursementChannel {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO disbursement_channels (id, name, type, provider, country_code, config, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  ).run(
    id,
    params.name,
    params.type,
    params.provider,
    params.countryCode ?? null,
    JSON.stringify(params.config),
    now,
  );

  return {
    id,
    name: params.name,
    type: params.type,
    provider: params.provider,
    countryCode: params.countryCode ?? null,
    config: params.config,
    active: true,
    createdAt: now,
  };
}

export function listChannels(): DisbursementChannel[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM disbursement_channels WHERE active = 1 ORDER BY created_at DESC')
    .all() as ChannelRow[];
  return rows.map(rowToChannel);
}

export function getChannelById(id: string): DisbursementChannel | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM disbursement_channels WHERE id = ?')
    .get(id) as ChannelRow | undefined;
  return row ? rowToChannel(row) : null;
}

// ── Disbursement CRUD ─────────────────────────────────────────────────────────

export function createDisbursement(params: {
  simulationId?: string | null;
  channelId: string;
  countryCode: string;
  recipientCount: number;
  amountPerRecipient: string;
  totalAmount: string;
  currency: string;
  apiKeyId?: string | null;
}): Disbursement {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO disbursements
       (id, simulation_id, channel_id, country_code, recipient_count,
        amount_per_recipient, total_amount, currency, status, created_at, api_key_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
  ).run(
    id,
    params.simulationId ?? null,
    params.channelId,
    params.countryCode,
    params.recipientCount,
    params.amountPerRecipient,
    params.totalAmount,
    params.currency,
    now,
    params.apiKeyId ?? null,
  );

  return {
    id,
    simulationId: params.simulationId ?? null,
    channelId: params.channelId,
    countryCode: params.countryCode,
    recipientCount: params.recipientCount,
    amountPerRecipient: params.amountPerRecipient,
    totalAmount: params.totalAmount,
    currency: params.currency,
    status: 'draft',
    createdAt: now,
    approvedAt: null,
    completedAt: null,
    externalId: null,
    apiKeyId: params.apiKeyId ?? null,
  };
}

export function getDisbursementById(id: string): Disbursement | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM disbursements WHERE id = ?')
    .get(id) as DisbursementRow | undefined;
  return row ? rowToDisbursement(row) : null;
}

export function listDisbursements(params: {
  limit?: number;
  offset?: number;
  status?: string;
  channelId?: string;
}): { disbursements: Disbursement[]; total: number } {
  const db = getDb();
  const { limit = 20, offset = 0, status, channelId } = params;

  const conditions: string[] = [];
  const args: unknown[] = [];

  if (status) {
    conditions.push('status = ?');
    args.push(status);
  }
  if (channelId) {
    conditions.push('channel_id = ?');
    args.push(channelId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM disbursements ${where}`).get(...args) as {
      count: number;
    }
  ).count;

  const rows = db
    .prepare(
      `SELECT * FROM disbursements ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset) as DisbursementRow[];

  return { disbursements: rows.map(rowToDisbursement), total };
}

export function updateDisbursementStatus(
  id: string,
  status: DisbursementStatus,
): Disbursement | null {
  const db = getDb();
  const now = new Date().toISOString();

  const extra =
    status === 'approved'
      ? ', approved_at = ?'
      : status === 'completed' || status === 'failed'
        ? ', completed_at = ?'
        : '';

  const extraArgs = extra ? [now] : [];

  db.prepare(`UPDATE disbursements SET status = ?${extra} WHERE id = ?`).run(
    status,
    ...extraArgs,
    id,
  );

  return getDisbursementById(id);
}

// ── Log CRUD ──────────────────────────────────────────────────────────────────

export function addLogEntry(
  disbursementId: string,
  event: DisbursementLogEvent,
  details?: Record<string, unknown> | null,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO disbursement_log (disbursement_id, event, details)
     VALUES (?, ?, ?)`,
  ).run(disbursementId, event, details ? JSON.stringify(details) : null);
}

export function getLogEntries(disbursementId: string): DisbursementLogEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM disbursement_log WHERE disbursement_id = ? ORDER BY timestamp ASC',
    )
    .all(disbursementId) as LogRow[];
  return rows.map(rowToLog);
}

/** Look up a disbursement by provider-assigned external ID */
export function getDisbursementByExternalId(externalId: string): Disbursement | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM disbursements WHERE external_id = ?')
    .get(externalId) as DisbursementRow | undefined;
  return row ? rowToDisbursement(row) : null;
}

/** Store the provider-assigned external ID on a disbursement */
export function setExternalId(disbursementId: string, externalId: string): void {
  const db = getDb();
  db.prepare('UPDATE disbursements SET external_id = ? WHERE id = ?').run(
    externalId,
    disbursementId,
  );
}
