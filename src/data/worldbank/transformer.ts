import type { Country, IncomeGroup } from '../../core/types.js';
import type { ImporterConfig, IndicatorField } from './config.types.js';
import type { RawCountryData } from './fetcher.js';

/**
 * Round a number to the specified decimal places.
 */
export function roundValue(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Classify a country's income group based on GNI per capita
 * using the configured thresholds.
 */
export function classifyIncomeGroup(
  gniPerCapita: number,
  thresholds: ImporterConfig['incomeGroupThresholds'],
): IncomeGroup {
  for (const [group, range] of Object.entries(thresholds)) {
    const min = range.min ?? -Infinity;
    const max = range.max ?? Infinity;
    if (gniPerCapita >= min && gniPerCapita <= max) {
      return group as IncomeGroup;
    }
  }
  // Fallback: if no threshold matches, classify based on value
  if (gniPerCapita > 14005) return 'HIC';
  if (gniPerCapita > 4515) return 'UMC';
  if (gniPerCapita > 1145) return 'LMC';
  return 'LIC';
}

/** Fields that must be non-null for a country to be included */
const REQUIRED_FIELDS: IndicatorField[] = [
  'gdpPerCapitaUsd',
  'gniPerCapitaUsd',
  'pppConversionFactor',
  'population',
];

/** New macro-economic fields — all optional/nullable */
const OPTIONAL_NUMERIC_FIELDS: IndicatorField[] = [
  'taxRevenuePercentGdp',
  'socialProtectionSpendingPercentGdp',
  'inflationRate',
  'laborForceParticipation',
  'unemploymentRate',
  'governmentDebtPercentGdp',
  'socialContributionsPercentRevenue',
  'povertyHeadcountRatio',
  'gdpGrowthRate',
  'healthExpenditurePercentGdp',
  'educationExpenditurePercentGdp',
  'urbanizationRate',
];

/**
 * Transform raw API data into the Country[] format for countries.json.
 *
 * - Drops countries missing required fields (GDP, GNI, PPP, population)
 * - Allows giniIndex to be null (per config)
 * - Rounds values per output.roundDecimals config
 * - Classifies income group from GNI
 * - Sorts alphabetically by country code
 */
export function transformCountries(
  rawData: Map<string, RawCountryData>,
  config: ImporterConfig,
): { countries: Country[]; warnings: string[] } {
  const countries: Country[] = [];
  const warnings: string[] = [];

  for (const [iso2, raw] of rawData) {
    // Check required fields
    const missing = REQUIRED_FIELDS.filter(
      (f) => raw.values[f]?.value === undefined || raw.values[f]?.value === null,
    );

    if (missing.length > 0) {
      warnings.push(
        `${iso2} (${raw.countryName || '?'}): dropped — missing ${missing.join(', ')}`,
      );
      continue;
    }

    const gdpPerCapitaUsd = roundValue(
      raw.values.gdpPerCapitaUsd!.value!,
      config.output.roundDecimals.gdpPerCapitaUsd ?? 0,
    );
    const gniPerCapitaUsd = roundValue(
      raw.values.gniPerCapitaUsd!.value!,
      config.output.roundDecimals.gniPerCapitaUsd ?? 0,
    );
    const pppConversionFactor = roundValue(
      raw.values.pppConversionFactor!.value!,
      config.output.roundDecimals.pppConversionFactor ?? 2,
    );
    const population = roundValue(
      raw.values.population!.value!,
      config.output.roundDecimals.population ?? 0,
    );

    let giniIndex: number | null = null;
    if (raw.values.giniIndex?.value !== undefined && raw.values.giniIndex.value !== null) {
      giniIndex = roundValue(
        raw.values.giniIndex.value,
        config.output.roundDecimals.giniIndex ?? 1,
      );
    } else if (!config.giniIndex.nullable) {
      warnings.push(
        `${iso2} (${raw.countryName || '?'}): dropped — Gini index unavailable and nullable=false`,
      );
      continue;
    }

    const incomeGroup = classifyIncomeGroup(
      gniPerCapitaUsd,
      config.incomeGroupThresholds,
    );

    // Build optional numeric fields — all nullable, graceful on missing data
    const optionalFields: Partial<Record<IndicatorField, number | null>> = {};
    for (const field of OPTIONAL_NUMERIC_FIELDS) {
      const iv = raw.values[field];
      if (iv?.value !== undefined && iv.value !== null) {
        const decimals = config.output.roundDecimals[field] ?? 1;
        optionalFields[field] = roundValue(iv.value, decimals);
      } else {
        optionalFields[field] = null;
      }
    }

    countries.push({
      code: iso2,
      name: raw.countryName || iso2,
      stats: {
        gdpPerCapitaUsd,
        gniPerCapitaUsd,
        pppConversionFactor,
        giniIndex,
        population,
        incomeGroup,
        taxRevenuePercentGdp: optionalFields.taxRevenuePercentGdp,
        socialProtectionSpendingPercentGdp: optionalFields.socialProtectionSpendingPercentGdp,
        inflationRate: optionalFields.inflationRate,
        laborForceParticipation: optionalFields.laborForceParticipation,
        unemploymentRate: optionalFields.unemploymentRate,
        governmentDebtPercentGdp: optionalFields.governmentDebtPercentGdp,
        socialContributionsPercentRevenue: optionalFields.socialContributionsPercentRevenue,
        povertyHeadcountRatio: optionalFields.povertyHeadcountRatio,
        gdpGrowthRate: optionalFields.gdpGrowthRate,
        healthExpenditurePercentGdp: optionalFields.healthExpenditurePercentGdp,
        educationExpenditurePercentGdp: optionalFields.educationExpenditurePercentGdp,
        urbanizationRate: optionalFields.urbanizationRate,
      },
    });
  }

  // Sort alphabetically by country code
  countries.sort((a, b) => a.code.localeCompare(b.code));

  return { countries, warnings };
}
