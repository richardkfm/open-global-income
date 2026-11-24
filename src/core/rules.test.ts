import { describe, it, expect } from 'vitest';
import { calculateEntitlement, calculateEntitlementV1, resolveEntitlementFloor } from './rules.js';
import type { Country } from './types.js';

const DATA_VERSION = 'test-snapshot';

// Representative countries across all four income groups

const germany: Country = {
  code: 'DE',
  name: 'Germany',
  stats: {
    gdpPerCapitaUsd: 51384,
    gniPerCapitaUsd: 51640,
    pppConversionFactor: 0.78,
    giniIndex: 31.7,
    population: 83800000,
    incomeGroup: 'HIC',
  },
};

const brazil: Country = {
  code: 'BR',
  name: 'Brazil',
  stats: {
    gdpPerCapitaUsd: 8920,
    gniPerCapitaUsd: 9140,
    pppConversionFactor: 2.55,
    giniIndex: 48.9,
    population: 214300000,
    incomeGroup: 'UMC',
  },
};

const india: Country = {
  code: 'IN',
  name: 'India',
  stats: {
    gdpPerCapitaUsd: 2485,
    gniPerCapitaUsd: 2390,
    pppConversionFactor: 22.88,
    giniIndex: 35.7,
    population: 1417200000,
    incomeGroup: 'LMC',
  },
};

const nigeria: Country = {
  code: 'NG',
  name: 'Nigeria',
  stats: {
    gdpPerCapitaUsd: 2184,
    gniPerCapitaUsd: 2140,
    pppConversionFactor: 168.5,
    giniIndex: 35.1,
    population: 218500000,
    incomeGroup: 'LMC',
  },
};

const burundi: Country = {
  code: 'BI',
  name: 'Burundi',
  stats: {
    gdpPerCapitaUsd: 259,
    gniPerCapitaUsd: 240,
    pppConversionFactor: 741.0,
    giniIndex: 38.6,
    population: 12890000,
    incomeGroup: 'LIC',
  },
};

const southAfrica: Country = {
  code: 'ZA',
  name: 'South Africa',
  stats: {
    gdpPerCapitaUsd: 6190,
    gniPerCapitaUsd: 6010,
    pppConversionFactor: 6.76,
    giniIndex: 63.0,
    population: 60400000,
    incomeGroup: 'UMC',
  },
};

describe('calculateEntitlement (Ruleset v1)', () => {
  it('produces low score for high-income country (DE)', () => {
    const result = calculateEntitlementV1(germany, DATA_VERSION);
    expect(result.countryCode).toBe('DE');
    expect(result.pppUsdPerMonth).toBe(210);
    expect(result.localCurrencyPerMonth).toBe(163.8);
    expect(result.score).toBeLessThan(0.1);
    expect(result.score).toBeGreaterThan(0);
    expect(result.meta.rulesetVersion).toBe('v1');
    expect(result.meta.dataVersion).toBe(DATA_VERSION);
  });

  it('produces moderate score for upper-middle-income country (BR)', () => {
    const result = calculateEntitlementV1(brazil, DATA_VERSION);
    expect(result.pppUsdPerMonth).toBe(210);
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.score).toBeLessThan(0.5);
  });

  it('produces high score for lower-middle-income country (IN)', () => {
    const result = calculateEntitlementV1(india, DATA_VERSION);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('clamps score to 1.0 for low-income country (BI)', () => {
    const result = calculateEntitlementV1(burundi, DATA_VERSION);
    expect(result.score).toBe(1);
    // localCurrencyPerMonth should be correctly calculated
    expect(result.localCurrencyPerMonth).toBe(155610);
  });

  it('inequality amplifies score (ZA has high Gini)', () => {
    // South Africa: moderate GNI but extreme inequality (Gini=63)
    const result = calculateEntitlementV1(southAfrica, DATA_VERSION);
    // Without Gini penalty: 210 / (6010/12) ≈ 0.419
    // With Gini penalty: + 63/100 * 0.15 = + 0.0945 → ~0.514
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('handles null Gini gracefully (no penalty applied)', () => {
    const noGini: Country = {
      code: 'XX',
      name: 'No Gini Data',
      stats: {
        gdpPerCapitaUsd: 50000,
        gniPerCapitaUsd: 50000,
        pppConversionFactor: 1.0,
        giniIndex: null,
        population: 1000000,
        incomeGroup: 'HIC',
      },
    };
    const result = calculateEntitlementV1(noGini, DATA_VERSION);
    // 210 / (50000/12) ≈ 0.0504, no Gini penalty
    expect(result.score).toBeCloseTo(0.0504, 3);
  });

  it('handles zero GNI gracefully', () => {
    const zeroGni: Country = {
      code: 'XX',
      name: 'Test',
      stats: {
        gdpPerCapitaUsd: 0,
        gniPerCapitaUsd: 0,
        pppConversionFactor: 1,
        giniIndex: null,
        population: 1000,
        incomeGroup: 'LIC',
      },
    };
    const result = calculateEntitlementV1(zeroGni, DATA_VERSION);
    expect(result.score).toBe(1);
  });

  it('score ordering matches income group ordering', () => {
    const deResult = calculateEntitlementV1(germany, DATA_VERSION);
    const brResult = calculateEntitlementV1(brazil, DATA_VERSION);
    const ngResult = calculateEntitlementV1(nigeria, DATA_VERSION);
    const biResult = calculateEntitlementV1(burundi, DATA_VERSION);

    // Lower income → higher score (more need)
    expect(deResult.score).toBeLessThan(brResult.score);
    expect(brResult.score).toBeLessThan(ngResult.score);
    expect(ngResult.score).toBeLessThanOrEqual(biResult.score);
  });

  it('is deterministic (same inputs produce same outputs)', () => {
    const a = calculateEntitlementV1(india, DATA_VERSION);
    const b = calculateEntitlementV1(india, DATA_VERSION);
    expect(a).toEqual(b);
  });

  it('includes correct metadata', () => {
    const result = calculateEntitlementV1(germany, DATA_VERSION);
    expect(result.meta).toEqual({
      rulesetVersion: 'v1',
      dataVersion: DATA_VERSION,
    });
  });

  it('attaches a local adequacy estimate that never equals the fixed anchor except by coincidence at UMC', () => {
    const de = calculateEntitlementV1(germany, DATA_VERSION);
    const br = calculateEntitlementV1(brazil, DATA_VERSION);
    const bi = calculateEntitlementV1(burundi, DATA_VERSION);

    // LIC adequacy sits well below the $210 anchor
    expect(bi.adequacyEstimate.basis).toBe('extreme');
    expect(bi.adequacyEstimate.monthlyPppUsd).toBeLessThan(bi.pppUsdPerMonth);

    // UMC adequacy is the line the anchor is calibrated to
    expect(br.adequacyEstimate.basis).toBe('upper_middle');
    expect(br.adequacyEstimate.monthlyPppUsd).toBeCloseTo(205.5, 0);

    // HIC adequacy (60% of estimated median) sits above the anchor
    expect(de.adequacyEstimate.basis).toBe('relative_median');
    expect(de.adequacyEstimate.monthlyPppUsd).toBeGreaterThan(de.pppUsdPerMonth);

    // v1 pays the anchor regardless of the adequacy line
    expect(de.pppUsdPerMonth).toBe(210);
    expect(de.score).toBeGreaterThan(0);
  });
});

describe('calculateEntitlement (Ruleset v3 — max of anchor and local adequacy)', () => {
  const germanyWithSurvey: Country = {
    ...germany,
    stats: {
      ...germany.stats,
      gdpPerCapitaPppUsd: 67364,
      medianIncome: {
        medianAnnualLcu: 28891,
        medianAnnualPppUsd: null,
        equivalised: true,
        referenceYear: 2025,
        source: 'eurostat',
        sourceLabel: 'Eurostat EU-SILC 2025',
        sourceUrl: 'https://ec.europa.eu/eurostat',
      },
    },
  };

  it('pays a high-income country its adequacy line: 60% of the survey median, in local currency', () => {
    const r = calculateEntitlement(germanyWithSurvey, DATA_VERSION);
    expect(r.meta.rulesetVersion).toBe('v3');
    expect(r.floor?.basis).toBe('local_adequacy');
    // 28,891 € × 0.6 / 12 = 1,444.55 € — the Eurostat single-adult threshold
    expect(r.localCurrencyPerMonth).toBeCloseTo(1444.55, 1);
    expect(r.pppUsdPerMonth).toBeCloseTo(28891 * 0.6 / 12 / 0.78, 1);
  });

  it('never pays less than the $210 anchor (LIC, LMC, UMC keep $210)', () => {
    for (const c of [burundi, india, brazil]) {
      const r = calculateEntitlement(c, DATA_VERSION);
      expect(r.pppUsdPerMonth).toBe(210);
      expect(r.floor?.basis).toBe('global_anchor');
      expect(r).toMatchObject({ localCurrencyPerMonth: calculateEntitlementV1(c, DATA_VERSION).localCurrencyPerMonth });
    }
  });

  it('keeps the need score identical to v1 for every income group', () => {
    for (const c of [germanyWithSurvey, brazil, india, burundi]) {
      expect(calculateEntitlement(c, DATA_VERSION).score).toBe(calculateEntitlementV1(c, DATA_VERSION).score);
    }
  });

  it('falls back to a calibrated proxy when no survey median exists — never NaN', () => {
    const f = resolveEntitlementFloor(germany); // fixture has no medianIncome
    expect(Number.isFinite(f.pppUsdPerMonth)).toBe(true);
    expect(f.pppUsdPerMonth).toBeGreaterThanOrEqual(210);
  });
});
