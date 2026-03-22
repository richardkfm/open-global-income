import { layout } from './layout.js';
import { escapeHtml, formatNumber, formatCompact, formatPercent, formatCurrency } from './helpers.js';
import { barChart } from './chart-helpers.js';
import { t } from '../../i18n/index.js';
import { getCurrencyForCountry, formatLocalCurrency } from '../../data/currencies.js';
import type { Country } from '../../core/types.js';
import type { SimulationResult } from '../../core/types.js';
import type { SavedSimulation } from '../../core/types.js';

function countryOptions(countries: Country[]): string {
  return countries
    .map(
      (c) =>
        `<option value="${escapeHtml(c.code)}" data-currency="${escapeHtml(getCurrencyForCountry(c.code)?.code ?? 'USD')}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`,
    )
    .join('');
}

export function renderSimulatePage(
  countries: Country[],
  savedSims: SavedSimulation[],
  flash?: string,
): string {
  const opts = countryOptions(countries);

  const savedRows =
    savedSims.length === 0
      ? `<tr><td colspan="5" class="text-muted">${t('simulate.noSavedSimulations')}</td></tr>`
      : savedSims
          .map(
            (s) => `
      <tr>
        <td class="font-mono">${escapeHtml(s.id.slice(0, 8))}${t('common.ellipsis')}</td>
        <td>${s.name ? escapeHtml(s.name) : t('common.none')}</td>
        <td>${escapeHtml(s.countryCode)}</td>
        <td>${escapeHtml(new Date(s.createdAt).toLocaleDateString())}</td>
        <td>
          <form method="post" action="/admin/simulate/delete" class="form-inline-compact">
            <input type="hidden" name="id" value="${escapeHtml(s.id)}">
            <button type="submit" class="btn btn-danger btn-sm">${t('simulate.deleteButton')}</button>
          </form>
        </td>
      </tr>`,
          )
          .join('');

  return layout(
    t('simulate.title'),
    `
    <h1 class="mt-1">${t('simulate.title')}</h1>
    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}

    <div class="two-col mt-1">
      <div class="two-col-main">
        <div class="card">
          <h2>${t('simulate.runSimulation')}</h2>
          <form
            id="sim-form"
            hx-post="/admin/simulate/preview"
            hx-target="#sim-result"
            hx-trigger="submit"
            class="form-stack">
            <div class="form-row">
              <div class="form-field">
                <label class="form-label">${t('simulate.country')}</label>
                <select class="form-select" name="country" required
                  onchange="document.getElementById('sim-currency-hint').textContent = this.options[this.selectedIndex].dataset.currency || ''">
                  ${opts}
                </select>
                <span class="form-hint" id="sim-currency-hint"></span>
              </div>
              <div class="form-field form-field-narrow">
                <label class="form-label">${t('simulate.coveragePct')}</label>
                <input class="form-input" type="number" name="coverage" min="1" max="100" value="20">
              </div>
              <div class="form-field form-field-narrow">
                <label class="form-label">${t('simulate.durationMonths')}</label>
                <input class="form-input" type="number" name="durationMonths" min="1" max="120" value="12">
              </div>
              <div class="form-field">
                <label class="form-label">${t('simulate.targetGroup')}</label>
                <select class="form-select" name="targetGroup">
                  <option value="all">${t('simulate.targetGroupAll')}</option>
                  <option value="bottom_quintile">${t('simulate.targetGroupBottomQuintile')}</option>
                </select>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">${t('simulate.runButton')}</button>
            </div>
          </form>
        </div>

        <div class="card mt-1">
          <h2>${t('simulate.compareCountries')}</h2>
          <form
            id="compare-form"
            hx-post="/admin/simulate/compare"
            hx-target="#compare-result"
            hx-trigger="submit"
            class="form-stack">
            <div class="form-row">
              <div class="form-field">
                <label class="form-label">${t('simulate.compareCountriesHint')}</label>
                <select class="form-select form-select-multi" name="countries" multiple size="6">
                  ${opts}
                </select>
              </div>
              <div class="form-field-group">
                <div class="form-field form-field-narrow">
                  <label class="form-label">${t('simulate.coveragePct')}</label>
                  <input class="form-input" type="number" name="coverage" min="1" max="100" value="20">
                </div>
                <div class="form-field form-field-narrow">
                  <label class="form-label">${t('simulate.durationMonths')}</label>
                  <input class="form-input" type="number" name="durationMonths" min="1" max="120" value="12">
                </div>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">${t('simulate.compareButton')}</button>
            </div>
          </form>
          <div id="compare-result" class="mt-1"></div>
        </div>
      </div>

      <div class="two-col-aside">
        <div id="sim-result"></div>
      </div>
    </div>

    <div class="card mt-1">
      <h2>${t('simulate.savedSimulations')}</h2>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('simulate.colId')}</th>
              <th>${t('simulate.colName')}</th>
              <th>${t('simulate.colCountry')}</th>
              <th>${t('simulate.colCreated')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${savedRows}</tbody>
        </table>
      </div>
    </div>
  `,
  );
}

export function renderSimulationPreview(result: SimulationResult, saveName?: string): string {
  const { country, simulation } = result;
  const { cost, entitlementPerPerson, recipientCount } = simulation;

  const currency = getCurrencyForCountry(country.code);
  const currencyCode = currency?.code ?? 'USD';

  const localMonthlyPerPerson = formatLocalCurrency(
    entitlementPerPerson.localCurrencyPerMonth,
    currencyCode,
  );
  const localMonthlyCost = formatLocalCurrency(cost.monthlyLocalCurrency, currencyCode);
  const annualPppFormatted = formatCurrency(cost.annualPppUsd, 'USD');

  return `
    <div class="card">
      <h2>${escapeHtml(country.name)} <span class="badge badge-secondary">${escapeHtml(country.code)}</span></h2>
      <div class="stat-grid">
        <div class="stat-tile">
          <div class="stat-label">${t('simulate.recipients')}</div>
          <div class="stat-value">${formatCompact(recipientCount)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">${t('simulate.coverage')}</div>
          <div class="stat-value">${formatPercent(simulation.coverageRate * 100)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">${t('simulate.perPersonMonthPpp')}</div>
          <div class="stat-value">${formatCurrency(entitlementPerPerson.pppUsdPerMonth, 'USD')}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">${t('simulate.perPersonMonthLocal')} (${escapeHtml(currencyCode)})</div>
          <div class="stat-value">${localMonthlyPerPerson}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">${t('simulate.monthlyCostLocal')} (${escapeHtml(currencyCode)})</div>
          <div class="stat-value">${localMonthlyCost}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">${t('simulate.annualCostPpp')}</div>
          <div class="stat-value">${annualPppFormatted}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">${t('simulate.asPercentGdp')}</div>
          <div class="stat-value">${formatPercent(cost.asPercentOfGdp, 2)}</div>
        </div>
      </div>
      <form method="post" action="/admin/simulate/save" class="form-inline mt-1">
        <input type="hidden" name="simulationJson" value="${escapeHtml(JSON.stringify(result))}">
        <input class="form-input" type="text" name="name" placeholder="${t('simulate.saveAs')}" value="${saveName ? escapeHtml(saveName) : ''}">
        <button type="submit" class="btn btn-primary btn-sm">${t('simulate.save')}</button>
      </form>
    </div>`;
}

export function renderComparisonTable(results: SimulationResult[]): string {
  if (results.length === 0) {
    return `<p class="text-muted">${t('simulate.noResults')}</p>`;
  }

  const labels = results.map((r) => `${r.country.name} (${r.country.code})`);
  const annualCosts = results.map((r) => r.simulation.cost.annualPppUsd);

  const chart = barChart(
    labels,
    [
      {
        label: t('simulate.annualCostPpp'),
        data: annualCosts,
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: 'rgba(59, 130, 246, 1)',
      },
    ],
    {
      height: 260,
      exportFilename: 'country-comparison',
      chartOptions: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    },
  );

  const rows = results
    .map((r) => {
      const currency = getCurrencyForCountry(r.country.code);
      const currencyCode = currency?.code ?? 'USD';
      const localPerPerson = formatLocalCurrency(
        r.simulation.entitlementPerPerson.localCurrencyPerMonth,
        currencyCode,
      );
      return `
    <tr>
      <td>${escapeHtml(r.country.name)} <span class="badge badge-secondary">${escapeHtml(r.country.code)}</span></td>
      <td>${formatCompact(r.country.population)}</td>
      <td>${formatCompact(r.simulation.recipientCount)}</td>
      <td>${localPerPerson} <span class="text-muted">${escapeHtml(currencyCode)}</span></td>
      <td>${formatCurrency(r.simulation.cost.annualPppUsd, 'USD')}</td>
      <td>${formatPercent(r.simulation.cost.asPercentOfGdp, 2)}</td>
    </tr>`;
    })
    .join('');

  return `
    <div class="card">
      ${chart}
      <div class="data-table-container mt-1">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('common.country')}</th>
              <th>${t('simulate.colPopulation')}</th>
              <th>${t('simulate.colRecipients')}</th>
              <th>${t('simulate.colPerPersonMonthLocal')}</th>
              <th>${t('simulate.colAnnualCostPpp')}</th>
              <th>${t('simulate.colPercentGdp')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
