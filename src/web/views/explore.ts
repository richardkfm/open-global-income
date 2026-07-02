/** Public country explorer — sortable table of all countries with headline UBI figures. */
import { publicLayout } from './layout.js';
import { escapeHtml, formatCompact, formatPercent } from '../../admin/views/helpers.js';
import type { IncomeGroup } from '../../core/types.js';

export interface ExploreRow {
  code: string;
  name: string;
  incomeGroup: IncomeGroup;
  population: number;
  gdpPerCapitaPppUsd: number;
  /** Poverty headcount (%), null when no survey data at all */
  povertyRatePercent: number | null;
  /** True when the rate is the $2.15/day extreme line because no survey exists for the country-appropriate line */
  povertyRateIsExtremeFallback: boolean;
  /** Monthly entitlement in local currency, formatted with symbol */
  monthlyLocalFormatted: string;
  /** Annual cost of universal coverage as % of PPP GDP */
  universalCostPercentGdp: number;
  /** Need score 0–1 */
  score: number;
}

export type ExploreSortKey =
  | 'name'
  | 'population'
  | 'gdp'
  | 'poverty'
  | 'cost'
  | 'score';

export interface ExploreData {
  rows: ExploreRow[];
  sort: ExploreSortKey;
  dir: 'asc' | 'desc';
  dataVersion: string;
}

const INCOME_GROUP_BADGE: Record<IncomeGroup, { cls: string; label: string }> = {
  HIC: { cls: 'badge-hic', label: 'High income' },
  UMC: { cls: 'badge-umc', label: 'Upper-middle' },
  LMC: { cls: 'badge-lmc', label: 'Lower-middle' },
  LIC: { cls: 'badge-lic', label: 'Low income' },
};

function sortHeader(
  label: string,
  key: ExploreSortKey,
  current: ExploreSortKey,
  dir: 'asc' | 'desc',
  numeric = true,
): string {
  const isActive = current === key;
  const nextDir = isActive && dir === 'desc' ? 'asc' : 'desc';
  const arrow = isActive ? (dir === 'desc' ? ' ▾' : ' ▴') : '';
  const cls = `${numeric ? ' class="num"' : ''}`;
  return `<th${cls}><a href="/countries?sort=${key}&amp;dir=${nextDir}"${isActive ? ' class="sort-active"' : ''}>${escapeHtml(label)}${arrow}</a></th>`;
}

export function renderExplore(data: ExploreData): string {
  const rowsHtml = data.rows
    .map((r) => {
      const badge = INCOME_GROUP_BADGE[r.incomeGroup];
      const poverty =
        r.povertyRatePercent != null
          ? `${formatPercent(r.povertyRatePercent)}${r.povertyRateIsExtremeFallback ? '<span class="text-muted">*</span>' : ''}`
          : '<span class="text-muted">—</span>';
      return `<tr>
        <td><a href="/countries/${escapeHtml(r.code)}"><strong>${escapeHtml(r.name)}</strong></a></td>
        <td><span class="badge ${badge.cls}">${badge.label}</span></td>
        <td class="num">${formatCompact(r.population)}</td>
        <td class="num">$${formatCompact(r.gdpPerCapitaPppUsd)}</td>
        <td class="num">${poverty}</td>
        <td class="num">${escapeHtml(r.monthlyLocalFormatted)}</td>
        <td class="num">${formatPercent(r.universalCostPercentGdp)}</td>
        <td class="num">${(r.score * 100).toFixed(0)}</td>
      </tr>`;
    })
    .join('\n');

  const content = `
  <div class="page-header">
    <h1>Country fact sheets</h1>
    <p>
      Headline basic-income figures for ${data.rows.length} countries. Click any country for the full
      fact sheet — entitlement formula, fiscal context, funding options, poverty impact, and sources.
      Poverty rates use each country's <a href="/methodology#poverty-lines">country-appropriate poverty line</a>,
      not one global line. Cost shows a universal transfer to every resident for one year, as a share of PPP GDP.
    </p>
  </div>

  <div class="flex-between mb-2 no-print" style="flex-wrap:wrap;gap:0.5rem">
    <input type="text" id="country-filter" placeholder="Filter countries…" style="max-width:260px"
      oninput="var q=this.value.toLowerCase();document.querySelectorAll('#country-table tbody tr').forEach(function(tr){tr.style.display=tr.cells[0].textContent.toLowerCase().indexOf(q)>-1?'':'none'})">
    <div class="flex gap-1">
      <a href="/data/countries.csv" class="btn btn-sm btn-secondary">Download CSV</a>
      <a href="/data/countries.json" class="btn btn-sm btn-secondary">Download JSON</a>
    </div>
  </div>

  <div class="data-table-container">
    <table class="data-table" id="country-table">
      <thead>
        <tr>
          ${sortHeader('Country', 'name', data.sort, data.dir, false)}
          <th>Income group</th>
          ${sortHeader('Population', 'population', data.sort, data.dir)}
          ${sortHeader('GDP / capita (PPP)', 'gdp', data.sort, data.dir)}
          ${sortHeader('Poverty rate', 'poverty', data.sort, data.dir)}
          <th class="num">Floor / month (local)</th>
          ${sortHeader('Universal cost, % GDP', 'cost', data.sort, data.dir)}
          ${sortHeader('Need score', 'score', data.sort, data.dir)}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>
  <p class="text-xs text-muted mt-1">
    Need score 0–100: how large the $210/month floor is relative to the country's average income,
    amplified by inequality (Gini). Higher = the floor matters more.
    * = $2.15/day extreme-poverty rate shown because no survey exists for the country-appropriate line.
    Data snapshot: ${escapeHtml(data.dataVersion)} (World Bank, ILO, IMF).
  </p>`;

  return publicLayout('Country fact sheets', content, {
    active: 'countries',
    dataVersion: data.dataVersion,
    description:
      'Basic income cost, entitlement and poverty figures for 49 countries — sortable, downloadable, fully sourced.',
  });
}
