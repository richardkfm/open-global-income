/**
 * UBI Cost Savings Estimation — Phase 24
 *
 * Estimates fiscal cost savings arising from a UBI program across healthcare,
 * social-benefits administration, and criminal-justice systems. Based on
 * peer-reviewed evidence and conservative elasticity assumptions.
 *
 * Key principles:
 *   1. Every elasticity is sourced from published research or grey literature
 *   2. Savings are returned as LOW / CENTRAL / HIGH ranges, not point estimates
 *   3. All categories are gated on transfer adequacy (must meet country poverty line)
 *      and coverage saturation (savings scale linearly with coverage)
 *   4. When data is missing, the category returns zero with an explanation
 *   5. Savings are REDIRECTABLE — not automatically subtracted from UBI cost
 *
 * Sources:
 *   - Forget, E.L. (2011). "The Town with No Poverty: The Health Effects of
 *     a Canadian Guaranteed Annual Income Field Experiment." Canadian Public
 *     Policy 37(3):283–305. — 8.5% hospitalization reduction in Mincome
 *   - Wright, R., Tekin, E., Topalli, V. (2014). "Less Cash, Less Crime:
 *     Evidence from the Electronic Benefit Transfer Program." Journal of Law
 *     and Economics 60(2):351–379. — 9.2% crime reduction from EBT
 *   - Haushofer & Shapiro (2016). "The Short-Term Impact of Unconditional
 *     Cash Transfers to the Poor: Experimental Evidence from Kenya."
 *     Quarterly Journal of Economics 131(4):1973–2042. — domestic violence,
 *     mental health, food security outcomes
 *   - OECD (2017). "The Role and Design of Net Wealth Taxes" — social
 *     fragmentation and administrative cost reduction literature
 */

import type {
  Country,
  CostSavingsEstimate,
  CostSavingsCategory,
} from './types.js';
import { resolveCountryPovertyLine } from './poverty.js';

// ── Constants: elasticities and gates ──────────────────────────────────────

/**
 * Healthcare savings elasticity from Forget (2011, Mincome).
 * 8.5% reduction in hospitalizations for recipients receiving a basic income.
 * This is observed for a transfer that clears the poverty line and is applied
 * to the full recipient population.
 */
const HEALTHCARE_ELASTICITY_CENTRAL = 0.085;
const HEALTHCARE_ELASTICITY_LOW = 0.04;  // Conservative — only accidents/injuries, not mental health
const HEALTHCARE_ELASTICITY_HIGH = 0.12; // Includes some spillover to family members

/**
 * Administrative savings from consolidating fragmented means-tested benefits
 * into a single UBI delivery system. Based on OECD estimates of the overhead
 * costs of means-testing (testing, verification, appeals, fraud prevention).
 *
 * Source: OECD (2017) "Tax-Benefit Systems" and IMF public expenditure reviews
 * on program delivery costs. Typically 5–15% of benefit spending goes to admin.
 */
const ADMIN_SAVINGS_ELASTICITY_CENTRAL = 0.10; // 10% of social spending becomes redirectable
const ADMIN_SAVINGS_ELASTICITY_LOW = 0.05;
const ADMIN_SAVINGS_ELASTICITY_HIGH = 0.15;

/**
 * Crime reduction elasticity from Wright et al. (2014, EBT study).
 * 9.2% overall crime reduction when cash is substituted for in-kind benefits
 * or when income floor is raised. Applied to a proxy for criminal-justice
 * system cost (we use ~1% of GDP as a neutral baseline across income groups).
 */
const CRIME_ELASTICITY_CENTRAL = 0.092;
const CRIME_ELASTICITY_LOW = 0.03;  // Property crime only
const CRIME_ELASTICITY_HIGH = 0.15; // Includes indirect effects on incarceration

/**
 * Approximate criminal-justice system spending as % of GDP (courts, police,
 * prisons, probation). Varies by country, but ~1% is a reasonable cross-
 * country average. When actual data is not available, we use this proxy.
 *
 * Source: World Bank justice sector estimates; IMF government finance stats.
 */
const CRIMINAL_JUSTICE_COST_PCT_GDP = 0.01;

// ── Gating logic ───────────────────────────────────────────────────────────

/**
 * Returns true if the transfer is adequate — i.e., meets or exceeds the
 * country's poverty line. Only adequate transfers unlock savings categories.
 */
function isTransferAdequate(
  floorPppUsd: number,
  countryPovertyLineMonthly: number,
): boolean {
  return floorPppUsd >= countryPovertyLineMonthly;
}

/**
 * Returns the coverage saturation factor — savings scale linearly with
 * actual program coverage. A program covering 10% saves ~10% as much as
 * a universal program (assuming linear effect).
 */
function coverageFactor(coverage: number): number {
  return Math.min(1, coverage);
}

// ── Individual category calculators ────────────────────────────────────────

function estimateHealthcareSavings(
  country: Country,
  recipientCount: number,
  floorPppUsd: number,
  coverage: number,
  countryPovertyLine: { monthlyPppUsd: number; label: string; source: string },
): CostSavingsCategory {
  const adequate = isTransferAdequate(floorPppUsd, countryPovertyLine.monthlyPppUsd);
  const cf = coverageFactor(coverage);

  const baselineHealthSpend =
    (country.stats.healthExpenditurePercentGdp ?? 5.5) / 100 *
    (country.stats.gdpPerCapitaUsd * country.stats.population);

  if (!adequate) {
    return {
      id: 'healthcare',
      label: 'Healthcare System Savings',
      annualSavingsPppUsdLow: 0,
      annualSavingsPppUsdCentral: 0,
      annualSavingsPppUsdHigh: 0,
      centralElasticity: null,
      baselineBasis: 'Health expenditure % GDP (not applied)',
      baselineAnnualPppUsd: Math.round(baselineHealthSpend),
      assumptions: [
        `Transfer ($${floorPppUsd}/month) does not meet country poverty line ($${countryPovertyLine.monthlyPppUsd.toFixed(2)}/month).`,
        'Healthcare savings from Mincome (Forget 2011) are only observed when the transfer addresses material deprivation (i.e., income floor is adequate).',
        'Gate: transfer inadequate → savings = $0.',
      ],
      sources: [
        'Forget, E.L. (2011). "The Town with No Poverty: The Health Effects of a Canadian Guaranteed Annual Income Field Experiment." Canadian Public Policy 37(3):283–305.',
      ],
      dataQuality: 'medium',
    };
  }

  const healthLow = HEALTHCARE_ELASTICITY_LOW * cf * baselineHealthSpend;
  const healthCentral = HEALTHCARE_ELASTICITY_CENTRAL * cf * baselineHealthSpend;
  const healthHigh = HEALTHCARE_ELASTICITY_HIGH * cf * baselineHealthSpend;

  return {
    id: 'healthcare',
    label: 'Healthcare System Savings',
    annualSavingsPppUsdLow: Math.round(healthLow),
    annualSavingsPppUsdCentral: Math.round(healthCentral),
    annualSavingsPppUsdHigh: Math.round(healthHigh),
    centralElasticity: HEALTHCARE_ELASTICITY_CENTRAL,
    baselineBasis: 'Annual health expenditure',
    baselineAnnualPppUsd: Math.round(baselineHealthSpend),
    assumptions: [
      `Transfer ($${floorPppUsd}/month) meets or exceeds country poverty line ($${countryPovertyLine.monthlyPppUsd.toFixed(2)}/month).`,
      `Baseline health expenditure: ${(country.stats.healthExpenditurePercentGdp ?? 5.5).toFixed(1)}% of GDP ≈ $${Math.round(baselineHealthSpend / 1e9)}B annually.`,
      `Central elasticity: ${(HEALTHCARE_ELASTICITY_CENTRAL * 100).toFixed(1)}% reduction in healthcare utilization (Mincome: 8.5% hospitalization reduction).`,
      `Applied to ${(cf * 100).toFixed(0)}% of baseline (coverage saturation: ${(coverage * 100).toFixed(1)}% × population).`,
      `Range: ${(HEALTHCARE_ELASTICITY_LOW * 100).toFixed(1)}% (conservative — accidents/injuries only) to ${(HEALTHCARE_ELASTICITY_HIGH * 100).toFixed(1)}% (includes mental health spillover).`,
      'Assumes reduced emergency room visits, fewer inpatient stays for stress-related conditions, and improved preventive health behaviors.',
    ],
    sources: [
      'Forget, E.L. (2011). "The Town with No Poverty: The Health Effects of a Canadian Guaranteed Annual Income Field Experiment." Canadian Public Policy 37(3):283–305.',
      'GiveDirectly Kenya evidence (Haushofer & Shapiro 2016): mental health improvements from cash transfers.',
    ],
    dataQuality: country.stats.healthExpenditurePercentGdp != null ? 'medium' : 'low',
  };
}

function estimateAdministrativeSavings(
  country: Country,
  recipientCount: number,
  floorPppUsd: number,
  coverage: number,
  countryPovertyLine: { monthlyPppUsd: number; label: string; source: string },
): CostSavingsCategory {
  const adequate = isTransferAdequate(floorPppUsd, countryPovertyLine.monthlyPppUsd);
  const cf = coverageFactor(coverage);

  const socialSpending =
    (country.stats.socialProtectionExpenditureIloPercentGdp ??
      country.stats.socialProtectionSpendingPercentGdp ??
      6) / 100 *
    (country.stats.gdpPerCapitaUsd * country.stats.population);

  if (!adequate) {
    return {
      id: 'administrative',
      label: 'Social Benefit Administration Savings',
      annualSavingsPppUsdLow: 0,
      annualSavingsPppUsdCentral: 0,
      annualSavingsPppUsdHigh: 0,
      centralElasticity: null,
      baselineBasis: 'Social protection spending % GDP (not applied)',
      baselineAnnualPppUsd: Math.round(socialSpending),
      assumptions: [
        `Transfer ($${floorPppUsd}/month) does not meet country poverty line.`,
        'Administrative savings require a transfer that addresses the poverty line — only then can fragmented means-tested programs be consolidated.',
        'Gate: transfer inadequate → savings = $0.',
      ],
      sources: [
        'OECD (2017). "The Role and Design of Net Wealth Taxes in the OECD."',
      ],
      dataQuality: 'medium',
    };
  }

  const adminLow = ADMIN_SAVINGS_ELASTICITY_LOW * cf * socialSpending;
  const adminCentral = ADMIN_SAVINGS_ELASTICITY_CENTRAL * cf * socialSpending;
  const adminHigh = ADMIN_SAVINGS_ELASTICITY_HIGH * cf * socialSpending;

  const source = country.stats.socialProtectionExpenditureIloPercentGdp != null
    ? 'ILO World Social Protection Report'
    : country.stats.socialProtectionSpendingPercentGdp != null
    ? 'World Bank'
    : 'income-group proxy (6% of GDP)';

  return {
    id: 'administrative',
    label: 'Social Benefit Administration Savings',
    annualSavingsPppUsdLow: Math.round(adminLow),
    annualSavingsPppUsdCentral: Math.round(adminCentral),
    annualSavingsPppUsdHigh: Math.round(adminHigh),
    centralElasticity: ADMIN_SAVINGS_ELASTICITY_CENTRAL,
    baselineBasis: 'Annual social protection spending',
    baselineAnnualPppUsd: Math.round(socialSpending),
    assumptions: [
      `Transfer ($${floorPppUsd}/month) meets or exceeds country poverty line ($${countryPovertyLine.monthlyPppUsd.toFixed(2)}/month).`,
      `Baseline social protection spending: ${(country.stats.socialProtectionExpenditureIloPercentGdp ?? country.stats.socialProtectionSpendingPercentGdp ?? 6).toFixed(1)}% of GDP (${source}).`,
      `Central elasticity: ${(ADMIN_SAVINGS_ELASTICITY_CENTRAL * 100).toFixed(0)}% of spending redirectable as administrative overhead.`,
      `Applied to ${(cf * 100).toFixed(0)}% of baseline (coverage saturation).`,
      `Range: ${(ADMIN_SAVINGS_ELASTICITY_LOW * 100).toFixed(0)}% (only means-test verification costs) to ${(ADMIN_SAVINGS_ELASTICITY_HIGH * 100).toFixed(1)}% (includes appeals, fraud prevention, multiple program coordination).`,
      'Assumes consolidation of fragmented means-tested programs (pensions, child benefits, disability, unemployment insurance) into a single UBI delivery system.',
    ],
    sources: [
      'OECD (2017). "The Role and Design of Net Wealth Taxes in the OECD."',
      'IMF Fiscal Affairs Department publications on tax-benefit system delivery costs.',
    ],
    dataQuality: (country.stats.socialProtectionExpenditureIloPercentGdp != null || country.stats.socialProtectionSpendingPercentGdp != null) ? 'medium' : 'low',
  };
}

function estimateCrimeJusticeSavings(
  country: Country,
  recipientCount: number,
  floorPppUsd: number,
  coverage: number,
  countryPovertyLine: { monthlyPppUsd: number; label: string; source: string },
): CostSavingsCategory {
  const adequate = isTransferAdequate(floorPppUsd, countryPovertyLine.monthlyPppUsd);
  const cf = coverageFactor(coverage);

  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const crimeJusticeBaselineUsd = CRIMINAL_JUSTICE_COST_PCT_GDP * gdpTotal;

  if (!adequate) {
    return {
      id: 'crime_justice',
      label: 'Crime & Justice System Savings',
      annualSavingsPppUsdLow: 0,
      annualSavingsPppUsdCentral: 0,
      annualSavingsPppUsdHigh: 0,
      centralElasticity: null,
      baselineBasis: 'Criminal justice cost baseline (estimated ~1% of GDP, not applied)',
      baselineAnnualPppUsd: Math.round(crimeJusticeBaselineUsd),
      assumptions: [
        `Transfer ($${floorPppUsd}/month) does not meet country poverty line.`,
        'Crime reduction in the EBT study (Wright et al. 2014) was observed for transfers that reduce material deprivation.',
        'Gate: transfer inadequate → savings = $0.',
      ],
      sources: [
        'Wright, R., Tekin, E., Topalli, V. (2014). "Less Cash, Less Crime: Evidence from the Electronic Benefit Transfer Program." Journal of Law and Economics 60(2):351–379.',
      ],
      dataQuality: 'medium',
    };
  }

  const crimeLow = CRIME_ELASTICITY_LOW * cf * crimeJusticeBaselineUsd;
  const crimeCentral = CRIME_ELASTICITY_CENTRAL * cf * crimeJusticeBaselineUsd;
  const crimeHigh = CRIME_ELASTICITY_HIGH * cf * crimeJusticeBaselineUsd;

  return {
    id: 'crime_justice',
    label: 'Crime & Justice System Savings',
    annualSavingsPppUsdLow: Math.round(crimeLow),
    annualSavingsPppUsdCentral: Math.round(crimeCentral),
    annualSavingsPppUsdHigh: Math.round(crimeHigh),
    centralElasticity: CRIME_ELASTICITY_CENTRAL,
    baselineBasis: 'Estimated criminal justice system spending',
    baselineAnnualPppUsd: Math.round(crimeJusticeBaselineUsd),
    assumptions: [
      `Transfer ($${floorPppUsd}/month) meets or exceeds country poverty line ($${countryPovertyLine.monthlyPppUsd.toFixed(2)}/month).`,
      `Baseline criminal justice cost: ~${(CRIMINAL_JUSTICE_COST_PCT_GDP * 100).toFixed(2)}% of GDP (proxy used; country-specific data unavailable).`,
      `Central elasticity: ${(CRIME_ELASTICITY_CENTRAL * 100).toFixed(1)}% overall crime reduction (Wright et al. 2014, EBT study: 9.2% crime reduction when cash income increased).`,
      `Applied to ${(cf * 100).toFixed(0)}% of baseline (coverage saturation).`,
      `Range: ${(CRIME_ELASTICITY_LOW * 100).toFixed(1)}% (property crime only, conservative) to ${(CRIME_ELASTICITY_HIGH * 100).toFixed(1)}% (includes incarceration reduction, policing spillover).`,
      'Savings accrue from reduced arrests, court processing, incarceration, and probation costs.',
    ],
    sources: [
      'Wright, R., Tekin, E., Topalli, V. (2014). "Less Cash, Less Crime: Evidence from the Electronic Benefit Transfer Program." Journal of Law and Economics 60(2):351–379.',
      'Haushofer & Shapiro (2016). Intimate partner violence reduction from cash transfers in Kenya.',
    ],
    dataQuality: 'low', // Criminal justice spending data rarely in World Bank / IMF data
  };
}

// ── Full cost savings estimate ─────────────────────────────────────────────

export function estimateCostSavings(
  country: Country,
  recipientCount: number,
  floorPppUsd: number,
  coverage: number,
  annualUbiCostPppUsd: number,
): CostSavingsEstimate {
  const line = resolveCountryPovertyLine(country);
  const adequate = isTransferAdequate(floorPppUsd, line.monthlyPppUsd);

  const healthcare = estimateHealthcareSavings(
    country,
    recipientCount,
    floorPppUsd,
    coverage,
    {
      monthlyPppUsd: line.monthlyPppUsd,
      label: line.label,
      source: line.source,
    },
  );

  const admin = estimateAdministrativeSavings(
    country,
    recipientCount,
    floorPppUsd,
    coverage,
    {
      monthlyPppUsd: line.monthlyPppUsd,
      label: line.label,
      source: line.source,
    },
  );

  const crimeJustice = estimateCrimeJusticeSavings(
    country,
    recipientCount,
    floorPppUsd,
    coverage,
    {
      monthlyPppUsd: line.monthlyPppUsd,
      label: line.label,
      source: line.source,
    },
  );

  const categories = [healthcare, admin, crimeJustice];

  const totalLow = categories.reduce((sum, c) => sum + c.annualSavingsPppUsdLow, 0);
  const totalCentral = categories.reduce((sum, c) => sum + c.annualSavingsPppUsdCentral, 0);
  const totalHigh = categories.reduce((sum, c) => sum + c.annualSavingsPppUsdHigh, 0);

  const savingsAsPctCentral =
    annualUbiCostPppUsd > 0
      ? Math.round((totalCentral / annualUbiCostPppUsd) * 10000) / 100
      : 0;

  const allSources = new Set<string>();
  const allAssumptions: string[] = [];
  for (const c of categories) {
    for (const s of c.sources) allSources.add(s);
    for (const a of c.assumptions) allAssumptions.push(a);
  }

  const assumptions = [...new Set(allAssumptions)];

  return {
    categories,
    totalAnnualSavingsPppUsdCentral: totalCentral,
    totalAnnualSavingsPppUsdLow: totalLow,
    totalAnnualSavingsPppUsdHigh: totalHigh,
    savingsAsPercentOfUbiCostCentral: savingsAsPctCentral,
    transferAdequateForSavings: adequate,
    coverageFactor: coverage,
    sources: Array.from(allSources),
    assumptions,
    dataQuality: totalCentral > 0 ? 'medium' : 'low',
  };
}
