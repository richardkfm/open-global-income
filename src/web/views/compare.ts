/**
 * Public country comparison — side-by-side basic income figures for up to
 * four countries. Aimed at NGOs picking pilot sites and journalists writing
 * cross-country stories. Shareable via ?c=KE&c=TZ&c=UG URLs.
 */
import { publicLayout } from './layout.js';
import {
  escapeHtml,
  formatCompact,
  formatPercent,
} from '../../admin/views/helpers.js';
import { barChart } from '../../admin/views/chart-helpers.js';

const CHART_BLUE = '#2a78d6';

export interface CompareColumn {
  code: string;
  name: string;
  incomeGroup: string;
  population: number;
  gdpPerCapitaPppUsd: number;
  povertyRatePercent: number | null;
  povertyLineLabel: string;
  monthlyLocalFormatted: string;
  universalAnnualPppUsd: number;
  universalPercentGdp: number;
  percentOfTaxRevenue: number | null;
  /** null when no poverty survey exists for the country line (model has no baseline) */
  estimatedLifted: number | null;
  score: number;
}

export interface CompareData {
  countries: Array<{ code: string; name: string }>;
  selected: string[];
  columns: CompareColumn[];
  dataVersion: string;
}

function countrySelect(name: string, countries: CompareData['countries'], selected?: string): string {
  const options = countries
    .map(
      (c) =>
        `<option value="${escapeHtml(c.code)}"${c.code === selected ? ' selected' : ''}>${escapeHtml(c.name)}</option>`,
    )
    .join('\n');
  return `<div class="form-group" style="flex:1;min-width:170px">
    <label>Country</label>
    <select name="${name}">
      <option value="">—</option>
      ${options}
    </select>
  </div>`;
}

function metricRow(label: string, cells: string[], note?: string): string {
  return `<tr>
    <td>${escapeHtml(label)}${note ? `<div class="text-xs text-muted">${escapeHtml(note)}</div>` : ''}</td>
    ${cells.map((c) => `<td class="num">${c}</td>`).join('')}
  </tr>`;
}

export function renderCompare(data: CompareData): string {
  const slots = [0, 1, 2, 3].map((i) => countrySelect('c', data.countries, data.selected[i]));

  let resultsHtml = '';
  if (data.columns.length >= 2) {
    const cols = data.columns;
    const header = cols
      .map((c) => `<th class="num"><a href="/countries/${escapeHtml(c.code)}">${escapeHtml(c.name)}</a></th>`)
      .join('');

    const chart = barChart(
      cols.map((c) => c.name),
      [{
        label: 'Universal UBI cost, % of GDP (PPP)',
        data: cols.map((c) => Math.round(c.universalPercentGdp * 10) / 10),
        backgroundColor: CHART_BLUE,
      }],
      {
        height: 260,
        exportFilename: 'ogi-compare-cost',
        chartOptions: {
          plugins: { legend: { display: false } },
          scales: { y: { title: { display: true, text: '% of GDP (PPP)' } } },
        },
      },
    );

    resultsHtml = `
    <div class="factsheet-actions no-print mb-2">
      <button type="button" class="btn btn-sm btn-secondary" data-copy="__URL__">Copy comparison link</button>
      <button type="button" class="btn btn-sm btn-secondary" onclick="window.print()">Print / save PDF</button>
    </div>

    <div class="card">
      <div class="card-header"><div>
        <div class="card-title">Cost of a universal program</div>
        <div class="card-subtitle">Annual cost of $210/month for every resident, as a share of PPP GDP.</div>
      </div></div>
      ${chart}
    </div>

    <div class="data-table-container">
      <table class="data-table">
        <thead><tr><th>Metric</th>${header}</tr></thead>
        <tbody>
          ${metricRow('Income group', cols.map((c) => escapeHtml(c.incomeGroup)))}
          ${metricRow('Population', cols.map((c) => formatCompact(c.population)))}
          ${metricRow('GDP per capita (PPP)', cols.map((c) => `$${formatCompact(c.gdpPerCapitaPppUsd)}`))}
          ${metricRow(
            'Poverty rate (country line)',
            cols.map((c) => (c.povertyRatePercent != null ? formatPercent(c.povertyRatePercent) : '—')),
            'Each country uses its income-group-appropriate line',
          )}
          ${metricRow('Monthly floor, local currency', cols.map((c) => escapeHtml(c.monthlyLocalFormatted)))}
          ${metricRow('Universal cost / year (PPP)', cols.map((c) => `$${formatCompact(c.universalAnnualPppUsd)}`))}
          ${metricRow('Universal cost, % of GDP', cols.map((c) => formatPercent(c.universalPercentGdp)))}
          ${metricRow(
            'Universal cost, % of tax revenue',
            cols.map((c) => (c.percentOfTaxRevenue != null ? formatPercent(c.percentOfTaxRevenue, 0) : '—')),
          )}
          ${metricRow(
            'People lifted above poverty line (est.)',
            cols.map((c) => (c.estimatedLifted != null ? formatCompact(c.estimatedLifted) : '—')),
            '— = no poverty survey exists for the country-appropriate line',
          )}
          ${metricRow('Need score (0–100)', cols.map((c) => (c.score * 100).toFixed(0)), 'Floor size relative to average income, amplified by inequality')}
        </tbody>
      </table>
    </div>
    <p class="text-xs text-muted mt-1">
      Same formula, same data sources, same units for every country — that is the point.
      Full derivations on each country's fact sheet and in the <a href="/methodology">methodology</a>.
    </p>`;
  } else if (data.selected.length === 1) {
    resultsHtml = `<div class="alert alert-info">Pick at least two countries to compare.</div>`;
  }

  const content = `
  <div class="page-header">
    <h1>Compare countries</h1>
    <p>
      Side-by-side basic income figures on identical terms — the comparison that is impossible
      when every program models its numbers differently. Choose up to four countries.
    </p>
  </div>
  <div class="card no-print">
    <form action="/compare" method="get">
      <div class="form-row">
        ${slots.join('\n')}
        <button type="submit" class="btn btn-primary">Compare</button>
      </div>
    </form>
  </div>
  ${resultsHtml}`;

  return publicLayout('Compare countries', content, {
    active: 'compare',
    includeCharts: data.columns.length >= 2,
    dataVersion: data.dataVersion,
    description:
      'Compare what a universal basic income would cost across countries — identical formula, identical data sources, directly comparable results.',
  });
}
