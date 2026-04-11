import { layout } from './layout.js';
import { escapeHtml, formatNumber, formatCompact, formatPercent } from './helpers.js';
import { stackedBarChart, lineChart } from './chart-helpers.js';
import { projectYearly, yearLabels } from '../../core/projections.js';
import { t } from '../../i18n/index.js';
import { getCurrencyForCountry, formatLocalCurrency } from '../../data/currencies.js';
import type {
  Country,
  SavedSimulation,
  FundingScenarioResult,
  FundingEstimate,
  FundingMechanismInput,
  FiscalContext,
  SavedFundingScenario,
} from '../../core/types.js';

function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${formatNumber(n)}`;
}

function fmtPct(n: number | null): string {
  if (n == null) return t('common.na');
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
  return `<option value="">${t('funding.inlineSimRunNew')}</option>` + rows.join('');
}

interface MechanismDef {
  key: string;
  titleKey: string;
  descKey: string;
  fieldName: string;
  min: string;
  max: string;
  step: string;
  defaultVal: string;
  suffix: string;
  checked: boolean;
}

const MECHANISMS: MechanismDef[] = [
  { key: 'income_tax', titleKey: 'incomeTaxTitle', descKey: 'incomeTaxDesc', fieldName: 'income_tax_rate', min: '0.5', max: '15', step: '0.5', defaultVal: '2', suffix: '%', checked: true },
  { key: 'vat', titleKey: 'vatTitle', descKey: 'vatDesc', fieldName: 'vat_points', min: '0.5', max: '10', step: '0.5', defaultVal: '2', suffix: 'pp', checked: false },
  { key: 'carbon', titleKey: 'carbonTaxTitle', descKey: 'carbonTaxDesc', fieldName: 'carbon_rate', min: '5', max: '200', step: '5', defaultVal: '25', suffix: '$', checked: false },
  { key: 'wealth', titleKey: 'wealthTaxTitle', descKey: 'wealthTaxDesc', fieldName: 'wealth_rate', min: '0.1', max: '5', step: '0.1', defaultVal: '1', suffix: '%', checked: false },
  { key: 'ftt', titleKey: 'fttTitle', descKey: 'fttDesc', fieldName: 'ftt_rate', min: '0.01', max: '1', step: '0.01', defaultVal: '0.1', suffix: '%', checked: false },
  { key: 'automation', titleKey: 'automationTaxTitle', descKey: 'automationTaxDesc', fieldName: 'automation_rate', min: '0.5', max: '15', step: '0.5', defaultVal: '3', suffix: '%', checked: false },
  { key: 'redirect', titleKey: 'redirectTitle', descKey: 'redirectDesc', fieldName: 'redirect_pct', min: '5', max: '80', step: '5', defaultVal: '15', suffix: '%', checked: false },
];

function renderMechanismCard(m: MechanismDef): string {
  const prefix = m.suffix === '$' ? '$' : '';
  const postfix = m.suffix !== '$' ? m.suffix : '';
  const defaultDisplay = `${prefix}${m.defaultVal}${postfix}`;
  const disabledStyle = m.checked ? '' : 'opacity:0.5';
  return `
    <div class="card mb-1 mechanism-card" id="mech-${m.key}" style="${disabledStyle}">
      <div class="flex-between">
        <h3 class="card-title">${t(`funding.${m.titleKey}`)}</h3>
        <label class="form-checkbox"><input type="checkbox" name="enable_${m.key}" value="1"${m.checked ? ' checked' : ''}
          onchange="this.closest('.mechanism-card').style.opacity = this.checked ? '1' : '0.5'"> ${t('funding.enable')}</label>
      </div>
      <p class="text-muted text-sm mt-1">${t(`funding.${m.descKey}`)}</p>
      <div class="flex flex-center gap-1 mt-1">
        <span class="text-xs text-muted">${prefix}${m.min}${postfix}</span>
        <input type="range" name="${m.fieldName}" min="${m.min}" max="${m.max}" step="${m.step}" value="${m.defaultVal}"
          oninput="this.nextElementSibling.textContent = '${prefix}' + this.value + '${postfix}'; var cb = this.closest('.mechanism-card').querySelector('input[type=checkbox]'); if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }" class="w-full">
        <span class="text-bold text-sm" style="min-width:60px;text-align:right">${defaultDisplay}</span>
        <span class="text-xs text-muted">${prefix}${m.max}${postfix}</span>
      </div>
    </div>`;
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
      ? `<tr><td colspan="6" class="text-muted">${t('funding.noSavedScenarios')}</td></tr>`
      : savedScenarios
          .map(
            (s) => `
      <tr>
        <td class="mono">${escapeHtml(s.id.slice(0, 8))}${t('common.ellipsis')}</td>
        <td>${s.name ? escapeHtml(s.name) : t('common.none')}</td>
        <td>${escapeHtml(s.countryCode)}</td>
        <td>${s.results.mechanisms.length} mechanism${s.results.mechanisms.length !== 1 ? 's' : ''}</td>
        <td>${fmtPct(s.results.coverageOfUbiCost)}</td>
        <td>
          <form method="post" action="/admin/funding/delete" class="form-inline">
            <input type="hidden" name="id" value="${escapeHtml(s.id)}">
            <button type="submit" class="btn btn-danger btn-sm">${t('funding.deleteButton')}</button>
          </form>
        </td>
      </tr>`,
          )
          .join('');

  const mechanismCards = MECHANISMS.map(renderMechanismCard).join('');

  return layout(
    t('funding.title'),
    `
    <div class="page-header">
      <h1>${t('funding.title')}</h1>
      <p class="text-muted">${t('funding.subtitle')}</p>
    </div>

    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('funding.configureScenario')}</h2>
      </div>

      <form id="funding-form"
        hx-post="/admin/funding/preview"
        hx-target="#funding-result"
        hx-trigger="submit">

        <div class="form-group mb-2">
          <label>${t('funding.baseSimulation')}</label>
          <select name="simulationId" id="sim-select"
            onchange="document.getElementById('inline-sim-panel').style.display = this.value === '' ? 'flex' : 'none'">
            ${simOpts}
          </select>
        </div>

        <div class="form-row mb-2" id="inline-sim-panel">
          <div class="form-group" style="flex:1">
            <label>${t('funding.country')}</label>
            <select name="country">${opts}</select>
          </div>
          <div class="form-group" style="flex:0 0 100px">
            <label>${t('funding.coveragePct')}</label>
            <input type="number" name="coverage" min="1" max="100" value="20">
          </div>
          <div class="form-group" style="flex:0 0 130px">
            <label>${t('funding.durationMonths')}</label>
            <input type="number" name="durationMonths" min="1" max="120" value="12">
          </div>
          <div class="form-group" style="flex:1">
            <label>${t('funding.targetGroup')}</label>
            <select name="targetGroup">
              <option value="all">${t('funding.targetGroupAll')}</option>
              <option value="bottom_decile">${t('funding.targetGroupBottomDecile')}</option>
              <option value="bottom_quintile">${t('funding.targetGroupBottomQuintile')}</option>
              <option value="bottom_third">${t('funding.targetGroupBottomThird')}</option>
              <option value="bottom_half">${t('funding.targetGroupBottomHalf')}</option>
            </select>
          </div>
        </div>

        <h3 class="section-title">${t('funding.fundingMechanisms')}</h3>
        ${mechanismCards}

        <div class="mt-2">
          <button type="submit" class="btn btn-primary">${t('funding.analyzeButton')}</button>
        </div>
      </form>
    </div>

    <div id="funding-result"></div>

    <div class="card mt-2">
      <div class="card-header">
        <h2 class="card-title">${t('funding.savedScenarios')}</h2>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('funding.colId')}</th>
              <th>${t('funding.colName')}</th>
              <th>${t('funding.colCountry')}</th>
              <th>${t('funding.colMechanisms')}</th>
              <th>${t('funding.colCoverage')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${savedRows}</tbody>
        </table>
      </div>
    </div>
  `,
    { activePage: 'funding' },
  );
}

// ── Preview result (htmx partial) ─────────────────────────────────────────

const BAR_COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0284c7'];

export function renderFundingPreview(
  result: FundingScenarioResult,
  fullCountry?: Country,
  mechanismInputs?: FundingMechanismInput[],
): string {
  const { mechanisms, totalRevenuePppUsd, coverageOfUbiCost, gapPppUsd, ubiCost, fiscalContext, country } = result;

  // Summary stat cards
  const coverageClass = coverageOfUbiCost >= 100 ? 'text-success' : coverageOfUbiCost >= 50 ? 'text-primary' : 'text-danger';
  const gapClass = gapPppUsd === 0 ? 'text-success' : 'text-danger';

  // Stacked bar
  const total = Math.max(ubiCost.annualPppUsd, totalRevenuePppUsd);
  const barSegments = mechanisms
    .map((m, i) => {
      const pct = total > 0 ? (m.annualRevenuePppUsd / total) * 100 : 0;
      if (pct < 0.5) return '';
      return `<div class="progress-bar-fill" style="width:${pct.toFixed(2)}%;background:${BAR_COLORS[i % 6]};display:inline-flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:600;color:#fff;float:left;height:100%">${pct >= 5 ? fmtPct(m.coversPercentOfUbiCost) : ''}</div>`;
    })
    .join('');
  const gapPct = total > 0 ? Math.max(0, (gapPppUsd / total) * 100) : 100;
  const gapSegment = gapPct > 0.5 ? `<div style="width:${gapPct.toFixed(2)}%;background:var(--color-border-light);display:inline-flex;align-items:center;justify-content:center;font-size:0.65rem;color:var(--color-text-secondary);float:left;height:100%">${gapPct >= 5 ? t('funding.gap') : ''}</div>` : '';

  // Mechanism breakdown
  const mechRows = mechanisms
    .map(
      (m, i) => `
    <div class="flex flex-center gap-1" style="padding:0.5rem 0;border-bottom:1px solid var(--color-border-light)">
      <span style="width:12px;height:12px;border-radius:50%;background:${BAR_COLORS[i % 6]};flex-shrink:0"></span>
      <div style="flex:1">
        <div class="text-bold text-sm">${escapeHtml(m.label)}</div>
        <div class="text-xs text-muted">${fmtPct(m.coversPercentOfUbiCost)} ${t('funding.ofUbiCost')}</div>
      </div>
      <div class="text-bold">${fmtCurrency(m.annualRevenuePppUsd)}</div>
    </div>`,
    )
    .join('');

  // Chart — stacked bar: funding mechanisms vs UBI cost
  const chart = mechanisms.length > 0
    ? stackedBarChart(
        ['Funding Raised', 'UBI Cost'],
        [
          ...mechanisms.map((m, i) => ({
            label: m.label,
            data: [m.annualRevenuePppUsd, 0],
            backgroundColor: BAR_COLORS[i % 6],
            stack: 'funding',
          })),
          {
            label: 'UBI Annual Cost',
            data: [0, ubiCost.annualPppUsd],
            backgroundColor: '#e5e7eb',
            stack: 'cost',
          },
        ],
        { height: 280, exportFilename: 'funding-breakdown', chartOptions: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } } } },
      )
    : '';

  // Fiscal context
  const ubiPctTaxRev = fiscalContext.ubiAsPercentOfTaxRevenue ?? 0;
  const ubiTaxClass = ubiPctTaxRev > 100 ? 'text-danger' : 'text-success';

  // Assumptions
  const allAssumptions = mechanisms.flatMap((m) => m.assumptions);

  // Overfunding warning
  const overFundedWarning = coverageOfUbiCost > 150 ? `
    <div class="alert alert-warning mb-2" style="background:#fffbeb;border:1px solid #f59e0b;border-radius:var(--radius-md);padding:0.75rem 1rem">
      <strong style="color:#92400e">Scenario exceeds ${fmtPct(coverageOfUbiCost)} of UBI cost.</strong>
      <span class="text-sm" style="color:#78350f"> This combination of mechanisms raises significantly more than needed. Consider reducing rates or disabling some mechanisms for a more realistic scenario. All estimates use income-group proxies where country-specific fiscal data is unavailable.</span>
    </div>` : '';

  // Proxy data warning — no actual fiscal data available
  const proxyWarning = fiscalContext.totalTaxRevenue.percentGdp == null ? `
    <div class="alert alert-info mb-2" style="background:#f0f9ff;border:1px solid #0ea5e9;border-radius:var(--radius-md);padding:0.75rem 1rem">
      <strong style="color:#0c4a6e">Estimates based on income-group proxies.</strong>
      <span class="text-sm" style="color:#075985"> No country-specific tax or fiscal data is available for ${escapeHtml(country.name)}. Revenue estimates use global averages for this income group. Run <code>npm run data:update</code> to fetch World Bank, ILO, and IMF fiscal data for more accurate results.</span>
    </div>` : '';

  return `
    <div class="card mt-2">
      <div class="card-header">
        <h2 class="card-title">${t('funding.fundingAnalysis')} — ${escapeHtml(country.name)}</h2>
      </div>
      <p class="text-muted text-sm mb-2">
        UBI for ${formatNumber(result.country.population)} people at ${fmtPct(ubiCost.asPercentOfGdp)} ${t('funding.ofGdp')}
      </p>

      ${overFundedWarning}
      ${proxyWarning}

      <div class="grid grid-4 mb-2">
        <div class="card stat-card">
          <div class="stat-value text-primary">${fmtCurrency(ubiCost.annualPppUsd)}</div>
          <div class="stat-label">${t('funding.annualUbiCost')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value text-success">${fmtCurrency(totalRevenuePppUsd)}</div>
          <div class="stat-label">${t('funding.totalFundingRaised')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value ${coverageClass}">${fmtPct(coverageOfUbiCost)}</div>
          <div class="stat-label">${t('funding.costCovered')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value ${gapClass}">${gapPppUsd === 0 ? t('funding.fullyFunded') : fmtCurrency(gapPppUsd)}</div>
          <div class="stat-label">${gapPppUsd === 0 ? '' : t('funding.fundingGap')}</div>
        </div>
      </div>

      <h3 class="section-title">${t('funding.fundingVsCost')}</h3>
      <div class="progress-bar mb-2" style="height:36px;border-radius:var(--radius-md);overflow:hidden">${barSegments}${gapSegment}</div>

      ${mechanisms.length > 0 ? `
      <div class="two-col mb-2">
        <div>
          <h3 class="section-title">${t('funding.revenueByMechanism')}</h3>
          <div class="card">${mechRows}</div>
        </div>
        <div>${chart}</div>
      </div>` : ''}

      <h3 class="section-title">${t('funding.fiscalContext')} — ${escapeHtml(country.name)}</h3>
      <div class="grid grid-4 mb-2">
        <div class="card">
          <div class="metric-tile">
            <div class="metric-tile-label">${t('funding.taxRevenue')}</div>
            <div class="metric-tile-value">${fmtPct(fiscalContext.totalTaxRevenue.percentGdp)}</div>
            <div class="text-xs text-muted">${t('funding.ofGdp')}${fiscalContext.totalTaxRevenue.absolutePppUsd ? ` (${fmtCurrency(fiscalContext.totalTaxRevenue.absolutePppUsd)})` : ''}</div>
          </div>
        </div>
        <div class="card">
          <div class="metric-tile">
            <div class="metric-tile-label">${t('funding.socialSpending')}</div>
            <div class="metric-tile-value">${fmtPct(fiscalContext.currentSocialSpending.percentGdp)}</div>
            <div class="text-xs text-muted">${t('funding.ofGdp')}${fiscalContext.currentSocialSpending.absolutePppUsd ? ` (${fmtCurrency(fiscalContext.currentSocialSpending.absolutePppUsd)})` : ''}</div>
          </div>
        </div>
        <div class="card">
          <div class="metric-tile">
            <div class="metric-tile-label">${t('funding.governmentDebt')}</div>
            <div class="metric-tile-value">${fmtPct(fiscalContext.governmentDebt.percentGdp)}</div>
            <div class="text-xs text-muted">${t('funding.ofGdp')}</div>
          </div>
        </div>
        <div class="card">
          <div class="metric-tile">
            <div class="metric-tile-label">${t('funding.ubiAsPercentTaxRevenue')}</div>
            <div class="metric-tile-value ${ubiTaxClass}">${fmtPct(fiscalContext.ubiAsPercentOfTaxRevenue)}</div>
            <div class="text-xs text-muted">${ubiPctTaxRev > 100 ? t('funding.exceedsTaxRevenue') : t('funding.withinFiscalCapacity')}</div>
          </div>
        </div>
      </div>

      ${allAssumptions.length > 0 ? `
      <h3 class="section-title">${t('funding.assumptionsMethodology')}</h3>
      <div class="card">
        <ul class="text-sm text-muted" style="padding-left:1.2rem;margin:0">
          ${allAssumptions.map((a) => `<li style="margin-bottom:0.3rem">${escapeHtml(a)}</li>`).join('')}
        </ul>
        <p class="text-xs text-muted mt-1" style="font-style:italic">${t('funding.assumptionsDisclaimer')}</p>
      </div>` : ''}

      ${(() => {
        const hasGdpGrowth = fullCountry?.stats.gdpGrowthRate != null;
        const hasInflation = fullCountry?.stats.inflationRate != null;
        const gdpGrowth = fullCountry?.stats.gdpGrowthRate ?? 3;
        const inflRate = fullCountry?.stats.inflationRate ?? 4;
        const missingIndicators: string[] = [];
        if (!hasGdpGrowth) missingIndicators.push('GDP growth rate (using 3% default)');
        if (!hasInflation) missingIndicators.push('Inflation rate (using 4% default)');
        if (!fullCountry) missingIndicators.push('Full country data unavailable');

        if (!fullCountry) {
          return `
          <div class="card mt-2" style="border-left:3px solid var(--color-warning)">
            <h3 class="section-title">10-Year Funding Projection</h3>
            <p class="text-sm text-muted"><strong>Cannot generate projection:</strong> Full country economic data not available. Projections require GDP growth and inflation indicators.</p>
          </div>`;
        }

        const projYears = 10;
        const labels = yearLabels(projYears);
        const costGrowth = (inflRate + 1.5) / 100;
        const revenueGrowth = gdpGrowth / 100;
        const costProj = projectYearly(ubiCost.annualPppUsd, costGrowth, projYears);
        const revProj = projectYearly(totalRevenuePppUsd, revenueGrowth, projYears);

        const dataWarning = missingIndicators.length > 0
          ? `<div class="data-warning mb-1">
              <strong>Data gaps:</strong> ${missingIndicators.map(i => escapeHtml(i)).join('; ')}. Projection accuracy is reduced.
            </div>`
          : '';

        return `
        <h3 class="section-title">10-Year Funding Projection</h3>
        ${dataWarning}
        <p class="text-xs text-muted mb-1">Revenue grows at ${hasGdpGrowth ? '' : '~'}${gdpGrowth.toFixed(1)}%/yr (GDP growth). Costs grow at ${hasInflation ? '' : '~'}${inflRate.toFixed(1)}%/yr inflation + 1.5% population growth.</p>
        ${lineChart(
          labels,
          [
            { label: 'Projected Revenue', data: revProj, borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.08)', fill: true },
            { label: 'Projected UBI Cost', data: costProj, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true },
          ],
          { height: 280, exportFilename: 'funding-projection', chartOptions: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } },
        )}`;
      })()}

      <div class="flex gap-1 mt-2">
        <form method="post" action="/admin/funding/save" class="form-inline" style="flex:1">
          <input type="hidden" name="resultJson" value="${escapeHtml(JSON.stringify(result))}">
          <input type="hidden" name="mechanismsJson" value="${escapeHtml(JSON.stringify(mechanismInputs ?? []))}">
          <input type="text" name="name" placeholder="${t('funding.scenarioNamePlaceholder')}" class="w-full">
          <button type="submit" class="btn btn-primary btn-sm">${t('funding.saveScenario')}</button>
        </form>
        <form method="post" action="/admin/funding/export">
          <input type="hidden" name="resultJson" value="${escapeHtml(JSON.stringify(result))}">
          <button type="submit" class="btn btn-secondary btn-sm">${t('funding.exportJson')}</button>
        </form>
      </div>
    </div>`;
}
