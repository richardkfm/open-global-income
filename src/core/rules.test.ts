import { describe, it, expect } from 'vitest';
import { calculateEntitlement } from './rules.js';
import type { Country } from './types.js';

const DATA_VERSION = 'test-snapshot';

const germany: Country = {
  code: 'DE',
  name: 'Germany',
  stats: {
    gdpPerCapitaUsd: 51384,
    pppConversionFactor: 0.78,
    giniIndex: 31.7,
    population: 83800000,
  },
};

const brazil: Country = {
  code: 'BR',
  name: 'Brazil',
  stats: {
    gdpPerCapitaUsd: 8920,
    pppConversionFactor: 2.55,
    giniIndex: 48.9,
    population: 214300000,
  },
};

const nigeria: Country = {
  code: 'NG',
  name: 'Nigeria',
  stats: {
    gdpPerCapitaUsd: 2184,
    pppConversionFactor: 168.5,
    giniIndex: 35.1,
    population: 218500000,
  },
};

describe('calculateEntitlement', () => {
  it('calculates low score for high-income country (DE)', () => {
    const result = calculateEntitlement(germany, DATA_VERSION);
    expect(result.countryCode).toBe('DE');
    expect(result.pppUsdPerMonth).toBe(200);
    expect(result.localCurrencyPerMonth).toBe(156);
    expect(result.score).toBeLessThan(0.1);
    expect(result.score).toBeGreaterThan(0);
    expect(result.meta.rulesetVersion).toBe('stub-v0.0.1');
    expect(result.meta.dataVersion).toBe(DATA_VERSION);
  });

  it('calculates moderate score for middle-income country (BR)', () => {
    const result = calculateEntitlement(brazil, DATA_VERSION);
    expect(result.countryCode).toBe('BR');
    expect(result.pppUsdPerMonth).toBe(200);
    expect(result.localCurrencyPerMonth).toBe(510);
    expect(result.score).toBeGreaterThan(0.2);
    expect(result.score).toBeLessThan(0.4);
  });

  it('clamps score to 1.0 for low-income country (NG)', () => {
    const result = calculateEntitlement(nigeria, DATA_VERSION);
    expect(result.countryCode).toBe('NG');
    expect(result.pppUsdPerMonth).toBe(200);
    expect(result.localCurrencyPerMonth).toBe(33700);
    expect(result.score).toBe(1);
  });

  it('handles zero GDP gracefully', () => {
    const zeroGdp: Country = {
      code: 'XX',
      name: 'Test',
      stats: {
        gdpPerCapitaUsd: 0,
        pppConversionFactor: 1,
        giniIndex: null,
        population: 1000,
      },
    };
    const result = calculateEntitlement(zeroGdp, DATA_VERSION);
    expect(result.score).toBe(1);
  });

  it('includes correct metadata', () => {
    const result = calculateEntitlement(germany, DATA_VERSION);
    expect(result.meta).toEqual({
      rulesetVersion: 'stub-v0.0.1',
      dataVersion: DATA_VERSION,
    });
  });
});
