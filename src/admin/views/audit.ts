import { layout } from './layout.js';
import type { AuditEntry } from '../../db/audit.js';

export function renderAuditLog(entries: AuditEntry[]): string {
  const rows = entries
    .map(
      (e) => `
      <tr>
        <td>${escapeHtml(e.timestamp)}</td>
        <td>${escapeHtml(e.method)}</td>
        <td>${escapeHtml(e.path)}</td>
        <td>${e.statusCode ?? '—'}</td>
        <td>${e.responseTimeMs ? e.responseTimeMs.toFixed(1) + 'ms' : '—'}</td>
        <td>${e.ip ? escapeHtml(e.ip) : '—'}</td>
      </tr>`,
    )
    .join('');

  return layout(
    'Audit Log',
    `
    <h1 class="mt-1">Audit Log</h1>
    <div class="card mt-1">
      <h2>Recent Requests (${entries.length})</h2>
      <div hx-get="/admin/audit/table" hx-trigger="every 10s" hx-swap="innerHTML">
        <table>
          <thead>
            <tr><th>Timestamp</th><th>Method</th><th>Path</th><th>Status</th><th>Time</th><th>IP</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `,
  );
}

export function renderAuditTable(entries: AuditEntry[]): string {
  const rows = entries
    .map(
      (e) => `
      <tr>
        <td>${escapeHtml(e.timestamp)}</td>
        <td>${escapeHtml(e.method)}</td>
        <td>${escapeHtml(e.path)}</td>
        <td>${e.statusCode ?? '—'}</td>
        <td>${e.responseTimeMs ? e.responseTimeMs.toFixed(1) + 'ms' : '—'}</td>
        <td>${e.ip ? escapeHtml(e.ip) : '—'}</td>
      </tr>`,
    )
    .join('');

  return `<table>
    <thead>
      <tr><th>Timestamp</th><th>Method</th><th>Path</th><th>Status</th><th>Time</th><th>IP</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
