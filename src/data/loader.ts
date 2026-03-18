import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Country } from '../core/types.js';

interface CountryDataFile {
  dataVersion: string;
  countries: Country[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cached: CountryDataFile | null = null;

function load(): CountryDataFile {
  if (cached) return cached;
  const filePath = join(__dirname, 'countries.json');
  const raw = readFileSync(filePath, 'utf-8');
  cached = JSON.parse(raw) as CountryDataFile;
  return cached;
}

/** Get the data version string for the current dataset */
export function getDataVersion(): string {
  return load().dataVersion;
}

/** Get all available countries */
export function getAllCountries(): Country[] {
  return load().countries;
}

/** Look up a country by ISO 3166-1 alpha-2 code (case-insensitive) */
export function getCountryByCode(code: string): Country | undefined {
  const upper = code.toUpperCase();
  return load().countries.find((c) => c.code === upper);
}

/** Get available data snapshots (multi-version support) */
export function getAvailableSnapshots(): string[] {
  const snapshotDir = join(__dirname, 'snapshots');
  if (!existsSync(snapshotDir)) return [];

  return readdirSync(snapshotDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
}

/** Load a specific snapshot by filename */
export function loadSnapshot(filename: string): CountryDataFile | null {
  const filePath = join(__dirname, 'snapshots', filename);
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as CountryDataFile;
}

/** Validate country data integrity */
export function validateCountryData(data: CountryDataFile): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.dataVersion) {
    errors.push('Missing dataVersion');
  }

  if (!Array.isArray(data.countries) || data.countries.length === 0) {
    errors.push('No countries in dataset');
  }

  const codes = new Set<string>();
  for (const country of data.countries) {
    if (codes.has(country.code)) {
      errors.push(`Duplicate country code: ${country.code}`);
    }
    codes.add(country.code);

    if (!country.code || country.code.length !== 2) {
      errors.push(`Invalid country code: ${country.code}`);
    }

    if (!country.name) {
      errors.push(`Missing name for country: ${country.code}`);
    }

    const s = country.stats;
    if (s.gdpPerCapitaUsd < 0) errors.push(`${country.code}: negative GDP`);
    if (s.gniPerCapitaUsd < 0) errors.push(`${country.code}: negative GNI`);
    if (s.pppConversionFactor <= 0) errors.push(`${country.code}: invalid PPP factor`);
    if (s.population < 0) errors.push(`${country.code}: negative population`);
    if (s.giniIndex !== null && (s.giniIndex < 0 || s.giniIndex > 100)) {
      errors.push(`${country.code}: Gini out of range: ${s.giniIndex}`);
    }
  }

  // Check income group coverage
  const groups = new Set(data.countries.map((c) => c.stats.incomeGroup));
  for (const required of ['HIC', 'UMC', 'LMC', 'LIC'] as const) {
    if (!groups.has(required)) {
      errors.push(`Missing income group: ${required}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Reset the cache (for testing) */
export function resetCache(): void {
  cached = null;
}
