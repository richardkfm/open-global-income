import type { Country, SimulationParameters, SimulationResult } from './types.js';
import { GLOBAL_INCOME_FLOOR_PPP, RULESET_VERSION } from './constants.js';
import { populationFactorFromRules, expandPresetToRules } from './targeting.js';
import { localAdequacyLine } from './adequacy.js';

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
 * asPercentOfGdp = annualPppUsd / (gdpPerCapitaPppUsd × population) × 100
 *
 * The cost is in PPP-USD (the floor is PPP-denominated), so it is divided by
 * PPP GDP — not nominal GDP — to keep the ratio's units consistent.
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

  const gdpTotalPpp = country.stats.gdpPerCapitaPppUsd * country.stats.population;
  const asPercentOfGdp =
    gdpTotalPpp > 0 ? Math.round((annualPppUsd / gdpTotalPpp) * 10000) / 100 : 0;

  // Informational comparison only: same recipientCount and duration, but
  // priced at the country's local adequacy line instead of the floor above.
  const adequacy = localAdequacyLine(country);
  const adequacyAnnualPppUsd = Math.round(recipientCount * adequacy.monthlyPppUsd * params.durationMonths * 100) / 100;
  const adequacyAsPercentOfGdp =
    gdpTotalPpp > 0 ? Math.round((adequacyAnnualPppUsd / gdpTotalPpp) * 10000) / 100 : 0;

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
      costAtLocalAdequacyLine: {
        monthlyPppUsd: adequacy.monthlyPppUsd,
        basis: adequacy.basis,
        label: adequacy.label,
        annualPppUsd: adequacyAnnualPppUsd,
        asPercentOfGdp: adequacyAsPercentOfGdp,
      },
      meta: {
        rulesetVersion: RULESET_VERSION,
        dataVersion,
      },
    },
  };
}
