import { layout } from './layout.js';
import { escapeHtml, formatNumber, formatCompact, formatPercent, formatCurrency, renderCitations, renderCitationSup } from './helpers.js';
import { renderDrawer } from './helpers.js';
import { barChart, lineChart } from './chart-helpers.js';
import { projectYearly, yearLabels } from '../../core/projections.js';
import { t } from '../../i18n/index.js';
import { getCurrencyForCountry, formatLocalCurrency } from '../../data/currencies.js';
import type { Country, FiscalContext, Citation } from '../../core/types.js';
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
              <div class="form-field form-field-narrow">
                <label class="form-label">${t('simulate.transferAmount')}</label>
                <input class="form-input" type="number" name="transferAmount" min="1" max="10000" placeholder="210" step="1">
                <span class="form-hint">${t('simulate.transferAmountHint')}</span>
              </div>
              <div class="form-field">
                <label class="form-label">${t('simulate.targetGroup')}</label>
                <select class="form-select" name="targetGroup">
                  <option value="all">${t('simulate.targetGroupAll')}</option>
                  <option value="bottom_decile">${t('simulate.targetGroupBottomDecile')}</option>
                  <option value="bottom_quintile">${t('simulate.targetGroupBottomQuintile')}</option>
                  <option value="bottom_third">${t('simulate.targetGroupBottomThird')}</option>
                  <option value="bottom_half">${t('simulate.targetGroupBottomHalf')}</option>
                </select>
              </div>
            </div>

            <details class="targeting-details">
              <summary class="targeting-summary">Advanced targeting filters <span class="text-muted text-xs">(optional)</span></summary>
              <div class="targeting-fields">
                <div class="form-row">
                  <div class="form-field">
                    <label class="form-label">Urban / Rural</label>
                    <select class="form-select" name="tr_urban_rural">
                      <option value="">Any</option>
                      <option value="urban">Urban only</option>
                      <option value="rural">Rural only</option>
                      <option value="mixed">Mixed</option>
                    </select>
                  </div>
                  <div class="form-field form-field-narrow">
                    <label class="form-label">Min age</label>
                    <input class="form-input" type="number" name="tr_age_min" min="0" max="120" placeholder="e.g. 18">
                  </div>
                  <div class="form-field form-field-narrow">
                    <label class="form-label">Max age</label>
                    <input class="form-input" type="number" name="tr_age_max" min="0" max="120" placeholder="e.g. 65">
                  </div>
                  <div class="form-field form-field-narrow">
                    <label class="form-label">Max income (PPP-USD/mo)</label>
                    <input class="form-input" type="number" name="tr_max_income" min="1" placeholder="e.g. 300">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-field">
                    <label class="form-label">Identity providers <span class="text-muted text-xs">(comma-separated)</span></label>
                    <input class="form-input" type="text" name="tr_identity_providers" placeholder="e.g. kyc-provider-a, kyc-provider-b">
                  </div>
                  <div class="form-field form-field-narrow">
                    <label class="form-label">Exclude if paid within (days)</label>
                    <input class="form-input" type="number" name="tr_exclude_paid_days" min="1" placeholder="e.g. 30">
                  </div>
                  <div class="form-field">
                    <label class="form-label">Region IDs <span class="text-muted text-xs">(comma-separated)</span></label>
                    <input class="form-input" type="text" name="tr_region_ids" placeholder="e.g. KE-NAI, KE-MOM">
                  </div>
                </div>
                <p class="text-xs text-muted" style="margin:0.25rem 0 0">
                  Note: advanced filters (age, income, identity providers, regions) are applied at disbursement time. Only the group preset affects recipient count estimates.
                </p>
              </div>
            </details>
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
                <div class="form-field form-field-narrow">
                  <label class="form-label">${t('simulate.transferAmount')}</label>
                  <input class="form-input" type="number" name="transferAmount" min="1" max="10000" placeholder="210" step="1">
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
    { activePage: 'simulate' },
  );
}

export interface SimulationPreviewContext {
  saveName?: string;
  fullCountry?: Country;
  /** Flat form fields to carry through to the save endpoint */
  savedFormFields?: Record<string, string>;
  /**
   * Optional fiscal context computed by `calculateFiscalContext` from
   * `src/core/funding.ts`. When present, a `.fiscal-card` section is
   * rendered beneath the main stat grid. Gracefully omitted when null.
   */
  fiscalContext?: FiscalContext | null;
}

// ---------------------------------------------------------------------------
// Fiscal context card (used inside renderSimulationPreview)
// ---------------------------------------------------------------------------

function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return `<span class="text-muted">${t('common.na')}</span>`;
  return escapeHtml(`${n.toFixed(decimals)}%`);
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return `<span class="text-muted">${t('common.na')}</span>`;
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return escapeHtml(formatCurrency(n, 'USD'));
}

function renderFiscalContextCard(fc: FiscalContext): string {
  const ubiPctTax = fc.ubiAsPercentOfTaxRevenue;
  const ubiTaxClass = ubiPctTax != null && ubiPctTax > 100 ? 'text-danger' : 'text-success';
  const ubiPctSocial = fc.ubiAsPercentOfSocialSpending;

  const taxRevAbsLabel = fc.totalTaxRevenue.absolutePppUsd != null
    ? ` (${fmtUsd(fc.totalTaxRevenue.absolutePppUsd)})`
    : '';
  const socialAbsLabel = fc.currentSocialSpending.absolutePppUsd != null
    ? ` (${fmtUsd(fc.currentSocialSpending.absolutePppUsd)})`
    : '';

  const drawer = renderDrawer(
    'sim-fiscal-methodology',
    t('common.calculations'),
    'How fiscal context is calculated',
    `<p class="text-sm text-muted">
      Tax revenue and social spending are sourced from World Bank, ILO, and IMF
      indicators for the selected country and expressed as a percentage of GDP.
      Absolute amounts are derived by multiplying those percentages by the
      country&rsquo;s total GDP (GDP per capita &times; population) in PPP-USD.
      UBI cost as a share of tax revenue and social spending gives a sense of
      fiscal headroom — values above 100&thinsp;% indicate the program would
      exceed the entire existing budget in that category.
    </p>`,
  );

  return `
  <div class="fiscal-card mt-2">
    <h3 class="section-title">${t('funding.fiscalContext')}</h3>
    <div class="grid grid-4 mb-1">
      <div class="card">
        <div class="metric-tile">
          <div class="metric-tile-label">${t('funding.taxRevenue')}</div>
          <div class="metric-tile-value">${fmtPct(fc.totalTaxRevenue.percentGdp)}</div>
          <div class="text-xs text-muted">${t('funding.ofGdp')}${taxRevAbsLabel}</div>
        </div>
      </div>
      <div class="card">
        <div class="metric-tile">
          <div class="metric-tile-label">${t('funding.socialSpending')}</div>
          <div class="metric-tile-value">${fmtPct(fc.currentSocialSpending.percentGdp)}</div>
          <div class="text-xs text-muted">${t('funding.ofGdp')}${socialAbsLabel}</div>
        </div>
      </div>
      <div class="card">
        <div class="metric-tile">
          <div class="metric-tile-label">${t('funding.governmentDebt')}</div>
          <div class="metric-tile-value">${fmtPct(fc.governmentDebt.percentGdp)}</div>
          <div class="text-xs text-muted">${t('funding.ofGdp')}</div>
        </div>
      </div>
      <div class="card">
        <div class="metric-tile">
          <div class="metric-tile-label">UBI as % of tax revenue</div>
          <div class="metric-tile-value ${ubiTaxClass}">${fmtPct(ubiPctTax)}</div>
          <div class="text-xs text-muted">
            ${ubiPctSocial != null ? `${ubiPctSocial.toFixed(1)}% of social spending` : ''}
          </div>
        </div>
      </div>
    </div>
    ${drawer}
  </div>`;
}

export function renderSimulationPreview(result: SimulationResult, saveName?: string, fullCountry?: Country, ctx?: SimulationPreviewContext): string {
  // Merge legacy args with ctx for backward compatibility
  const _saveName = ctx?.saveName ?? saveName;
  const _fullCountry = ctx?.fullCountry ?? fullCountry;
  const savedFormFields = ctx?.savedFormFields ?? {};
  const { country, simulation } = result;
  const { cost, entitlementPerPerson, recipientCount } = simulation;

  const currency = getCurrencyForCountry(country.code);
  const currencyCode = currency?.code ?? 'USD';

  // Hidden inputs to carry form params through to save endpoint
  const hiddenFields = Object.entries(savedFormFields)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('\n        ');

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
      ${ctx?.fiscalContext ? renderFiscalContextCard(ctx.fiscalContext) : ''}
      ${(() => {
        if (!_fullCountry) return '';
        const hasGdpGrowth = _fullCountry.stats.gdpGrowthRate != null;
        const hasInflation = _fullCountry.stats.inflationRate != null;
        const gdpGrowth = _fullCountry.stats.gdpGrowthRate ?? 3;
        const inflRate = _fullCountry.stats.inflationRate ?? 4;

        const missingIndicators: string[] = [];
        if (!hasGdpGrowth) missingIndicators.push('GDP growth rate (using 3% default)');
        if (!hasInflation) missingIndicators.push('Inflation rate (using 4% default)');

        const projYears = 10;
        const labels = yearLabels(projYears);
        const costGrowth = (inflRate + 1.5) / 100;
        const costProj = projectYearly(cost.annualPppUsd, costGrowth, projYears);
        // GDP total grows at aggregate GDP growth (includes population growth)
        const gdpTotal = _fullCountry.stats.gdpPerCapitaUsd * _fullCountry.stats.population;
        const gdpProj = projectYearly(gdpTotal, gdpGrowth / 100, projYears);
        const pctGdpProj = costProj.map((c, i) => Math.round((c / gdpProj[i]) * 10000) / 100);

        const dataWarning = missingIndicators.length > 0
          ? `<div class="data-warning mb-1">
              <strong>Data gaps:</strong> ${missingIndicators.map(i => escapeHtml(i)).join('; ')}. Projection accuracy is reduced.
            </div>`
          : '';

        return `
        <h3 class="section-title mt-2">10-Year Cost Projection</h3>
        ${dataWarning}
        <p class="text-xs text-muted mb-1">Costs grow at ${hasInflation ? '' : '~'}${inflRate.toFixed(1)}%/yr inflation + 1.5% population growth. GDP grows at ${hasGdpGrowth ? '' : '~'}${gdpGrowth.toFixed(1)}%/yr.</p>
        ${lineChart(
          labels,
          [
            { label: 'Annual Cost (PPP USD)', data: costProj, borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.08)', fill: true },
          ],
          { height: 240, exportFilename: 'cost-projection', chartOptions: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } },
        )}
        <div class="mt-1">
        ${lineChart(
          labels,
          [
            { label: 'Cost as % of GDP', data: pctGdpProj, borderColor: '#ea580c', backgroundColor: 'rgba(234,88,12,0.08)', fill: true },
          ],
          { height: 200, exportFilename: 'cost-pct-gdp-projection', chartOptions: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } },
        )}
        </div>`;
      })()}
      <form method="post" action="/admin/simulate/save" class="form-inline mt-1">
        <input type="hidden" name="simulationJson" value="${escapeHtml(JSON.stringify(result))}">
        ${hiddenFields}
        <input class="form-input" type="text" name="name" placeholder="${t('simulate.saveAs')}" value="${_saveName ? escapeHtml(_saveName) : ''}">
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
