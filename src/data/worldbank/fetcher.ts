import type { ImporterConfig, IndicatorField } from './config.types.js';

export interface IndicatorValue {
  value: number | null;
  year: string;
}

export interface RawCountryData {
  countryName: string;
  iso2Code: string;
  values: Partial<Record<IndicatorField, IndicatorValue>>;
}

interface WBRecord {
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

async function fetchWithRetry(
  url: string,
  retries: number,
  delayMs: number,
): Promise<unknown> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
      if (res.status >= 500 && attempt < retries) {
        console.error(`  Retry ${attempt + 1}/${retries} after ${res.status}...`);
        await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (attempt < retries) {
        console.error(`  Retry ${attempt + 1}/${retries} after error: ${err}`);
        await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

/**
 * Fetch a single indicator for the configured countries.
 * Returns a Map from ISO2 code to the most recent non-null value.
 */
export async function fetchIndicator(
  config: ImporterConfig,
  field: IndicatorField,
): Promise<Map<string, IndicatorValue>> {
  const indicatorCode = config.indicators[field];
  const countryCodes =
    config.countries.mode === 'all'
      ? 'all'
      : config.countries.codes.join(';');

  // For sparse indicators (infrequent reporters), request more years of history
  const sparseConfig = config.sparseIndicators?.[field];
  const mrnev = sparseConfig
    ? sparseConfig.lookbackYears
    : field === 'giniIndex'
      ? config.giniIndex.lookbackYears
      : 1;

  const url =
    `${config.source.baseUrl}/country/${countryCodes}/indicator/${indicatorCode}` +
    `?format=${config.source.format}&mrnev=${mrnev}&per_page=${config.source.perPage}`;

  console.error(`  Fetching ${field} (${indicatorCode})...`);

  const result = new Map<string, IndicatorValue>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const pageUrl = page === 1 ? url : `${url}&page=${page}`;
    const json = (await fetchWithRetry(
      pageUrl,
      config.source.retries,
      config.source.retryDelayMs,
    )) as [{ pages: number; total: number }, WBRecord[] | null];

    // WB API returns a 2-element array: [metadata, data]
    if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
      break;
    }

    totalPages = json[0].pages;
    const records = json[1];

    for (const rec of records) {
      const iso2 = rec.country.id;
      if (rec.value === null) continue;

      // Keep only the most recent year per country
      const existing = result.get(iso2);
      if (!existing || rec.date > existing.year) {
        result.set(iso2, { value: rec.value, year: rec.date });
      }
    }

    page++;
  }

  console.error(`    → ${result.size} countries with data`);
  return result;
}

/**
 * Fetch all configured indicators and merge into RawCountryData records.
 */
export async function fetchAllIndicators(
  config: ImporterConfig,
): Promise<Map<string, RawCountryData>> {
  const fields = Object.keys(config.indicators) as IndicatorField[];
  const allData = new Map<string, RawCountryData>();

  // Determine the set of country codes to track
  const targetCodes =
    config.countries.mode === 'explicit'
      ? new Set(config.countries.codes.map((c) => c.toUpperCase()))
      : null; // null means accept all
  const excludeCodes = new Set(
    (config.countries.exclude ?? []).map((c) => c.toUpperCase()),
  );

  for (const field of fields) {
    const indicatorMap = await fetchIndicator(config, field);

    for (const [iso2, iv] of indicatorMap) {
      if (targetCodes && !targetCodes.has(iso2)) continue;
      if (excludeCodes.has(iso2)) continue;

      let entry = allData.get(iso2);
      if (!entry) {
        entry = { countryName: '', iso2Code: iso2, values: {} };
        allData.set(iso2, entry);
      }
      entry.values[field] = iv;
    }
  }

  // Fetch country names from the first indicator's raw response
  // (the WB API includes country.value = name in every response)
  // We already have iso2 codes; let's do a separate lightweight call for names
  await fetchCountryNames(config, allData);

  return allData;
}

async function fetchCountryNames(
  config: ImporterConfig,
  data: Map<string, RawCountryData>,
): Promise<void> {
  const countryCodes =
    config.countries.mode === 'all'
      ? 'all'
      : config.countries.codes.join(';');

  const url =
    `${config.source.baseUrl}/country/${countryCodes}` +
    `?format=${config.source.format}&per_page=${config.source.perPage}`;

  try {
    const json = (await fetchWithRetry(
      url,
      config.source.retries,
      config.source.retryDelayMs,
    )) as [{ pages: number }, Array<{ id: string; iso2Code: string; name: string }> | null];

    if (Array.isArray(json) && json.length >= 2 && Array.isArray(json[1])) {
      for (const rec of json[1]) {
        const iso2 = rec.iso2Code || rec.id;
        const entry = data.get(iso2);
        if (entry) {
          entry.countryName = rec.name;
        }
      }
    }
  } catch {
    // Non-fatal — names will be empty strings
    console.error('  Warning: could not fetch country names');
  }
}
