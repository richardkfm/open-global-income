import type { CountryStats } from '../../core/types.js';
import type { IloConfig, IloIndicatorField } from './config.types.js';
import type { IloCountryData } from './fetcher.js';

/**
 * Round a number to the specified decimal places.
 */
function roundValue(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type IloEnrichment = Pick<
  CountryStats,
  | 'socialProtectionCoveragePercent'
  | 'socialProtectionExpenditureIloPercentGdp'
  | 'pensionCoveragePercent'
  | 'childBenefitCoveragePercent'
>;

/**
 * Transform raw ILO data into a map of ISO2 → partial CountryStats.
 * All fields are nullable — missing data is represented as null, not omitted.
 */
export function transformIloData(
  rawData: Map<string, IloCountryData>,
  config: IloConfig,
): Map<string, IloEnrichment> {
  const result = new Map<string, IloEnrichment>();
  const decimals = config.output.roundDecimals;
  const fields: IloIndicatorField[] = [
    'socialProtectionCoveragePercent',
    'socialProtectionExpenditureIloPercentGdp',
    'pensionCoveragePercent',
    'childBenefitCoveragePercent',
  ];

  for (const [iso2, raw] of rawData) {
    const enrichment: IloEnrichment = {
      socialProtectionCoveragePercent: null,
      socialProtectionExpenditureIloPercentGdp: null,
      pensionCoveragePercent: null,
      childBenefitCoveragePercent: null,
    };

    for (const field of fields) {
      const iv = raw.values[field];
      if (iv?.value !== undefined && iv.value !== null) {
        (enrichment as Record<string, number | null>)[field] = roundValue(iv.value, decimals);
      }
    }

    result.set(iso2, enrichment);
  }

  return result;
}
