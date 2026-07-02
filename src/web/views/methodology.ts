/**
 * Public methodology page — the transparency contract.
 *
 * Everything a researcher needs to audit the numbers, everything a
 * journalist needs to describe them accurately, and everything a policy
 * maker needs to defend them. Values are imported from the actual
 * constants so this page cannot drift from the code.
 */
import { publicLayout } from './layout.js';
import { escapeHtml } from '../../admin/views/helpers.js';
import {
  GLOBAL_INCOME_FLOOR_PPP,
  GINI_WEIGHT,
  RULESET_VERSION,
} from '../../core/constants.js';
import {
  POVERTY_LINE_EXTREME_DAILY_PPP_USD,
  POVERTY_LINE_LMIC_DAILY_PPP_USD,
  POVERTY_LINE_UMIC_DAILY_PPP_USD,
  RELATIVE_POVERTY_MEDIAN_FRACTION,
} from '../../core/poverty.js';
import { packageVersion } from '../../config.js';

const REPO_URL = 'https://github.com/richardkfm/open-global-income';

export interface MethodologyData {
  dataVersion: string;
  countryCount: number;
}

export function renderMethodology(data: MethodologyData): string {
  const citation =
    `Open Global Income v${packageVersion}, ruleset ${RULESET_VERSION}, ` +
    `data snapshot ${data.dataVersion} (World Bank, ILO, IMF). ` +
    `Open-source basic income calculation infrastructure. ${REPO_URL}`;

  const content = `
  <div class="page-header">
    <h1>Methodology</h1>
    <p>
      Every number on this site is produced by a pure, open-source function from published data.
      This page explains each model in plain language and links to the exact code and constants.
      If you disagree with an assumption, you can change it and re-run the numbers — that is the point.
    </p>
  </div>

  <section class="site-section" id="floor">
    <h2>1. The income floor: $${GLOBAL_INCOME_FLOOR_PPP}/month (PPP)</h2>
    <p class="section-lede">
      The entitlement is anchored to the <strong>World Bank upper-middle-income poverty line of
      $${POVERTY_LINE_UMIC_DAILY_PPP_USD}/day (2017 PPP)</strong>: $${POVERTY_LINE_UMIC_DAILY_PPP_USD} × 365 ÷ 12 ≈ $208, rounded to
      <strong>$${GLOBAL_INCOME_FLOOR_PPP} per person per month</strong>. It is expressed in PPP
      (purchasing-power-parity) dollars, so it represents the same basket of goods everywhere,
      and is converted to each country's currency with the World Bank PPP conversion factor
      (indicator <code class="mono">PA.NUS.PPP</code>).
    </p>
  </section>

  <section class="site-section" id="formula">
    <h2>2. The entitlement formula (ruleset ${RULESET_VERSION})</h2>
    <div class="card">
      <pre class="mono text-sm" style="white-space:pre-wrap">pppUsdPerMonth        = ${GLOBAL_INCOME_FLOOR_PPP}                        (the global floor)
localCurrencyPerMonth = pppUsdPerMonth × pppConversionFactor

incomeRatio  = ${GLOBAL_INCOME_FLOOR_PPP} / (GNI per capita / 12)
giniPenalty  = (giniIndex / 100) × ${GINI_WEIGHT}          (0 if Gini unavailable)
score        = clamp(incomeRatio + giniPenalty, 0, 1)</pre>
    </div>
    <p class="section-lede mt-1">
      The <strong>score</strong> (shown as 0–100 on this site) measures relative need: how large the
      floor is compared to what residents actually earn (GNI, not GDP), amplified by inequality —
      two countries with identical average income but different Gini coefficients score differently,
      because the floor matters more for the poorest where inequality is high. The amount itself is
      the same floor everywhere; the score is for prioritization and comparison.
      Formula source: <a href="${REPO_URL}/blob/main/src/core/rules.ts" target="_blank" rel="noopener noreferrer"><code class="mono">src/core/rules.ts</code></a>
      · <a href="${REPO_URL}/blob/main/RULESET_V1.md" target="_blank" rel="noopener noreferrer">RULESET_V1.md</a>.
    </p>
  </section>

  <section class="site-section" id="simulation">
    <h2>3. Program cost</h2>
    <div class="card">
      <pre class="mono text-sm" style="white-space:pre-wrap">recipients   = population × targetGroupFraction × coverage
annualCost   = recipients × monthlyAmount × 12       (PPP-USD)
% of GDP     = annualCost / (GDP per capita, PPP × population)</pre>
    </div>
    <p class="section-lede mt-1">
      Costs are denominated in PPP-USD because the floor is, and are therefore divided by
      <strong>PPP GDP</strong> (indicator <code class="mono">NY.GDP.PCAP.PP.CD</code>) — never nominal GDP —
      so the numerator and denominator share units. Mixing them would overstate the burden for
      lower-income countries by roughly the PPP gap. Target-group fractions (poorest 10/20/33/50%)
      scale the eligible population; administrative costs are not included.
    </p>
  </section>

  <section class="site-section" id="poverty-lines">
    <h2>4. Country-appropriate poverty lines</h2>
    <p class="section-lede">
      Using one global line everywhere produces nonsense — by the $${POVERTY_LINE_EXTREME_DAILY_PPP_USD}/day line, Germany has
      no poverty. Poverty figures on this site therefore use a tiered ladder, per country income group:
    </p>
    <div class="data-table-container">
      <table class="data-table">
        <thead><tr><th>Income group</th><th>Poverty line</th><th>Standard</th></tr></thead>
        <tbody>
          <tr><td>High income</td><td>${RELATIVE_POVERTY_MEDIAN_FRACTION * 100}% of median income</td><td>OECD / Eurostat at-risk-of-poverty</td></tr>
          <tr><td>Upper-middle</td><td>$${POVERTY_LINE_UMIC_DAILY_PPP_USD}/day (2017 PPP)</td><td>World Bank <code class="mono">SI.POV.UMIC</code></td></tr>
          <tr><td>Lower-middle</td><td>$${POVERTY_LINE_LMIC_DAILY_PPP_USD}/day (2017 PPP)</td><td>World Bank <code class="mono">SI.POV.LMIC</code></td></tr>
          <tr><td>Low income</td><td>$${POVERTY_LINE_EXTREME_DAILY_PPP_USD}/day (2017 PPP)</td><td>World Bank <code class="mono">SI.POV.DDAY</code> (extreme)</td></tr>
        </tbody>
      </table>
    </div>
    <p class="text-sm text-muted mt-1">
      Each figure carries a data-quality flag (high / medium / low) reflecting whether a matching
      survey headcount exists. Source: <a href="${REPO_URL}/blob/main/src/core/poverty.ts" target="_blank" rel="noopener noreferrer"><code class="mono">src/core/poverty.ts</code></a>.
    </p>
  </section>

  <section class="site-section" id="funding">
    <h2>5. Funding mechanisms</h2>
    <p class="section-lede">
      Seven revenue calculators estimate what a given tax or reallocation would raise: income tax
      surcharge, VAT increase, carbon tax, wealth tax, financial transaction tax, automation tax,
      and redirected social spending. Each applies documented behavioural discounts and
      income-group proxies (e.g. a 20% VAT demand response, wealth-tax collection factors that
      account for avoidance, formal-economy shares for income tax). Every estimate returns its
      assumption list, which is displayed wherever the number appears.
      Source: <a href="${REPO_URL}/blob/main/src/core/funding.ts" target="_blank" rel="noopener noreferrer"><code class="mono">src/core/funding.ts</code></a>.
    </p>
  </section>

  <section class="site-section" id="impact">
    <h2>6. Impact estimates</h2>
    <p class="section-lede">
      Five modeled dimensions: poverty reduction (income-gap method against the country-appropriate
      line), purchasing power for the poorest quintile (income-share estimates from Gini),
      social-protection coverage gaps (ILO coverage data), GDP stimulus (income-group-calibrated
      cash-transfer fiscal multipliers), and potential fiscal cost savings (healthcare,
      administration, criminal justice — deliberately conservative and gated on transfer adequacy).
      These are <strong>model outputs, not measurements</strong>: they come with explicit assumption
      lists, data-quality flags, and citations on every page. The full model documentation is in
      <a href="${REPO_URL}/blob/main/IMPACT_METHODOLOGY.md" target="_blank" rel="noopener noreferrer">IMPACT_METHODOLOGY.md</a>.
    </p>
  </section>

  <section class="site-section" id="data-sources">
    <h2>7. Data sources</h2>
    <p class="section-lede">
      ${data.countryCount} countries, 17+ indicators each, current snapshot <strong>${escapeHtml(data.dataVersion)}</strong>:
    </p>
    <ul class="assumption-list">
      <li><strong>World Bank</strong> — GDP, GNI, PPP conversion factors, Gini, population, poverty headcounts, fiscal and labor indicators (World Development Indicators API)</li>
      <li><strong>ILO</strong> — social protection coverage and expenditure (Social Protection Data Dashboard)</li>
      <li><strong>IMF</strong> — tax revenue breakdowns (Government Finance Statistics)</li>
      <li><strong>National statistics bureaus</strong> — sub-national cost-of-living indices (currently Kenya, 47 counties)</li>
    </ul>
    <p class="text-sm text-muted">
      Snapshots are versioned and checked into the repository, so any historical figure can be
      reproduced exactly. Download the current dataset: <a href="/data/countries.csv">CSV</a> ·
      <a href="/data/countries.json">JSON</a>.
    </p>
  </section>

  <section class="site-section" id="limitations">
    <h2>8. What these numbers are not</h2>
    <ul class="assumption-list">
      <li>They are <strong>static estimates</strong> — no behavioural responses to the transfer itself (labor supply, prices, migration) are modeled.</li>
      <li>Administrative and delivery costs are excluded (well-run cash transfer programs add roughly 5–15%).</li>
      <li>Funding-mechanism yields use income-group proxies where country data is missing — the assumption list on each estimate says exactly when.</li>
      <li>Impact figures are model projections. Measured pilot outcomes belong to the platform's evidence layer, which is a separate, clearly-labeled dataset.</li>
      <li>Data vintages vary by indicator; each country fact sheet shows its snapshot identifier.</li>
    </ul>
  </section>

  <section class="site-section" id="citing">
    <h2>9. Citing these figures</h2>
    <p class="section-lede">
      Cite the platform version and data snapshot — both appear on every page, and every fact
      sheet has a copy-ready citation for its own figures.
    </p>
    <div class="citation-box">${escapeHtml(citation)}</div>
    <p class="text-sm text-muted mt-1">
      For fully reproducible pipelines, use the <a href="/docs" target="_blank" rel="noopener">REST API</a> or the versioned
      snapshots in the <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">repository</a>.
    </p>
  </section>`;

  return publicLayout('Methodology', content, {
    active: 'methodology',
    dataVersion: data.dataVersion,
    description:
      'How Open Global Income calculates basic income entitlements, costs, funding and impact — every formula, constant, assumption and data source, fully open.',
  });
}
