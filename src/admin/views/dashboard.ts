import { layout } from './layout.js';

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
      (e) => `<tr><td>${escapeHtml(e.path)}</td><td>${e.count}</td></tr>`,
    )
    .join('');

  return layout(
    'Dashboard',
    `
    <h1 class="mt-1">Dashboard</h1>
    <div class="grid mt-1">
      <div class="card">
        <div class="stat">${data.totalCountries}</div>
        <div class="stat-label">Countries</div>
      </div>
      <div class="card">
        <div class="stat">${data.totalUsers}</div>
        <div class="stat-label">Users</div>
      </div>
      <div class="card">
        <div class="stat">${data.totalApiKeys}</div>
        <div class="stat-label">API Keys</div>
      </div>
      <div class="card">
        <div class="stat">${data.totalRequests}</div>
        <div class="stat-label">Total Requests</div>
      </div>
    </div>
    <div class="grid">
      <div class="card">
        <div class="stat">${data.last24hRequests}</div>
        <div class="stat-label">Requests (24h)</div>
      </div>
      <div class="card">
        <div class="stat-label">Data Version</div>
        <div style="font-size:1.1rem;font-weight:600;margin-top:0.25rem">${escapeHtml(data.dataVersion)}</div>
      </div>
    </div>
    ${
      data.topEndpoints.length > 0
        ? `
    <div class="card mt-1">
      <h2>Top Endpoints</h2>
      <table>
        <thead><tr><th>Path</th><th>Requests</th></tr></thead>
        <tbody>${topEndpointsRows}</tbody>
      </table>
    </div>`
        : ''
    }
  `,
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
