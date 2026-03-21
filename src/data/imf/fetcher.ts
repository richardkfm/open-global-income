import type { ImfConfig, ImfIndicatorField } from './config.types.js';

export interface ImfCountryData {
  /** ISO2 country code */
  iso2: string;
  values: Partial<Record<ImfIndicatorField, { value: number; year: string }>>;
}

// IMF SDMX JSON response types
interface ImfObservation {
  [key: string]: string | number | null | (string | number | null)[];
}

interface ImfSeries {
  [seriesKey: string]: {
    '@KEY': string;
    '@START_PERIOD'?: string;
    '@END_PERIOD'?: string;
    Obs: ImfObservation[];
  };
}

interface ImfDataSet {
  Series: ImfSeries;
}

interface ImfSdmxResponse {
  CompactData: {
    DataSet: ImfDataSet;
    '@xmlns'?: string;
  };
}

async function fetchWithRetry(url: string, retries: number, delayMs: number): Promise<unknown> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 404 || res.status === 400) {
        return null; // Indicator not available
      }
      if (res.status >= 500 && attempt < retries) {
        console.error(`  IMF retry ${attempt + 1}/${retries} after ${res.status}...`);
        await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (attempt < retries) {
        console.error(`  IMF retry ${attempt + 1}/${retries} after error: ${err}`);
        await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

/**
 * Fetch a single IMF GFS indicator for all countries.
 * IMF SDMX JSON URL format:
 *   {baseUrl}/GetData/{dataset}/{indicatorCode}/all?startPeriod=2015&endPeriod=2024
 *
 * Returns a Map from ISO2 country code to the most recent non-null value.
 */
export async function fetchImfIndicator(
  config: ImfConfig,
  field: ImfIndicatorField,
): Promise<Map<string, { value: number; year: string }>> {
  const indicatorCode = config.indicators[field];
  const startPeriod = new Date().getFullYear() - 10;
  const endPeriod = new Date().getFullYear();
  const url =
    `${config.source.baseUrl}/GetData/${config.source.dataset}/` +
    `${indicatorCode}/all?startPeriod=${startPeriod}&endPeriod=${endPeriod}`;

  console.error(`  Fetching IMF ${field} (${indicatorCode})...`);

  const result = new Map<string, { value: number; year: string }>();

  let json: unknown;
  try {
    json = await fetchWithRetry(url, config.source.retries, config.source.retryDelayMs);
  } catch (err) {
    console.error(`  WARNING: Could not fetch IMF ${field}: ${err}`);
    return result;
  }

  if (json === null) {
    console.error(`  WARNING: IMF indicator ${indicatorCode} not available — skipping`);
    return result;
  }

  try {
    const response = json as ImfSdmxResponse;
    const seriesData = response.CompactData?.DataSet?.Series;
    if (!seriesData) {
      return result;
    }

    // IMF SDMX JSON: series keys encode country code in the @KEY attribute
    // e.g., "@KEY": "GFS.A.US.G_X1_G01_GDP_PT"
    // Structure: {dataset}.{frequency}.{country}.{indicator}
    for (const [, series] of Object.entries(seriesData)) {
      if (!series['@KEY']) continue;
      const keyParts = series['@KEY'].split('.');
      // Country code is at index 2: {dataset}.{freq}.{country}.{indicator}
      const iso2 = keyParts[2];
      if (!iso2 || iso2.length !== 2) continue;

      const observations = series.Obs;
      if (!Array.isArray(observations)) continue;

      for (const obs of observations) {
        const tpRaw = obs['@TIME_PERIOD'];
        const timePeriod = typeof tpRaw === 'string' ? tpRaw : (Array.isArray(tpRaw) ? String(tpRaw[0] ?? '') : undefined);
        const ovRaw = obs['@OBS_VALUE'];
        const rawValue: string | number | null | undefined = Array.isArray(ovRaw)
          ? (ovRaw[0] as string | number | null | undefined)
          : (ovRaw as string | number | null | undefined);

        if (!timePeriod || rawValue === null || rawValue === undefined) continue;

        const numValue = typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue;
        if (isNaN(numValue)) continue;

        const existing = result.get(iso2);
        if (!existing || timePeriod > existing.year) {
          result.set(iso2, { value: numValue, year: timePeriod });
        }
      }
    }
  } catch (err) {
    console.error(`  WARNING: Failed to parse IMF response for ${field}: ${err}`);
  }

  console.error(`    → ${result.size} countries with IMF ${field} data`);
  return result;
}

/**
 * Fetch all configured IMF indicators and merge into per-country records.
 */
export async function fetchAllImfIndicators(
  config: ImfConfig,
): Promise<Map<string, ImfCountryData>> {
  const fields = Object.keys(config.indicators) as ImfIndicatorField[];
  const allData = new Map<string, ImfCountryData>();

  for (const field of fields) {
    const indicatorMap = await fetchImfIndicator(config, field);

    for (const [iso2, iv] of indicatorMap) {
      let entry = allData.get(iso2);
      if (!entry) {
        entry = { iso2, values: {} };
        allData.set(iso2, entry);
      }
      entry.values[field] = iv;
    }
  }

  return allData;
}
