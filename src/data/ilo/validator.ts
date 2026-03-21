import type { IloConfig } from './config.types.js';
import type { IloEnrichment } from './transformer.js';

export interface IloValidationResult {
  valid: boolean;
  warnings: string[];
}

const COVERAGE_FIELDS = [
  'socialProtectionCoveragePercent',
  'pensionCoveragePercent',
  'childBenefitCoveragePercent',
] as const;

/**
 * Validate ILO enrichment data. Issues are warnings, not hard failures —
 * ILO data being absent or invalid does not block the main importer.
 */
export function validateIloData(
  data: Map<string, IloEnrichment>,
  config: IloConfig,
): IloValidationResult {
  const warnings: string[] = [];
  const [min, max] = config.validation.coverageRange;

  for (const [iso2, enrichment] of data) {
    for (const field of COVERAGE_FIELDS) {
      const val = enrichment[field];
      if (val !== null && val !== undefined && (val < min || val > max)) {
        warnings.push(`${iso2}: ${field} ${val} outside expected range [${min}, ${max}]`);
      }
    }

    const exp = enrichment.socialProtectionExpenditureIloPercentGdp;
    if (exp !== null && exp !== undefined && (exp < 0 || exp > 50)) {
      warnings.push(
        `${iso2}: socialProtectionExpenditureIloPercentGdp ${exp} outside plausible range [0, 50]`,
      );
    }
  }

  return { valid: true, warnings }; // Always valid — ILO data is supplementary
}
