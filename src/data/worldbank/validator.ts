import type { Country } from '../../core/types.js';
import type { ImporterConfig } from './config.types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate the output dataset against the same rules the test suite checks.
 * If validation fails, countries.json should NOT be overwritten.
 */
export function validateOutput(
  countries: Country[],
  config: ImporterConfig,
): ValidationResult {
  const errors: string[] = [];

  // Minimum country count
  if (countries.length < config.validation.minCountries) {
    errors.push(
      `Only ${countries.length} countries — minimum is ${config.validation.minCountries}`,
    );
  }

  // All required income groups present
  const groups = new Set(countries.map((c) => c.stats.incomeGroup));
  for (const required of config.validation.requiredIncomeGroups) {
    if (!groups.has(required as Country['stats']['incomeGroup'])) {
      errors.push(`Missing required income group: ${required}`);
    }
  }

  // Per-country validation
  for (const country of countries) {
    const prefix = `${country.code} (${country.name})`;

    if (!/^[A-Z]{2}$/.test(country.code)) {
      errors.push(`${prefix}: invalid ISO code format`);
    }

    if (!country.name || country.name.length === 0) {
      errors.push(`${country.code}: empty name`);
    }

    if (country.stats.gdpPerCapitaUsd <= 0) {
      errors.push(`${prefix}: gdpPerCapitaUsd must be > 0`);
    }

    if (country.stats.gniPerCapitaUsd <= 0) {
      errors.push(`${prefix}: gniPerCapitaUsd must be > 0`);
    }

    if (country.stats.pppConversionFactor <= 0) {
      errors.push(`${prefix}: pppConversionFactor must be > 0`);
    }

    if (country.stats.population <= 0) {
      errors.push(`${prefix}: population must be > 0`);
    }

    if (!['HIC', 'UMC', 'LMC', 'LIC'].includes(country.stats.incomeGroup)) {
      errors.push(`${prefix}: invalid incomeGroup "${country.stats.incomeGroup}"`);
    }

    const [giniMin, giniMax] = config.validation.giniRange;
    if (country.stats.giniIndex !== null) {
      if (
        country.stats.giniIndex < giniMin ||
        country.stats.giniIndex > giniMax
      ) {
        errors.push(
          `${prefix}: giniIndex ${country.stats.giniIndex} outside range [${giniMin}, ${giniMax}]`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
