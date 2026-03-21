import { describe, it, expect } from 'vitest';
import {
  estimatePovertyReduction,
  estimatePurchasingPower,
  estimateSocialCoverage,
  estimateFiscalMultiplier,
  calculateImpactAnalysis,
} from './impact.js';
import type { Country, ImpactParameters, SimulationResult } from './types.js';

// ── Test fixtures ────────────────────────────────────────────────────────────

const kenya: Country = {
  code: 'KE',
  name: 'Kenya',
  stats: {
    gdpPerCapitaUsd: 2099,
    gniPerCapitaUsd: 2010,
    pppConversionFactor: 49.37,
    giniIndex: 38.7,
    population: 54030000,
    incomeGroup: 'LMC',
    povertyHeadcountRatio: 36.1,
    socialProtectionCoveragePercent: 17.8,
  },
};

const germany: Country = {
  code: 'DE',
  name: 'Germany',
  stats: {
    gdpPerCapitaUsd: 51384,
    gniPerCapitaUsd: 51640,
    pppConversionFactor: 0.78,
    giniIndex: 31.7,
    population: 83240000,
    incomeGroup: 'HIC',
    povertyHeadcountRatio: 0.2,
    socialProtectionCoveragePercent: 92.5,
  },
};

const southAfrica: Country = {
  code: 'ZA',
  name: 'South Africa',
  stats: {
    gdpPerCapitaUsd: 6001,
    gniPerCapitaUsd: 6440,
    pppConversionFactor: 7.56,
    giniIndex: 63.0,
    population: 59310000,
    incomeGroup: 'UMC',
    povertyHeadcountRatio: 18.9,
    socialProtectionCoveragePercent: 44.2,
  },
};

const minimal: Country = {
  code: 'XX',
  name: 'Test',
  stats: {
    gdpPerCapitaUsd: 1000,
    gniPerCapitaUsd: 950,
    pppConversionFactor: 40,
    giniIndex: null,
    population: 10000000,
    incomeGroup: 'LIC',
  },
};

function makeSimulation(country: Country, coverage: number, durationMonths = 12): SimulationResult {
  const floor = 210;
  const recipientCount = Math.round(country.stats.population * coverage);
  const localPerMonth = Math.round(floor * country.stats.pppConversionFactor * 100) / 100;
  const annualPppUsd = recipientCount * floor * durationMonths;
  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  return {
    country: { code: country.code, name: country.name, population: country.stats.population },
    simulation: {
      recipientCount,
      coverageRate: coverage,
      entitlementPerPerson: { pppUsdPerMonth: floor, localCurrencyPerMonth: localPerMonth },
      cost: {
        monthlyLocalCurrency: recipientCount * localPerMonth,
        annualLocalCurrency: recipientCount * localPerMonth * durationMonths,
        annualPppUsd,
        asPercentOfGdp: gdpTotal > 0 ? (annualPppUsd / gdpTotal) * 100 : 0,
      },
      meta: { rulesetVersion: 'v1', dataVersion: 'test' },
    },
  };
}

// ── estimatePovertyReduction ─────────────────────────────────────────────────

describe('estimatePovertyReduction', () => {
  it('returns a positive lifted count when transfer exceeds poverty line', () => {
    const result = estimatePovertyReduction(kenya, 5000000, 210, 'bottom_quintile');
    expect(result.transferExceedsPovertyLine).toBe(true);
    expect(result.estimatedLifted).toBeGreaterThan(0);
    expect(result.extremePoorBaseline).toBeGreaterThan(0);
    expect(result.liftedAsPercentOfPoor).toBeGreaterThan(0);
    expect(result.liftedAsPercentOfPoor).toBeLessThanOrEqual(100);
  });

  it('poverty line is $64.50/month (2.15 × 30)', () => {
    const result = estimatePovertyReduction(kenya, 1000, 210, 'all');
    expect(result.povertyLineMonthlyPppUsd).toBeCloseTo(64.5, 1);
  });

  it('lifted count is bounded by extreme poor baseline', () => {
    // Very high recipient count — cannot lift more than all extreme poor
    const result = estimatePovertyReduction(kenya, 100000000, 210, 'all');
    expect(result.estimatedLifted).toBeLessThanOrEqual(result.extremePoorBaseline);
    expect(result.liftedAsPercentOfPoor).toBeLessThanOrEqual(100);
  });

  it('returns low data quality and zero counts when poverty data is missing', () => {
    const result = estimatePovertyReduction(minimal, 1000000, 210, 'all');
    expect(result.dataQuality).toBe('low');
    expect(result.estimatedLifted).toBe(0);
    expect(result.extremePoorBaseline).toBe(0);
  });

  it('partial lift when transfer is below poverty line', () => {
    // Transfer of $30 < poverty line of $64.50 → partial lifts
    const result = estimatePovertyReduction(kenya, 10000000, 30, 'bottom_quintile');
    expect(result.transferExceedsPovertyLine).toBe(false);
    expect(result.estimatedLifted).toBeGreaterThan(0);
    // Partial: should be less than if transfer fully exceeded line
    const fullResult = estimatePovertyReduction(kenya, 10000000, 210, 'bottom_quintile');
    expect(result.estimatedLifted).toBeLessThan(fullResult.estimatedLifted);
  });

  it('is deterministic for the same inputs', () => {
    const r1 = estimatePovertyReduction(kenya, 5000000, 210, 'bottom_quintile');
    const r2 = estimatePovertyReduction(kenya, 5000000, 210, 'bottom_quintile');
    expect(r1.estimatedLifted).toBe(r2.estimatedLifted);
  });

  it('assumptions list is non-empty', () => {
    const result = estimatePovertyReduction(kenya, 5000000, 210, 'all');
    expect(result.assumptions.length).toBeGreaterThan(2);
  });

  it('Germany has very low extreme poor baseline', () => {
    const result = estimatePovertyReduction(germany, 1000000, 210, 'all');
    expect(result.extremePoorBaseline).toBeLessThan(germany.stats.population * 0.005);
  });
});

// ── estimatePurchasingPower ──────────────────────────────────────────────────

describe('estimatePurchasingPower', () => {
  it('returns a positive income increase for Kenya', () => {
    const result = estimatePurchasingPower(kenya, 210);
    expect(result.incomeIncreasePercent).toBeGreaterThan(0);
    expect(result.estimatedMonthlyIncomeUsd).toBeGreaterThan(0);
    expect(result.incomeShareQ1).toBeGreaterThan(0);
    expect(result.incomeShareQ1).toBeLessThan(0.20);
  });

  it('lower-income countries have higher income increase %', () => {
    const keResult = estimatePurchasingPower(kenya, 210);
    const deResult = estimatePurchasingPower(germany, 210);
    expect(keResult.incomeIncreasePercent).toBeGreaterThan(deResult.incomeIncreasePercent);
  });

  it('higher Gini → lower income share Q1 → higher income increase %', () => {
    const keResult = estimatePurchasingPower(kenya, 210);     // Gini 38.7
    const zaResult = estimatePurchasingPower(southAfrica, 210); // Gini 63.0
    expect(keResult.incomeShareQ1).toBeGreaterThan(zaResult.incomeShareQ1);
  });

  it('bottom quintile population is 20% of total', () => {
    const result = estimatePurchasingPower(kenya, 210);
    expect(result.bottomQuintilePopulation).toBe(Math.round(kenya.stats.population * 0.2));
  });

  it('returns low data quality when Gini is null', () => {
    const result = estimatePurchasingPower(minimal, 210);
    expect(result.dataQuality).toBe('low');
    expect(result.incomeIncreasePercent).toBe(0);
  });

  it('Lorenz curve: income share Q1 in plausible range for Kenya', () => {
    const result = estimatePurchasingPower(kenya, 210);
    // Kenya bottom quintile: empirically ~5-6%, formula should give similar
    expect(result.incomeShareQ1).toBeGreaterThan(0.04);
    expect(result.incomeShareQ1).toBeLessThan(0.10);
  });

  it('is deterministic', () => {
    const r1 = estimatePurchasingPower(kenya, 210);
    const r2 = estimatePurchasingPower(kenya, 210);
    expect(r1.incomeIncreasePercent).toBe(r2.incomeIncreasePercent);
  });
});

// ── estimateSocialCoverage ───────────────────────────────────────────────────

describe('estimateSocialCoverage', () => {
  it('returns newly covered count for Kenya', () => {
    const result = estimateSocialCoverage(kenya, 5000000, 'bottom_quintile');
    expect(result.estimatedNewlyCovered).toBeGreaterThan(0);
    expect(result.populationCurrentlyUncovered).toBeGreaterThan(0);
    expect(result.uncoverageRatePercent).toBeGreaterThan(0);
  });

  it('bottom_quintile targeting has higher uncoverage rate than universal', () => {
    const bq = estimateSocialCoverage(kenya, 5000000, 'bottom_quintile');
    const all = estimateSocialCoverage(kenya, 5000000, 'all');
    expect(bq.recipientUncoverageRatePercent).toBeGreaterThanOrEqual(all.recipientUncoverageRatePercent);
  });

  it('newly covered is bounded by recipient count', () => {
    const result = estimateSocialCoverage(kenya, 5000000, 'all');
    expect(result.estimatedNewlyCovered).toBeLessThanOrEqual(5000000);
  });

  it('high-coverage country returns fewer newly covered', () => {
    const deResult = estimateSocialCoverage(germany, 1000000, 'all');
    const keResult = estimateSocialCoverage(kenya, 1000000, 'all');
    expect(deResult.estimatedNewlyCovered).toBeLessThan(keResult.estimatedNewlyCovered);
  });

  it('returns low data quality when ILO coverage is missing', () => {
    const result = estimateSocialCoverage(minimal, 1000000, 'all');
    expect(result.dataQuality).toBe('low');
    expect(result.estimatedNewlyCovered).toBe(0);
  });

  it('is deterministic', () => {
    const r1 = estimateSocialCoverage(kenya, 5000000, 'bottom_quintile');
    const r2 = estimateSocialCoverage(kenya, 5000000, 'bottom_quintile');
    expect(r1.estimatedNewlyCovered).toBe(r2.estimatedNewlyCovered);
  });
});

// ── estimateFiscalMultiplier ─────────────────────────────────────────────────

describe('estimateFiscalMultiplier', () => {
  it('returns a positive GDP stimulus', () => {
    const result = estimateFiscalMultiplier(kenya, 1e9);
    expect(result.estimatedGdpStimulusPppUsd).toBeGreaterThan(1e9);
    expect(result.multiplier).toBeGreaterThan(1);
  });

  it('low-income countries have higher multiplier than high-income', () => {
    const lic: Country = { ...kenya, stats: { ...kenya.stats, incomeGroup: 'LIC' } };
    const hic: Country = { ...kenya, stats: { ...kenya.stats, incomeGroup: 'HIC' } };
    const licResult = estimateFiscalMultiplier(lic, 1e9);
    const hicResult = estimateFiscalMultiplier(hic, 1e9);
    expect(licResult.multiplier).toBeGreaterThan(hicResult.multiplier);
  });

  it('GDP stimulus = transfer × multiplier', () => {
    const transfer = 1_000_000_000;
    const result = estimateFiscalMultiplier(kenya, transfer);
    expect(result.estimatedGdpStimulusPppUsd).toBeCloseTo(transfer * result.multiplier, 0);
  });

  it('incomeGroup matches country', () => {
    const result = estimateFiscalMultiplier(kenya, 1e9);
    expect(result.incomeGroup).toBe('LMC');
  });

  it('multiplier is between 0.5 and 3.5 for all income groups', () => {
    const groups = ['LIC', 'LMC', 'UMC', 'HIC'] as const;
    for (const g of groups) {
      const c: Country = { ...kenya, stats: { ...kenya.stats, incomeGroup: g } };
      const r = estimateFiscalMultiplier(c, 1e9);
      expect(r.multiplier).toBeGreaterThanOrEqual(0.5);
      expect(r.multiplier).toBeLessThanOrEqual(3.5);
    }
  });

  it('assumptions are non-empty', () => {
    const result = estimateFiscalMultiplier(kenya, 1e9);
    expect(result.assumptions.length).toBeGreaterThan(3);
  });
});

// ── calculateImpactAnalysis ──────────────────────────────────────────────────

describe('calculateImpactAnalysis', () => {
  const params: ImpactParameters = {
    country: 'KE',
    coverage: 0.2,
    targetGroup: 'bottom_quintile',
    durationMonths: 12,
    floorOverride: null,
    simulationId: null,
  };

  it('returns a full impact analysis with all four dimensions', () => {
    const sim = makeSimulation(kenya, 0.2);
    const result = calculateImpactAnalysis(kenya, sim, params, 'test');

    expect(result.country.code).toBe('KE');
    expect(result.country.name).toBe('Kenya');
    expect(result.program.recipientCount).toBeGreaterThan(0);
    expect(result.program.monthlyAmountPppUsd).toBe(210);

    // Four dimensions all present
    expect(result.povertyReduction).toBeDefined();
    expect(result.purchasingPower).toBeDefined();
    expect(result.socialCoverage).toBeDefined();
    expect(result.fiscalMultiplier).toBeDefined();
    expect(result.policyBrief).toBeDefined();
  });

  it('policy brief has title, subtitle, headline, and assumptions', () => {
    const sim = makeSimulation(kenya, 0.2);
    const result = calculateImpactAnalysis(kenya, sim, params, 'test');
    const brief = result.policyBrief;

    expect(brief.title).toContain('Kenya');
    expect(brief.subtitle.length).toBeGreaterThan(10);
    expect(brief.headline.povertyReduction.value).toBeGreaterThanOrEqual(0);
    expect(brief.headline.purchasingPower.value).toBeGreaterThan(0);
    expect(brief.headline.socialCoverage.value).toBeGreaterThanOrEqual(0);
    expect(brief.headline.gdpStimulus.value).toBeGreaterThan(0);
    expect(brief.assumptions.length).toBeGreaterThan(5);
    expect(brief.dataSources.length).toBeGreaterThan(2);
    expect(brief.caveats.length).toBeGreaterThan(3);
  });

  it('meta includes rulesetVersion, dataVersion, and generatedAt', () => {
    const sim = makeSimulation(kenya, 0.2);
    const result = calculateImpactAnalysis(kenya, sim, params, 'worldbank-2023');
    expect(result.meta.rulesetVersion).toBe('v1');
    expect(result.meta.dataVersion).toBe('worldbank-2023');
    expect(result.meta.generatedAt).toBeTruthy();
  });

  it('is deterministic for the same inputs (except generatedAt)', () => {
    const sim = makeSimulation(kenya, 0.2);
    const r1 = calculateImpactAnalysis(kenya, sim, params, 'test');
    const r2 = calculateImpactAnalysis(kenya, sim, params, 'test');
    expect(r1.povertyReduction.estimatedLifted).toBe(r2.povertyReduction.estimatedLifted);
    expect(r1.purchasingPower.incomeIncreasePercent).toBe(r2.purchasingPower.incomeIncreasePercent);
    expect(r1.socialCoverage.estimatedNewlyCovered).toBe(r2.socialCoverage.estimatedNewlyCovered);
    expect(r1.fiscalMultiplier.multiplier).toBe(r2.fiscalMultiplier.multiplier);
  });

  it('respects floorOverride in program output', () => {
    const customParams = { ...params, floorOverride: 150 };
    const sim = makeSimulation(kenya, 0.2);
    // Manually override the sim amount
    const customSim = {
      ...sim,
      simulation: { ...sim.simulation, entitlementPerPerson: { pppUsdPerMonth: 150, localCurrencyPerMonth: 0 } },
    };
    const result = calculateImpactAnalysis(kenya, customSim, customParams, 'test');
    expect(result.program.monthlyAmountPppUsd).toBe(150);
  });

  it('handles country with missing optional data gracefully', () => {
    const sim = makeSimulation(minimal, 0.3);
    const minParams: ImpactParameters = { ...params, country: 'XX' };
    expect(() => calculateImpactAnalysis(minimal, sim, minParams, 'test')).not.toThrow();
    const result = calculateImpactAnalysis(minimal, sim, minParams, 'test');
    expect(result.povertyReduction.dataQuality).toBe('low');
    expect(result.purchasingPower.dataQuality).toBe('low');
    expect(result.socialCoverage.dataQuality).toBe('low');
  });

  it('program.annualCostPppUsd matches simulation annualPppUsd', () => {
    const sim = makeSimulation(kenya, 0.25);
    const result = calculateImpactAnalysis(kenya, sim, { ...params, coverage: 0.25 }, 'test');
    expect(result.program.annualCostPppUsd).toBe(sim.simulation.cost.annualPppUsd);
  });

  it('headline numbers are formatted as strings with units', () => {
    const sim = makeSimulation(kenya, 0.2);
    const result = calculateImpactAnalysis(kenya, sim, params, 'test');
    const { headline } = result.policyBrief;
    expect(headline.povertyReduction.formatted).toMatch(/[0-9]/);
    expect(headline.purchasingPower.formatted).toContain('%');
    expect(headline.socialCoverage.formatted).toMatch(/[0-9]/);
    expect(headline.gdpStimulus.formatted).toContain('$');
  });

  it('GDP stimulus > annual transfer cost (multiplier > 1 for LMC)', () => {
    const sim = makeSimulation(kenya, 0.2);
    const result = calculateImpactAnalysis(kenya, sim, params, 'test');
    expect(result.fiscalMultiplier.estimatedGdpStimulusPppUsd)
      .toBeGreaterThan(result.program.annualCostPppUsd);
  });
});
