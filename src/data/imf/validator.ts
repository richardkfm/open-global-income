import type { ImfConfig } from './config.types.js';
import type { ImfEnrichment } from './transformer.js';

export interface ImfValidationResult {
  valid: boolean;
  warnings: string[];
}

/**
 * Validate IMF enrichment data. Issues are warnings — IMF data being
 * absent or unusual does not block the main importer.
 */
export function validateImfData(
  data: Map<string, ImfEnrichment>,
  config: ImfConfig,
): ImfValidationResult {
  const warnings: string[] = [];
  const [min, max] = config.validation.percentRange;

  for (const [iso2, enrichment] of data) {
    if (!enrichment.taxBreakdown) continue;

    const breakdown = enrichment.taxBreakdown;
    const components = [
      ['incomeTaxPercentGdp', breakdown.incomeTaxPercentGdp],
      ['vatPercentGdp', breakdown.vatPercentGdp],
      ['tradeTaxPercentGdp', breakdown.tradeTaxPercentGdp],
    ] as const;

    for (const [field, val] of components) {
      if (val !== null && val !== undefined && (val < min || val > max)) {
        warnings.push(`${iso2}: ${field} ${val} outside expected range [${min}, ${max}]`);
      }
    }
  }

  return { valid: true, warnings }; // Always valid — IMF data is supplementary
}
