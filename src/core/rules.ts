import type { Country, GlobalIncomeEntitlement } from './types.js';
import {
  RULESET_VERSION,
  GLOBAL_INCOME_FLOOR_PPP,
  GINI_WEIGHT,
} from './constants.js';

/**
 * Calculate the global income entitlement for a country.
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
export function calculateEntitlement(
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
    meta: {
      rulesetVersion: RULESET_VERSION,
      dataVersion,
    },
  };
}
