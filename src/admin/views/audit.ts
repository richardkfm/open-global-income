import { layout } from './layout.js';
import { escapeHtml } from './helpers.js';
import { t } from '../../i18n/index.js';
import type { AuditEntry } from '../../db/audit.js';

function methodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':    return 'badge-get';
    case 'POST':   return 'badge-post';
    case 'PUT':    return 'badge-put';
    case 'PATCH':  return 'badge-patch';
    case 'DELETE': return 'badge-delete';
    default:       return 'badge-secondary';
  }
}

function buildRows(entries: AuditEntry[]): string {
  if (entries.length === 0) {
    return `<tr><td colspan="6" class="text-muted">${t('common.noData')}</td></tr>`;
  }
  return entries
    .map(
      (e) => `
      <tr>
        <td>${escapeHtml(e.timestamp)}</td>
        <td><span class="badge ${methodBadgeClass(e.method)}">${escapeHtml(e.method)}</span></td>
        <td class="font-mono">${escapeHtml(e.path)}</td>
        <td>${e.statusCode ?? t('common.none')}</td>
        <td>${e.responseTimeMs ? e.responseTimeMs.toFixed(1) + 'ms' : t('common.none')}</td>
        <td>${e.ip ? escapeHtml(e.ip) : t('common.none')}</td>
      </tr>`,
    )
    .join('');
}

function buildTableHead(): string {
  return `
    <thead>
      <tr>
        <th>${t('audit.colTimestamp')}</th>
        <th>${t('audit.colMethod')}</th>
        <th>${t('audit.colPath')}</th>
        <th>${t('audit.colStatus')}</th>
        <th>${t('audit.colTime')}</th>
        <th>${t('audit.colIp')}</th>
      </tr>
    </thead>`;
}

export function renderAuditLog(entries: AuditEntry[]): string {
  return layout(
    t('audit.title'),
    `
    <h1 class="mt-1">${t('audit.title')}</h1>
    <div class="card mt-1">
      <h2>${t('audit.recentRequests')} (${entries.length})</h2>
      <div hx-get="/admin/audit/table" hx-trigger="every 10s" hx-swap="innerHTML">
        <div class="data-table-container">
          <table class="data-table">
            ${buildTableHead()}
            <tbody>${buildRows(entries)}</tbody>
          </table>
        </div>
      </div>
    </div>
  `,
    { activePage: 'audit' },
  );
}

export function renderAuditTable(entries: AuditEntry[]): string {
  return `
    <div class="data-table-container">
      <table class="data-table">
        ${buildTableHead()}
        <tbody>${buildRows(entries)}</tbody>
      </table>
    </div>`;
}
