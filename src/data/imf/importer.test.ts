import { describe, it, expect } from 'vitest';
import { transformImfData } from './transformer.js';
import { validateImfData } from './validator.js';
import type { ImfConfig } from './config.types.js';
import type { ImfCountryData } from './fetcher.js';

const testConfig: ImfConfig = {
  source: {
    baseUrl: 'https://dataservices.imf.org/REST/SDMX_JSON.svc',
    dataset: 'GFS',
    retries: 0,
    retryDelayMs: 0,
  },
  indicators: {
    incomeTaxPercentGdp: 'G_X1_G01_GDP_PT',
    vatPercentGdp: 'G_X1_G12_GDP_PT',
    tradeTaxPercentGdp: 'G_X1_G15_GDP_PT',
  },
  output: { path: '../imf-enrichment.json', roundDecimals: 1 },
  validation: { percentRange: [0, 60] },
};

function makeImfRaw(
  iso2: string,
  income: number | null,
  vat: number | null,
  trade: number | null,
): ImfCountryData {
  const data: ImfCountryData = { iso2, values: {} };
  if (income !== null) data.values.incomeTaxPercentGdp = { value: income, year: '2022' };
  if (vat !== null) data.values.vatPercentGdp = { value: vat, year: '2022' };
  if (trade !== null) data.values.tradeTaxPercentGdp = { value: trade, year: '2022' };
  return data;
}

describe('transformImfData', () => {
  it('builds taxBreakdown when all components present', () => {
    const rawData = new Map<string, ImfCountryData>([
      ['KE', makeImfRaw('KE', 6.2, 4.8, 1.4)],
    ]);

    const result = transformImfData(rawData, testConfig);
    const ke = result.get('KE')!;
    expect(ke.taxBreakdown).not.toBeNull();
    expect(ke.taxBreakdown!.incomeTaxPercentGdp).toBe(6.2);
    expect(ke.taxBreakdown!.vatPercentGdp).toBe(4.8);
    expect(ke.taxBreakdown!.tradeTaxPercentGdp).toBe(1.4);
    expect(ke.taxBreakdown!.otherTaxPercentGdp).toBeNull(); // not fetched
  });

  it('builds taxBreakdown with partial components', () => {
    const rawData = new Map<string, ImfCountryData>([
      ['NG', makeImfRaw('NG', 3.1, null, 0.8)],
    ]);

    const result = transformImfData(rawData, testConfig);
    const ng = result.get('NG')!;
    expect(ng.taxBreakdown).not.toBeNull();
    expect(ng.taxBreakdown!.incomeTaxPercentGdp).toBe(3.1);
    expect(ng.taxBreakdown!.vatPercentGdp).toBeNull();
    expect(ng.taxBreakdown!.tradeTaxPercentGdp).toBe(0.8);
  });

  it('sets taxBreakdown to null when no components available', () => {
    const rawData = new Map<string, ImfCountryData>([
      ['XX', makeImfRaw('XX', null, null, null)],
    ]);

    const result = transformImfData(rawData, testConfig);
    expect(result.get('XX')!.taxBreakdown).toBeNull();
  });

  it('rounds values to configured decimal places', () => {
    const rawData = new Map<string, ImfCountryData>([
      ['DE', makeImfRaw('DE', 6.1234, 4.8765, 0.123)],
    ]);

    const result = transformImfData(rawData, testConfig);
    const de = result.get('DE')!;
    expect(de.taxBreakdown!.incomeTaxPercentGdp).toBe(6.1);
    expect(de.taxBreakdown!.vatPercentGdp).toBe(4.9);
    expect(de.taxBreakdown!.tradeTaxPercentGdp).toBe(0.1);
  });

  it('returns empty map for empty input', () => {
    const result = transformImfData(new Map(), testConfig);
    expect(result.size).toBe(0);
  });
});

describe('validateImfData', () => {
  it('always returns valid=true (IMF data is supplementary)', () => {
    const data = new Map([
      ['KE', { taxBreakdown: { incomeTaxPercentGdp: 6.2, vatPercentGdp: 4.8, tradeTaxPercentGdp: 1.4, otherTaxPercentGdp: null } }],
    ]);
    const result = validateImfData(data, testConfig);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns on out-of-range tax value but stays valid', () => {
    const data = new Map([
      ['XX', { taxBreakdown: { incomeTaxPercentGdp: 80, vatPercentGdp: null, tradeTaxPercentGdp: null, otherTaxPercentGdp: null } }],
    ]);
    const result = validateImfData(data, testConfig);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('incomeTaxPercentGdp');
  });

  it('does not warn when taxBreakdown is null', () => {
    const data = new Map([['ZZ', { taxBreakdown: null }]]);
    const result = validateImfData(data, testConfig);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
