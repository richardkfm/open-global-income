import { describe, it, expect } from 'vitest';
import { transformCountries, classifyIncomeGroup, roundValue } from './transformer.js';
import { validateOutput } from './validator.js';
import { validateConfig } from './config.types.js';
import type { ImporterConfig } from './config.types.js';
import type { RawCountryData } from './fetcher.js';
import type { Country } from '../../core/types.js';

// Minimal valid config for testing
const testConfig: ImporterConfig = {
  source: { baseUrl: 'https://api.worldbank.org/v2', format: 'json', perPage: 300, retries: 0, retryDelayMs: 0 },
  indicators: {
    gdpPerCapitaUsd: 'NY.GDP.PCAP.CD',
    gniPerCapitaUsd: 'NY.GNP.PCAP.CD',
    pppConversionFactor: 'PA.NUS.PPP',
    giniIndex: 'SI.POV.GINI',
    population: 'SP.POP.TOTL',
    taxRevenuePercentGdp: 'GC.TAX.TOTL.GD.ZS',
    socialProtectionSpendingPercentGdp: 'GC.XPN.COMP.ZS',
    inflationRate: 'FP.CPI.TOTL.ZG',
    laborForceParticipation: 'SL.TLF.CACT.ZS',
    unemploymentRate: 'SL.UEM.TOTL.ZS',
    governmentDebtPercentGdp: 'GC.DOD.TOTL.GD.ZS',
    socialContributionsPercentRevenue: 'GC.REV.SOCL.ZS',
    povertyHeadcountRatio: 'SI.POV.DDAY',
    gdpGrowthRate: 'NY.GDP.MKTP.KD.ZG',
    healthExpenditurePercentGdp: 'SH.XPD.CHEX.GD.ZS',
    educationExpenditurePercentGdp: 'SE.XPD.TOTL.GD.ZS',
    urbanizationRate: 'SP.URB.TOTL.IN.ZS',
  },
  countries: { mode: 'explicit', codes: ['DE', 'NG'] },
  incomeGroupThresholds: {
    HIC: { min: 14006 },
    UMC: { min: 4516, max: 14005 },
    LMC: { min: 1146, max: 4515 },
    LIC: { max: 1145 },
  },
  giniIndex: { lookbackYears: 10, nullable: true },
  output: {
    path: '../countries.json',
    dataVersionPrefix: 'worldbank',
    roundDecimals: { gdpPerCapitaUsd: 0, gniPerCapitaUsd: 0, pppConversionFactor: 2, giniIndex: 1, population: 0 },
  },
  validation: { minCountries: 1, requiredIncomeGroups: ['HIC', 'LMC'], giniRange: [0, 100] },
};

function makeRaw(iso2: string, name: string, gdp: number, gni: number, ppp: number, gini: number | null, pop: number): RawCountryData {
  return {
    iso2Code: iso2,
    countryName: name,
    values: {
      gdpPerCapitaUsd: { value: gdp, year: '2023' },
      gniPerCapitaUsd: { value: gni, year: '2023' },
      pppConversionFactor: { value: ppp, year: '2023' },
      giniIndex: gini !== null ? { value: gini, year: '2020' } : undefined,
      population: { value: pop, year: '2023' },
    },
  };
}

// --- roundValue ---

describe('roundValue', () => {
  it('rounds to 0 decimal places', () => {
    expect(roundValue(123.456, 0)).toBe(123);
  });

  it('rounds to 2 decimal places', () => {
    expect(roundValue(1.236, 2)).toBe(1.24);
    expect(roundValue(0.784, 2)).toBe(0.78);
  });

  it('rounds to 1 decimal place', () => {
    expect(roundValue(35.15, 1)).toBe(35.2);
  });
});

// --- classifyIncomeGroup ---

describe('classifyIncomeGroup', () => {
  const thresholds = testConfig.incomeGroupThresholds;

  it('classifies high income', () => {
    expect(classifyIncomeGroup(50000, thresholds)).toBe('HIC');
    expect(classifyIncomeGroup(14006, thresholds)).toBe('HIC');
  });

  it('classifies upper middle income', () => {
    expect(classifyIncomeGroup(14005, thresholds)).toBe('UMC');
    expect(classifyIncomeGroup(4516, thresholds)).toBe('UMC');
  });

  it('classifies lower middle income', () => {
    expect(classifyIncomeGroup(4515, thresholds)).toBe('LMC');
    expect(classifyIncomeGroup(1146, thresholds)).toBe('LMC');
  });

  it('classifies low income', () => {
    expect(classifyIncomeGroup(1145, thresholds)).toBe('LIC');
    expect(classifyIncomeGroup(100, thresholds)).toBe('LIC');
  });
});

// --- transformCountries ---

describe('transformCountries', () => {
  it('transforms valid raw data into Country[]', () => {
    const rawData = new Map<string, RawCountryData>([
      ['DE', makeRaw('DE', 'Germany', 51384, 51640, 0.78, 31.7, 83800000)],
      ['NG', makeRaw('NG', 'Nigeria', 2184, 2140, 168.5, 35.1, 218500000)],
    ]);

    const { countries, warnings } = transformCountries(rawData, testConfig);
    expect(warnings).toHaveLength(0);
    expect(countries).toHaveLength(2);

    // Sorted alphabetically
    expect(countries[0].code).toBe('DE');
    expect(countries[1].code).toBe('NG');

    // Germany
    expect(countries[0].stats.incomeGroup).toBe('HIC');
    expect(countries[0].stats.pppConversionFactor).toBe(0.78);

    // Nigeria
    expect(countries[1].stats.incomeGroup).toBe('LMC');
  });

  it('drops countries missing required fields and warns', () => {
    const raw: RawCountryData = {
      iso2Code: 'XX',
      countryName: 'Missing Data',
      values: {
        gdpPerCapitaUsd: { value: 1000, year: '2023' },
        // missing gni, ppp, population
      },
    };

    const rawData = new Map([['XX', raw]]);
    const { countries, warnings } = transformCountries(rawData, testConfig);
    expect(countries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('XX');
    expect(warnings[0]).toContain('dropped');
  });

  it('allows null Gini when nullable=true', () => {
    const rawData = new Map([
      ['SG', makeRaw('SG', 'Singapore', 65000, 64000, 0.84, null, 5640000)],
    ]);

    const { countries } = transformCountries(rawData, testConfig);
    expect(countries).toHaveLength(1);
    expect(countries[0].stats.giniIndex).toBeNull();
  });

  it('drops countries with null Gini when nullable=false', () => {
    const strictConfig = {
      ...testConfig,
      giniIndex: { ...testConfig.giniIndex, nullable: false },
    };

    const rawData = new Map([
      ['SG', makeRaw('SG', 'Singapore', 65000, 64000, 0.84, null, 5640000)],
    ]);

    const { countries, warnings } = transformCountries(rawData, strictConfig);
    expect(countries).toHaveLength(0);
    expect(warnings[0]).toContain('Gini');
  });

  it('rounds values according to config', () => {
    const rawData = new Map([
      ['DE', makeRaw('DE', 'Germany', 51384.567, 51640.123, 0.78432, 31.749, 83812345)],
    ]);

    const { countries } = transformCountries(rawData, testConfig);
    expect(countries[0].stats.gdpPerCapitaUsd).toBe(51385); // 0 decimals
    expect(countries[0].stats.pppConversionFactor).toBe(0.78); // 2 decimals
    expect(countries[0].stats.giniIndex).toBe(31.7); // 1 decimal
    expect(countries[0].stats.population).toBe(83812345); // 0 decimals
  });
});

// --- validateOutput ---

describe('validateOutput', () => {
  const validCountries: Country[] = [
    {
      code: 'DE',
      name: 'Germany',
      stats: { gdpPerCapitaUsd: 51384, gniPerCapitaUsd: 51640, pppConversionFactor: 0.78, giniIndex: 31.7, population: 83800000, incomeGroup: 'HIC' },
    },
    {
      code: 'NG',
      name: 'Nigeria',
      stats: { gdpPerCapitaUsd: 2184, gniPerCapitaUsd: 2140, pppConversionFactor: 168.5, giniIndex: 35.1, population: 218500000, incomeGroup: 'LMC' },
    },
  ];

  it('passes with valid data', () => {
    const result = validateOutput(validCountries, testConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when too few countries', () => {
    const strict = { ...testConfig, validation: { ...testConfig.validation, minCountries: 100 } };
    const result = validateOutput(validCountries, strict);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('minimum');
  });

  it('fails when required income group is missing', () => {
    const strict = {
      ...testConfig,
      validation: { ...testConfig.validation, requiredIncomeGroups: ['HIC', 'LMC', 'LIC'] },
    };
    const result = validateOutput(validCountries, strict);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('LIC');
  });

  it('fails on invalid ISO code', () => {
    const bad: Country[] = [
      { ...validCountries[0], code: 'INVALID' },
      validCountries[1],
    ];
    const result = validateOutput(bad, testConfig);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('ISO code');
  });

  it('fails on negative GDP', () => {
    const bad: Country[] = [
      {
        ...validCountries[0],
        stats: { ...validCountries[0].stats, gdpPerCapitaUsd: -100 },
      },
      validCountries[1],
    ];
    const result = validateOutput(bad, testConfig);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('gdpPerCapitaUsd');
  });

  it('fails on Gini out of range', () => {
    const bad: Country[] = [
      {
        ...validCountries[0],
        stats: { ...validCountries[0].stats, giniIndex: 150 },
      },
      validCountries[1],
    ];
    const result = validateOutput(bad, testConfig);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('giniIndex');
  });
});

// --- validateConfig ---

describe('validateConfig', () => {
  it('passes with valid config shape', () => {
    const errors = validateConfig(testConfig);
    expect(errors).toHaveLength(0);
  });

  it('fails on non-object', () => {
    expect(validateConfig('string')).toContain('Config must be a JSON object');
  });

  it('fails on missing sections', () => {
    const errors = validateConfig({});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('source'))).toBe(true);
    expect(errors.some((e) => e.includes('indicators'))).toBe(true);
  });

  it('fails on missing indicator', () => {
    const bad = {
      ...testConfig,
      indicators: { ...testConfig.indicators, gniPerCapitaUsd: undefined },
    };
    const errors = validateConfig(bad);
    expect(errors.some((e) => e.includes('gniPerCapitaUsd'))).toBe(true);
  });
});

// --- new optional macro-economic fields ---

describe('transformCountries — optional fields', () => {
  it('sets optional fields to null when absent from raw data', () => {
    const rawData = new Map([
      ['KE', {
        iso2Code: 'KE',
        countryName: 'Kenya',
        values: {
          gdpPerCapitaUsd: { value: 2099, year: '2023' },
          gniPerCapitaUsd: { value: 2010, year: '2023' },
          pppConversionFactor: { value: 49.37, year: '2023' },
          giniIndex: { value: 38.7, year: '2020' },
          population: { value: 54030000, year: '2023' },
          // no macro fields
        },
      }],
    ]);

    const { countries } = transformCountries(rawData, testConfig);
    expect(countries).toHaveLength(1);
    const s = countries[0].stats;
    expect(s.taxRevenuePercentGdp).toBeNull();
    expect(s.inflationRate).toBeNull();
    expect(s.laborForceParticipation).toBeNull();
    expect(s.povertyHeadcountRatio).toBeNull();
    expect(s.urbanizationRate).toBeNull();
  });

  it('populates optional fields when present in raw data', () => {
    const rawData = new Map([
      ['KE', {
        iso2Code: 'KE',
        countryName: 'Kenya',
        values: {
          gdpPerCapitaUsd: { value: 2099, year: '2023' },
          gniPerCapitaUsd: { value: 2010, year: '2023' },
          pppConversionFactor: { value: 49.37, year: '2023' },
          giniIndex: { value: 38.7, year: '2020' },
          population: { value: 54030000, year: '2023' },
          taxRevenuePercentGdp: { value: 16.123, year: '2022' },
          inflationRate: { value: 7.7, year: '2022' },
          unemploymentRate: { value: 5.7, year: '2022' },
          urbanizationRate: { value: 29.5, year: '2022' },
        },
      }],
    ]);

    const { countries } = transformCountries(rawData, testConfig);
    const s = countries[0].stats;
    expect(s.taxRevenuePercentGdp).toBe(16.1); // rounded to 1 decimal
    expect(s.inflationRate).toBe(7.7);
    expect(s.unemploymentRate).toBe(5.7);
    expect(s.urbanizationRate).toBe(29.5);
    // Fields not provided should still be null
    expect(s.laborForceParticipation).toBeNull();
  });
});

describe('validateOutput — optional field range checks', () => {
  it('flags unemployment rate out of range', () => {
    const bad: Country[] = [
      {
        code: 'DE',
        name: 'Germany',
        stats: {
          gdpPerCapitaUsd: 51384, gniPerCapitaUsd: 51640, pppConversionFactor: 0.78,
          giniIndex: 31.7, population: 83800000, incomeGroup: 'HIC',
          unemploymentRate: 150, // invalid
        },
      },
    ];
    const config = { ...testConfig, validation: { ...testConfig.validation, requiredIncomeGroups: ['HIC'] } };
    const result = validateOutput(bad, config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unemploymentRate'))).toBe(true);
  });

  it('allows null optional fields without errors', () => {
    const good: Country[] = [
      {
        code: 'DE',
        name: 'Germany',
        stats: {
          gdpPerCapitaUsd: 51384, gniPerCapitaUsd: 51640, pppConversionFactor: 0.78,
          giniIndex: 31.7, population: 83800000, incomeGroup: 'HIC',
          taxRevenuePercentGdp: null,
          inflationRate: null,
          laborForceParticipation: null,
        },
      },
    ];
    const config = { ...testConfig, validation: { ...testConfig.validation, requiredIncomeGroups: ['HIC'] } };
    const result = validateOutput(good, config);
    expect(result.valid).toBe(true);
  });
});
