import { describe, it, expect } from 'vitest';
import { localAdequacyLine } from './adequacy.js';
import type { Country } from './types.js';

function makeCountry(overrides: Partial<Country['stats']>): Country {
  return {
    code: 'XX',
    name: 'Test',
    stats: {
      gdpPerCapitaUsd: 10000,
      gdpPerCapitaPppUsd: 10000,
      gniPerCapitaUsd: 10000,
      pppConversionFactor: 1,
      giniIndex: 35,
      population: 1000000,
      incomeGroup: 'UMC',
      ...overrides,
    },
  };
}

describe('localAdequacyLine', () => {
  it('is pure — same input produces the same output', () => {
    const country = makeCountry({ incomeGroup: 'LMC' });
    expect(localAdequacyLine(country)).toEqual(localAdequacyLine(country));
  });

  it('one estimate per income group, matching the poverty ladder basis', () => {
    expect(localAdequacyLine(makeCountry({ incomeGroup: 'LIC' })).basis).toBe('extreme');
    expect(localAdequacyLine(makeCountry({ incomeGroup: 'LMC' })).basis).toBe('lower_middle');
    expect(localAdequacyLine(makeCountry({ incomeGroup: 'UMC' })).basis).toBe('upper_middle');
    expect(localAdequacyLine(makeCountry({ incomeGroup: 'HIC' })).basis).toBe('relative_median');
  });

  it('LIC adequacy sits well below the $210 global anchor', () => {
    const estimate = localAdequacyLine(makeCountry({ incomeGroup: 'LIC' }));
    expect(estimate.monthlyPppUsd).toBeLessThan(210);
    expect(estimate.monthlyPppUsd).toBeCloseTo(64.5, 0);
  });

  it('HIC adequacy scales with the country median income, not a fixed number', () => {
    const poorHic = localAdequacyLine(makeCountry({ incomeGroup: 'HIC', gniPerCapitaUsd: 30000 }));
    const richHic = localAdequacyLine(makeCountry({ incomeGroup: 'HIC', gniPerCapitaUsd: 90000 }));
    expect(richHic.monthlyPppUsd).toBeGreaterThan(poorHic.monthlyPppUsd);
  });

  it('always carries the informational caveat', () => {
    const estimate = localAdequacyLine(makeCountry({}));
    expect(estimate.caveat.length).toBeGreaterThan(0);
    expect(estimate.caveat).toMatch(/informational/i);
  });

  it('carries a human-readable label and source for display', () => {
    const estimate = localAdequacyLine(makeCountry({ incomeGroup: 'LMC' }));
    expect(estimate.label.length).toBeGreaterThan(0);
    expect(estimate.source.length).toBeGreaterThan(0);
  });
});
