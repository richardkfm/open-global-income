/**
 * Public cost & funding calculator.
 *
 * A plain GET form — every scenario lives entirely in the URL, so a
 * journalist or ministry analyst can share a link that reproduces the
 * exact numbers. No login, no JavaScript required to compute.
 */
import { publicLayout } from './layout.js';
import {
  escapeHtml,
  formatCompact,
  formatPercent,
} from '../../admin/views/helpers.js';
import { horizontalBarChart } from '../../admin/views/chart-helpers.js';
import { GLOBAL_INCOME_FLOOR_PPP } from '../../core/constants.js';
import type {
  FiscalContext,
  FundingScenarioResult,
  ImpactAnalysisResult,
  SimulationResult,
  TargetGroup,
} from '../../core/types.js';

const CHART_BLUE = '#2a78d6';

export interface CalculatorFormState {
  country: string;
  coveragePercent: number;
  targetGroup: TargetGroup;
  durationMonths: number;
  monthlyAmount: number;
  fIncomeTax: number;
  fVat: number;
  fCarbon: number;
  fWealth: number;
  fFtt: number;
  fAutomation: number;
  fRedirect: number;
}

export interface CalculatorResult {
  countryName: string;
  simulation: SimulationResult;
  fiscal: FiscalContext;
  impact: ImpactAnalysisResult;
  /** null when every funding rate is zero */
  funding: FundingScenarioResult | null;
  monthlyLocalFormatted: string;
}

export interface CalculatorData {
  countries: Array<{ code: string; name: string }>;
  form: CalculatorFormState;
  result?: CalculatorResult;
  dataVersion: string;
}

export const TARGET_GROUP_LABELS: Record<TargetGroup, string> = {
  all: 'Everyone (universal)',
  bottom_half: 'Poorest 50%',
  bottom_third: 'Poorest 33%',
  bottom_quintile: 'Poorest 20%',
  bottom_decile: 'Poorest 10%',
};

function numberField(
  name: string,
  label: string,
  value: number,
  opts: { min?: number; max?: number; step?: number; help?: string } = {},
): string {
  return `<div class="form-group">
    <label for="${name}">${escapeHtml(label)}</label>
    <input type="number" id="${name}" name="${name}" value="${value}"
      ${opts.min != null ? `min="${opts.min}"` : ''} ${opts.max != null ? `max="${opts.max}"` : ''}
      step="${opts.step ?? 'any'}">
    ${opts.help ? `<span class="form-help">${escapeHtml(opts.help)}</span>` : ''}
  </div>`;
}

function renderForm(data: CalculatorData): string {
  const f = data.form;
  const countryOptions = data.countries
    .map(
      (c) =>
        `<option value="${escapeHtml(c.code)}"${c.code === f.country ? ' selected' : ''}>${escapeHtml(c.name)}</option>`,
    )
    .join('\n');
  const targetOptions = (Object.keys(TARGET_GROUP_LABELS) as TargetGroup[])
    .map(
      (tg) =>
        `<option value="${tg}"${tg === f.targetGroup ? ' selected' : ''}>${TARGET_GROUP_LABELS[tg]}</option>`,
    )
    .join('\n');

  return `<div class="card">
    <form action="/calculator" method="get">
      <div class="form-row">
        <div class="form-group" style="min-width:220px;flex:1">
          <label for="country">Country</label>
          <select id="country" name="country">
            <option value="">Choose a country…</option>
            ${countryOptions}
          </select>
        </div>
        <div class="form-group" style="min-width:180px">
          <label for="target">Who receives it</label>
          <select id="target" name="target">${targetOptions}</select>
        </div>
        ${numberField('coverage', 'Coverage of that group (%)', f.coveragePercent, { min: 1, max: 100, step: 1, help: 'Enrollment reach — pilots rarely hit 100%' })}
        ${numberField('months', 'Duration (months)', f.durationMonths, { min: 1, max: 120, step: 1 })}
        ${numberField('amount', 'Monthly amount (PPP-USD)', f.monthlyAmount, { min: 1, step: 1, help: `Default $${GLOBAL_INCOME_FLOOR_PPP} = the global floor` })}
      </div>
      <details class="targeting-details mt-2" ${hasFunding(f) ? 'open' : ''}>
        <summary class="targeting-summary">Funding mechanisms (optional) — set rates to see how the cost could be covered</summary>
        <div class="targeting-fields">
          <div class="form-row">
            ${numberField('f_income', 'Income tax surcharge (%)', f.fIncomeTax, { min: 0, max: 50, step: 0.5 })}
            ${numberField('f_vat', 'VAT increase (points)', f.fVat, { min: 0, max: 15, step: 0.5 })}
            ${numberField('f_carbon', 'Carbon tax ($/ton CO2)', f.fCarbon, { min: 0, max: 300, step: 5 })}
            ${numberField('f_wealth', 'Wealth tax (%)', f.fWealth, { min: 0, max: 10, step: 0.25 })}
          </div>
          <div class="form-row mt-1">
            ${numberField('f_ftt', 'Financial transaction tax (%)', f.fFtt, { min: 0, max: 2, step: 0.05 })}
            ${numberField('f_automation', 'Automation tax (%)', f.fAutomation, { min: 0, max: 20, step: 0.5 })}
            ${numberField('f_redirect', 'Redirect social spending (%)', f.fRedirect, { min: 0, max: 100, step: 5 })}
          </div>
        </div>
      </details>
      <div class="mt-2">
        <button type="submit" class="btn btn-primary">Calculate</button>
      </div>
    </form>
  </div>`;
}

function hasFunding(f: CalculatorFormState): boolean {
  return (
    f.fIncomeTax > 0 || f.fVat > 0 || f.fCarbon > 0 || f.fWealth > 0 ||
    f.fFtt > 0 || f.fAutomation > 0 || f.fRedirect > 0
  );
}

function renderResult(data: CalculatorData): string {
  const r = data.result;
  if (!r) return '';
  const f = data.form;
  const sim = r.simulation.simulation;
  const h = r.impact.policyBrief.headline;

  const targetLabel = TARGET_GROUP_LABELS[f.targetGroup].toLowerCase();
  let summary =
    `A basic income of $${sim.entitlementPerPerson.pppUsdPerMonth}/month (PPP; ${r.monthlyLocalFormatted}) ` +
    `reaching ${f.coveragePercent}% of ${targetLabel} in ${r.countryName} — ` +
    `${formatCompact(sim.recipientCount)} people — would cost $${formatCompact(sim.cost.annualPppUsd)} PPP ` +
    `over ${f.durationMonths} months (${sim.cost.asPercentOfGdp.toFixed(2)}% of one year's GDP`;
  if (r.fiscal.ubiAsPercentOfTaxRevenue != null) {
    summary += `, ${r.fiscal.ubiAsPercentOfTaxRevenue.toFixed(1)}% of annual tax revenue`;
  }
  summary += `). Scenario: __URL__`;

  const fundingHtml = r.funding
    ? ((fund: FundingScenarioResult) => {
        const chart = horizontalBarChart(
          fund.mechanisms.map((m) => m.label),
          [{
            label: '% of program cost covered',
            data: fund.mechanisms.map((m) => m.coversPercentOfUbiCost),
            backgroundColor: CHART_BLUE,
          }],
          {
            height: 80 + fund.mechanisms.length * 36,
            exportFilename: `ogi-${fund.country.code.toLowerCase()}-funding`,
            chartOptions: {
              plugins: { legend: { display: false } },
              scales: { x: { title: { display: true, text: '% of program cost covered' } } },
            },
          },
        );
        const rows = fund.mechanisms
          .map(
            (m) =>
              `<tr><td>${escapeHtml(m.label)}</td><td class="num">$${formatCompact(m.annualRevenuePppUsd)}</td><td class="num">${formatPercent(m.coversPercentOfUbiCost)}</td></tr>`,
          )
          .join('\n');
        const covered = fund.coverageOfUbiCost >= 100;
        return `<div class="card">
        <div class="card-header"><div>
          <div class="card-title">Funding the program</div>
          <div class="card-subtitle">Your selected mechanisms cover <strong>${formatPercent(fund.coverageOfUbiCost)}</strong> of the annual cost${covered ? ' — fully funded' : ` — remaining gap $${formatCompact(fund.gapPppUsd)}`}.</div>
        </div></div>
        ${chart}
        <table class="data-quality-table mt-1">
          <thead><tr><th>Mechanism</th><th class="num">Annual revenue (PPP)</th><th class="num">Covers</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
      })(r.funding)
    : `<div class="alert alert-info no-print">
        Open <strong>Funding mechanisms</strong> above and set one or more rates to see how this
        program could be paid for — income tax, VAT, carbon tax, wealth tax, and more.
      </div>`;

  return `
  <div class="factsheet-actions no-print mt-2">
    <button type="button" class="btn btn-sm btn-secondary" data-copy="__URL__">Copy scenario link</button>
    <button type="button" class="btn btn-sm btn-secondary" data-copy="${escapeHtml(summary)}">Copy summary</button>
    <button type="button" class="btn btn-sm btn-secondary" onclick="window.print()">Print / save PDF</button>
    <a class="btn btn-sm btn-secondary" href="/countries/${escapeHtml(r.simulation.country.code)}">Full fact sheet</a>
  </div>

  <div class="pull-quote">${escapeHtml(summary.replace(' Scenario: __URL__', ''))}</div>

  <div class="grid grid-auto mb-2">
    <div class="card stat-card">
      <div class="stat-value stat-value-sm" style="font-size:1.5rem">${formatCompact(sim.recipientCount)}</div>
      <div class="stat-label">Recipients</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value stat-value-sm" style="font-size:1.5rem">$${sim.entitlementPerPerson.pppUsdPerMonth}</div>
      <div class="stat-label">Per person / month (PPP)</div>
      <div class="text-xs text-muted mt-1">${escapeHtml(r.monthlyLocalFormatted)} local</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value stat-value-sm" style="font-size:1.5rem">$${formatCompact(sim.cost.annualPppUsd)}</div>
      <div class="stat-label">Total cost, ${f.durationMonths} months (PPP)</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value stat-value-sm" style="font-size:1.5rem">${formatPercent(sim.cost.asPercentOfGdp, 2)}</div>
      <div class="stat-label">Share of GDP (PPP)</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value stat-value-sm" style="font-size:1.5rem">${r.fiscal.ubiAsPercentOfTaxRevenue != null ? formatPercent(r.fiscal.ubiAsPercentOfTaxRevenue) : '—'}</div>
      <div class="stat-label">Share of tax revenue</div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div>
      <div class="card-title">Estimated impact</div>
      <div class="card-subtitle">Model estimates for this exact program design — assumptions and sources in the drawer below.</div>
    </div></div>
    <div class="program-hero-tiles">
      ${[
        r.impact.povertyReduction.extremePoorBaseline > 0
          ? h.povertyReduction
          : { formatted: 'No data', label: 'No poverty survey exists for the country-appropriate line, so lift estimates are not modeled' },
        h.purchasingPower,
        h.socialCoverage,
        h.gdpStimulus,
      ]
        .map(
          (t) => `<div class="impact-tile">
        <div class="impact-tile-value">${escapeHtml(t.formatted)}</div>
        <div class="impact-tile-note">${escapeHtml(t.label)}</div>
      </div>`,
        )
        .join('\n')}
    </div>
    <details class="drawer mt-2">
      <summary class="drawer-summary">Assumptions behind these estimates</summary>
      <div class="drawer-body">
        <ul class="assumption-list">
          ${r.impact.policyBrief.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join('\n')}
        </ul>
      </div>
    </details>
  </div>

  ${fundingHtml}`;
}

export function renderCalculator(data: CalculatorData): string {
  const content = `
  <div class="page-header">
    <h1>Cost &amp; funding calculator</h1>
    <p>
      Design a basic income program and get its cost in fiscal context, its estimated impact,
      and a funding plan — instantly, for any of ${data.countries.length} countries. The whole scenario is
      encoded in the page URL: copy the link and anyone can reproduce your numbers.
    </p>
  </div>
  ${renderForm(data)}
  ${renderResult(data)}`;

  return publicLayout('Cost & funding calculator', content, {
    active: 'calculator',
    includeCharts: data.result != null,
    dataVersion: data.dataVersion,
    description:
      'Model what a basic income would cost in any of 49 countries — by coverage, targeting and duration — and how taxes could fund it. Shareable, reproducible results.',
  });
}
