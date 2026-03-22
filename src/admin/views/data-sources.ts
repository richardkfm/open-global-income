import { layout } from './layout.js';
import { escapeHtml } from './helpers.js';
import { t } from '../../i18n/index.js';
import type { DataSourceRow } from '../../db/data-sources-db.js';

function providerBadge(provider: string): string {
  const map: Record<string, { label: string; cls: string }> = {
    worldbank: { label: 'World Bank', cls: 'badge-info' },
    ilo: { label: 'ILO', cls: 'badge-success' },
    imf: { label: 'IMF', cls: 'badge-danger' },
    wikidata: { label: 'Wikidata', cls: 'badge-secondary' },
    custom: { label: 'Custom', cls: 'badge-neutral' },
  };
  const { label, cls } = map[provider] ?? { label: provider, cls: 'badge-neutral' };
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    active: 'badge-success',
    disabled: 'badge-neutral',
    error: 'badge-danger',
  };
  return `<span class="badge ${map[status] ?? 'badge-neutral'}">${escapeHtml(status)}</span>`;
}

function typeBadge(type: string): string {
  const map: Record<string, string> = {
    api: 'badge-info',
    upload: 'badge-warning',
    manual: 'badge-neutral',
  };
  return `<span class="badge ${map[type] ?? 'badge-neutral'}">${escapeHtml(type)}</span>`;
}

export function renderDataSourcesPage(sources: DataSourceRow[], flash?: string): string {
  const totalSources = sources.length;
  const activeSources = sources.filter((s) => s.status === 'active').length;
  const totalIndicators = new Set(
    sources.flatMap((s) => {
      try { return JSON.parse(s.indicators_provided ?? '[]'); }
      catch { return []; }
    }),
  ).size;
  const lastRefresh = sources
    .filter((s) => s.last_fetched_at)
    .sort((a, b) => (b.last_fetched_at ?? '').localeCompare(a.last_fetched_at ?? ''))[0]?.last_fetched_at ?? 'Never';

  const rows = sources.map((s) => {
    const indicators: string[] = (() => {
      try { return JSON.parse(s.indicators_provided ?? '[]'); }
      catch { return []; }
    })();
    return `
      <tr>
        <td>
          <div class="text-bold">${escapeHtml(s.name)}</div>
          <div class="text-xs text-muted">${escapeHtml(s.description ?? '')}</div>
        </td>
        <td>${providerBadge(s.provider)}</td>
        <td>${typeBadge(s.type)}</td>
        <td>${escapeHtml(s.data_year ?? 'N/A')}</td>
        <td>${statusBadge(s.status)}</td>
        <td>${indicators.length}</td>
        <td class="text-xs text-muted">${s.last_fetched_at ? escapeHtml(s.last_fetched_at.slice(0, 10)) : 'Never'}</td>
        <td>
          <div class="flex gap-1">
            <a href="/admin/data-sources/${escapeHtml(s.id)}" class="btn btn-primary btn-xs">View</a>
            <form method="post" action="/admin/data-sources/${escapeHtml(s.id)}/refresh" style="display:inline">
              <button type="submit" class="btn btn-secondary btn-xs">Refresh</button>
            </form>
            <form method="post" action="/admin/data-sources/${escapeHtml(s.id)}/delete" style="display:inline"
                  onsubmit="return confirm('Delete this data source?')">
              <button type="submit" class="btn btn-sm" style="color:var(--color-danger)">Delete</button>
            </form>
          </div>
        </td>
      </tr>`;
  }).join('');

  return layout(
    t('dataSources.title'),
    `
    ${flash ? `<div class="alert alert-success mb-2">${escapeHtml(flash)}</div>` : ''}

    <div class="page-header">
      <h1>${t('dataSources.title')}</h1>
      <p class="text-muted">${t('dataSources.subtitle')}</p>
    </div>

    <div class="grid grid-4 mb-2">
      <div class="card stat-card">
        <div class="stat-value">${totalSources}</div>
        <div class="stat-label">${t('dataSources.totalSources')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value text-success">${activeSources}</div>
        <div class="stat-label">${t('dataSources.activeSources')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value text-primary">${totalIndicators}</div>
        <div class="stat-label">${t('dataSources.totalIndicators')}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value text-muted" style="font-size:0.9rem">${escapeHtml(typeof lastRefresh === 'string' ? lastRefresh.slice(0, 10) : 'Never')}</div>
        <div class="stat-label">${t('dataSources.lastRefresh')}</div>
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-header flex-between">
        <h2 class="card-title">${t('dataSources.configuredSources')}</h2>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('dataSources.colName')}</th>
              <th>${t('dataSources.colProvider')}</th>
              <th>${t('dataSources.colType')}</th>
              <th>${t('dataSources.colDataYear')}</th>
              <th>${t('dataSources.colStatus')}</th>
              <th>${t('dataSources.colIndicators')}</th>
              <th>${t('dataSources.colLastFetched')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows.length > 0 ? rows : `<tr><td colspan="8" class="text-muted">${t('dataSources.noSources')}</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('dataSources.addSource')}</h2>
      </div>
      <form method="post" action="/admin/data-sources" class="form-grid">
        <div class="form-group">
          <label for="ds-name">${t('dataSources.formName')}</label>
          <input id="ds-name" type="text" name="name" required class="form-input" placeholder="e.g. National Statistics Bureau">
        </div>
        <div class="form-group">
          <label for="ds-provider">${t('dataSources.formProvider')}</label>
          <select id="ds-provider" name="provider" class="form-input">
            <option value="worldbank">World Bank</option>
            <option value="ilo">ILO</option>
            <option value="imf">IMF</option>
            <option value="wikidata">Wikidata</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="form-group">
          <label for="ds-type">${t('dataSources.formType')}</label>
          <select id="ds-type" name="type" class="form-input">
            <option value="api">API</option>
            <option value="upload">Upload</option>
            <option value="manual">Manual Entry</option>
          </select>
        </div>
        <div class="form-group">
          <label for="ds-url">${t('dataSources.formUrl')}</label>
          <input id="ds-url" type="url" name="url" class="form-input" placeholder="https://api.example.org/v1">
        </div>
        <div class="form-group">
          <label for="ds-year">${t('dataSources.formDataYear')}</label>
          <input id="ds-year" type="text" name="data_year" class="form-input" placeholder="e.g. 2023 or 2022-2023">
        </div>
        <div class="form-group" style="grid-column: 1 / -1">
          <label for="ds-desc">${t('dataSources.formDescription')}</label>
          <textarea id="ds-desc" name="description" class="form-input" rows="2" placeholder="What data does this source provide?"></textarea>
        </div>
        <div>
          <button type="submit" class="btn btn-primary">${t('dataSources.addButton')}</button>
        </div>
      </form>
    </div>

    <div class="card mt-2">
      <div class="card-header">
        <h2 class="card-title">${t('dataSources.uploadTitle')}</h2>
      </div>
      <p class="text-sm text-muted mb-1">${t('dataSources.uploadDescription')}</p>
      <form method="post" action="/admin/data-sources/upload" enctype="multipart/form-data" class="flex gap-1 flex-center">
        <input type="file" name="datafile" accept=".csv,.json" class="form-input" style="max-width:300px">
        <input type="text" name="source_name" placeholder="Source name" class="form-input" style="max-width:200px">
        <input type="text" name="data_year" placeholder="Data year" class="form-input" style="max-width:120px">
        <button type="submit" class="btn btn-secondary">${t('dataSources.uploadButton')}</button>
      </form>
    </div>
    `,
    { activePage: 'data-sources' },
  );
}

export function renderDataSourceDetail(source: DataSourceRow): string {
  const indicators: string[] = (() => {
    try { return JSON.parse(source.indicators_provided ?? '[]'); }
    catch { return []; }
  })();

  const config = (() => {
    try { return source.config ? JSON.parse(source.config) : null; }
    catch { return null; }
  })();

  return layout(
    `${source.name} — Data Source`,
    `
    <div class="page-header">
      <div class="flex-between">
        <div>
          <h1>${escapeHtml(source.name)}</h1>
          <div class="flex gap-1 mt-1">
            ${providerBadge(source.provider)}
            ${typeBadge(source.type)}
            ${statusBadge(source.status)}
          </div>
        </div>
        <a href="/admin/data-sources" class="btn btn-secondary">Back to Sources</a>
      </div>
    </div>

    <div class="grid grid-2 mb-2">
      <div class="card">
        <h3 class="card-title">Source Details</h3>
        <div class="metric-tile mb-1">
          <div class="metric-tile-label">Description</div>
          <div class="text-sm">${escapeHtml(source.description ?? 'No description')}</div>
        </div>
        ${source.url ? `
        <div class="metric-tile mb-1">
          <div class="metric-tile-label">API Endpoint</div>
          <div class="text-sm mono">${escapeHtml(source.url)}</div>
        </div>` : ''}
        <div class="metric-tile mb-1">
          <div class="metric-tile-label">Data Year</div>
          <div class="text-sm">${escapeHtml(source.data_year ?? 'Not specified')}</div>
        </div>
        <div class="metric-tile mb-1">
          <div class="metric-tile-label">Last Fetched</div>
          <div class="text-sm">${source.last_fetched_at ? escapeHtml(source.last_fetched_at) : 'Never'}</div>
        </div>
        <div class="metric-tile mb-1">
          <div class="metric-tile-label">Created</div>
          <div class="text-sm">${escapeHtml(source.created_at)}</div>
        </div>
        ${source.error_message ? `
        <div class="alert alert-danger mt-1">
          <strong>Error:</strong> ${escapeHtml(source.error_message)}
        </div>` : ''}
      </div>

      <div class="card">
        <h3 class="card-title">Indicators Provided (${indicators.length})</h3>
        ${indicators.length > 0 ? `
        <div class="flex gap-1" style="flex-wrap:wrap">
          ${indicators.map((ind) => `<span class="badge badge-info">${escapeHtml(ind)}</span>`).join('')}
        </div>` : '<p class="text-muted text-sm">No indicators specified</p>'}
      </div>
    </div>

    ${config ? `
    <div class="card mb-2">
      <h3 class="card-title">Configuration</h3>
      <pre class="text-sm" style="background:var(--color-bg-secondary);padding:1rem;border-radius:var(--radius-md);overflow:auto">${escapeHtml(JSON.stringify(config, null, 2))}</pre>
    </div>` : ''}

    <div class="card mb-2">
      <h3 class="card-title">Edit Source</h3>
      <form method="post" action="/admin/data-sources/${escapeHtml(source.id)}/edit" class="form-grid">
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="name" value="${escapeHtml(source.name)}" class="form-input" required>
        </div>
        <div class="form-group">
          <label>API URL</label>
          <input type="url" name="url" value="${escapeHtml(source.url ?? '')}" class="form-input">
        </div>
        <div class="form-group">
          <label>Data Year</label>
          <input type="text" name="data_year" value="${escapeHtml(source.data_year ?? '')}" class="form-input">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select name="status" class="form-input">
            <option value="active"${source.status === 'active' ? ' selected' : ''}>Active</option>
            <option value="disabled"${source.status === 'disabled' ? ' selected' : ''}>Disabled</option>
          </select>
        </div>
        <div class="form-group" style="grid-column: 1 / -1">
          <label>Description</label>
          <textarea name="description" class="form-input" rows="2">${escapeHtml(source.description ?? '')}</textarea>
        </div>
        <div>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>

    <div class="flex gap-1">
      <form method="post" action="/admin/data-sources/${escapeHtml(source.id)}/refresh">
        <button type="submit" class="btn btn-secondary">Refresh Data</button>
      </form>
      <form method="post" action="/admin/data-sources/${escapeHtml(source.id)}/delete"
            onsubmit="return confirm('Are you sure you want to delete this data source?')">
        <button type="submit" class="btn btn-sm" style="color:var(--color-danger)">Delete Source</button>
      </form>
    </div>
    `,
    { activePage: 'data-sources' },
  );
}
