import type { TaxBreakdown } from '../../core/types.js';
import type { ImfConfig } from './config.types.js';
import type { ImfCountryData } from './fetcher.js';

/**
 * Round a number to the specified decimal places.
 */
function roundValue(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface ImfEnrichment {
  taxBreakdown: TaxBreakdown | null;
}

/**
 * Transform raw IMF data into a map of ISO2 → ImfEnrichment.
 * The tax breakdown is only populated if at least one component is available.
 * The 'other' component is not fetched (IMF categorization varies); it remains null.
 */
export function transformImfData(
  rawData: Map<string, ImfCountryData>,
  config: ImfConfig,
): Map<string, ImfEnrichment> {
  const result = new Map<string, ImfEnrichment>();
  const decimals = config.output.roundDecimals;

  for (const [iso2, raw] of rawData) {
    const income = raw.values.incomeTaxPercentGdp;
    const vat = raw.values.vatPercentGdp;
    const trade = raw.values.tradeTaxPercentGdp;

    // Only emit a taxBreakdown if at least one component has data
    const hasAny = income || vat || trade;
    if (!hasAny) {
      result.set(iso2, { taxBreakdown: null });
      continue;
    }

    result.set(iso2, {
      taxBreakdown: {
        incomeTaxPercentGdp: income ? roundValue(income.value, decimals) : null,
        vatPercentGdp: vat ? roundValue(vat.value, decimals) : null,
        tradeTaxPercentGdp: trade ? roundValue(trade.value, decimals) : null,
        otherTaxPercentGdp: null, // Derived field — not fetched directly
      },
    });
  }

  return result;
}
