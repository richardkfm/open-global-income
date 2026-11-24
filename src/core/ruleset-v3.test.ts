/**
 * Ruleset v3 against the committed data: max($210 anchor, local adequacy line),
 * with high-income adequacy = 60% of the survey median equivalised income.
 */
import { describe, it, expect } from 'vitest';
import { getAllCountries, getCountryByCode, getDataVersion, getRegionById } from '../data/loader.js';
import { calculateEntitlement, calculateEntitlementV1 } from './rules.js';
import { buildRegionAdjustedCountry } from './regions.js';
import { calculateSimulation } from './simulations.js';
import { calculateRecommendedFundingMix } from './funding.js';
import { GLOBAL_INCOME_FLOOR_PPP } from './constants.js';

const v = getDataVersion();
const de = getCountryByCode('DE')!;

describe('ruleset v3 on the committed snapshot', () => {
  it('pays Germany the Eurostat at-risk-of-poverty threshold for a single adult', () => {
    const median = de.stats.medianIncome!;
    expect(median.source).toBe('eurostat');
    const e = calculateEntitlement(de, v);
    expect(e.floor?.basis).toBe('local_adequacy');
    expect(e.localCurrencyPerMonth).toBeCloseTo((median.medianAnnualLcu! * 0.6) / 12, 1);
  });

  it('pays every non-high-income country exactly the $210 anchor', () => {
    for (const c of getAllCountries().filter((c) => c.stats.incomeGroup !== 'HIC')) {
      const e = calculateEntitlement(c, v);
      expect(e.pppUsdPerMonth).toBe(GLOBAL_INCOME_FLOOR_PPP);
      expect(e.localCurrencyPerMonth).toBe(calculateEntitlementV1(c, v).localCurrencyPerMonth);
    }
  });

  it('pays every high-income country more than the anchor', () => {
    for (const c of getAllCountries().filter((c) => c.stats.incomeGroup === 'HIC')) {
      expect(calculateEntitlement(c, v).pppUsdPerMonth).toBeGreaterThan(GLOBAL_INCOME_FLOOR_PPP);
    }
  });

  it('keeps v1 reproducible: Germany at 210 × 0.78 = €163.80', () => {
    const e = calculateEntitlementV1(de, v);
    expect(e.localCurrencyPerMonth).toBe(163.8);
    expect(e.meta.rulesetVersion).toBe('v1');
  });

  it('scales the German amount by each Bundesland cost-of-living index', () => {
    const national = calculateEntitlement(de, v).localCurrencyPerMonth;
    for (const id of ['DE-HH', 'DE-ST', 'DE-BE']) {
      const region = getRegionById(id)!;
      const regional = calculateEntitlement(buildRegionAdjustedCountry(de, region), v);
      expect(regional.localCurrencyPerMonth).toBeCloseTo(national * region.stats.costOfLivingIndex, 0);
    }
  });

  it('gives high-income countries an at-risk-of-poverty baseline from the same survey', () => {
    expect(de.stats.relativePovertyHeadcountRatioPercent).toBeGreaterThan(10);
  });

  it('never routes a high-income funding gap to an international solidarity transfer', () => {
    for (const c of getAllCountries().filter((c) => c.stats.incomeGroup === 'HIC')) {
      const sim = calculateSimulation(
        c,
        { country: c.code, coverage: 1, targetGroup: 'all', durationMonths: 12, adjustments: { floorOverride: null, householdSize: null } },
        v,
      );
      const mix = calculateRecommendedFundingMix(c, sim, v);
      expect(mix.mechanisms.map((m) => m.mechanism)).not.toContain('international_solidarity_transfer');
    }
  });
});
