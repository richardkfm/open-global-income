/**
 * Multi-country compare page for pilot site selection.
 * Lets NGO program officers compare 2-5 candidate countries side-by-side
 * using the same simulation scenario.
 */
import { layout } from './layout.js';
import { escapeHtml, formatNumber, formatCompact, formatPercent } from './helpers.js';
import { scatterChart } from './chart-helpers.js';
import { t } from '../../i18n/index.js';
import type { Country, SimulationResult } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function fmtLarge(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${formatNumber(Math.round(n))}`;
}

function incomeGroupLabel(group: string): string {
  const labels: Record<string, string> = {
    HIC: 'High Income',
    UMC: 'Upper Middle Income',
    LMC: 'Lower Middle Income',
    LIC: 'Low Income',
  };
  return labels[group] ?? group;
}

function countryCheckboxes(countries: Country[]): string {
  return countries
    .map(
      (c) =>
        `<label class="compare-country-label">
          <input type="checkbox" name="countries" value="${escapeHtml(c.code)}" class="compare-country-checkbox">
          ${escapeHtml(c.name)} <span class="text-muted text-xs">(${escapeHtml(c.code)})</span>
        </label>`,
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Takeaway heuristic
// ---------------------------------------------------------------------------

function computeTakeaway(results: SimulationResult[]): string {
  if (results.length === 0) return '';

  // Lowest cost per recipient
  let lowestCprIdx = 0;
  let lowestCpr = Infinity;
  // Highest recipient count
  let highestRcpIdx = 0;
  let highestRcp = -Infinity;
  // Lowest total annual cost
  let lowestCostIdx = 0;
  let lowestCost = Infinity;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const annualCost = r.simulation.cost.annualPppUsd;
    const recipients = r.simulation.recipientCount;
    const cpr = recipients > 0 ? annualCost / recipients : Infinity;

    if (cpr < lowestCpr) { lowestCpr = cpr; lowestCprIdx = i; }
    if (recipients > highestRcp) { highestRcp = recipients; highestRcpIdx = i; }
    if (annualCost < lowestCost) { lowestCost = annualCost; lowestCostIdx = i; }
  }

  const lowestCprCountry = results[lowestCprIdx].country.code;
  const highestRcpCountry = results[highestRcpIdx].country.code;
  const lowestCostCountry = results[lowestCostIdx].country.code;

  const parts: string[] = [];
  parts.push(`${t('compare.takeawayLowestCostPerRecipient')} ${escapeHtml(lowestCprCountry)}`);

  if (highestRcpCountry !== lowestCprCountry) {
    parts.push(`${t('compare.takeawayHighestCoverage')} ${escapeHtml(highestRcpCountry)}`);
  }

  if (lowestCostCountry !== lowestCprCountry && lowestCostCountry !== highestRcpCountry) {
    parts.push(`${t('compare.takeawayLowestTotalCost')} ${escapeHtml(lowestCostCountry)}`);
  }

  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function renderComparePage(countries: Country[], flash?: string): string {
  const checkboxes = countryCheckboxes(countries);

  return layout(
    t('compare.title'),
    `
    <div class="page-header">
      <h1>${t('compare.title')}</h1>
      <p class="text-muted">${t('compare.subtitle')}</p>
    </div>

    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}

    <div class="two-col">
      <!-- Config panel -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${t('compare.configureComparison')}</h2>
        </div>

        <form
          hx-post="/admin/compare/preview"
          hx-target="#compare-results"
          hx-swap="innerHTML"
          hx-indicator="#compare-loading"
          class="form-stack">

          <div class="form-group mb-2">
            <label class="form-label">${t('compare.selectCountries')}</label>
            <p class="text-xs text-muted mb-1">${t('compare.selectCountriesHint')}</p>
            <div class="compare-country-grid">
              ${checkboxes}
            </div>
          </div>

          <div class="grid grid-2 mb-2">
            <div class="form-group">
              <label class="form-label">${t('compare.coveragePct')}</label>
              <input class="form-input" type="number" name="coverage" min="1" max="100" value="20">
            </div>
            <div class="form-group">
              <label class="form-label">${t('compare.durationMonths')}</label>
              <input class="form-input" type="number" name="durationMonths" min="1" max="120" value="12">
            </div>
          </div>

          <div class="form-group mb-2">
            <label class="form-label">${t('compare.targetGroup')}</label>
            <select class="form-select" name="targetGroup">
              <option value="all">${t('compare.targetGroupAll')}</option>
              <option value="bottom_decile">${t('compare.targetGroupBottomDecile')}</option>
              <option value="bottom_quintile" selected>${t('compare.targetGroupBottomQuintile')}</option>
              <option value="bottom_third">${t('compare.targetGroupBottomThird')}</option>
              <option value="bottom_half">${t('compare.targetGroupBottomHalf')}</option>
            </select>
          </div>

          <div class="form-group mb-2">
            <label class="form-label">${t('compare.transferAmount')}</label>
            <input class="form-input" type="number" name="transferAmount" min="1" max="10000" placeholder="210" step="1">
            <span class="form-hint">${t('compare.transferAmountHint')}</span>
          </div>

          <div class="form-group mb-2">
            <label class="form-label">${t('compare.rulesetVersion')}</label>
            <select class="form-select" name="rulesetVersion">
              <option value="">${t('compare.rulesetDefault')}</option>
              <option value="v1">v1</option>
              <option value="v2">v2 (preview)</option>
            </select>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${t('compare.compareButton')}</button>
          </div>
        </form>
      </div>

      <!-- Results panel -->
      <div>
        <div id="compare-loading" class="htmx-indicator card empty-state">
          <p class="empty-state-title">${t('compare.calculating')}</p>
        </div>
        <div id="compare-results">
          <div class="card empty-state">
            <p class="empty-state-title">${t('compare.configurePrompt')}</p>
            <p class="text-muted text-sm">${t('compare.configurePromptSub')}</p>
          </div>
        </div>
      </div>
    </div>
  `,
    {
      activePage: 'compare',
      breadcrumbs: [
        { label: t('nav.sectionPlan') },
        { label: t('compare.title') },
      ],
    },
  );
}

// ---------------------------------------------------------------------------
// Results partial (htmx target)
// ---------------------------------------------------------------------------

export function renderCompareResults(results: SimulationResult[]): string {
  if (results.length === 0) {
    return `<div class="card empty-state">
      <p class="empty-state-title">${t('compare.noCountriesSelected')}</p>
      <p class="text-muted text-sm">${t('compare.noCountriesSelectedHint')}</p>
    </div>`;
  }

  // Build scatter chart: x = recipients, y = annual cost PPP-USD
  const chartHtml = scatterChart({
    datasets: [
      {
        label: t('compare.chartDatasetLabel'),
        points: results.map((r) => ({
          x: r.simulation.recipientCount,
          y: r.simulation.cost.annualPppUsd,
          label: r.country.code,
        })),
        colour: '#4f46e5',
      },
    ],
    xLabel: t('compare.chartXLabel'),
    yLabel: t('compare.chartYLabel'),
    title: t('compare.chartTitle'),
    height: 320,
    downloadFilename: 'country-comparison-scatter',
  });

  // Takeaway line
  const takeaway = computeTakeaway(results);

  // Sort table by annual cost ascending
  const sorted = [...results].sort(
    (a, b) => a.simulation.cost.annualPppUsd - b.simulation.cost.annualPppUsd,
  );

  const rows = sorted
    .map((r) => {
      const costPerRecipient =
        r.simulation.recipientCount > 0
          ? r.simulation.cost.annualPppUsd / r.simulation.recipientCount
          : 0;
      return `
    <tr>
      <td>
        <strong>${escapeHtml(r.country.name)}</strong>
        <span class="badge badge-secondary">${escapeHtml(r.country.code)}</span>
      </td>
      <td class="text-muted text-sm">${escapeHtml(incomeGroupLabel(''))}</td>
      <td>${formatCompact(r.simulation.recipientCount)}</td>
      <td>$${formatNumber(Math.round(r.simulation.entitlementPerPerson.pppUsdPerMonth))}</td>
      <td>${fmtLarge(r.simulation.cost.annualPppUsd)}</td>
      <td>${formatPercent(r.simulation.cost.asPercentOfGdp, 2)}</td>
      <td class="text-xs text-muted">$${formatNumber(Math.round(costPerRecipient))}</td>
    </tr>`;
    })
    .join('');

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('compare.resultsTitle')} (${results.length} ${t('compare.countriesLabel')})</h2>
      </div>

      ${chartHtml}

      ${takeaway ? `
      <div class="compare-takeaway mt-2">
        <span class="text-sm text-bold">${t('compare.takeawayLabel')}</span>
        <span class="text-sm text-muted">${takeaway}</span>
      </div>` : ''}

      <div class="data-table-container mt-2">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('compare.colCountry')}</th>
              <th>${t('compare.colIncomeGroup')}</th>
              <th>${t('compare.colRecipients')}</th>
              <th>${t('compare.colMonthlyTransfer')}</th>
              <th>${t('compare.colAnnualCost')}</th>
              <th>${t('compare.colPercentGdp')}</th>
              <th>${t('compare.colCostPerRecipient')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}
