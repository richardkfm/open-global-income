import { readFileSync } from 'node:fs';
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
