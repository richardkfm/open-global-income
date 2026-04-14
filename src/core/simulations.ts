import type { Country, SimulationParameters, SimulationResult } from './types.js';
import { GLOBAL_INCOME_FLOOR_PPP, RULESET_VERSION } from './constants.js';
import { populationFactorFromRules, expandPresetToRules } from './targeting.js';

/**
 * Calculate a budget simulation for a country.
 *
 * Pure function — no side effects, no I/O.
 *
 * recipientCount = population × targetFactor × coverage
 * monthlyLocal   = floorPpp × pppConversionFactor
 * monthlyTotal   = recipientCount × monthlyLocal
 * annualTotal    = monthlyTotal × durationMonths
 * annualPppUsd   = recipientCount × floorPpp × durationMonths
 * asPercentOfGdp = annualPppUsd / (gdpPerCapitaUsd × population) × 100
 *
 * If `params.targetingRules` is present its `preset` field is used as the
 * population fraction — this takes precedence over `params.targetGroup`.
 * Existing callers that only set `targetGroup` continue to work unchanged.
 */
export function calculateSimulation(
  country: Country,
  params: SimulationParameters,
  dataVersion: string,
): SimulationResult {
  const floorPpp = params.adjustments.floorOverride ?? GLOBAL_INCOME_FLOOR_PPP;

  // Resolve the effective targeting rules: explicit rules beat legacy targetGroup
  const effectiveRules = params.targetingRules ?? expandPresetToRules(params.targetGroup);
  const targetFactor = populationFactorFromRules(effectiveRules);

  const targetPopulation = country.stats.population * targetFactor;
  const recipientCount = Math.round(targetPopulation * params.coverage);

  const localCurrencyPerMonth =
    Math.round(floorPpp * country.stats.pppConversionFactor * 100) / 100;

  const monthlyLocalCurrency = Math.round(recipientCount * localCurrencyPerMonth * 100) / 100;
  const annualLocalCurrency = Math.round(monthlyLocalCurrency * params.durationMonths * 100) / 100;
  const annualPppUsd = Math.round(recipientCount * floorPpp * params.durationMonths * 100) / 100;

  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const asPercentOfGdp =
    gdpTotal > 0 ? Math.round((annualPppUsd / gdpTotal) * 10000) / 100 : 0;

  return {
    country: {
      code: country.code,
      name: country.name,
      population: country.stats.population,
    },
    simulation: {
      recipientCount,
      coverageRate: params.coverage,
      entitlementPerPerson: {
        pppUsdPerMonth: floorPpp,
        localCurrencyPerMonth,
      },
      cost: {
        monthlyLocalCurrency,
        annualLocalCurrency,
        annualPppUsd,
        asPercentOfGdp,
      },
      meta: {
        rulesetVersion: RULESET_VERSION,
        dataVersion,
      },
    },
  };
}
