import { layout } from './layout.js';
import type {
  Country,
  SavedSimulation,
  FundingScenarioResult,
  FundingEstimate,
  FiscalContext,
  SavedFundingScenario,
} from '../../core/types.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatCurrency(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${formatNumber(n)}`;
}

function formatPercent(n: number | null): string {
  if (n == null) return 'N/A';
  return `${n.toFixed(1)}%`;
}

function countryOptions(countries: Country[], selected?: string): string {
  return countries
    .map(
      (c) =>
        `<option value="${escapeHtml(c.code)}"${c.code === selected ? ' selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`,
    )
    .join('');
}

function simulationOptions(sims: SavedSimulation[], selected?: string): string {
  const rows = sims.map(
    (s) =>
      `<option value="${escapeHtml(s.id)}"${s.id === selected ? ' selected' : ''}>${s.name ? escapeHtml(s.name) : escapeHtml(s.id.slice(0, 8))} — ${escapeHtml(s.countryCode)} (${(s.results.simulation.coverageRate * 100).toFixed(0)}% cov.)</option>`,
  );
  return `<option value="">Run new simulation inline</option>` + rows.join('');
}

// ── Main page ──────────────────────────────────────────────────────────────

export function renderFundingPage(
  countries: Country[],
  savedSims: SavedSimulation[],
  savedScenarios: SavedFundingScenario[],
  flash?: string,
): string {
  const opts = countryOptions(countries);
  const simOpts = simulationOptions(savedSims);

  const savedRows =
    savedScenarios.length === 0
      ? '<tr><td colspan="6" style="color:var(--muted)">No saved scenarios yet</td></tr>'
      : savedScenarios
          .map(
            (s) => `
      <tr>
        <td>${escapeHtml(s.id.slice(0, 8))}&hellip;</td>
        <td>${s.name ? escapeHtml(s.name) : '&mdash;'}</td>
        <td>${escapeHtml(s.countryCode)}</td>
        <td>${s.results.mechanisms.length} mechanism${s.results.mechanisms.length !== 1 ? 's' : ''}</td>
        <td>${formatPercent(s.results.coverageOfUbiCost)}</td>
        <td>
          <form method="post" action="/admin/funding/delete" style="display:inline">
            <input type="hidden" name="id" value="${escapeHtml(s.id)}">
            <button type="submit" class="btn btn-danger btn-sm">Delete</button>
          </form>
        </td>
      </tr>`,
          )
          .join('');

  return layout(
    'Funding Scenario Builder',
    `
    <style>
      .funding-hero { background: linear-gradient(135deg, #0d6efd 0%, #6610f2 100%); color: #fff; border-radius: 0.75rem; padding: 2rem; margin-top: 1rem; margin-bottom: 1.5rem; }
      .funding-hero h1 { font-size: 1.5rem; margin-bottom: 0.25rem; font-weight: 700; }
      .funding-hero p { opacity: 0.85; font-size: 0.95rem; margin: 0; }

      .mechanism-card { background: var(--card); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem; }
      .mechanism-card h3 { font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text); }
      .mechanism-card .desc { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.75rem; }

      .slider-row { display: flex; align-items: center; gap: 0.75rem; }
      .slider-row input[type=range] { flex: 1; accent-color: var(--primary); }
      .slider-row .slider-val { min-width: 60px; font-weight: 700; text-align: right; font-size: 0.9rem; }
      .slider-row input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--primary); }

      .funding-bar { position: relative; height: 40px; border-radius: 0.5rem; overflow: hidden; background: #e9ecef; margin: 1rem 0; }
      .funding-bar-segment { height: 100%; float: left; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 600; color: #fff; overflow: hidden; white-space: nowrap; }
      .funding-bar-gap { background: #e9ecef; color: var(--muted); }

      .bar-colors-0 { background: #0d6efd; }
      .bar-colors-1 { background: #6f42c1; }
      .bar-colors-2 { background: #d63384; }
      .bar-colors-3 { background: #fd7e14; }
      .bar-colors-4 { background: #20c997; }
      .bar-colors-5 { background: #0dcaf0; }

      .fiscal-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
      .fiscal-item { background: var(--bg); border-radius: 0.5rem; padding: 0.75rem; }
      .fiscal-item .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
      .fiscal-item .value { font-size: 1.3rem; font-weight: 700; margin-top: 0.15rem; }
      .fiscal-item .sub { font-size: 0.8rem; color: var(--muted); }

      .assumption-list { list-style: none; padding: 0; }
      .assumption-list li { font-size: 0.8rem; color: var(--muted); padding: 0.2rem 0; padding-left: 1rem; position: relative; }
      .assumption-list li::before { content: '\\2022'; position: absolute; left: 0; color: var(--primary); }

      .result-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1rem 0; }
      .result-summary .summary-card { background: var(--bg); border-radius: 0.5rem; padding: 1rem; text-align: center; }
      .result-summary .summary-card .big { font-size: 1.5rem; font-weight: 700; }
      .result-summary .summary-card .big.green { color: var(--success); }
      .result-summary .summary-card .big.red { color: var(--danger); }
      .result-summary .summary-card .big.blue { color: var(--primary); }
      .result-summary .summary-card .label { font-size: 0.8rem; color: var(--muted); }

      .mechanism-result { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
      .mechanism-result:last-child { border-bottom: none; }
      .mechanism-result .dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
      .mechanism-result .info { flex: 1; }
      .mechanism-result .info .name { font-weight: 600; font-size: 0.9rem; }
      .mechanism-result .info .detail { font-size: 0.8rem; color: var(--muted); }
      .mechanism-result .amount { font-weight: 700; text-align: right; white-space: nowrap; }

      .section-title { font-size: 1.1rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.75rem; padding-bottom: 0.25rem; border-bottom: 2px solid var(--primary); display: inline-block; }

      .inline-sim { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; padding: 0.75rem; background: var(--bg); border-radius: 0.5rem; margin-bottom: 0.75rem; }
      .inline-sim label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; color: var(--muted); }

      .export-bar { display: flex; gap: 0.5rem; margin-top: 1rem; }
    </style>

    <div class="funding-hero">
      <h1>Funding Scenario Builder</h1>
      <p>Model concrete funding mechanisms and see how a basic income program fits into a country's fiscal picture.</p>
    </div>

    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}

    <div class="card">
      <h2 style="margin-bottom:1rem">Configure Scenario</h2>

      <form id="funding-form"
        hx-post="/admin/funding/preview"
        hx-target="#funding-result"
        hx-trigger="submit"
        style="flex-direction:column;align-items:stretch;gap:0">

        <!-- Simulation source -->
        <div style="margin-bottom:1rem">
          <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem;font-weight:600">
            Base Simulation
            <select name="simulationId" id="sim-select" style="max-width:400px"
              onchange="document.getElementById('inline-sim-panel').style.display = this.value === '' ? 'flex' : 'none'">
              ${simOpts}
            </select>
          </label>
        </div>

        <!-- Inline simulation params (shown when no saved sim selected) -->
        <div class="inline-sim" id="inline-sim-panel">
          <label>
            Country
            <select name="country">${opts}</select>
          </label>
          <label>
            Coverage (%)
            <input type="number" name="coverage" min="1" max="100" value="20" style="width:70px">
          </label>
          <label>
            Duration (months)
            <input type="number" name="durationMonths" min="1" max="120" value="12" style="width:70px">
          </label>
          <label>
            Target Group
            <select name="targetGroup">
              <option value="all">All</option>
              <option value="bottom_quintile">Bottom Quintile</option>
            </select>
          </label>
        </div>

        <!-- Funding mechanisms -->
        <div class="section-title">Funding Mechanisms</div>

        <div class="mechanism-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Income Tax Surcharge</h3>
            <label class="slider-row" style="gap:0.4rem"><input type="checkbox" name="enable_income_tax" value="1" checked> Enable</label>
          </div>
          <div class="desc">A flat surcharge on income tax applied to all employed individuals.</div>
          <div class="slider-row">
            <span style="font-size:0.8rem">0.5%</span>
            <input type="range" name="income_tax_rate" min="0.5" max="15" step="0.5" value="3"
              oninput="this.nextElementSibling.textContent = this.value + '%'">
            <span class="slider-val">3%</span>
            <span style="font-size:0.8rem">15%</span>
          </div>
        </div>

        <div class="mechanism-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>VAT Increase</h3>
            <label class="slider-row" style="gap:0.4rem"><input type="checkbox" name="enable_vat" value="1" checked> Enable</label>
          </div>
          <div class="desc">Increase the value-added tax rate by a number of percentage points.</div>
          <div class="slider-row">
            <span style="font-size:0.8rem">0.5pp</span>
            <input type="range" name="vat_points" min="0.5" max="10" step="0.5" value="2"
              oninput="this.nextElementSibling.textContent = this.value + 'pp'">
            <span class="slider-val">2pp</span>
            <span style="font-size:0.8rem">10pp</span>
          </div>
        </div>

        <div class="mechanism-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Carbon Tax</h3>
            <label class="slider-row" style="gap:0.4rem"><input type="checkbox" name="enable_carbon" value="1"> Enable</label>
          </div>
          <div class="desc">A tax on CO2 emissions per metric ton, applied to estimated national emissions.</div>
          <div class="slider-row">
            <span style="font-size:0.8rem">$5</span>
            <input type="range" name="carbon_rate" min="5" max="200" step="5" value="25"
              oninput="this.nextElementSibling.textContent = '$' + this.value">
            <span class="slider-val">$25</span>
            <span style="font-size:0.8rem">$200</span>
          </div>
        </div>

        <div class="mechanism-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Wealth Tax</h3>
            <label class="slider-row" style="gap:0.4rem"><input type="checkbox" name="enable_wealth" value="1"> Enable</label>
          </div>
          <div class="desc">Annual tax on total private wealth, estimated from income-group wealth-to-GDP ratios.</div>
          <div class="slider-row">
            <span style="font-size:0.8rem">0.1%</span>
            <input type="range" name="wealth_rate" min="0.1" max="5" step="0.1" value="1"
              oninput="this.nextElementSibling.textContent = this.value + '%'">
            <span class="slider-val">1%</span>
            <span style="font-size:0.8rem">5%</span>
          </div>
        </div>

        <div class="mechanism-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Financial Transaction Tax</h3>
            <label class="slider-row" style="gap:0.4rem"><input type="checkbox" name="enable_ftt" value="1"> Enable</label>
          </div>
          <div class="desc">A small tax on stock market transactions, based on estimated turnover.</div>
          <div class="slider-row">
            <span style="font-size:0.8rem">0.01%</span>
            <input type="range" name="ftt_rate" min="0.01" max="1" step="0.01" value="0.1"
              oninput="this.nextElementSibling.textContent = this.value + '%'">
            <span class="slider-val">0.1%</span>
            <span style="font-size:0.8rem">1%</span>
          </div>
        </div>

        <div class="mechanism-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Redirect Social Spending</h3>
            <label class="slider-row" style="gap:0.4rem"><input type="checkbox" name="enable_redirect" value="1" checked> Enable</label>
          </div>
          <div class="desc">Redirect a portion of existing social protection spending toward basic income.</div>
          <div class="slider-row">
            <span style="font-size:0.8rem">5%</span>
            <input type="range" name="redirect_pct" min="5" max="80" step="5" value="30"
              oninput="this.nextElementSibling.textContent = this.value + '%'">
            <span class="slider-val">30%</span>
            <span style="font-size:0.8rem">80%</span>
          </div>
        </div>

        <div style="margin-top:1rem;display:flex;gap:0.5rem">
          <button type="submit" class="btn btn-primary">Analyze Funding</button>
        </div>
      </form>
    </div>

    <div id="funding-result"></div>

    <div class="card mt-1">
      <h2>Saved Scenarios</h2>
      <table>
        <thead>
          <tr><th>ID</th><th>Name</th><th>Country</th><th>Mechanisms</th><th>Coverage</th><th></th></tr>
        </thead>
        <tbody>${savedRows}</tbody>
      </table>
    </div>
  `,
  );
}

// ── Preview result (htmx partial) ─────────────────────────────────────────

export function renderFundingPreview(result: FundingScenarioResult): string {
  const { mechanisms, totalRevenuePppUsd, coverageOfUbiCost, gapPppUsd, ubiCost, fiscalContext, country } = result;

  // Summary cards
  const summaryHtml = `
    <div class="result-summary">
      <div class="summary-card">
        <div class="big blue">${formatCurrency(ubiCost.annualPppUsd)}</div>
        <div class="label">Annual UBI Cost</div>
      </div>
      <div class="summary-card">
        <div class="big green">${formatCurrency(totalRevenuePppUsd)}</div>
        <div class="label">Total Funding Raised</div>
      </div>
      <div class="summary-card">
        <div class="big ${coverageOfUbiCost >= 100 ? 'green' : coverageOfUbiCost >= 50 ? 'blue' : 'red'}">${formatPercent(coverageOfUbiCost)}</div>
        <div class="label">Cost Covered</div>
      </div>
      <div class="summary-card">
        <div class="big ${gapPppUsd === 0 ? 'green' : 'red'}">${gapPppUsd === 0 ? 'Fully funded' : formatCurrency(gapPppUsd)}</div>
        <div class="label">${gapPppUsd === 0 ? '' : 'Funding Gap'}</div>
      </div>
    </div>`;

  // Stacked bar chart
  const total = Math.max(ubiCost.annualPppUsd, totalRevenuePppUsd);
  const barSegments = mechanisms
    .map((m, i) => {
      const pct = total > 0 ? (m.annualRevenuePppUsd / total) * 100 : 0;
      if (pct < 0.5) return '';
      return `<div class="funding-bar-segment bar-colors-${i % 6}" style="width:${pct.toFixed(2)}%">${pct >= 5 ? formatPercent(m.coversPercentOfUbiCost) : ''}</div>`;
    })
    .join('');
  const gapPct = total > 0 ? Math.max(0, (gapPppUsd / total) * 100) : 100;
  const gapSegment = gapPct > 0.5 ? `<div class="funding-bar-segment funding-bar-gap" style="width:${gapPct.toFixed(2)}%">${gapPct >= 5 ? 'Gap' : ''}</div>` : '';

  const barHtml = `
    <div class="section-title">Funding vs. Cost</div>
    <div class="funding-bar">${barSegments}${gapSegment}</div>`;

  // Mechanism breakdown
  const mechRows = mechanisms
    .map(
      (m, i) => `
    <div class="mechanism-result">
      <div class="dot bar-colors-${i % 6}"></div>
      <div class="info">
        <div class="name">${escapeHtml(m.label)}</div>
        <div class="detail">${formatPercent(m.coversPercentOfUbiCost)} of UBI cost</div>
      </div>
      <div class="amount">${formatCurrency(m.annualRevenuePppUsd)}</div>
    </div>`,
    )
    .join('');

  const mechHtml = mechanisms.length > 0 ? `
    <div class="section-title">Revenue by Mechanism</div>
    <div class="card" style="margin-top:0.5rem">${mechRows}</div>` : '';

  // Fiscal context panel
  const fiscalHtml = `
    <div class="section-title">Fiscal Context — ${escapeHtml(country.name)}</div>
    <div class="fiscal-panel">
      <div class="fiscal-item">
        <div class="label">Tax Revenue</div>
        <div class="value">${formatPercent(fiscalContext.totalTaxRevenue.percentGdp)}</div>
        <div class="sub">of GDP${fiscalContext.totalTaxRevenue.absolutePppUsd ? ` (${formatCurrency(fiscalContext.totalTaxRevenue.absolutePppUsd)})` : ''}</div>
      </div>
      <div class="fiscal-item">
        <div class="label">Social Spending</div>
        <div class="value">${formatPercent(fiscalContext.currentSocialSpending.percentGdp)}</div>
        <div class="sub">of GDP${fiscalContext.currentSocialSpending.absolutePppUsd ? ` (${formatCurrency(fiscalContext.currentSocialSpending.absolutePppUsd)})` : ''}</div>
      </div>
      <div class="fiscal-item">
        <div class="label">Government Debt</div>
        <div class="value">${formatPercent(fiscalContext.governmentDebt.percentGdp)}</div>
        <div class="sub">of GDP</div>
      </div>
      <div class="fiscal-item">
        <div class="label">UBI as % of Tax Revenue</div>
        <div class="value" style="color:${(fiscalContext.ubiAsPercentOfTaxRevenue ?? 0) > 100 ? 'var(--danger)' : 'var(--success)'}">${formatPercent(fiscalContext.ubiAsPercentOfTaxRevenue)}</div>
        <div class="sub">${(fiscalContext.ubiAsPercentOfTaxRevenue ?? 0) > 100 ? 'Exceeds total tax revenue' : 'Within fiscal capacity'}</div>
      </div>
    </div>`;

  // Assumptions
  const allAssumptions = mechanisms.flatMap((m) => m.assumptions);
  const assumptionsHtml = allAssumptions.length > 0 ? `
    <div class="section-title">Assumptions &amp; Methodology</div>
    <div class="card" style="margin-top:0.5rem">
      <ul class="assumption-list">
        ${allAssumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}
      </ul>
      <p style="font-size:0.75rem;color:var(--muted);margin-top:0.5rem;font-style:italic">
        These are estimates based on proxy data and simplified models. Actual revenue would depend on
        implementation details, behavioral responses, and enforcement capacity.
      </p>
    </div>` : '';

  // Save form and export
  const saveHtml = `
    <div class="export-bar">
      <form method="post" action="/admin/funding/save" style="display:flex;gap:0.5rem;align-items:end;flex:1">
        <input type="hidden" name="resultJson" value="${escapeHtml(JSON.stringify(result))}">
        <input type="text" name="name" placeholder="Scenario name..." style="flex:1">
        <button type="submit" class="btn btn-primary btn-sm">Save Scenario</button>
      </form>
      <form method="post" action="/admin/funding/export" style="display:inline">
        <input type="hidden" name="resultJson" value="${escapeHtml(JSON.stringify(result))}">
        <button type="submit" class="btn btn-sm" style="background:var(--text);color:#fff">Export JSON</button>
      </form>
    </div>`;

  return `
    <div class="card mt-1">
      <h2 style="margin-bottom:0.5rem">Funding Analysis — ${escapeHtml(country.name)}</h2>
      <p style="font-size:0.85rem;color:var(--muted);margin-bottom:0.5rem">
        UBI for ${formatNumber(result.country.population)} people at ${formatPercent(ubiCost.asPercentOfGdp)} of GDP
      </p>
      ${summaryHtml}
      ${barHtml}
      ${mechHtml}
      ${fiscalHtml}
      ${assumptionsHtml}
      ${saveHtml}
    </div>`;
}
