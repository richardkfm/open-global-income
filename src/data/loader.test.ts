import { describe, it, expect } from 'vitest';
import { getCountryByCode, getAllCountries, getDataVersion } from './loader.js';

describe('data loader', () => {
  it('returns a data version string', () => {
    expect(getDataVersion()).toBe('dummy-2026-03-01');
  });

  it('loads all countries', () => {
    const countries = getAllCountries();
    expect(countries).toHaveLength(3);
    expect(countries.map((c) => c.code)).toEqual(['DE', 'BR', 'NG']);
  });

  it('finds a country by code (case-insensitive)', () => {
    const de = getCountryByCode('de');
    expect(de).toBeDefined();
    expect(de!.name).toBe('Germany');
    expect(de!.stats.gdpPerCapitaUsd).toBe(51384);
  });

  it('returns undefined for unknown country', () => {
    expect(getCountryByCode('XX')).toBeUndefined();
  });
});
