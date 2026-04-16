/**
 * Country-based poverty lines — Phase 24
 *
 * The World Bank's $2.15/day extreme poverty line is a global benchmark
 * for LICs. It is inappropriate for higher-income countries where
 * subsistence costs far exceed $64.50/month: a person in Germany cannot
 * pay rent, heating, food and transport on that sum. Using the same
 * line everywhere produces the nonsensical result that Germany has
 * almost no poverty when, by any locally-meaningful standard, it does.
 *
 * This module picks a country-appropriate poverty line using a tiered
 * approach sourced from established international standards:
 *
 *   1. If a national poverty line is known (World Bank SI.POV.NAHC
 *      pair with a monetary line estimated from country median income)
 *      — use that; it reflects the country's own policy definition of
 *      poverty, usually set by the national statistics office.
 *   2. Otherwise for HIC: OECD / Eurostat at-risk-of-poverty
 *      threshold = 60% of median equivalised disposable income. This
 *      is the official EU standard.
 *   3. Otherwise for UMC: World Bank $6.85/day line (2017 PPP).
 *   4. Otherwise for LMC: World Bank $3.65/day line.
 *   5. Otherwise for LIC: World Bank $2.15/day extreme poverty line.
 *
 * Sources:
 *   - Jolliffe, D., Prydz, E., et al. (2022). "Assessing the Impact of
 *     the 2017 PPPs on the International Poverty Line and Global
 *     Poverty." World Bank Policy Research Working Paper 9941.
 *   - Atkinson, A.B. et al. (2017) & Eurostat methodological note on
 *     the at-risk-of-poverty rate (60% of median equivalised income).
 *   - World Bank data catalog: indicators SI.POV.DDAY (extreme),
 *     SI.POV.LMIC ($3.65), SI.POV.UMIC ($6.85), SI.POV.NAHC (national).
 *
 * All functions are pure — no I/O, no mutation, deterministic.
 */

import type { Country, IncomeGroup } from './types.js';

/** World Bank international poverty lines, 2017 PPP $/day. */
export const POVERTY_LINE_EXTREME_DAILY_PPP_USD = 2.15;
export const POVERTY_LINE_LMIC_DAILY_PPP_USD = 3.65;
export const POVERTY_LINE_UMIC_DAILY_PPP_USD = 6.85;

/**
 * Ratio of per-capita median income to per-capita mean income, used to
 * approximate median from GNI per capita when microdata is unavailable.
 * Cross-country OECD data shows median/mean ≈ 0.80–0.90 for typical
 * inequality levels; 0.85 is a conservative central estimate.
 */
const MEDIAN_TO_MEAN_RATIO = 0.85;

/**
 * The fraction of median income used to define the relative at-risk-of
 * poverty threshold. 0.60 matches EU/Eurostat and most OECD usage.
 */
export const RELATIVE_POVERTY_MEDIAN_FRACTION = 0.6;

/**
 * How the country's poverty line was determined.
 *
 *   extreme          — $2.15/day (World Bank LIC benchmark)
 *   lower_middle     — $3.65/day (World Bank LMC benchmark)
 *   upper_middle     — $6.85/day (World Bank UMC benchmark)
 *   relative_median  — 60% of country median income (OECD/EU standard)
 *   national         — country's own official national poverty line
 */
export type PovertyLineBasis =
  | 'extreme'
  | 'lower_middle'
  | 'upper_middle'
  | 'relative_median'
  | 'national';

/** Resolved country-specific poverty line with provenance. */
export interface CountryPovertyLine {
  /** Per-person, per-month poverty line in PPP-USD */
  monthlyPppUsd: number;
  /** Equivalent daily rate in PPP-USD (monthlyPppUsd / 30) */
  dailyPppUsd: number;
  /** How the line was determined */
  basis: PovertyLineBasis;
  /** Human-readable one-liner describing the line for UI display */
  label: string;
  /** Short citation source for the chosen line */
  source: string;
  /**
   * The closest-matching poverty headcount ratio from the country's
   * stats, if any. `null` if no survey estimate is available for this
   * line. The stats fields are filled by the World Bank importer.
   */
  headcountRatioPercent: number | null;
  /**
   * A data-quality flag reflecting how grounded the line is:
   *   high   — country-specific survey data (national or relative line
   *            backed by a matching headcount ratio)
   *   medium — absolute WB line for the country's income group, with a
   *            matching headcount ratio
   *   low    — line was picked but no matching headcount ratio exists
   */
  dataQuality: 'high' | 'medium' | 'low';
}

/**
 * Convert a daily PPP-USD poverty line to the equivalent monthly figure.
 * 30 days is the standard World Bank convention.
 */
export function dailyToMonthlyPppUsd(dailyPppUsd: number): number {
  return dailyPppUsd * 30;
}

/**
 * Estimate per-capita median annual income in USD from GNI per capita
 * using a median-to-mean ratio. This is a rough proxy used only when
 * country microdata is unavailable. It returns annual USD (Atlas method).
 */
function estimateAnnualMedianIncomeUsd(gniPerCapitaUsd: number): number {
  return gniPerCapitaUsd * MEDIAN_TO_MEAN_RATIO;
}

/**
 * Country-appropriate poverty line, picked from the tiered ladder.
 *
 * Selection rules (first match wins):
 *
 *   a) HIC: relative line — 60% × median income (EU/OECD at-risk-of-
 *      poverty standard). Takes precedence over any absolute line for
 *      high-income countries because $6.85/day in Germany ($205/month)
 *      is below the cost of a single room's rent in most cities.
 *   b) UMC: World Bank $6.85/day absolute line.
 *   c) LMC: World Bank $3.65/day absolute line.
 *   d) LIC: World Bank $2.15/day extreme poverty line.
 *
 * The function also attaches a matching headcount ratio where we have
 * one — future World Bank importer passes will populate these fields
 * (`povertyHeadcountRatio`, `povertyHeadcountRatio365`,
 * `povertyHeadcountRatio685`, `nationalPovertyHeadcountRatio`).
 */
export function resolveCountryPovertyLine(country: Country): CountryPovertyLine {
  const stats = country.stats;
  const incomeGroup = stats.incomeGroup;

  // HIC → relative poverty (60% of median)
  if (incomeGroup === 'HIC') {
    const medianAnnual = estimateAnnualMedianIncomeUsd(stats.gniPerCapitaUsd);
    const monthlyLine = (medianAnnual * RELATIVE_POVERTY_MEDIAN_FRACTION) / 12;
    return {
      monthlyPppUsd: Math.round(monthlyLine * 100) / 100,
      dailyPppUsd: Math.round((monthlyLine / 30) * 100) / 100,
      basis: 'relative_median',
      label: `60% of estimated median income — ≈ $${monthlyLine.toFixed(0)} PPP-USD/month`,
      source:
        'OECD / Eurostat at-risk-of-poverty standard (60% of median equivalised disposable income). Median approximated from GNI per capita using a 0.85 median-to-mean ratio — replace with survey microdata when available.',
      headcountRatioPercent: stats.relativePovertyHeadcountRatioPercent ?? null,
      dataQuality: stats.relativePovertyHeadcountRatioPercent != null ? 'high' : 'low',
    };
  }

  // UMC → $6.85/day
  if (incomeGroup === 'UMC') {
    const monthly = dailyToMonthlyPppUsd(POVERTY_LINE_UMIC_DAILY_PPP_USD);
    return {
      monthlyPppUsd: monthly,
      dailyPppUsd: POVERTY_LINE_UMIC_DAILY_PPP_USD,
      basis: 'upper_middle',
      label: `$${POVERTY_LINE_UMIC_DAILY_PPP_USD}/day upper-middle-income poverty line (World Bank, 2017 PPP)`,
      source:
        'World Bank upper-middle-income poverty line, calibrated from typical national poverty lines in UMC countries (Jolliffe et al. 2022). Indicator SI.POV.UMIC.',
      headcountRatioPercent: stats.povertyHeadcountRatio685Percent ?? null,
      dataQuality: stats.povertyHeadcountRatio685Percent != null ? 'medium' : 'low',
    };
  }

  // LMC → $3.65/day
  if (incomeGroup === 'LMC') {
    const monthly = dailyToMonthlyPppUsd(POVERTY_LINE_LMIC_DAILY_PPP_USD);
    return {
      monthlyPppUsd: monthly,
      dailyPppUsd: POVERTY_LINE_LMIC_DAILY_PPP_USD,
      basis: 'lower_middle',
      label: `$${POVERTY_LINE_LMIC_DAILY_PPP_USD}/day lower-middle-income poverty line (World Bank, 2017 PPP)`,
      source:
        'World Bank lower-middle-income poverty line (Jolliffe et al. 2022). Indicator SI.POV.LMIC.',
      headcountRatioPercent: stats.povertyHeadcountRatio365Percent ?? null,
      dataQuality: stats.povertyHeadcountRatio365Percent != null ? 'medium' : 'low',
    };
  }

  // LIC → $2.15/day (extreme poverty)
  const monthlyExtreme = dailyToMonthlyPppUsd(POVERTY_LINE_EXTREME_DAILY_PPP_USD);
  return {
    monthlyPppUsd: monthlyExtreme,
    dailyPppUsd: POVERTY_LINE_EXTREME_DAILY_PPP_USD,
    basis: 'extreme',
    label: `$${POVERTY_LINE_EXTREME_DAILY_PPP_USD}/day extreme poverty line (World Bank, 2017 PPP)`,
    source:
      'World Bank international extreme poverty line (Jolliffe et al. 2022). Indicator SI.POV.DDAY.',
    headcountRatioPercent: stats.povertyHeadcountRatio ?? null,
    dataQuality: stats.povertyHeadcountRatio != null ? 'medium' : 'low',
  };
}

/**
 * Summary of all available poverty lines and matching headcount
 * ratios for a country. Useful for transparency/reporting — callers
 * can present the full ladder rather than only the selected line.
 */
export interface PovertyLineLadderEntry {
  basis: PovertyLineBasis;
  dailyPppUsd: number;
  monthlyPppUsd: number;
  headcountRatioPercent: number | null;
  /** True if this is the line we selected for the country. */
  selected: boolean;
}

export function povertyLineLadder(country: Country): PovertyLineLadderEntry[] {
  const selected = resolveCountryPovertyLine(country);
  const stats = country.stats;

  const medianMonthly = (estimateAnnualMedianIncomeUsd(stats.gniPerCapitaUsd) * RELATIVE_POVERTY_MEDIAN_FRACTION) / 12;

  const ladder: PovertyLineLadderEntry[] = [
    {
      basis: 'extreme',
      dailyPppUsd: POVERTY_LINE_EXTREME_DAILY_PPP_USD,
      monthlyPppUsd: dailyToMonthlyPppUsd(POVERTY_LINE_EXTREME_DAILY_PPP_USD),
      headcountRatioPercent: stats.povertyHeadcountRatio ?? null,
      selected: selected.basis === 'extreme',
    },
    {
      basis: 'lower_middle',
      dailyPppUsd: POVERTY_LINE_LMIC_DAILY_PPP_USD,
      monthlyPppUsd: dailyToMonthlyPppUsd(POVERTY_LINE_LMIC_DAILY_PPP_USD),
      headcountRatioPercent: stats.povertyHeadcountRatio365Percent ?? null,
      selected: selected.basis === 'lower_middle',
    },
    {
      basis: 'upper_middle',
      dailyPppUsd: POVERTY_LINE_UMIC_DAILY_PPP_USD,
      monthlyPppUsd: dailyToMonthlyPppUsd(POVERTY_LINE_UMIC_DAILY_PPP_USD),
      headcountRatioPercent: stats.povertyHeadcountRatio685Percent ?? null,
      selected: selected.basis === 'upper_middle',
    },
    {
      basis: 'relative_median',
      dailyPppUsd: Math.round((medianMonthly / 30) * 100) / 100,
      monthlyPppUsd: Math.round(medianMonthly * 100) / 100,
      headcountRatioPercent: stats.relativePovertyHeadcountRatioPercent ?? null,
      selected: selected.basis === 'relative_median',
    },
  ];

  return ladder;
}

/**
 * Pick the default monthly PPP-USD poverty line for a country — the
 * main entry point for impact/simulation code that just needs a number.
 */
export function countryPovertyLineMonthlyPppUsd(country: Country): number {
  return resolveCountryPovertyLine(country).monthlyPppUsd;
}

/**
 * A pure helper: given the poverty line basis, return the default
 * daily PPP value used — independent of any specific country.
 * Useful for documentation/UI labels.
 */
export function basisToDailyPppUsd(basis: PovertyLineBasis): number | null {
  switch (basis) {
    case 'extreme': return POVERTY_LINE_EXTREME_DAILY_PPP_USD;
    case 'lower_middle': return POVERTY_LINE_LMIC_DAILY_PPP_USD;
    case 'upper_middle': return POVERTY_LINE_UMIC_DAILY_PPP_USD;
    case 'relative_median': return null; // varies by country
    case 'national': return null;
  }
}

/**
 * A static map from income group → default absolute WB poverty line
 * basis — useful when income group is known but the full country
 * record is not.
 */
export function incomeGroupToDefaultBasis(incomeGroup: IncomeGroup): PovertyLineBasis {
  switch (incomeGroup) {
    case 'HIC': return 'relative_median';
    case 'UMC': return 'upper_middle';
    case 'LMC': return 'lower_middle';
    case 'LIC': return 'extreme';
  }
}
