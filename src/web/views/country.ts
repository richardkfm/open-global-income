/**
 * Public country fact sheet.
 *
 * One page per country with everything an advocate needs to make the case:
 * the entitlement and its formula, the cost of universal coverage in fiscal
 * context, targeted program options, funding mechanisms, poverty impact
 * estimates, and a copy-ready citation. Print-friendly (Print → PDF gives
 * a briefing document).
 */
import { publicLayout } from './layout.js';
import {
  escapeHtml,
  formatCompact,
  formatNumber,
  formatPercent,
  renderCitations,
} from '../../admin/views/helpers.js';
import { horizontalBarChart } from '../../admin/views/chart-helpers.js';
import { GLOBAL_INCOME_FLOOR_PPP, GINI_WEIGHT } from '../../core/constants.js';
import type {
  Country,
  FiscalContext,
  FundingScenarioResult,
  GlobalIncomeEntitlement,
  ImpactAnalysisResult,
  Region,
  SimulationResult,
} from '../../core/types.js';
import type { CountryPovertyLine } from '../../core/poverty.js';

/** Validated chart hue (dataviz reference palette, slot 1) */
const CHART_BLUE = '#2a78d6';

export interface TargetedOption {
  label: string;
  recipients: number;
  annualPppUsd: number;
  percentGdp: number;
}

export interface CountryFactSheetData {
  country: Country;
  dataVersion: string;
  appVersion: string;
  entitlement: GlobalIncomeEntitlement;
  /** Monthly floor formatted in local currency, e.g. "KSh 10,458" */
  monthlyLocalFormatted: string;
  povertyLine: CountryPovertyLine;
  /** Universal coverage, 12 months */
  universal: SimulationResult;
  fiscal: FiscalContext;
  impact: ImpactAnalysisResult;
  funding: FundingScenarioResult;
  targetedOptions: TargetedOption[];
  regions: Region[];
  /** ISO date the page was generated (for the citation block) */
  generatedDate: string;
  /** Absolute URL of this page, derived from the request */
  pageUrl: string;
}

const INCOME_GROUP_LABEL: Record<string, string> = {
  HIC: 'High income',
  UMC: 'Upper-middle income',
  LMC: 'Lower-middle income',
  LIC: 'Low income',
};

/** The quotable summary paragraph — plain text so it can be copied verbatim. */
export function buildSummaryParagraph(data: CountryFactSheetData): string {
  const { country, universal, fiscal, impact, povertyLine } = data;
  const cost = universal.simulation.cost;
  const lifted = impact.povertyReduction.estimatedLifted;
  const poor = impact.povertyReduction.extremePoorBaseline;

  let sentence =
    `A universal basic income of $${universal.simulation.entitlementPerPerson.pppUsdPerMonth} per month ` +
    `(PPP; ${data.monthlyLocalFormatted} in local currency) for all ${formatCompact(country.stats.population)} ` +
    `people in ${country.name} would cost $${formatCompact(cost.annualPppUsd)} PPP per year — ` +
    `${cost.asPercentOfGdp.toFixed(1)}% of GDP`;
  if (fiscal.ubiAsPercentOfTaxRevenue != null) {
    sentence += `, or ${fiscal.ubiAsPercentOfTaxRevenue.toFixed(0)}% of current tax revenue`;
  }
  sentence += '.';
  if (poor > 0 && lifted > 0) {
    sentence +=
      ` It is estimated to lift ${formatCompact(lifted)} of the ${formatCompact(poor)} people ` +
      `living below the country's poverty line (${povertyLine.label}) above it.`;
  }
  sentence +=
    ` Source: Open Global Income v${data.appVersion}, data snapshot ${data.dataVersion} (World Bank / ILO / IMF).`;
  return sentence;
}

function statTile(value: string, label: string, note?: string): string {
  return `<div class="card stat-card">
    <div class="stat-value stat-value-sm" style="font-size:1.5rem">${value}</div>
    <div class="stat-label">${escapeHtml(label)}</div>
    ${note ? `<div class="text-xs text-muted mt-1">${escapeHtml(note)}</div>` : ''}
  </div>`;
}

function fiscalChart(data: CountryFactSheetData): string {
  const bars: Array<{ label: string; value: number }> = [
    { label: 'Universal basic income (annual cost)', value: data.universal.simulation.cost.asPercentOfGdp },
  ];
  if (data.fiscal.totalTaxRevenue.percentGdp != null) {
    bars.push({ label: 'Current tax revenue', value: data.fiscal.totalTaxRevenue.percentGdp });
  }
  if (data.fiscal.currentSocialSpending.percentGdp != null) {
    bars.push({ label: 'Current social protection spending', value: data.fiscal.currentSocialSpending.percentGdp });
  }
  if (bars.length < 2) return '';

  const chart = horizontalBarChart(
    bars.map((b) => b.label),
    [{ label: '% of GDP (PPP)', data: bars.map((b) => Math.round(b.value * 10) / 10), backgroundColor: CHART_BLUE }],
    {
      height: 60 + bars.length * 44,
      exportFilename: `ogi-${data.country.code.toLowerCase()}-fiscal-context`,
      chartOptions: {
        plugins: { legend: { display: false } },
        scales: { x: { title: { display: true, text: '% of GDP (PPP)' } } },
      },
    },
  );

  // Direct-label fallback table keeps the figures readable without JS/color.
  const tableRows = bars
    .map((b) => `<tr><td>${escapeHtml(b.label)}</td><td class="num">${formatPercent(b.value)}</td></tr>`)
    .join('');

  return `<div class="card">
    <div class="card-header">
      <div>
        <div class="card-title">Would it fit in the budget?</div>
        <div class="card-subtitle">Annual universal UBI cost next to the country's existing fiscal aggregates — all as % of PPP GDP, so the units match.</div>
      </div>
    </div>
    ${chart}
    <table class="data-quality-table mt-1"><tbody>${tableRows}</tbody></table>
  </div>`;
}

function targetedOptionsTable(options: TargetedOption[]): string {
  const rows = options
    .map(
      (o) => `<tr>
      <td>${escapeHtml(o.label)}</td>
      <td class="num">${formatCompact(o.recipients)}</td>
      <td class="num">$${formatCompact(o.annualPppUsd)}</td>
      <td class="num">${formatPercent(o.percentGdp)}</td>
    </tr>`,
    )
    .join('\n');
  return `<div class="data-table-container">
    <table class="data-table">
      <thead><tr>
        <th>Program design</th><th class="num">Recipients</th>
        <th class="num">Annual cost (PPP)</th><th class="num">% of GDP</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function impactSection(impact: ImpactAnalysisResult): string {
  const h = impact.policyBrief.headline;
  // No survey headcount for the country-appropriate line → the poverty model
  // has no baseline. Say "no data" instead of a misleading "0 people".
  const povertyTile =
    impact.povertyReduction.extremePoorBaseline > 0
      ? h.povertyReduction
      : {
          formatted: 'No data',
          label: `No poverty survey exists for the country-appropriate line (${impact.povertyReduction.povertyLineLabel}), so lift estimates are not modeled`,
        };
  const tiles = [povertyTile, h.purchasingPower, h.socialCoverage, h.gdpStimulus, h.costSavings]
    .map(
      (t) => `<div class="impact-tile">
      <div class="impact-tile-value">${escapeHtml(t.formatted)}</div>
      <div class="impact-tile-note">${escapeHtml(t.label)}</div>
    </div>`,
    )
    .join('\n');

  const assumptions = impact.policyBrief.assumptions
    .map((a) => `<li>${escapeHtml(a)}</li>`)
    .join('\n');
  const caveats = impact.policyBrief.caveats.map((c) => `<li>${escapeHtml(c)}</li>`).join('\n');

  return `<section class="site-section" id="impact">
    <h2>What would it change?</h2>
    <p class="section-lede">
      Modeled estimates for a universal program, using the country-appropriate poverty line
      (${escapeHtml(impact.povertyReduction.povertyLineLabel)}). These are transparent model outputs,
      not pilot measurements — every assumption is listed below.
    </p>
    <div class="program-hero-tiles mb-2">${tiles}</div>
    <details class="drawer">
      <summary class="drawer-summary">Every assumption behind these estimates</summary>
      <div class="drawer-body">
        <div class="drawer-title">Assumptions</div>
        <ul class="assumption-list">${assumptions}</ul>
        <div class="drawer-title mt-2">Caveats</div>
        <ul class="assumption-list">${caveats}</ul>
        <div class="drawer-title mt-2">Citations</div>
        ${renderCitations(impact.policyBrief.citations)}
      </div>
    </details>
  </section>`;
}

/**
 * Below this coverage threshold, the shortfall isn't a tax-policy problem —
 * even a maxed-out, realistic mix of domestic mechanisms can't close a gap
 * this large. That happens when the universal $/month floor times the
 * population approaches or exceeds the country's own GDP, which is common
 * for the lowest-income countries. Surface that explicitly instead of
 * leaving readers to wonder why the mix "only" gets partway there.
 */
const LOW_DOMESTIC_COVERAGE_THRESHOLD = 30;

function fundingSection(funding: FundingScenarioResult, countryCode: string): string {
  const solidarity = funding.mechanisms.find((m) => m.mechanism === 'international_solidarity_transfer');
  const rows = funding.mechanisms
    .map((m) => {
      const pct = Math.min(100, m.coversPercentOfUbiCost);
      const isSolidarity = m.mechanism === 'international_solidarity_transfer';
      return `<tr${isSolidarity ? ' class="funding-row-solidarity"' : ''}>
      <td>${escapeHtml(m.label)}</td>
      <td class="num">$${formatCompact(m.annualRevenuePppUsd)}</td>
      <td style="width:40%">
        <div class="flex-center gap-1">
          <div class="progress-bar" style="flex:1"><div class="progress-bar-fill-primary progress-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <span class="text-sm text-bold" style="min-width:3.5rem;text-align:right">${formatPercent(m.coversPercentOfUbiCost)}</span>
        </div>
      </td>
    </tr>`;
    })
    .join('\n');

  return `<section class="site-section" id="funding">
    <h2>Where could the money come from?</h2>
    <p class="section-lede">
      A recommended mix, not one mechanism maxed out: each rate below is sized to
      ${escapeHtml(funding.country.name)}'s own economic profile — how formal its labor market is, how
      much it already collects from VAT, how concentrated its wealth is, how much social spending
      exists to redirect — so mechanisms poorly suited to this economy stay small or drop out
      entirely. The seven domestic mechanisms together target
      <strong>${formatPercent(funding.domesticCoveragePercent)}</strong> of the cost domestically${
        solidarity
          ? `; the remaining <strong>${formatPercent(solidarity.coversPercentOfUbiCost)}</strong>
      (≈$${formatCompact(solidarity.annualRevenuePppUsd)}/year) is shown below as a pooled
      international solidarity transfer rather than an unlabeled gap`
          : ''
      }.
      Adjust every rate in the <a href="/calculator?country=${escapeHtml(countryCode)}">calculator</a>.
    </p>
    ${
      funding.domesticCoveragePercent < LOW_DOMESTIC_COVERAGE_THRESHOLD
        ? `<div class="alert alert-info">
      This isn't a tax-rate problem: universal coverage for ${escapeHtml(funding.country.name)} costs
      $${formatCompact(funding.ubiCost.annualPppUsd)}/year, ${formatPercent(funding.ubiCost.asPercentOfGdp)} of
      the country's own PPP GDP — even every domestic mechanism above at its realistic ceiling can't
      close a gap that size from domestic revenue alone. That's typical for the lowest-income countries;
      the pooled international solidarity transfer row below quantifies the resulting external-funding
      requirement (aid, DAO or NGO transfers, or a rules-based donor pool modeled on EU cohesion funds
      and the IMF's Poverty Reduction and Growth Trust) rather than leaving it as a silent shortfall.
      A <a href="#options">narrower coverage target</a> is the other lever available.
    </div>`
        : ''
    }
    <div class="data-table-container">
      <table class="data-table">
        <thead><tr><th>Mechanism</th><th class="num">Annual revenue (PPP)</th><th>Covers</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function formulaDrawer(data: CountryFactSheetData): string {
  const s = data.country.stats;
  const monthlyGni = s.gniPerCapitaUsd / 12;
  const incomeRatio = monthlyGni > 0 ? GLOBAL_INCOME_FLOOR_PPP / monthlyGni : 1;
  const giniPenalty = s.giniIndex !== null ? (s.giniIndex / 100) * GINI_WEIGHT : 0;
  return `<details class="drawer">
    <summary class="drawer-summary">How these figures are calculated — with ${escapeHtml(data.country.name)}'s numbers plugged in</summary>
    <div class="drawer-body">
      <div class="drawer-title">Entitlement (Ruleset v1)</div>
      <p class="text-sm">
        The floor is fixed at <strong>$${GLOBAL_INCOME_FLOOR_PPP} PPP-USD/month</strong> for everyone
        (from the World Bank $6.85/day upper-middle-income poverty line). Converting to local currency:
      </p>
      <p class="mono text-sm mt-1">
        ${GLOBAL_INCOME_FLOOR_PPP} × ${s.pppConversionFactor} (PPP conversion factor) = ${formatNumber(data.entitlement.localCurrencyPerMonth, 'en-US', 2)} per month
      </p>
      <div class="drawer-title mt-2">Need score</div>
      <p class="mono text-sm">
        incomeRatio = ${GLOBAL_INCOME_FLOOR_PPP} / (${formatNumber(s.gniPerCapitaUsd)} / 12) = ${incomeRatio.toFixed(3)}<br>
        giniPenalty = ${s.giniIndex !== null ? `(${s.giniIndex} / 100) × ${GINI_WEIGHT} = ${giniPenalty.toFixed(3)}` : '0 (no Gini data)'}<br>
        score = clamp(incomeRatio + giniPenalty, 0, 1) = ${data.entitlement.score}
      </p>
      <div class="drawer-title mt-2">Universal annual cost</div>
      <p class="mono text-sm">
        ${formatCompact(s.population)} people × $${GLOBAL_INCOME_FLOOR_PPP} × 12 months = $${formatCompact(data.universal.simulation.cost.annualPppUsd)} PPP<br>
        ÷ PPP GDP ($${formatCompact(s.gdpPerCapitaPppUsd * s.population)}) = ${data.universal.simulation.cost.asPercentOfGdp.toFixed(1)}% of GDP
      </p>
      <p class="text-xs text-muted mt-1">Full derivations, constants and source code: <a href="/methodology">methodology</a>.</p>
    </div>
  </details>`;
}

function regionsSection(regions: Region[], countryName: string): string {
  if (regions.length === 0) return '';
  const rows = regions
    .slice()
    .sort((a, b) => b.stats.population - a.stats.population)
    .slice(0, 10)
    .map(
      (r) => `<tr>
      <td>${escapeHtml(r.name)}</td>
      <td class="num">${formatCompact(r.stats.population)}</td>
      <td>${escapeHtml(r.stats.urbanRural)}</td>
      <td class="num">${r.stats.costOfLivingIndex.toFixed(2)}×</td>
    </tr>`,
    )
    .join('\n');
  return `<section class="site-section" id="regions">
    <h2>Regional precision</h2>
    <p class="section-lede">
      ${escapeHtml(countryName)} has sub-national data for ${regions.length} regions, so entitlements can be
      adjusted for local cost of living (1.00× = national average). The ${regions.length > 10 ? 'ten largest are' : 'regions are'} shown here;
      regional calculations are available through the <a href="/docs" target="_blank" rel="noopener">API</a>.
    </p>
    <div class="data-table-container">
      <table class="data-table">
        <thead><tr><th>Region</th><th class="num">Population</th><th>Type</th><th class="num">Cost-of-living index</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

export function renderCountryFactSheet(data: CountryFactSheetData): string {
  const { country, universal, fiscal, impact } = data;
  const cost = universal.simulation.cost;
  const summary = buildSummaryParagraph(data);
  const citation =
    `Open Global Income v${data.appVersion} — ${country.name} basic income fact sheet. ` +
    `Ruleset ${data.entitlement.meta.rulesetVersion}, data snapshot ${data.dataVersion} ` +
    `(World Bank, ILO, IMF). Retrieved ${data.generatedDate} from ${data.pageUrl}`;

  // Prefer the country-appropriate line; fall back to the global $2.15/day
  // extreme-poverty headcount when no matching survey exists — labeled as such.
  const countryLineRate = data.povertyLine.headcountRatioPercent;
  const extremeRate = country.stats.povertyHeadcountRatio;
  const povertyTileValue =
    countryLineRate != null
      ? formatPercent(countryLineRate)
      : extremeRate != null
        ? formatPercent(extremeRate)
        : '—';
  const povertyTileNote =
    countryLineRate != null
      ? data.povertyLine.label
      : extremeRate != null
        ? '$2.15/day extreme poverty line (no survey exists for the country-appropriate line)'
        : 'No poverty survey data available';

  const content = `
  <div class="factsheet-header">
    <div class="factsheet-kicker">Basic income fact sheet</div>
    <h1 class="factsheet-title">${escapeHtml(country.name)}</h1>
    <div class="factsheet-meta">
      <span class="badge badge-${country.stats.incomeGroup.toLowerCase()}">${INCOME_GROUP_LABEL[country.stats.incomeGroup] ?? country.stats.incomeGroup}</span>
      <span>Population ${formatCompact(country.stats.population)}</span>
      <span>Data snapshot ${escapeHtml(data.dataVersion)}</span>
    </div>
    <div class="factsheet-actions no-print">
      <a href="/calculator?country=${escapeHtml(country.code)}" class="btn btn-sm btn-primary">Open in calculator</a>
      <button type="button" class="btn btn-sm btn-secondary" onclick="window.print()">Print / save PDF</button>
      <button type="button" class="btn btn-sm btn-secondary" data-copy="${escapeHtml(summary)}">Copy summary paragraph</button>
      <button type="button" class="btn btn-sm btn-secondary" data-copy="${escapeHtml(citation)}">Copy citation</button>
      <button type="button" class="btn btn-sm btn-secondary" data-copy="__URL__">Copy link</button>
    </div>
  </div>

  <div class="pull-quote">${escapeHtml(summary)}</div>

  <div class="grid grid-auto mb-2">
    ${statTile(`$${universal.simulation.entitlementPerPerson.pppUsdPerMonth}`, 'Global anchor — per person / month (PPP-USD)', `${data.monthlyLocalFormatted} in local currency. Fixed everywhere for comparability.`)}
    ${statTile(`$${data.entitlement.adequacyEstimate.monthlyPppUsd.toFixed(0)}`, `Local adequacy estimate (${data.country.name})`, data.entitlement.adequacyEstimate.label)}
    ${statTile(`$${formatCompact(cost.annualPppUsd)}`, 'Universal program, annual cost (PPP)', `${formatCompact(universal.simulation.recipientCount)} recipients`)}
    ${statTile(formatPercent(cost.asPercentOfGdp), 'Share of GDP (PPP)', 'Cost and GDP in matching PPP units')}
    ${statTile(
      fiscal.ubiAsPercentOfTaxRevenue != null ? formatPercent(fiscal.ubiAsPercentOfTaxRevenue, 0) : '—',
      'Share of current tax revenue',
      fiscal.ubiAsPercentOfTaxRevenue == null ? 'No tax revenue data for this country' : undefined,
    )}
    ${statTile(povertyTileValue, countryLineRate != null ? 'Poverty rate (country line)' : 'Poverty rate (extreme line)', povertyTileNote)}
  </div>
  <p class="text-sm text-muted mb-2">
    Two different numbers, on purpose: the <strong>global anchor</strong> is fixed everywhere so
    programs stay comparable; the <strong>local adequacy estimate</strong> answers "enough to live on
    here" and is informational only — it is never used to compute the entitlement above. See
    <a href="/methodology#adequacy">Methodology</a> for why, and set it as a suggested override in the
    <a href="/calculator?country=${escapeHtml(country.code)}">calculator</a>.
  </p>

  ${fiscalChart(data)}

  <section class="site-section" id="options">
    <h2>Universal isn't the only option</h2>
    <p class="section-lede">
      The same $${GLOBAL_INCOME_FLOOR_PPP}/month floor at different targeting levels — how policy makers
      typically phase programs in. Model any coverage rate, duration or transfer amount in the
      <a href="/calculator?country=${escapeHtml(country.code)}">calculator</a>.
    </p>
    ${targetedOptionsTable(data.targetedOptions)}
  </section>

  ${impactSection(impact)}

  ${fundingSection(data.funding, country.code)}

  ${regionsSection(data.regions, country.name)}

  <section class="site-section" id="sources">
    <h2>Verify these numbers</h2>
    ${formulaDrawer(data)}
    <div class="two-col mt-2">
      <div>
        <div class="section-title">Cite this page</div>
        <div class="citation-box">${escapeHtml(citation)}</div>
      </div>
      <div>
        <div class="section-title">Reproduce it</div>
        <ul class="assumption-list">
          <li>Machine-readable: <a href="/data/countries.json">countries.json</a> · <a href="/data/countries.csv">countries.csv</a></li>
          <li>Live API: <code class="mono">GET /v1/income/calc?country=${escapeHtml(country.code)}</code> — <a href="/docs" target="_blank" rel="noopener">API reference</a></li>
          <li><a href="/methodology">Methodology</a> — every formula, constant and assumption</li>
          <li><a href="https://github.com/richardkfm/open-global-income" target="_blank" rel="noopener noreferrer">Source code on GitHub</a></li>
        </ul>
      </div>
    </div>
  </section>`;

  return publicLayout(`${country.name} — basic income fact sheet`, content, {
    active: 'countries',
    includeCharts: true,
    dataVersion: data.dataVersion,
    description: summary.slice(0, 300),
  });
}
