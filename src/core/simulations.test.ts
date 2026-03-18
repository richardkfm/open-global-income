import { describe, it, expect } from 'vitest';
import { calculateSimulation } from './simulations.js';
import type { Country, SimulationParameters } from './types.js';

const DATA_VERSION = 'test-snapshot';

const kenya: Country = {
  code: 'KE',
  name: 'Kenya',
  stats: {
    gdpPerCapitaUsd: 2099,
    gniPerCapitaUsd: 2010,
    pppConversionFactor: 49.37,
    giniIndex: 38.7,
    population: 54030000,
    incomeGroup: 'LMC',
  },
};

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

const defaultParams: SimulationParameters = {
  country: 'KE',
  coverage: 0.2,
  targetGroup: 'all',
  durationMonths: 12,
  adjustments: { floorOverride: null, householdSize: null },
};

describe('calculateSimulation', () => {
  it('calculates recipient count correctly for targetGroup=all', () => {
    const result = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    // 54030000 × 0.2 = 10806000
    expect(result.simulation.recipientCount).toBe(10806000);
  });

  it('calculates recipient count correctly for targetGroup=bottom_quintile', () => {
    const params: SimulationParameters = { ...defaultParams, coverage: 1.0, targetGroup: 'bottom_quintile' };
    const result = calculateSimulation(kenya, params, DATA_VERSION);
    // 54030000 × 0.2 (bottom quintile) × 1.0 (coverage) = 10806000
    expect(result.simulation.recipientCount).toBe(10806000);
  });

  it('bottom_quintile with partial coverage = 50% of bottom quintile', () => {
    const params: SimulationParameters = { ...defaultParams, coverage: 0.5, targetGroup: 'bottom_quintile' };
    const result = calculateSimulation(kenya, params, DATA_VERSION);
    // 54030000 × 0.2 × 0.5 = 5403000
    expect(result.simulation.recipientCount).toBe(5403000);
  });

  it('calculates local currency per month using PPP conversion factor', () => {
    const result = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    // 210 × 49.37 = 10367.7
    expect(result.simulation.entitlementPerPerson.localCurrencyPerMonth).toBe(10367.7);
  });

  it('calculates monthly total cost', () => {
    const result = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    // 10806000 × 10367.7 = 112033366200
    expect(result.simulation.cost.monthlyLocalCurrency).toBeCloseTo(112033366200, -2);
  });

  it('calculates annual cost as monthly × durationMonths', () => {
    const result = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    const expected = result.simulation.cost.monthlyLocalCurrency * 12;
    expect(result.simulation.cost.annualLocalCurrency).toBeCloseTo(expected, 0);
  });

  it('calculates annual PPP USD cost', () => {
    const result = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    // 10806000 × 210 × 12 = 27231120000
    expect(result.simulation.cost.annualPppUsd).toBe(27231120000);
  });

  it('calculates GDP percentage', () => {
    const result = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    // annualPppUsd / (gdpPerCapitaUsd × population) × 100
    const gdpTotal = kenya.stats.gdpPerCapitaUsd * kenya.stats.population;
    const expected = (result.simulation.cost.annualPppUsd / gdpTotal) * 100;
    expect(result.simulation.cost.asPercentOfGdp).toBeCloseTo(expected, 1);
  });

  it('uses floorOverride when provided', () => {
    const params: SimulationParameters = {
      ...defaultParams,
      adjustments: { floorOverride: 100, householdSize: null },
    };
    const result = calculateSimulation(kenya, params, DATA_VERSION);
    expect(result.simulation.entitlementPerPerson.pppUsdPerMonth).toBe(100);
    // 100 × 49.37 = 4937
    expect(result.simulation.entitlementPerPerson.localCurrencyPerMonth).toBe(4937);
  });

  it('includes correct country info', () => {
    const result = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    expect(result.country.code).toBe('KE');
    expect(result.country.name).toBe('Kenya');
    expect(result.country.population).toBe(54030000);
  });

  it('includes correct metadata', () => {
    const result = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    expect(result.simulation.meta.rulesetVersion).toBe('v1');
    expect(result.simulation.meta.dataVersion).toBe(DATA_VERSION);
  });

  it('coverage rate is preserved in result', () => {
    const result = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    expect(result.simulation.coverageRate).toBe(0.2);
  });

  it('is deterministic', () => {
    const a = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    const b = calculateSimulation(kenya, defaultParams, DATA_VERSION);
    expect(a).toEqual(b);
  });

  it('works for high-income country (Germany)', () => {
    const params: SimulationParameters = { ...defaultParams, country: 'DE' };
    const result = calculateSimulation(germany, params, DATA_VERSION);
    // 83800000 × 0.2 = 16760000
    expect(result.simulation.recipientCount).toBe(16760000);
    // 210 × 0.78 = 163.8
    expect(result.simulation.entitlementPerPerson.localCurrencyPerMonth).toBe(163.8);
    // GDP % should be low for HIC
    expect(result.simulation.cost.asPercentOfGdp).toBeLessThan(1);
  });

  it('handles coverage=1.0 (universal)', () => {
    const params: SimulationParameters = { ...defaultParams, coverage: 1.0 };
    const result = calculateSimulation(kenya, params, DATA_VERSION);
    expect(result.simulation.recipientCount).toBe(54030000);
  });

  it('handles 1-month duration', () => {
    const params: SimulationParameters = { ...defaultParams, durationMonths: 1 };
    const result = calculateSimulation(kenya, params, DATA_VERSION);
    expect(result.simulation.cost.annualLocalCurrency).toBe(
      result.simulation.cost.monthlyLocalCurrency,
    );
  });
});
