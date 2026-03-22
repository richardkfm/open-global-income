import { layout } from './layout.js';
import { escapeHtml, formatCompact } from './helpers.js';
import { t } from '../../i18n/index.js';
import type { Region } from '../../core/types.js';

function colBadge(index: number): string {
  if (index > 1.1) return `<span class="badge badge-info">${index.toFixed(2)}</span>`;
  if (index < 0.9) return `<span class="badge badge-warning">${index.toFixed(2)}</span>`;
  return `<span class="badge badge-neutral">${index.toFixed(2)}</span>`;
}

function urbanBadge(type: string): string {
  const classes: Record<string, string> = {
    urban: 'badge-success',
    rural: 'badge-danger',
    mixed: 'badge-info',
  };
  return `<span class="badge ${classes[type] ?? 'badge-neutral'}">${escapeHtml(type)}</span>`;
}

export function renderRegionList(
  regions: Region[],
  dataVersion: string,
  username?: string,
): string {
  // Group by country
  const byCountry = new Map<string, Region[]>();
  for (const r of regions) {
    const list = byCountry.get(r.countryCode) ?? [];
    list.push(r);
    byCountry.set(r.countryCode, list);
  }

  let html = `
    <div class="page-header">
      <h1>${t('regions.title')}</h1>
      <p class="text-muted">${t('regions.subtitle')} &middot; ${regions.length} ${t('regions.regions')} &middot; ${t('regions.data')} ${escapeHtml(dataVersion)}</p>
    </div>`;

  for (const [countryCode, countryRegions] of byCountry) {
    html += `<div class="section"><h2>${escapeHtml(countryCode)} &mdash; ${countryRegions.length} ${t('regions.regions')}</h2>`;
    html += `<div class="data-table-container"><table class="data-table">
<thead><tr>
  <th>${t('regions.colId')}</th>
  <th>${t('regions.colName')}</th>
  <th class="text-right">${t('regions.colPopulation')}</th>
  <th class="text-center">${t('regions.colColIndex')}</th>
  <th class="text-center">${t('regions.colType')}</th>
  <th class="text-right">${t('regions.colPovertyPct')}</th>
</tr></thead>
<tbody>`;

    for (const r of countryRegions.sort((a, b) => a.name.localeCompare(b.name))) {
      html += `<tr>
  <td><a href="/admin/regions/${escapeHtml(r.id)}">${escapeHtml(r.id)}</a></td>
  <td>${escapeHtml(r.name)}</td>
  <td class="text-right">${formatCompact(r.stats.population)}</td>
  <td class="text-center">${colBadge(r.stats.costOfLivingIndex)}</td>
  <td class="text-center">${urbanBadge(r.stats.urbanRural)}</td>
  <td class="text-right">${r.stats.povertyHeadcountRatio != null ? `${r.stats.povertyHeadcountRatio.toFixed(1)}%` : t('common.none')}</td>
</tr>`;
    }

    html += `</tbody></table></div></div>`;
  }

  return layout(t('regions.title'), html, username);
}

export function renderRegionDetail(
  region: Region,
  nationalPppFactor: number,
  nationalLocalCurrency: number,
  regionalLocalCurrency: number,
  dataVersion: string,
  username?: string,
): string {
  const effectivePpp = nationalPppFactor * region.stats.costOfLivingIndex;
  const diff = ((regionalLocalCurrency - nationalLocalCurrency) / nationalLocalCurrency * 100).toFixed(1);
  const diffSign = regionalLocalCurrency >= nationalLocalCurrency ? '+' : '';
  const diffClass = regionalLocalCurrency >= nationalLocalCurrency ? 'text-success' : 'text-danger';

  const html = `
    <div class="page-header">
      <h1>${escapeHtml(region.name)}</h1>
      <p class="text-muted">${t('regions.region')} ${escapeHtml(region.id)} &middot; ${t('regions.country')} ${escapeHtml(region.countryCode)} &middot; ${t('regions.data')} ${escapeHtml(dataVersion)}</p>
    </div>

    <div class="grid grid-4 mb-2">
      <div class="card stat-card">
        <div class="stat-label">${t('regions.population')}</div>
        <div class="stat-value">${formatCompact(region.stats.population)}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t('regions.costOfLivingIndex')}</div>
        <div class="stat-value">${colBadge(region.stats.costOfLivingIndex)}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t('regions.type')}</div>
        <div class="stat-value">${urbanBadge(region.stats.urbanRural)}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t('regions.povertyRate')}</div>
        <div class="stat-value">${region.stats.povertyHeadcountRatio != null ? `${region.stats.povertyHeadcountRatio.toFixed(1)}%` : t('common.none')}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('regions.entitlementComparison')}</h2>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead><tr><th>${t('regions.colMetric')}</th><th>${t('regions.colNational')}</th><th>${t('regions.colRegional')}</th></tr></thead>
          <tbody>
            <tr><td>${t('regions.pppConversionFactor')}</td><td>${nationalPppFactor.toFixed(2)}</td><td>${effectivePpp.toFixed(2)}</td></tr>
            <tr><td>${t('regions.localCurrencyMonth')}</td><td>${nationalLocalCurrency.toFixed(2)}</td><td><strong>${regionalLocalCurrency.toFixed(2)}</strong> <span class="${diffClass}">(${diffSign}${diff}%)</span></td></tr>
            <tr><td>${t('regions.pppUsdMonth')}</td><td colspan="2">${t('regions.universalFloor')}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="text-muted text-sm mt-2">
      ${t('regions.dataSource')} ${escapeHtml(region.stats.dataSource)} &middot; ${t('regions.asOf')} ${escapeHtml(region.stats.dataAsOf)}
    </p>

    <p class="mt-1"><a href="/admin/regions">${t('regions.backToRegions')}</a></p>`;

  return layout(`Region: ${region.name}`, html, username);
}
