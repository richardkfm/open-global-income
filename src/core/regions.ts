import type { Country, Region, GlobalIncomeEntitlement, RegionalIncomeEntitlement } from './types.js';

/**
 * Build a Country with regionally-adjusted stats.
 * pppConversionFactor is multiplied by the region's costOfLivingIndex.
 * population is replaced with the regional population.
 * All other stats remain at the national level.
 *
 * The returned object is a new value; neither input is mutated.
 */
export function buildRegionAdjustedCountry(country: Country, region: Region): Country {
  return {
    ...country,
    stats: {
      ...country.stats,
      pppConversionFactor: country.stats.pppConversionFactor * region.stats.costOfLivingIndex,
      population: region.stats.population,
      // The survey median is in national currency. Scale it with the same
      // cost-of-living index so its PPP-USD value (median / ppp factor) stays
      // the national figure — otherwise the regional adjustment cancels out
      // and every Bundesland would be paid exactly the national euro amount.
      medianIncome:
        country.stats.medianIncome?.medianAnnualLcu != null
          ? {
              ...country.stats.medianIncome,
              medianAnnualLcu: country.stats.medianIncome.medianAnnualLcu * region.stats.costOfLivingIndex,
            }
          : country.stats.medianIncome,
    },
  };
}

/**
 * Promote a national GlobalIncomeEntitlement to a RegionalIncomeEntitlement
 * by attaching region metadata and the national baseline for comparison.
 *
 * Note: score is unchanged — it is derived from GNI and Gini (national stats),
 * not PPP. The regional adjustment only affects localCurrencyPerMonth.
 */
export function toRegionalEntitlement(
  entitlement: GlobalIncomeEntitlement,
  nationalEntitlement: GlobalIncomeEntitlement,
  region: Region,
): RegionalIncomeEntitlement {
  return {
    ...entitlement,
    regionId: region.id,
    regionName: region.name,
    costOfLivingIndex: region.stats.costOfLivingIndex,
    nationalLocalCurrencyPerMonth: nationalEntitlement.localCurrencyPerMonth,
  };
}
