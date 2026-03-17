import { describe, it, expect } from 'vitest';
import { calculateEntitlement } from './rules.js';
import type { Country } from './types.js';

const DATA_VERSION = 'test-snapshot';

// Representative countries across all four income groups

const germany: Country = {
  code: 'DE',
  name: 'Germany',
  stats: {
    gdpPerCapitaUsd: 51384,
    gniPerCapitaUsd: 51640,
    pppConversionFactor: 0.78,
    giniIndex: 31.7,
    population: 83800000,
    incomeGroup: 'HIC',
  },
};

const brazil: Country = {
  code: 'BR',
  name: 'Brazil',
  stats: {
    gdpPerCapitaUsd: 8920,
    gniPerCapitaUsd: 9140,
    pppConversionFactor: 2.55,
    giniIndex: 48.9,
    population: 214300000,
    incomeGroup: 'UMC',
  },
};

const india: Country = {
  code: 'IN',
  name: 'India',
  stats: {
    gdpPerCapitaUsd: 2485,
    gniPerCapitaUsd: 2390,
    pppConversionFactor: 22.88,
    giniIndex: 35.7,
    population: 1417200000,
    incomeGroup: 'LMC',
  },
};

const nigeria: Country = {
  code: 'NG',
  name: 'Nigeria',
  stats: {
    gdpPerCapitaUsd: 2184,
    gniPerCapitaUsd: 2140,
    pppConversionFactor: 168.5,
    giniIndex: 35.1,
    population: 218500000,
    incomeGroup: 'LMC',
  },
};

const burundi: Country = {
  code: 'BI',
  name: 'Burundi',
  stats: {
    gdpPerCapitaUsd: 259,
    gniPerCapitaUsd: 240,
    pppConversionFactor: 741.0,
    giniIndex: 38.6,
    population: 12890000,
    incomeGroup: 'LIC',
  },
};

const southAfrica: Country = {
  code: 'ZA',
  name: 'South Africa',
  stats: {
    gdpPerCapitaUsd: 6190,
    gniPerCapitaUsd: 6010,
    pppConversionFactor: 6.76,
    giniIndex: 63.0,
    population: 60400000,
    incomeGroup: 'UMC',
  },
};

describe('calculateEntitlement (Ruleset v1)', () => {
  it('produces low score for high-income country (DE)', () => {
    const result = calculateEntitlement(germany, DATA_VERSION);
    expect(result.countryCode).toBe('DE');
    expect(result.pppUsdPerMonth).toBe(210);
    expect(result.localCurrencyPerMonth).toBe(163.8);
    expect(result.score).toBeLessThan(0.1);
    expect(result.score).toBeGreaterThan(0);
    expect(result.meta.rulesetVersion).toBe('v1');
    expect(result.meta.dataVersion).toBe(DATA_VERSION);
  });

  it('produces moderate score for upper-middle-income country (BR)', () => {
    const result = calculateEntitlement(brazil, DATA_VERSION);
    expect(result.pppUsdPerMonth).toBe(210);
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.score).toBeLessThan(0.5);
  });

  it('produces high score for lower-middle-income country (IN)', () => {
    const result = calculateEntitlement(india, DATA_VERSION);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('clamps score to 1.0 for low-income country (BI)', () => {
    const result = calculateEntitlement(burundi, DATA_VERSION);
    expect(result.score).toBe(1);
    // localCurrencyPerMonth should be correctly calculated
    expect(result.localCurrencyPerMonth).toBe(155610);
  });

  it('inequality amplifies score (ZA has high Gini)', () => {
    // South Africa: moderate GNI but extreme inequality (Gini=63)
    const result = calculateEntitlement(southAfrica, DATA_VERSION);
    // Without Gini penalty: 210 / (6010/12) ≈ 0.419
    // With Gini penalty: + 63/100 * 0.15 = + 0.0945 → ~0.514
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('handles null Gini gracefully (no penalty applied)', () => {
    const noGini: Country = {
      code: 'XX',
      name: 'No Gini Data',
      stats: {
        gdpPerCapitaUsd: 50000,
        gniPerCapitaUsd: 50000,
        pppConversionFactor: 1.0,
        giniIndex: null,
        population: 1000000,
        incomeGroup: 'HIC',
      },
    };
    const result = calculateEntitlement(noGini, DATA_VERSION);
    // 210 / (50000/12) ≈ 0.0504, no Gini penalty
    expect(result.score).toBeCloseTo(0.0504, 3);
  });

  it('handles zero GNI gracefully', () => {
    const zeroGni: Country = {
      code: 'XX',
      name: 'Test',
      stats: {
        gdpPerCapitaUsd: 0,
        gniPerCapitaUsd: 0,
        pppConversionFactor: 1,
        giniIndex: null,
        population: 1000,
        incomeGroup: 'LIC',
      },
    };
    const result = calculateEntitlement(zeroGni, DATA_VERSION);
    expect(result.score).toBe(1);
  });

  it('score ordering matches income group ordering', () => {
    const deResult = calculateEntitlement(germany, DATA_VERSION);
    const brResult = calculateEntitlement(brazil, DATA_VERSION);
    const ngResult = calculateEntitlement(nigeria, DATA_VERSION);
    const biResult = calculateEntitlement(burundi, DATA_VERSION);

    // Lower income → higher score (more need)
    expect(deResult.score).toBeLessThan(brResult.score);
    expect(brResult.score).toBeLessThan(ngResult.score);
    expect(ngResult.score).toBeLessThanOrEqual(biResult.score);
  });

  it('is deterministic (same inputs produce same outputs)', () => {
    const a = calculateEntitlement(india, DATA_VERSION);
    const b = calculateEntitlement(india, DATA_VERSION);
    expect(a).toEqual(b);
  });

  it('includes correct metadata', () => {
    const result = calculateEntitlement(germany, DATA_VERSION);
    expect(result.meta).toEqual({
      rulesetVersion: 'v1',
      dataVersion: DATA_VERSION,
    });
  });
});
