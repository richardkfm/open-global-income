import { describe, it, expect } from 'vitest';
import {
  getCountryByCode,
  getAllCountries,
  getDataVersion,
  validateCountryData,
  getCountryDataCompleteness,
} from './loader.js';

describe('data loader', () => {
  it('returns a worldbank data version string', () => {
    expect(getDataVersion()).toMatch(/^worldbank-\d{4}/);
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
      expect(['HIC', 'UMC', 'LMC', 'LIC']).toContain(country.stats.incomeGroup);
      if (country.stats.giniIndex !== null) {
        expect(country.stats.giniIndex).toBeGreaterThan(0);
        expect(country.stats.giniIndex).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('validateCountryData', () => {
  it('validates the current dataset', () => {
    const data = {
      dataVersion: getDataVersion(),
      countries: getAllCountries(),
    };
    const result = validateCountryData(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty dataset', () => {
    const result = validateCountryData({ dataVersion: '', countries: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects duplicate country codes', () => {
    const country = getAllCountries()[0];
    const result = validateCountryData({
      dataVersion: 'test',
      countries: [country, country],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });
});

describe('getCountryDataCompleteness', () => {
  it('returns null for unknown country code', () => {
    expect(getCountryDataCompleteness('ZZ')).toBeNull();
  });

  it('returns a completeness report with total and available counts', () => {
    const result = getCountryDataCompleteness('US');
    expect(result).not.toBeNull();
    expect(result!.total).toBeGreaterThan(0);
    expect(result!.available).toBeGreaterThanOrEqual(0);
    expect(result!.available).toBeLessThanOrEqual(result!.total);
  });

  it('tracks missingFields and presentFields', () => {
    const result = getCountryDataCompleteness('US');
    expect(Array.isArray(result!.missingFields)).toBe(true);
    expect(Array.isArray(result!.presentFields)).toBe(true);
    expect(result!.missingFields.length + result!.presentFields.length).toBe(result!.total);
  });

  it('distinguishes unavailable (null) from notFetched (undefined)', () => {
    const result = getCountryDataCompleteness('US');
    expect(result).not.toBeNull();
    expect(typeof result!.unavailable).toBe('number');
    expect(typeof result!.notFetched).toBe('number');
    expect(Array.isArray(result!.unavailableFields)).toBe(true);
    expect(Array.isArray(result!.notFetchedFields)).toBe(true);
    expect(result!.unavailable + result!.notFetched + result!.available).toBe(result!.total);
    expect(result!.unavailableFields.length).toBe(result!.unavailable);
    expect(result!.notFetchedFields.length).toBe(result!.notFetched);
  });

  it('works for a country with likely sparse data', () => {
    // Burundi (BI) is known to have sparse macro data
    const result = getCountryDataCompleteness('BI');
    if (result) {
      expect(result.total).toBe(17);
      // At least some fields are expected to be available or null — just no crash
      expect(result.available + result.missingFields.length).toBe(result.total);
    }
  });
});
