import { describe, it, expect } from 'vitest';
import { getCountryByCode, getAllCountries, getDataVersion } from './loader.js';

describe('data loader', () => {
  it('returns the worldbank data version string', () => {
    expect(getDataVersion()).toBe('worldbank-2023');
  });

  it('loads all countries (49 in Phase 2 dataset)', () => {
    const countries = getAllCountries();
    expect(countries.length).toBeGreaterThanOrEqual(40);
  });

  it('includes countries from all income groups', () => {
    const countries = getAllCountries();
    const groups = new Set(countries.map((c) => c.stats.incomeGroup));
    expect(groups).toContain('HIC');
    expect(groups).toContain('UMC');
    expect(groups).toContain('LMC');
    expect(groups).toContain('LIC');
  });

  it('finds a country by code (case-insensitive)', () => {
    const de = getCountryByCode('de');
    expect(de).toBeDefined();
    expect(de!.name).toBe('Germany');
    expect(de!.stats.gdpPerCapitaUsd).toBe(51384);
    expect(de!.stats.gniPerCapitaUsd).toBe(51640);
    expect(de!.stats.incomeGroup).toBe('HIC');
  });

  it('returns undefined for unknown country', () => {
    expect(getCountryByCode('XX')).toBeUndefined();
  });

  it('every country has valid stats', () => {
    for (const country of getAllCountries()) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.name.length).toBeGreaterThan(0);
      expect(country.stats.gdpPerCapitaUsd).toBeGreaterThan(0);
      expect(country.stats.gniPerCapitaUsd).toBeGreaterThan(0);
      expect(country.stats.pppConversionFactor).toBeGreaterThan(0);
      expect(country.stats.population).toBeGreaterThan(0);
      expect(['HIC', 'UMC', 'LMC', 'LIC']).toContain(
        country.stats.incomeGroup,
      );
      if (country.stats.giniIndex !== null) {
        expect(country.stats.giniIndex).toBeGreaterThan(0);
        expect(country.stats.giniIndex).toBeLessThanOrEqual(100);
      }
    }
  });
});
