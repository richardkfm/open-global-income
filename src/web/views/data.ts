/** Public data & API page — downloads and programmatic access for researchers. */
import { publicLayout } from './layout.js';
import { escapeHtml } from '../../admin/views/helpers.js';

const REPO_URL = 'https://github.com/richardkfm/open-global-income';

export interface DataPageData {
  dataVersion: string;
  countryCount: number;
  regionCount: number;
}

export function renderDataPage(data: DataPageData): string {
  const content = `
  <div class="page-header">
    <h1>Data &amp; API</h1>
    <p>
      Everything on this site is reproducible. Download the dataset with computed entitlements,
      or drive the same calculation engine through the open REST API.
    </p>
  </div>

  <section class="site-section">
    <h2>Dataset downloads</h2>
    <p class="section-lede">
      ${data.countryCount} countries with economic indicators plus the computed entitlement, need
      score and universal-coverage cost columns. Snapshot <strong>${escapeHtml(data.dataVersion)}</strong>
      (World Bank, ILO, IMF). One row per country; column headers include units.
    </p>
    <div class="flex gap-1">
      <a href="/data/countries.csv" class="btn btn-primary">Download CSV</a>
      <a href="/data/countries.json" class="btn btn-secondary">Download JSON</a>
    </div>
  </section>

  <section class="site-section">
    <h2>REST API</h2>
    <p class="section-lede">
      The same pure functions behind these pages are exposed as a documented API — no key needed
      for read access at standard rate limits. Interactive reference at <a href="/docs" target="_blank" rel="noopener">/docs</a>.
    </p>
    <div class="data-table-container">
      <table class="data-table">
        <thead><tr><th>Endpoint</th><th>Returns</th></tr></thead>
        <tbody>
          <tr><td><code class="mono">GET /v1/income/calc?country=KE</code></td><td>Entitlement for a country (amount, score, ruleset + data version)</td></tr>
          <tr><td><code class="mono">GET /v1/income/countries</code></td><td>All countries with statistics</td></tr>
          <tr><td><code class="mono">GET /v1/income/regions</code></td><td>Sub-national regions (${data.regionCount} regions)</td></tr>
          <tr><td><code class="mono">GET /v1/income/calc/regional?region=KE-NAI</code></td><td>Cost-of-living-adjusted regional entitlement</td></tr>
          <tr><td><code class="mono">POST /v1/simulate</code></td><td>Budget simulation (coverage, targeting, duration)</td></tr>
          <tr><td><code class="mono">POST /v1/simulate/fund</code></td><td>Funding mechanism revenue estimates</td></tr>
          <tr><td><code class="mono">POST /v1/impact</code></td><td>Poverty / purchasing-power / stimulus impact analysis</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="site-section">
    <h2>Reproducibility</h2>
    <ul class="assumption-list">
      <li>Data snapshots are versioned and checked into the repository — any published figure can be recomputed from its snapshot.</li>
      <li>All calculation code is pure functions with no I/O: <code class="mono">src/core/</code> in the <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">repository</a>.</li>
      <li>A generated TypeScript SDK is available for programmatic use (<code class="mono">npm run sdk:generate</code>).</li>
      <li>Evidence-layer exports (pilot outcome data, anonymized cross-program aggregates) are available via <code class="mono">/v1/evidence</code> endpoints.</li>
    </ul>
  </section>`;

  return publicLayout('Data & API', content, {
    active: 'data',
    dataVersion: data.dataVersion,
    description:
      'Download the Open Global Income dataset (CSV/JSON) or use the open REST API — versioned World Bank/ILO/IMF snapshots with computed basic income entitlements.',
  });
}
