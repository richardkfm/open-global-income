import type { Country, EntitlementFloor, GlobalIncomeEntitlement } from './types.js';
import {
  RULESET_V1_VERSION,
  RULESET_V3_VERSION,
  GLOBAL_INCOME_FLOOR_PPP,
  GINI_WEIGHT,
} from './constants.js';
import { localAdequacyLine } from './adequacy.js';

/**
 * The per-person amount ruleset v3 pays: the higher of the global anchor
 * ($210 PPP) and the country's local adequacy line.
 *
 * Low- and middle-income countries have adequacy lines at or below the
 * anchor (the World Bank absolute lines), so they keep $210 — never less.
 * High-income countries use 60% of median equivalised disposable income,
 * which is far above $210, so a German recipient is paid the German
 * at-risk-of-poverty line rather than ~€164.
 *
 * Pure function.
 */
export function resolveEntitlementFloor(country: Country): EntitlementFloor {
  const adequacy = localAdequacyLine(country).monthlyPppUsd;
  const useAdequacy = adequacy > GLOBAL_INCOME_FLOOR_PPP;
  return {
    pppUsdPerMonth: useAdequacy ? adequacy : GLOBAL_INCOME_FLOOR_PPP,
    basis: useAdequacy ? 'local_adequacy' : 'global_anchor',
    anchorPppUsdPerMonth: GLOBAL_INCOME_FLOOR_PPP,
    adequacyPppUsdPerMonth: adequacy,
  };
}

/** v1/v3 need score — identical in both rulesets, always measured against the fixed anchor. */
function needScore(country: Country): number {
  const monthlyGniPerCapita = country.stats.gniPerCapitaUsd / 12;
  const incomeRatio =
    monthlyGniPerCapita > 0 ? GLOBAL_INCOME_FLOOR_PPP / monthlyGniPerCapita : 1;
  const giniPenalty =
    country.stats.giniIndex !== null ? (country.stats.giniIndex / 100) * GINI_WEIGHT : 0;
  const rawScore = incomeRatio + giniPenalty;
  return Math.round(Math.min(Math.max(rawScore, 0), 1) * 10000) / 10000;
}

/**
 * Calculate the entitlement under the **active** ruleset (v3).
 *
 * Ruleset v3 formula:
 *
 *   adequacy              = localAdequacyLine(country)          (PPP-USD/month)
 *   pppUsdPerMonth        = max(GLOBAL_INCOME_FLOOR_PPP, adequacy)
 *   localCurrencyPerMonth = pppUsdPerMonth × pppConversionFactor
 *   score                 = v1 need score (unchanged, anchor-based)
 *
 * Only the paid amount changes from v1; the need score still compares the
 * fixed $210 anchor with average income, so need rankings stay comparable
 * across countries and across rulesets.
 *
 * Pure function.
 */
export function calculateEntitlement(
  country: Country,
  dataVersion: string,
): GlobalIncomeEntitlement {
  const floor = resolveEntitlementFloor(country);
  const pppUsdPerMonth = Math.round(floor.pppUsdPerMonth * 100) / 100;
  return {
    countryCode: country.code,
    pppUsdPerMonth,
    localCurrencyPerMonth: Math.round(pppUsdPerMonth * country.stats.pppConversionFactor * 100) / 100,
    score: needScore(country),
    adequacyEstimate: localAdequacyLine(country),
    floor,
    meta: {
      rulesetVersion: RULESET_V3_VERSION,
      dataVersion,
    },
  };
}

/**
 * Ruleset v1 — kept unchanged so every v1 result stays reproducible.
 * Pays the fixed $210 anchor everywhere.
 *
 * Ruleset v1 formula:
 *
 *   pppUsdPerMonth        = GLOBAL_INCOME_FLOOR_PPP (210 PPP-USD/month)
 *   localCurrencyPerMonth = pppUsdPerMonth × pppConversionFactor
 *
 *   incomeRatio   = GLOBAL_INCOME_FLOOR_PPP / (gniPerCapitaUsd / 12)
 *   giniPenalty   = (giniIndex / 100) × GINI_WEIGHT       [0 if giniIndex is null]
 *   score         = clamp(incomeRatio + giniPenalty, 0, 1)
 *
 * The score captures relative need:
 *   - incomeRatio: how large the global floor is relative to the country's
 *     monthly GNI per capita. Uses GNI (not GDP) because GNI better reflects
 *     what residents actually earn.
 *   - giniPenalty: inequality amplifier. Two countries with identical GNI
 *     but different Gini coefficients will get different scores — higher
 *     inequality means the floor matters more for the poorest residents.
 *
 * This is a pure function with no side effects.
 */
export function calculateEntitlementV1(
  country: Country,
  dataVersion: string,
): GlobalIncomeEntitlement {
  const pppUsdPerMonth = GLOBAL_INCOME_FLOOR_PPP;

  const localCurrencyPerMonth =
    Math.round(pppUsdPerMonth * country.stats.pppConversionFactor * 100) / 100;

  const monthlyGniPerCapita = country.stats.gniPerCapitaUsd / 12;
  const incomeRatio =
    monthlyGniPerCapita > 0 ? pppUsdPerMonth / monthlyGniPerCapita : 1;

  const giniPenalty =
    country.stats.giniIndex !== null
      ? (country.stats.giniIndex / 100) * GINI_WEIGHT
      : 0;

  const rawScore = incomeRatio + giniPenalty;
  const score = Math.round(Math.min(Math.max(rawScore, 0), 1) * 10000) / 10000;

  return {
    countryCode: country.code,
    pppUsdPerMonth,
    localCurrencyPerMonth,
    score,
    adequacyEstimate: localAdequacyLine(country),
    meta: {
      rulesetVersion: RULESET_V1_VERSION,
      dataVersion,
    },
  };
}
