import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEurostatLatest, parseOecdLatest, fetchMedianIncome, type GetJson } from './importer.js';
import { MEDIAN_INCOME_TO_GDP_PPP_RATIO } from '../../core/poverty.js';
import { getCountryByCode } from '../loader.js';

// Minimal JSON-stat 2.0: geo × time, other dimensions already filtered to one value.
const eurostatMedian = {
  id: ['freq', 'geo', 'time'],
  size: [1, 2, 2],
  dimension: {
    freq: { category: { index: { A: 0 } } },
    geo: { category: { index: { DE: 0, FR: 1 } } },
    time: { category: { index: { '2024': 0, '2025': 1 } } },
  },
  value: { '0': 27000, '1': 28891, '2': 25900 }, // FR 2025 missing → FR latest is 2024
};

const eurostatRate = {
  ...eurostatMedian,
  value: { '1': 16.1, '2': 15.9 },
};

// SDMX-JSON 2.0 with dimensionAtObservation=AllDimensions
function oecdResponse(area: string, median: number, rate: number) {
  return {
    data: {
      structures: [
        {
          dimensions: {
            observation: [
              { id: 'REF_AREA', values: [{ id: area }] },
              { id: 'MEASURE', values: [{ id: 'INC_DISP' }, { id: 'PR_INC_DISP' }] },
              { id: 'TIME_PERIOD', values: [{ id: '2022' }, { id: '2023' }] },
            ],
          },
        },
      ],
      dataSets: [{ observations: { '0:0:0': [median - 1000], '0:0:1': [median], '0:1:1': [rate] } }],
    },
  };
}

describe('parseEurostatLatest', () => {
  it('returns the latest year per geo', () => {
    const m = parseEurostatLatest(eurostatMedian);
    expect(m.get('DE')).toEqual({ year: 2025, value: 28891 });
    expect(m.get('FR')).toEqual({ year: 2024, value: 25900 });
  });
});

describe('parseOecdLatest', () => {
  it('returns the latest year per area and measure', () => {
    const m = parseOecdLatest(oecdResponse('USA', 49885, 25.06));
    expect(m.get('USA')?.get('INC_DISP')).toEqual({ year: 2023, value: 49885 });
    expect(m.get('USA')?.get('PR_INC_DISP')).toEqual({ year: 2023, value: 25.06 });
  });
});

describe('fetchMedianIncome — Eurostat → OECD → PIP chain', () => {
  it('uses Eurostat first, OECD for the rest, and skips countries no source covers', async () => {
    const getJson: GetJson = async (url) => {
      if (url.includes('ilc_di03')) return eurostatMedian;
      if (url.includes('ilc_li02')) return eurostatRate;
      if (url.includes('sdmx.oecd.org') && url.includes('/USA.')) return oecdResponse('USA', 49885, 25.06);
      throw new Error(`404 from ${url}`);
    };
    const snap = await fetchMedianIncome(['DE', 'US', 'SG'], getJson);
    expect(Object.keys(snap.countries)).toEqual(['DE', 'US']);
    expect(snap.countries.DE).toMatchObject({
      source: 'eurostat',
      medianAnnualLcu: 28891,
      referenceYear: 2025,
      atRiskOfPovertyRatePercent: 16.1,
      equivalised: true,
    });
    expect(snap.countries.US).toMatchObject({ source: 'oecd', medianAnnualLcu: 49885, atRiskOfPovertyRatePercent: 25.1 });
  });
});

describe('committed snapshot src/data/median-income.json', () => {
  const file = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'median-income.json'), 'utf8'),
  ) as { countries: Record<string, { medianAnnualLcu: number | null; source: string; referenceYear: number }> };

  it('covers every high-income country except Singapore with an official survey source', () => {
    for (const [code, rec] of Object.entries(file.countries)) {
      expect(['eurostat', 'oecd']).toContain(rec.source);
      expect(rec.medianAnnualLcu).toBeGreaterThan(0);
      expect(rec.referenceYear).toBeGreaterThanOrEqual(2020);
      expect(getCountryByCode(code)?.stats.incomeGroup).toBe('HIC');
    }
    expect(Object.keys(file.countries)).not.toContain('SG');
    expect(Object.keys(file.countries).length).toBeGreaterThanOrEqual(15);
  });

  it('matches the proxy ratio used for uncovered countries (recalibrate the constant if this fails)', () => {
    const ratios = Object.entries(file.countries)
      .map(([code, rec]) => {
        const s = getCountryByCode(code)!.stats;
        return rec.medianAnnualLcu! / s.pppConversionFactor / s.gdpPerCapitaPppUsd;
      })
      .sort((a, b) => a - b);
    const mid = ratios.length / 2;
    const median = ratios.length % 2 ? ratios[Math.floor(mid)] : (ratios[mid - 1] + ratios[mid]) / 2;
    expect(Math.abs(median - MEDIAN_INCOME_TO_GDP_PPP_RATIO)).toBeLessThan(0.02);
  });
});
