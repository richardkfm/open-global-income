import { layout } from './layout.js';
import type { Country } from '../../core/types.js';
import type { SimulationResult } from '../../core/types.js';
import type { SavedSimulation } from '../../core/types.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function countryOptions(countries: Country[]): string {
  return countries
    .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`)
    .join('');
}

export function renderSimulatePage(countries: Country[], savedSims: SavedSimulation[], flash?: string): string {
  const opts = countryOptions(countries);

  const savedRows = savedSims.length === 0
    ? '<tr><td colspan="5" style="color:var(--muted)">No saved simulations</td></tr>'
    : savedSims.map((s) => `
      <tr>
        <td>${escapeHtml(s.id.slice(0, 8))}…</td>
        <td>${s.name ? escapeHtml(s.name) : '—'}</td>
        <td>${escapeHtml(s.countryCode)}</td>
        <td>${escapeHtml(new Date(s.createdAt).toLocaleDateString())}</td>
        <td>
          <form method="post" action="/admin/simulate/delete" style="display:inline">
            <input type="hidden" name="id" value="${escapeHtml(s.id)}">
            <button type="submit" class="btn btn-danger btn-sm">Delete</button>
          </form>
        </td>
      </tr>`).join('');

  return layout(
    'Simulate',
    `
    <h1 class="mt-1">Budget Simulation</h1>
    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}

    <div class="card mt-1">
      <h2>Run Simulation</h2>
      <form id="sim-form"
        hx-post="/admin/simulate/preview"
        hx-target="#sim-result"
        hx-trigger="submit"
        style="flex-direction:column;align-items:flex-start;gap:0.75rem">
        <div style="display:flex;gap:1rem;flex-wrap:wrap">
          <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem">
            Country
            <select name="country" required>${opts}</select>
          </label>
          <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem">
            Coverage (%)
            <input type="number" name="coverage" min="1" max="100" value="20" style="width:80px">
          </label>
          <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem">
            Duration (months)
            <input type="number" name="durationMonths" min="1" max="120" value="12" style="width:80px">
          </label>
          <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem">
            Target Group
            <select name="targetGroup">
              <option value="all">All (entire population)</option>
              <option value="bottom_quintile">Bottom Quintile (20%)</option>
            </select>
          </label>
        </div>
        <button type="submit" class="btn btn-primary">Run Simulation</button>
      </form>
      <div id="sim-result" class="mt-1"></div>
    </div>

    <div class="card mt-1">
      <h2>Compare Countries</h2>
      <form id="compare-form"
        hx-post="/admin/simulate/compare"
        hx-target="#compare-result"
        hx-trigger="submit"
        style="flex-direction:column;align-items:flex-start;gap:0.75rem">
        <div style="display:flex;gap:1rem;flex-wrap:wrap">
          <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem">
            Countries (hold Ctrl/Cmd to select multiple)
            <select name="countries" multiple size="5" style="min-width:200px">${opts}</select>
          </label>
          <div style="display:flex;flex-direction:column;gap:0.75rem">
            <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem">
              Coverage (%)
              <input type="number" name="coverage" min="1" max="100" value="20" style="width:80px">
            </label>
            <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem">
              Duration (months)
              <input type="number" name="durationMonths" min="1" max="120" value="12" style="width:80px">
            </label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Compare</button>
      </form>
      <div id="compare-result" class="mt-1"></div>
    </div>

    <div class="card mt-1">
      <h2>Saved Simulations</h2>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Country</th><th>Created</th><th></th></tr></thead>
        <tbody>${savedRows}</tbody>
      </table>
    </div>
  `,
  );
}

export function renderSimulationPreview(result: SimulationResult, saveName?: string): string {
  const { country, simulation } = result;
  const { cost, entitlementPerPerson, recipientCount } = simulation;

  return `
    <div class="card" style="margin-top:0">
      <h2>${escapeHtml(country.name)} (${escapeHtml(country.code)})</h2>
      <div class="grid">
        <div>
          <div class="stat-label">Recipients</div>
          <div style="font-weight:700">${formatNumber(recipientCount)}</div>
        </div>
        <div>
          <div class="stat-label">Coverage</div>
          <div style="font-weight:700">${(simulation.coverageRate * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div class="stat-label">Per Person / Month (PPP USD)</div>
          <div style="font-weight:700">$${entitlementPerPerson.pppUsdPerMonth}</div>
        </div>
        <div>
          <div class="stat-label">Per Person / Month (Local)</div>
          <div style="font-weight:700">${formatNumber(entitlementPerPerson.localCurrencyPerMonth)}</div>
        </div>
      </div>
      <div class="grid" style="margin-top:0.75rem">
        <div>
          <div class="stat-label">Monthly Cost (Local)</div>
          <div style="font-weight:700">${formatNumber(cost.monthlyLocalCurrency)}</div>
        </div>
        <div>
          <div class="stat-label">Annual Cost (PPP USD)</div>
          <div style="font-weight:700">$${formatNumber(cost.annualPppUsd)}</div>
        </div>
        <div>
          <div class="stat-label">As % of GDP</div>
          <div style="font-weight:700">${cost.asPercentOfGdp.toFixed(2)}%</div>
        </div>
      </div>
      <form method="post" action="/admin/simulate/save" style="margin-top:1rem;flex-direction:row">
        <input type="hidden" name="simulationJson" value="${escapeHtml(JSON.stringify(result))}">
        <input type="text" name="name" placeholder="Save as..." value="${saveName ? escapeHtml(saveName) : ''}">
        <button type="submit" class="btn btn-primary btn-sm">Save</button>
      </form>
    </div>`;
}

export function renderComparisonTable(results: SimulationResult[]): string {
  if (results.length === 0) {
    return '<p style="color:var(--muted)">No results</p>';
  }

  const rows = results.map((r) => `
    <tr>
      <td>${escapeHtml(r.country.name)} (${escapeHtml(r.country.code)})</td>
      <td>${formatNumber(r.country.population)}</td>
      <td>${formatNumber(r.simulation.recipientCount)}</td>
      <td>${formatNumber(r.simulation.entitlementPerPerson.localCurrencyPerMonth)}</td>
      <td>$${formatNumber(r.simulation.cost.annualPppUsd)}</td>
      <td>${r.simulation.cost.asPercentOfGdp.toFixed(2)}%</td>
    </tr>`).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>Country</th>
          <th>Population</th>
          <th>Recipients</th>
          <th>Per Person/Mo (Local)</th>
          <th>Annual Cost (PPP USD)</th>
          <th>% of GDP</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}
