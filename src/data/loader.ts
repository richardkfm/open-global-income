import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Country, Region } from '../core/types.js';

interface RegionDataFile {
  dataVersion: string;
  source?: string;
  regions: Region[];
}

interface CountryDataFile {
  dataVersion: string;
  source?: string;
  completeness?: string[];
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

/**
 * The full list of optional macro-economic fields that Phase 14 introduces.
 * Used to compute per-country data completeness scores.
 */
const OPTIONAL_STAT_FIELDS: ReadonlyArray<keyof Country['stats']> = [
  'taxRevenuePercentGdp',
  'socialProtectionSpendingPercentGdp',
  'inflationRate',
  'laborForceParticipation',
  'unemploymentRate',
  'governmentDebtPercentGdp',
  'socialContributionsPercentRevenue',
  'povertyHeadcountRatio',
  'gdpGrowthRate',
  'healthExpenditurePercentGdp',
  'educationExpenditurePercentGdp',
  'urbanizationRate',
  'socialProtectionCoveragePercent',
  'socialProtectionExpenditureIloPercentGdp',
  'pensionCoveragePercent',
  'childBenefitCoveragePercent',
  'taxBreakdown',
];

export interface DataCompleteness {
  /** Total optional fields tracked */
  total: number;
  /** Fields with non-null values */
  available: number;
  /** Which fields are explicitly null (fetched but not reported for this country) */
  unavailable: number;
  /** Which fields are undefined (never fetched / data file predates this field) */
  notFetched: number;
  /** Fields that are null (fetched, not reported) */
  unavailableFields: string[];
  /** Fields that are undefined (never fetched) */
  notFetchedFields: string[];
  /** Which fields are missing (null or undefined) — union of unavailable + notFetched */
  missingFields: string[];
  /** Which fields have data */
  presentFields: string[];
}

/**
 * Return a completeness report for a single country's optional macro-economic data.
 * Core fields (GDP, GNI, PPP, Gini, population, incomeGroup) are always present.
 *
 * Distinguishes between:
 * - present: field has a non-null value
 * - unavailable: field is explicitly null (data was fetched but not reported for this country)
 * - notFetched: field is undefined (data file predates this indicator or importer was not run)
 */
export function getCountryDataCompleteness(code: string): DataCompleteness | null {
  const country = getCountryByCode(code);
  if (!country) return null;

  const presentFields: string[] = [];
  const unavailableFields: string[] = [];
  const notFetchedFields: string[] = [];

  for (const field of OPTIONAL_STAT_FIELDS) {
    const val = country.stats[field];
    if (val !== null && val !== undefined) {
      presentFields.push(field as string);
    } else if (val === null) {
      unavailableFields.push(field as string);
    } else {
      notFetchedFields.push(field as string);
    }
  }

  return {
    total: OPTIONAL_STAT_FIELDS.length,
    available: presentFields.length,
    unavailable: unavailableFields.length,
    notFetched: notFetchedFields.length,
    unavailableFields,
    notFetchedFields,
    missingFields: [...unavailableFields, ...notFetchedFields],
    presentFields,
  };
}

/** Reset the cache (for testing) */
export function resetCache(): void {
  cached = null;
}

// ── Region data loader ────────────────────────────────────────────────────────

let cachedRegions: RegionDataFile | null = null;

function loadRegions(): RegionDataFile {
  if (cachedRegions) return cachedRegions;
  const filePath = join(__dirname, 'regions.json');
  if (!existsSync(filePath)) {
    cachedRegions = { dataVersion: 'none', regions: [] };
    return cachedRegions;
  }
  const raw = readFileSync(filePath, 'utf-8');
  cachedRegions = JSON.parse(raw) as RegionDataFile;
  return cachedRegions;
}

/** Get the data version string for the regions dataset */
export function getRegionsDataVersion(): string {
  return loadRegions().dataVersion;
}

/** Get all regions */
export function getAllRegions(): Region[] {
  return loadRegions().regions;
}

/** Look up a region by its id (e.g. "KE-NAI"), case-insensitive */
export function getRegionById(id: string): Region | undefined {
  const upper = id.toUpperCase();
  return loadRegions().regions.find((r) => r.id === upper);
}

/** Get all regions for a given country code */
export function getRegionsByCountry(countryCode: string): Region[] {
  const upper = countryCode.toUpperCase();
  return loadRegions().regions.filter((r) => r.countryCode === upper);
}

/** Reset the regions cache (for testing) */
export function resetRegionsCache(): void {
  cachedRegions = null;
}
