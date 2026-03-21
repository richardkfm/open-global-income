import type { IloConfig, IloIndicatorField } from './config.types.js';

export interface IloCountryData {
  /** ISO2 country code */
  iso2: string;
  /** Map from field name to most recent value */
  values: Partial<Record<IloIndicatorField, { value: number; year: string }>>;
}

interface SdmxJsonObservation {
  [dimensionIndex: string]: number | string;
}

interface SdmxJsonSeriesEntry {
  attributes: number[];
  observations: Record<string, SdmxJsonObservation>;
}

interface SdmxJsonDataSet {
  series: Record<string, SdmxJsonSeriesEntry>;
}

interface SdmxJsonStructureDimension {
  id: string;
  values: Array<{ id: string; name: string }>;
}

interface SdmxJsonResponse {
  data: {
    dataSets: SdmxJsonDataSet[];
    structure: {
      dimensions: {
        series: SdmxJsonStructureDimension[];
        observation: SdmxJsonStructureDimension[];
      };
    };
  };
}

async function fetchWithRetry(url: string, retries: number, delayMs: number): Promise<unknown> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/vnd.sdmx.data+json' } });
      if (res.ok) {
        return await res.json();
      }
      if (res.status >= 500 && attempt < retries) {
        console.error(`  ILO retry ${attempt + 1}/${retries} after ${res.status}...`);
        await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
        continue;
      }
      if (res.status === 404) {
        // Indicator not available — return empty response signal
        return null;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (attempt < retries) {
        console.error(`  ILO retry ${attempt + 1}/${retries} after error: ${err}`);
        await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

/**
 * Fetch a single ILO indicator for all countries.
 * Returns a Map from ISO2 country code to the most recent non-null value.
 *
 * ILO SDMX URL format:
 *   {baseUrl}/data/{dataflow}/ALL.{indicatorCode}.A
 * where ALL = all reference areas, A = annual frequency
 */
export async function fetchIloIndicator(
  config: IloConfig,
  field: IloIndicatorField,
): Promise<Map<string, { value: number; year: string }>> {
  const indicatorCode = config.indicators[field];
  const url = `${config.source.baseUrl}/data/${config.source.dataflow}/ALL.${indicatorCode}.A?format=jsondata&detail=dataonly`;

  console.error(`  Fetching ILO ${field} (${indicatorCode})...`);

  const result = new Map<string, { value: number; year: string }>();

  let json: unknown;
  try {
    json = await fetchWithRetry(url, config.source.retries, config.source.retryDelayMs);
  } catch (err) {
    console.error(`  WARNING: Could not fetch ILO ${field}: ${err}`);
    return result;
  }

  if (json === null) {
    console.error(`  WARNING: ILO indicator ${indicatorCode} returned 404 — skipping`);
    return result;
  }

  try {
    const sdmx = json as SdmxJsonResponse;
    const dataSets = sdmx.data?.dataSets;
    const structure = sdmx.data?.structure;

    if (!dataSets?.length || !structure) {
      return result;
    }

    const seriesDimensions = structure.dimensions.series;
    const obsDimensions = structure.dimensions.observation;

    // Find the dimension index for REF_AREA (country) and TIME_PERIOD
    const refAreaDimIdx = seriesDimensions.findIndex((d) => d.id === 'REF_AREA');
    const timeDimIdx = obsDimensions.findIndex((d) => d.id === 'TIME_PERIOD');

    if (refAreaDimIdx === -1) {
      console.error(`  WARNING: REF_AREA dimension not found in ILO response for ${field}`);
      return result;
    }

    const refAreaValues = seriesDimensions[refAreaDimIdx].values;
    const timePeriodValues = timeDimIdx >= 0 ? obsDimensions[timeDimIdx].values : [];

    const dataSet = dataSets[0];
    for (const [seriesKey, seriesData] of Object.entries(dataSet.series)) {
      const keyParts = seriesKey.split(':');
      const refAreaIdx = parseInt(keyParts[refAreaDimIdx] ?? '0', 10);
      const iso2 = refAreaValues[refAreaIdx]?.id;

      if (!iso2 || iso2.length !== 2) continue;

      // Find most recent non-null observation
      for (const [obsKey, obsValue] of Object.entries(seriesData.observations)) {
        const rawValue = Array.isArray(obsValue) ? obsValue[0] : obsValue[0];
        if (rawValue === null || rawValue === undefined || typeof rawValue !== 'number') continue;

        const timeIdx = parseInt(obsKey, 10);
        const year = timePeriodValues[timeIdx]?.id ?? obsKey;

        const existing = result.get(iso2);
        if (!existing || year > existing.year) {
          result.set(iso2, { value: rawValue, year });
        }
      }
    }
  } catch (err) {
    console.error(`  WARNING: Failed to parse ILO response for ${field}: ${err}`);
  }

  console.error(`    → ${result.size} countries with ILO ${field} data`);
  return result;
}

/**
 * Fetch all configured ILO indicators and merge into per-country records.
 */
export async function fetchAllIloIndicators(
  config: IloConfig,
): Promise<Map<string, IloCountryData>> {
  const fields = Object.keys(config.indicators) as IloIndicatorField[];
  const allData = new Map<string, IloCountryData>();

  for (const field of fields) {
    const indicatorMap = await fetchIloIndicator(config, field);

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
