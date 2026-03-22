import { layout } from './layout.js';
import { escapeHtml, formatNumber, formatCompact } from './helpers.js';
import { t } from '../../i18n/index.js';

export interface DashboardData {
  totalCountries: number;
  totalUsers: number;
  totalApiKeys: number;
  totalRequests: number;
  last24hRequests: number;
  topEndpoints: Array<{ path: string; count: number }>;
  dataVersion: string;
}

export function renderDashboard(data: DashboardData): string {
  const topEndpointsRows = data.topEndpoints
    .map(
      (e) =>
        `<tr>
          <td class="mono">${escapeHtml(e.path)}</td>
          <td>${formatNumber(e.count)}</td>
        </tr>`,
    )
    .join('');

  const topEndpointsSection =
    data.topEndpoints.length > 0
      ? `
    <div class="section">
      <div class="card-header">
        <span class="card-title">${t('dashboard.topEndpoints')}</span>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('dashboard.path')}</th>
              <th>${t('dashboard.requests')}</th>
            </tr>
          </thead>
          <tbody>${topEndpointsRows}</tbody>
        </table>
      </div>
    </div>`
      : '';

  const content = `
    <div class="page-header">
      <h1>${t('dashboard.title')}</h1>
    </div>

    <div class="grid grid-4 mb-2">
      <div class="card stat-card">
        <div class="stat-value">${formatCompact(data.totalCountries)}</div>
        <div class="stat-label">${t('dashboard.totalCountries')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${formatCompact(data.totalUsers)}</div>
        <div class="stat-label">${t('dashboard.totalUsers')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${formatCompact(data.totalApiKeys)}</div>
        <div class="stat-label">${t('dashboard.totalApiKeys')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${formatCompact(data.totalRequests)}</div>
        <div class="stat-label">${t('dashboard.totalRequests')}</div>
      </div>
    </div>

    <div class="grid grid-2 mb-2">
      <div class="card stat-card">
        <div class="stat-value">${formatCompact(data.last24hRequests)}</div>
        <div class="stat-label">${t('dashboard.last24h')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t('dashboard.dataVersion')}</div>
        <div class="stat-value stat-value-sm">${escapeHtml(data.dataVersion)}</div>
      </div>
    </div>

    ${topEndpointsSection}
  `;

  return layout(t('dashboard.title'), content, { activePage: 'dashboard' });
}
