import { getDb } from './database.js';

export interface AuditEntry {
  id: number;
  timestamp: string;
  apiKeyId: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  responseTimeMs: number | null;
  ip: string | null;
  userAgent: string | null;
}

/** Record an API request in the audit log */
export function logAuditEntry(entry: {
  apiKeyId?: string | null;
  method: string;
  path: string;
  statusCode?: number;
  responseTimeMs?: number;
  ip?: string;
  userAgent?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (api_key_id, method, path, status_code, response_time_ms, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.apiKeyId ?? null,
    entry.method,
    entry.path,
    entry.statusCode ?? null,
    entry.responseTimeMs ?? null,
    entry.ip ?? null,
    entry.userAgent ?? null,
  );
}

/** Get recent audit entries */
export function getRecentAuditEntries(limit = 100): AuditEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, timestamp, api_key_id, method, path, status_code, response_time_ms, ip, user_agent
       FROM audit_log ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as Array<{
      id: number;
      timestamp: string;
      api_key_id: string | null;
      method: string;
      path: string;
      status_code: number | null;
      response_time_ms: number | null;
      ip: string | null;
      user_agent: string | null;
    }>;

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    apiKeyId: r.api_key_id,
    method: r.method,
    path: r.path,
    statusCode: r.status_code,
    responseTimeMs: r.response_time_ms,
    ip: r.ip,
    userAgent: r.user_agent,
  }));
}

/** Get audit stats summary */
export function getAuditStats(): {
  totalRequests: number;
  last24hRequests: number;
  topEndpoints: Array<{ path: string; count: number }>;
} {
  const db = getDb();

  const total = db.prepare(`SELECT COUNT(*) as count FROM audit_log`).get() as { count: number };

  const last24h = db
    .prepare(
      `SELECT COUNT(*) as count FROM audit_log WHERE timestamp > datetime('now', '-1 day')`,
    )
    .get() as { count: number };

  const topEndpoints = db
    .prepare(
      `SELECT path, COUNT(*) as count FROM audit_log
       GROUP BY path ORDER BY count DESC LIMIT 10`,
    )
    .all() as Array<{ path: string; count: number }>;

  return {
    totalRequests: total.count,
    last24hRequests: last24h.count,
    topEndpoints,
  };
}
