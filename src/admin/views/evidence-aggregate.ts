/**
 * Evidence Aggregate page — cross-pilot outcome statistics dashboard.
 *
 * Target user: NGO / researcher wanting anonymised aggregate outcome data
 * filterable by income group, country, and minimum sample size.
 */
import { layout } from './layout.js';
import { escapeHtml, formatNumber, formatPercent } from './helpers.js';
import { renderBreadcrumbs, renderDrawer } from './helpers.js';
import { horizontalBarChart } from './chart-helpers.js';
import type { EvidenceAggregate, OutcomeIndicators } from '../../core/types.js';
import type { Country } from '../../core/types.js';

type IndicatorStats = NonNullable<EvidenceAggregate['indicators'][keyof OutcomeIndicators]>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvidenceAggregatePageContext {
  aggregate: EvidenceAggregate;
  countries: Country[];
  /** Currently applied filter values (used to repopulate the form) */
  filters: {
    incomeGroup: string;
    country: string;
    minSampleSize: number;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function fmtVal(n: number | null | undefined, decimals = 3): string {
  if (n == null) return '<span class="text-muted">—</span>';
  return escapeHtml(String(Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals)));
}

function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '<span class="text-muted">—</span>';
  return escapeHtml(formatPercent(n, decimals));
}

interface IndicatorMeta {
  key: string;
  label: string;
  unit: string;
  description: string;
  /** true if indicator is a percentage / rate (0–1 range) */
  isRate: boolean;
}

const INDICATOR_META: IndicatorMeta[] = [
  { key: 'employmentRate',             label: 'Employment Rate',          unit: '(0–1)',    description: 'Share of working-age adults in employment', isRate: true },
  { key: 'averageMonthlyIncomeUsd',    label: 'Avg Monthly Income',       unit: '(USD/mo)', description: 'Mean reported monthly income in USD', isRate: false },
  { key: 'foodSecurityScore',          label: 'Food Security Score',      unit: '(0–10)',   description: 'Score on standardised food security questionnaire', isRate: false },
  { key: 'childSchoolAttendanceRate',  label: 'Child School Attendance',  unit: '(0–1)',    description: 'Share of school-age children attending school', isRate: true },
  { key: 'abovePovertyLinePercent',    label: 'Above Poverty Line',       unit: '(0–1)',    description: 'Share of cohort above the local poverty line', isRate: true },
  { key: 'selfReportedHealthScore',    label: 'Self-reported Health',     unit: '(0–1)',    description: 'Self-rated health status (0 = very poor, 1 = excellent)', isRate: true },
  { key: 'savingsRate',                label: 'Savings Rate',             unit: '(0–1)',    description: 'Share of monthly income saved or invested', isRate: true },
];

function indicatorTile(
  meta: IndicatorMeta,
  stats: IndicatorStats | undefined,
): string {
  if (!stats || stats.median == null) {
    return `
    <div class="impact-tile impact-tile--empty">
      <div class="impact-tile-label">${escapeHtml(meta.label)}</div>
      <div class="impact-tile-unit">${escapeHtml(meta.unit)}</div>
      <div class="impact-tile-value text-muted">No data</div>
      <div class="impact-tile-sub text-muted">${escapeHtml(meta.description)}</div>
    </div>`;
  }

  const iqr = (stats.p25 != null && stats.p75 != null)
    ? `IQR ${fmtVal(stats.p25)} – ${fmtVal(stats.p75)}`
    : '<span class="text-muted">IQR unavailable</span>';

  const displayVal = meta.isRate
    ? fmtPct((stats.median ?? 0) * 100)
    : fmtVal(stats.median, 2);

  return `
  <div class="impact-tile">
    <div class="impact-tile-label">${escapeHtml(meta.label)}</div>
    <div class="impact-tile-unit">${escapeHtml(meta.unit)}</div>
    <div class="impact-tile-value">${displayVal}</div>
    <div class="impact-tile-meta">
      <span class="text-xs text-muted">Median &middot; ${iqr}</span>
    </div>
    <div class="impact-tile-sub">
      <span class="badge badge-secondary">${formatNumber(stats.sampleSize)} observations</span>
    </div>
    <div class="impact-tile-desc text-xs text-muted">${escapeHtml(meta.description)}</div>
  </div>`;
}

function buildDeltaChart(aggregate: EvidenceAggregate): string {
  // Collect indicators that have a median value to chart
  const chartLabels: string[] = [];
  const chartData: number[] = [];

  for (const meta of INDICATOR_META) {
    const stats = aggregate.indicators[meta.key as keyof typeof aggregate.indicators];
    if (!stats || stats.median == null) continue;
    chartLabels.push(meta.label);
    // Normalise all to 0–100 scale for the chart
    const val = meta.isRate ? (stats.median * 100) : Math.min(stats.median, 100);
    chartData.push(Math.round(val * 100) / 100);
  }

  if (chartLabels.length === 0) return '';

  return horizontalBarChart(
    chartLabels,
    [
      {
        label: 'Median value (normalised)',
        data: chartData,
        backgroundColor: 'rgba(79,70,229,0.65)',
        borderColor: 'rgba(79,70,229,1)',
      },
    ],
    {
      height: Math.max(180, chartLabels.length * 42),
      exportFilename: 'evidence-aggregate-medians',
      chartOptions: {
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, max: 100 } },
      },
    },
  );
}

function countryOptions(countries: Country[], selected: string): string {
  const allOpt = `<option value=""${!selected ? ' selected' : ''}>All countries</option>`;
  const opts = countries
    .map(
      (c) =>
        `<option value="${escapeHtml(c.code)}"${c.code === selected ? ' selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`,
    )
    .join('');
  return allOpt + opts;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderEvidenceAggregatePage(ctx: EvidenceAggregatePageContext): string {
  const { aggregate, countries, filters } = ctx;
  const { programCount, measurementCount } = aggregate;

  // Breadcrumbs
  const breadcrumbs = renderBreadcrumbs([
    { label: 'Prove', href: '/admin/evidence' },
    { label: 'Evidence Aggregate' },
  ]);

  // Summary summary cards
  const totalControlSample = Object.values(aggregate.indicators).reduce(
    (sum, ind) => sum + (ind?.sampleSize ?? 0),
    0,
  );

  const summaryCards = `
  <div class="stat-grid mb-2">
    <div class="stat-tile">
      <div class="stat-label">Pilots covered</div>
      <div class="stat-value">${formatNumber(programCount)}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-label">Outcome measurements</div>
      <div class="stat-value">${formatNumber(measurementCount)}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-label">Total observations (all indicators)</div>
      <div class="stat-value">${formatNumber(totalControlSample)}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-label">Indicators with data</div>
      <div class="stat-value">${Object.values(aggregate.indicators).filter((v) => v?.median != null).length} / ${INDICATOR_META.length}</div>
    </div>
  </div>`;

  // Filter form
  const incomeGroupOptions = [
    { value: '', label: 'All income groups' },
    { value: 'HIC', label: 'HIC — High Income' },
    { value: 'UMC', label: 'UMC — Upper Middle Income' },
    { value: 'LMC', label: 'LMC — Lower Middle Income' },
    { value: 'LIC', label: 'LIC — Low Income' },
  ]
    .map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${o.value === filters.incomeGroup ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
    )
    .join('');

  const filterForm = `
  <div class="card mb-2">
    <div class="card-header">
      <h2 class="card-title">Filter</h2>
    </div>
    <form method="POST" action="/admin/evidence" class="form-row" style="align-items:flex-end">
      <div class="form-group" style="flex:1">
        <label class="form-label">Income group</label>
        <select class="form-select" name="incomeGroup">
          ${incomeGroupOptions}
        </select>
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">Country (optional)</label>
        <select class="form-select" name="country">
          ${countryOptions(countries, filters.country)}
        </select>
      </div>
      <div class="form-group" style="flex:0 0 180px">
        <label class="form-label">Min sample size</label>
        <input class="form-input" type="number" name="minSampleSize" min="0" value="${escapeHtml(String(filters.minSampleSize))}" placeholder="0">
        <span class="form-hint">Minimum pilot measurement count</span>
      </div>
      <div class="form-group" style="flex:0 0 auto">
        <button type="submit" class="btn btn-primary">Apply filters</button>
      </div>
    </form>
  </div>`;

  // Indicator tiles
  const tiles = INDICATOR_META.map((meta) =>
    indicatorTile(meta, aggregate.indicators[meta.key as keyof typeof aggregate.indicators]),
  ).join('');

  const tilesSection = `
  <div class="card mb-2">
    <div class="card-header">
      <h2 class="card-title">Outcome Indicators — Aggregate Medians</h2>
      <span class="text-muted text-sm">Anonymised across all ${formatNumber(programCount)} pilot program${programCount !== 1 ? 's' : ''}</span>
    </div>
    ${programCount === 0 ? `<div class="empty-state"><p class="text-muted">No programs match the current filters. Adjust filters or record outcome measurements on pilot pages.</p></div>` : `<div class="impact-tile-grid">${tiles}</div>`}
  </div>`;

  // Chart section
  const chartSection = programCount > 0 ? `
  <div class="card mb-2">
    <div class="card-header">
      <h2 class="card-title">Indicator Medians (normalised to 0–100 scale)</h2>
    </div>
    <p class="text-xs text-muted mb-1">
      Rates (employment, above poverty, etc.) are shown as percentages. Scores (food security, health) are shown on their native scale where &le;100.
    </p>
    ${buildDeltaChart(aggregate)}
  </div>` : '';

  // Methodology drawer
  const methodologyDrawer = renderDrawer(
    'evidence-methodology',
    'Methodology & data caveats',
    'How aggregate evidence is calculated',
    `<p class="text-sm text-muted">
      Outcome data is collected from individual pilot programs. Aggregation calculates the
      <strong>median</strong>, 25th percentile (P25), and 75th percentile (P75) across all
      measurements that match the applied filters. Measurements are included regardless of
      cohort type (recipient or control) and baseline status.
    </p>
    <p class="text-sm text-muted mt-1">
      <strong>Anonymisation:</strong> No program names, implementing organisations, or
      individual records are exposed. Only aggregate statistics are returned.
    </p>
    <p class="text-sm text-muted mt-1">
      <strong>Small-sample warning:</strong> Aggregate statistics with fewer than 30 observations
      should be interpreted with caution. Medians from small samples are sensitive to outliers
      and may not be representative of broader outcomes.
    </p>
    <p class="text-sm text-muted mt-1">
      <strong>Income-group filter:</strong> Filters by the income group of the country linked
      to each pilot&rsquo;s associated simulation. Pilots without a linked simulation are excluded
      when an income group filter is active.
    </p>
    <p class="text-sm text-muted mt-1">
      Data version: ${escapeHtml(aggregate.meta.dataVersion)}.
      Generated: ${escapeHtml(new Date(aggregate.meta.generatedAt).toLocaleString())}.
    </p>`,
  );

  const content = `
  ${breadcrumbs}
  <div class="page-header mt-1">
    <h1>Evidence Aggregate</h1>
    <p class="text-muted">Cross-pilot outcome statistics — anonymised and aggregated across all programs</p>
  </div>

  ${filterForm}
  ${summaryCards}
  ${tilesSection}
  ${chartSection}

  <div class="card">
    <div class="card-header">
      <h2 class="card-title">Methodology &amp; Caveats</h2>
    </div>
    <div style="padding:0.5rem 0">
      ${methodologyDrawer}
    </div>
    <div class="mt-1">
      <a href="/v1/evidence/aggregate${buildQueryString(filters)}" class="btn btn-secondary btn-sm" target="_blank" rel="noopener noreferrer">
        View raw JSON (API)
      </a>
      <a href="/v1/evidence/export?format=csv${filters.country ? `&country=${encodeURIComponent(filters.country)}` : ''}" class="btn btn-secondary btn-sm" style="margin-left:0.5rem">
        Export CSV
      </a>
    </div>
  </div>
  `;

  return layout('Evidence Aggregate', content, {
    activePage: 'evidence',
    breadcrumbs: [
      { label: 'Prove', href: '/admin/evidence' },
      { label: 'Evidence Aggregate' },
    ],
  });
}

function buildQueryString(filters: EvidenceAggregatePageContext['filters']): string {
  const params: string[] = [];
  if (filters.incomeGroup) params.push(`incomeGroup=${encodeURIComponent(filters.incomeGroup)}`);
  if (filters.country) params.push(`country=${encodeURIComponent(filters.country)}`);
  if (filters.minSampleSize > 0) params.push(`coverageMin=0`);
  return params.length > 0 ? `?${params.join('&')}` : '';
}
