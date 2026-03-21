import { describe, it, expect } from 'vitest';
import { transformIloData } from './transformer.js';
import { validateIloData } from './validator.js';
import type { IloConfig } from './config.types.js';
import type { IloCountryData } from './fetcher.js';

const testConfig: IloConfig = {
  source: {
    baseUrl: 'https://sdmx.ilo.org/rest',
    dataflow: 'ILO,DF_SOC_PROT,1.0',
    format: 'json',
    retries: 0,
    retryDelayMs: 0,
  },
  indicators: {
    socialProtectionCoveragePercent: 'SPR_FTPT_POP_SP',
    socialProtectionExpenditureIloPercentGdp: 'SPR_XPNS_XPNS_GDPSH',
    pensionCoveragePercent: 'SPR_FTPT_POP_OAP',
    childBenefitCoveragePercent: 'SPR_FTPT_POP_CHB',
  },
  output: { path: '../ilo-enrichment.json', roundDecimals: 1 },
  validation: { coverageRange: [0, 100] },
};

function makeIloRaw(
  iso2: string,
  coverage: number | null,
  expenditure: number | null,
  pension: number | null,
  childBenefit: number | null,
): IloCountryData {
  const data: IloCountryData = { iso2, values: {} };
  if (coverage !== null) data.values.socialProtectionCoveragePercent = { value: coverage, year: '2022' };
  if (expenditure !== null) data.values.socialProtectionExpenditureIloPercentGdp = { value: expenditure, year: '2022' };
  if (pension !== null) data.values.pensionCoveragePercent = { value: pension, year: '2022' };
  if (childBenefit !== null) data.values.childBenefitCoveragePercent = { value: childBenefit, year: '2022' };
  return data;
}

describe('transformIloData', () => {
  it('maps ILO raw data to enrichment fields', () => {
    const rawData = new Map<string, IloCountryData>([
      ['KE', makeIloRaw('KE', 28.4, 2.3, 15.1, 5.2)],
      ['DE', makeIloRaw('DE', 97.2, 25.3, 92.1, 73.4)],
    ]);

    const result = transformIloData(rawData, testConfig);
    expect(result.size).toBe(2);

    const ke = result.get('KE')!;
    expect(ke.socialProtectionCoveragePercent).toBe(28.4);
    expect(ke.socialProtectionExpenditureIloPercentGdp).toBe(2.3);
    expect(ke.pensionCoveragePercent).toBe(15.1);
    expect(ke.childBenefitCoveragePercent).toBe(5.2);

    const de = result.get('DE')!;
    expect(de.socialProtectionCoveragePercent).toBe(97.2);
  });

  it('sets fields to null when data is absent', () => {
    const rawData = new Map<string, IloCountryData>([
      ['BI', makeIloRaw('BI', null, null, null, null)],
    ]);

    const result = transformIloData(rawData, testConfig);
    const bi = result.get('BI')!;
    expect(bi.socialProtectionCoveragePercent).toBeNull();
    expect(bi.pensionCoveragePercent).toBeNull();
  });

  it('rounds values to configured decimal places', () => {
    const rawData = new Map<string, IloCountryData>([
      ['US', makeIloRaw('US', 97.1234, null, null, null)],
    ]);

    const result = transformIloData(rawData, testConfig);
    expect(result.get('US')!.socialProtectionCoveragePercent).toBe(97.1);
  });

  it('returns empty map for empty input', () => {
    const result = transformIloData(new Map(), testConfig);
    expect(result.size).toBe(0);
  });
});

describe('validateIloData', () => {
  it('always returns valid=true (ILO data is supplementary)', () => {
    const data = new Map([
      ['KE', { socialProtectionCoveragePercent: 28.4, socialProtectionExpenditureIloPercentGdp: 2.3, pensionCoveragePercent: 15.1, childBenefitCoveragePercent: 5.2 }],
    ]);
    const result = validateIloData(data, testConfig);
    expect(result.valid).toBe(true);
  });

  it('emits warning for out-of-range coverage value but stays valid', () => {
    const data = new Map([
      ['XX', { socialProtectionCoveragePercent: 150, socialProtectionExpenditureIloPercentGdp: null, pensionCoveragePercent: null, childBenefitCoveragePercent: null }],
    ]);
    const result = validateIloData(data, testConfig);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('socialProtectionCoveragePercent');
  });
});
