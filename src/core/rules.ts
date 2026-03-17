import type { Country, GlobalIncomeEntitlement } from './types.js';
import { RULESET_VERSION, GLOBAL_INCOME_FLOOR_PPP } from './constants.js';

/**
 * Calculate the global income entitlement for a country.
 *
 * Stub formula (stub-v0.0.1):
 *   pppUsdPerMonth       = GLOBAL_INCOME_FLOOR_PPP (fixed at 200)
 *   localCurrencyPerMonth = pppUsdPerMonth × pppConversionFactor
 *   score                 = clamp(pppUsdPerMonth / (gdpPerCapitaUsd / 12), 0, 1)
 *
 * The score represents what fraction of the country's monthly GDP-per-capita
 * the global floor represents. A score near 1.0 means the floor approaches
 * or exceeds the country's average income (high need).
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

  const monthlyGdpPerCapita = country.stats.gdpPerCapitaUsd / 12;
  const rawScore =
    monthlyGdpPerCapita > 0 ? pppUsdPerMonth / monthlyGdpPerCapita : 1;
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
