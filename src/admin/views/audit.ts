import { layout } from './layout.js';
import { escapeHtml, formatCompact } from './helpers.js';
import { t } from '../../i18n/index.js';
import type { AuditEntry } from '../../db/audit.js';

export interface AuditStats {
  totalRequests: number;
  last24hRequests: number;
}

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

export function renderAuditLog(entries: AuditEntry[], stats: AuditStats): string {
  const timed = entries.filter((e) => typeof e.responseTimeMs === 'number');
  const avgMs = timed.length
    ? timed.reduce((sum, e) => sum + (e.responseTimeMs ?? 0), 0) / timed.length
    : 0;
  const errors = entries.filter((e) => (e.statusCode ?? 0) >= 400).length;
  const errorRate = entries.length ? (errors / entries.length) * 100 : 0;

  const content = `
    <div class="page-header">
      <h1>${t('audit.title')}</h1>
      <p class="text-muted">${t('audit.subtitle')}</p>
    </div>

    <div class="grid grid-4 mb-2">
      <div class="card stat-card">
        <div class="stat-value">${formatCompact(stats.totalRequests)}</div>
        <div class="stat-label">${t('audit.totalRequests')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${formatCompact(stats.last24hRequests)}</div>
        <div class="stat-label">${t('audit.last24h')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${avgMs.toFixed(1)}ms</div>
        <div class="stat-label">${t('audit.avgResponse')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${errorRate.toFixed(1)}%</div>
        <div class="stat-label">${t('audit.errorRate')}</div>
      </div>
    </div>

    <div class="section">
      <div class="card-header">
        <span class="card-title">${t('audit.recentRequests')}</span>
        <span class="text-muted text-sm">${entries.length}</span>
      </div>
      <div hx-get="/admin/audit/table" hx-trigger="every 10s" hx-swap="innerHTML">
        <div class="data-table-container">
          <table class="data-table">
            ${buildTableHead()}
            <tbody>${buildRows(entries)}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  return layout(t('audit.title'), content, { activePage: 'audit' });
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
