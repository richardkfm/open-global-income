#!/usr/bin/env node
/**
 * Median equivalised disposable income importer (high-income countries).
 *
 * Feeds the relative adequacy line used for high-income countries:
 * 60% of the national median equivalised disposable income — the
 * EU / OECD at-risk-of-poverty standard. Previously that median was
 * approximated as 0.85 × GNI per capita (Atlas, nominal USD) and then
 * labelled PPP-USD, which put Germany's line ~20% above the official one.
 *
 * Source order per country (first hit wins):
 *   1. Eurostat EU-SILC  — ilc_di03 (median equivalised net income, national
 *      currency) and ilc_li02 (at-risk-of-poverty rate, 60% of median).
 *      Official source for EU / EFTA members.
 *   2. OECD Income Distribution Database (IDD) — median equivalised
 *      disposable income (national currency) and poverty rate at 60%.
 *   3. World Bank PIP — survey median per capita (PPP-USD/day). Not
 *      equivalised, so it understates the equivalised median; flagged as such.
 *
 * Countries with no source (e.g. Singapore) are left out of the snapshot;
 * `src/core/poverty.ts` then uses a proxy calibrated on the covered countries.
 *
 * Usage:  NODE_USE_ENV_PROXY=1 npm run data:update:median
 * Output: src/data/median-income.json (committed; read by src/data/loader.ts)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface MedianIncomeRecord {
  /** Median equivalised disposable income per year, national currency. Null when only a PPP figure exists (PIP). */
  medianAnnualLcu: number | null;
  /** Median per year in PPP-USD — set only for sources that publish PPP directly (PIP). */
  medianAnnualPppUsd: number | null;
  /** True when the median is per equivalised adult (Eurostat/OECD); false for per-capita (PIP). */
  equivalised: boolean;
  /** Survey / reference year of the median */
  referenceYear: number;
  /** Share of people below 60% of the median, % — null when the source has none */
  atRiskOfPovertyRatePercent: number | null;
  povertyRateYear: number | null;
  source: 'eurostat' | 'oecd' | 'pip';
  sourceLabel: string;
  sourceUrl: string;
}

export interface MedianIncomeSnapshot {
  description: string;
  fetchedAt: string;
  countries: Record<string, MedianIncomeRecord>;
}

// ── ISO helpers ────────────────────────────────────────────────────────────

/** ISO2 → ISO3 for the codes OECD and PIP use. Only countries we query need to be here. */
const ISO3: Record<string, string> = {
  US: 'USA', DE: 'DEU', GB: 'GBR', FR: 'FRA', JP: 'JPN', CA: 'CAN', AU: 'AUS', KR: 'KOR',
  IT: 'ITA', ES: 'ESP', NL: 'NLD', CH: 'CHE', SE: 'SWE', NO: 'NOR', SG: 'SGP', IL: 'ISR',
  AT: 'AUT', BE: 'BEL', DK: 'DNK', FI: 'FIN', IE: 'IRL', PT: 'PRT', NZ: 'NZL', PL: 'POL',
};

/** Eurostat uses EL for Greece and UK for the United Kingdom. */
function toEurostatGeo(iso2: string): string {
  return iso2 === 'GR' ? 'EL' : iso2 === 'GB' ? 'UK' : iso2;
}

// ── Eurostat (JSON-stat 2.0) ───────────────────────────────────────────────

interface JsonStat {
  id: string[];
  size: number[];
  dimension: Record<string, { category: { index: Record<string, number> } }>;
  value: Record<string, number>;
}

/**
 * Read a JSON-stat response into { geo → latest { year, value } }. All
 * dimensions other than geo and time must already be filtered to one value.
 */
export function parseEurostatLatest(json: JsonStat): Map<string, { year: number; value: number }> {
  const out = new Map<string, { year: number; value: number }>();
  const geoPos = json.id.indexOf('geo');
  const timePos = json.id.indexOf('time');
  const invert = (dim: string) =>
    Object.fromEntries(Object.entries(json.dimension[dim].category.index).map(([k, v]) => [v, k]));
  const geos = invert('geo');
  const times = invert('time');
  for (const [flat, value] of Object.entries(json.value)) {
    let rest = Number(flat);
    const coords = new Array<number>(json.size.length);
    for (let i = json.size.length - 1; i >= 0; i--) {
      coords[i] = rest % json.size[i];
      rest = Math.floor(rest / json.size[i]);
    }
    const geo = geos[coords[geoPos]];
    const year = Number(times[coords[timePos]]);
    const prev = out.get(geo);
    if (typeof value === 'number' && (!prev || year > prev.year)) out.set(geo, { year, value });
  }
  return out;
}

// ── OECD IDD (SDMX-JSON 2.0, dimensionAtObservation=AllDimensions) ────────

interface SdmxAllDims {
  data: {
    structures: Array<{ dimensions: { observation: Array<{ id: string; values: Array<{ id: string }> }> } }>;
    dataSets: Array<{ observations: Record<string, [number | null, ...unknown[]]> }>;
  };
}

/** Read an OECD IDD response into { ISO3 → { MEASURE → latest { year, value } } }. */
export function parseOecdLatest(json: SdmxAllDims): Map<string, Map<string, { year: number; value: number }>> {
  const dims = json.data.structures[0].dimensions.observation;
  const pos = (id: string) => dims.findIndex((d) => d.id === id);
  const [areaPos, measurePos, timePos] = [pos('REF_AREA'), pos('MEASURE'), pos('TIME_PERIOD')];
  const out = new Map<string, Map<string, { year: number; value: number }>>();
  for (const [key, obs] of Object.entries(json.data.dataSets[0].observations)) {
    const value = obs[0];
    if (typeof value !== 'number') continue;
    const idx = key.split(':').map(Number);
    const area = dims[areaPos].values[idx[areaPos]].id;
    const measure = dims[measurePos].values[idx[measurePos]].id;
    const year = Number(dims[timePos].values[idx[timePos]].id);
    const byMeasure = out.get(area) ?? new Map();
    const prev = byMeasure.get(measure);
    if (!prev || year > prev.year) byMeasure.set(measure, { year, value });
    out.set(area, byMeasure);
  }
  return out;
}

// ── Fetching ───────────────────────────────────────────────────────────────

const EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
const OECD_IDD = 'https://sdmx.oecd.org/public/rest/data/OECD.WISE.INE,DSD_WISE_IDD@DF_IDD,';
const PIP = 'https://api.worldbank.org/pip/v1/pip';

/** HTTP transport — injectable so tests (and unusual network setups) can supply their own. */
export type GetJson = (url: string, accept?: string) => Promise<unknown>;

export const fetchGetJson: GetJson = async (url, accept = 'application/json') => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { Accept: accept } });
    if (res.ok) return res.json();
    if (res.status < 500) throw new Error(`${res.status} from ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error(`Gave up after retries: ${url}`);
};

async function fetchEurostat(iso2s: string[], getJson: GetJson): Promise<Map<string, MedianIncomeRecord>> {
  const geo = iso2s.map((c) => `geo=${toEurostatGeo(c)}`).join('&');
  const medianUrl = `${EUROSTAT}/ilc_di03?${geo}&age=TOTAL&sex=T&statinfo=MED_EI&unit=NAC&sinceTimePeriod=2020`;
  const rateUrl = `${EUROSTAT}/ilc_li02?${geo}&age=TOTAL&sex=T&statinfo=MED_EI&unit=PC&rskpovth=B_60&sinceTimePeriod=2020`;
  const medians = parseEurostatLatest((await getJson(medianUrl)) as JsonStat);
  const rates = parseEurostatLatest((await getJson(rateUrl)) as JsonStat);
  const out = new Map<string, MedianIncomeRecord>();
  for (const iso2 of iso2s) {
    const m = medians.get(toEurostatGeo(iso2));
    if (!m) continue;
    const r = rates.get(toEurostatGeo(iso2));
    out.set(iso2, {
      medianAnnualLcu: m.value,
      medianAnnualPppUsd: null,
      equivalised: true,
      referenceYear: m.year,
      atRiskOfPovertyRatePercent: r?.value ?? null,
      povertyRateYear: r?.year ?? null,
      source: 'eurostat',
      sourceLabel: `Eurostat EU-SILC ${m.year} — median equivalised net income (ilc_di03), at-risk-of-poverty rate (ilc_li02)`,
      sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/ilc_di03/default/table',
    });
  }
  return out;
}

async function fetchOecd(iso2s: string[], getJson: GetJson): Promise<Map<string, MedianIncomeRecord>> {
  // One country per request: the OECD SDMX endpoint intermittently answers
  // multi-country queries with HTTP 500, while single-country ones succeed.
  const out = new Map<string, MedianIncomeRecord>();
  for (const iso2 of iso2s) {
    const iso3 = ISO3[iso2];
    if (!iso3) continue;
    const url =
      `${OECD_IDD}/${iso3}.A.INC_DISP+PR_INC_DISP.MEDIAN+_Z.XDC_HH_EQ+PT_POP._T.METH2012.D_CUR.PL_60+_Z` +
      '?startPeriod=2015&dimensionAtObservation=AllDimensions';
    let parsed: ReturnType<typeof parseOecdLatest>;
    try {
      parsed = parseOecdLatest((await getJson(url, 'application/vnd.sdmx.data+json')) as SdmxAllDims);
    } catch (err) {
      console.error(`  OECD: no data for ${iso2} (${(err as Error).message.slice(0, 60)})`);
      continue;
    }
    const byMeasure = parsed.get(iso3);
    const median = byMeasure?.get('INC_DISP');
    if (!median) continue;
    const rate = byMeasure?.get('PR_INC_DISP');
    out.set(iso2, {
      medianAnnualLcu: median.value,
      medianAnnualPppUsd: null,
      equivalised: true,
      referenceYear: median.year,
      atRiskOfPovertyRatePercent: rate ? Math.round(rate.value * 10) / 10 : null,
      povertyRateYear: rate?.year ?? null,
      source: 'oecd',
      sourceLabel: `OECD Income Distribution Database ${median.year} — median equivalised disposable income, poverty rate at 60% of median`,
      sourceUrl: 'https://data-explorer.oecd.org/?df[ds]=dsDisseminateFinalDMZ&df[id]=DSD_WISE_IDD%40DF_IDD&df[ag]=OECD.WISE.INE',
    });
  }
  return out;
}

async function fetchPip(iso2: string, getJson: GetJson): Promise<MedianIncomeRecord | null> {
  const iso3 = ISO3[iso2];
  if (!iso3) return null;
  let rows: Array<{ reporting_year: number; median: number | null }>;
  try {
    rows = (await getJson(`${PIP}?country=${iso3}&year=all&povline=2.15&format=json`)) as typeof rows;
  } catch {
    return null; // PIP returns 4xx for countries it does not cover
  }
  const latest = rows.filter((r) => typeof r.median === 'number').sort((a, b) => b.reporting_year - a.reporting_year)[0];
  if (!latest || latest.median == null) return null;
  return {
    medianAnnualLcu: null,
    medianAnnualPppUsd: Math.round(latest.median * 365),
    equivalised: false,
    referenceYear: latest.reporting_year,
    atRiskOfPovertyRatePercent: null,
    povertyRateYear: null,
    source: 'pip',
    sourceLabel: `World Bank PIP ${latest.reporting_year} — survey median per capita (not equivalised)`,
    sourceUrl: `https://pip.worldbank.org/country-profiles/${iso3}`,
  };
}

/** Fetch every country in `iso2s` through the Eurostat → OECD → PIP chain. */
export async function fetchMedianIncome(
  iso2s: string[],
  getJson: GetJson = fetchGetJson,
): Promise<MedianIncomeSnapshot> {
  const countries: Record<string, MedianIncomeRecord> = {};
  const eurostat = await fetchEurostat(iso2s, getJson);
  for (const [k, v] of eurostat) countries[k] = v;

  const remaining = iso2s.filter((c) => !countries[c]);
  if (remaining.length > 0) {
    const oecd = await fetchOecd(remaining, getJson);
    for (const [k, v] of oecd) countries[k] = v;
  }
  for (const iso2 of iso2s.filter((c) => !countries[c])) {
    const pip = await fetchPip(iso2, getJson);
    if (pip) countries[iso2] = pip;
  }
  return {
    description:
      'Median equivalised disposable income for high-income countries — feeds the relative ' +
      'adequacy line (60% of median). Generated by src/data/median-income/importer.ts.',
    fetchedAt: new Date().toISOString().slice(0, 10),
    countries: Object.fromEntries(Object.entries(countries).sort(([a], [b]) => a.localeCompare(b))),
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const data = JSON.parse(readFileSync(resolve(__dirname, '../countries.json'), 'utf8')) as {
    countries: Array<{ code: string; stats: { incomeGroup: string } }>;
  };
  const hic = data.countries.filter((c) => c.stats.incomeGroup === 'HIC').map((c) => c.code);
  console.error(`Fetching median income for ${hic.length} high-income countries...`);
  const snapshot = await fetchMedianIncome(hic);
  const covered = Object.keys(snapshot.countries);
  console.error(`  Covered ${covered.length}/${hic.length}: ${covered.join(', ')}`);
  const missing = hic.filter((c) => !covered.includes(c));
  if (missing.length) console.error(`  No source (calibrated proxy will be used): ${missing.join(', ')}`);
  const outPath = resolve(__dirname, '../median-income.json');
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n');
  console.error(`Wrote ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
