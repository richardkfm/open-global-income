import { describe, it, expect } from 'vitest';
import {
  calcIncomeTaxSurcharge,
  calcVatIncrease,
  calcCarbonTax,
  calcWealthTax,
  calcFinancialTransactionTax,
  calcRedirectSocialSpending,
  calculateFundingMechanism,
  calculateFiscalContext,
  calculateFundingScenario,
} from './funding.js';
import type { Country, SimulationResult, FundingMechanismInput } from './types.js';

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
    taxRevenuePercentGdp: 16.1,
    socialProtectionSpendingPercentGdp: 2.3,
    governmentDebtPercentGdp: 68.2,
    laborForceParticipation: 72.3,
    inflationRate: 7.7,
    taxBreakdown: {
      incomeTaxPercentGdp: 6.2,
      vatPercentGdp: 4.8,
      tradeTaxPercentGdp: 1.4,
      otherTaxPercentGdp: 3.7,
    },
  },
};

const kenyaMinimal: Country = {
  code: 'KE',
  name: 'Kenya',
  stats: {
    gdpPerCapitaUsd: 2099,
    gniPerCapitaUsd: 2010,
    pppConversionFactor: 49.37,
    giniIndex: 38.7,
    population: 54030000,
    incomeGroup: 'LMC',
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
    population: 83800000,
    incomeGroup: 'HIC',
    taxRevenuePercentGdp: 24.5,
    socialProtectionSpendingPercentGdp: 16.2,
    governmentDebtPercentGdp: 66.3,
    laborForceParticipation: 77.5,
  },
};

const simulationResult: SimulationResult = {
  country: { code: 'KE', name: 'Kenya', population: 54030000 },
  simulation: {
    recipientCount: 10806000,
    coverageRate: 0.2,
    entitlementPerPerson: { pppUsdPerMonth: 210, localCurrencyPerMonth: 10367.7 },
    cost: {
      monthlyLocalCurrency: 112033366200,
      annualLocalCurrency: 1344400394400,
      annualPppUsd: 27231120000,
      asPercentOfGdp: 24.01,
    },
    meta: { rulesetVersion: 'v1', dataVersion: 'test' },
  },
};

describe('calcIncomeTaxSurcharge', () => {
  it('calculates revenue from income tax surcharge', () => {
    const est = calcIncomeTaxSurcharge(kenya, 0.03);
    expect(est.mechanism).toBe('income_tax_surcharge');
    // 0.03 × 2010 × 54030000 × 0.723 ≈ 2,354,XXX,XXX
    expect(est.annualRevenuePppUsd).toBeGreaterThan(2_000_000_000);
    expect(est.annualRevenuePppUsd).toBeLessThan(3_000_000_000);
    expect(est.annualRevenueLocal).toBeGreaterThan(0);
    expect(est.assumptions.length).toBeGreaterThan(0);
  });

  it('falls back to 60% LFP when data missing', () => {
    const est = calcIncomeTaxSurcharge(kenyaMinimal, 0.03);
    // 0.03 × 2010 × 54030000 × 0.60
    const expected = 0.03 * 2010 * 54030000 * 0.6;
    expect(est.annualRevenuePppUsd).toBe(Math.round(expected));
    expect(est.assumptions.some((a) => a.includes('estimated'))).toBe(true);
  });

  it('scales linearly with rate', () => {
    const est1 = calcIncomeTaxSurcharge(kenya, 0.01);
    const est2 = calcIncomeTaxSurcharge(kenya, 0.02);
    expect(Math.round(est2.annualRevenuePppUsd / est1.annualRevenuePppUsd)).toBe(2);
  });
});

describe('calcVatIncrease', () => {
  it('uses IMF VAT breakdown when available', () => {
    const est = calcVatIncrease(kenya, 2);
    expect(est.mechanism).toBe('vat_increase');
    expect(est.annualRevenuePppUsd).toBeGreaterThan(0);
    expect(est.assumptions.some((a) => a.includes('4.8%'))).toBe(true);
  });

  it('falls back when no tax breakdown', () => {
    const est = calcVatIncrease(kenyaMinimal, 2);
    expect(est.annualRevenuePppUsd).toBeGreaterThan(0);
    expect(est.assumptions.some((a) => a.includes('proxy'))).toBe(true);
  });

  it('scales with points', () => {
    const est1 = calcVatIncrease(kenya, 1);
    const est2 = calcVatIncrease(kenya, 3);
    expect(Math.round(est2.annualRevenuePppUsd / est1.annualRevenuePppUsd)).toBe(3);
  });
});

describe('calcCarbonTax', () => {
  it('calculates carbon tax revenue', () => {
    const est = calcCarbonTax(kenya, 25);
    expect(est.mechanism).toBe('carbon_tax');
    expect(est.annualRevenuePppUsd).toBeGreaterThan(0);
    expect(est.label).toContain('$25');
    expect(est.assumptions.length).toBeGreaterThanOrEqual(2);
  });

  it('higher rate = higher revenue', () => {
    const est25 = calcCarbonTax(kenya, 25);
    const est50 = calcCarbonTax(kenya, 50);
    expect(est50.annualRevenuePppUsd).toBe(est25.annualRevenuePppUsd * 2);
  });
});

describe('calcWealthTax', () => {
  it('calculates wealth tax revenue', () => {
    const est = calcWealthTax(kenya, 0.01);
    expect(est.mechanism).toBe('wealth_tax');
    const gdp = kenya.stats.gdpPerCapitaUsd * kenya.stats.population;
    const expected = 0.01 * gdp * 1.8; // LMC ratio
    expect(est.annualRevenuePppUsd).toBe(Math.round(expected));
  });

  it('uses different ratios for different income groups', () => {
    const estKe = calcWealthTax(kenya, 0.01);
    const estDe = calcWealthTax(germany, 0.01);
    // Germany (HIC) has higher wealth-to-GDP ratio
    const ratioKe = estKe.annualRevenuePppUsd / (kenya.stats.gdpPerCapitaUsd * kenya.stats.population);
    const ratioDe = estDe.annualRevenuePppUsd / (germany.stats.gdpPerCapitaUsd * germany.stats.population);
    expect(ratioDe).toBeGreaterThan(ratioKe);
  });
});

describe('calcFinancialTransactionTax', () => {
  it('calculates FTT revenue', () => {
    const est = calcFinancialTransactionTax(germany, 0.001);
    expect(est.mechanism).toBe('financial_transaction_tax');
    expect(est.annualRevenuePppUsd).toBeGreaterThan(0);
    expect(est.label).toContain('0.10%');
  });
});

describe('calcRedirectSocialSpending', () => {
  it('uses actual social spending data', () => {
    const est = calcRedirectSocialSpending(kenya, 0.5);
    expect(est.mechanism).toBe('redirect_social_spending');
    expect(est.annualRevenuePppUsd).toBeGreaterThan(0);
    expect(est.assumptions.some((a) => a.includes('2.3%'))).toBe(true);
  });

  it('falls back when no data', () => {
    const est = calcRedirectSocialSpending(kenyaMinimal, 0.5);
    expect(est.annualRevenuePppUsd).toBeGreaterThan(0);
    expect(est.assumptions.some((a) => a.includes('proxy'))).toBe(true);
  });

  it('redirecting 100% equals total social spending', () => {
    const est100 = calcRedirectSocialSpending(kenya, 1.0);
    const gdp = kenya.stats.gdpPerCapitaUsd * kenya.stats.population;
    const socialSpend = Math.round((2.3 / 100) * gdp);
    expect(est100.annualRevenuePppUsd).toBe(socialSpend);
  });
});

describe('calculateFundingMechanism (dispatch)', () => {
  it('dispatches to correct calculator', () => {
    const est = calculateFundingMechanism(kenya, { type: 'income_tax_surcharge', rate: 0.02 });
    expect(est.mechanism).toBe('income_tax_surcharge');
    const est2 = calculateFundingMechanism(kenya, { type: 'carbon_tax', dollarPerTon: 10 });
    expect(est2.mechanism).toBe('carbon_tax');
  });
});

describe('calculateFiscalContext', () => {
  it('calculates fiscal context with data', () => {
    const ctx = calculateFiscalContext(kenya, 27231120000);
    expect(ctx.totalTaxRevenue.percentGdp).toBe(16.1);
    expect(ctx.totalTaxRevenue.absolutePppUsd).toBeGreaterThan(0);
    expect(ctx.governmentDebt.percentGdp).toBe(68.2);
    expect(ctx.ubiAsPercentOfTaxRevenue).toBeGreaterThan(100);
    expect(ctx.ubiAsPercentOfSocialSpending).toBeGreaterThan(100);
  });

  it('handles missing data gracefully', () => {
    const ctx = calculateFiscalContext(kenyaMinimal, 27231120000);
    expect(ctx.totalTaxRevenue.percentGdp).toBeNull();
    expect(ctx.totalTaxRevenue.absolutePppUsd).toBeNull();
    expect(ctx.ubiAsPercentOfTaxRevenue).toBeNull();
    expect(ctx.ubiAsPercentOfSocialSpending).toBeNull();
  });
});

describe('calculateFundingScenario', () => {
  it('builds a complete scenario with multiple mechanisms', () => {
    const mechanisms: FundingMechanismInput[] = [
      { type: 'income_tax_surcharge', rate: 0.03 },
      { type: 'vat_increase', points: 2 },
      { type: 'redirect_social_spending', percent: 0.3 },
    ];

    const result = calculateFundingScenario(kenya, simulationResult, mechanisms, 'test');

    expect(result.country.code).toBe('KE');
    expect(result.ubiCost.annualPppUsd).toBe(27231120000);
    expect(result.mechanisms).toHaveLength(3);
    expect(result.totalRevenuePppUsd).toBeGreaterThan(0);
    expect(result.coverageOfUbiCost).toBeGreaterThan(0);
    expect(result.coverageOfUbiCost).toBeLessThan(100);
    expect(result.gapPppUsd).toBeGreaterThan(0);
    expect(result.fiscalContext.totalTaxRevenue.percentGdp).toBe(16.1);
    expect(result.meta.rulesetVersion).toBe('v1');
  });

  it('each mechanism has coversPercentOfUbiCost filled', () => {
    const mechanisms: FundingMechanismInput[] = [
      { type: 'income_tax_surcharge', rate: 0.05 },
    ];
    const result = calculateFundingScenario(kenya, simulationResult, mechanisms, 'test');
    expect(result.mechanisms[0].coversPercentOfUbiCost).toBeGreaterThan(0);
  });

  it('handles empty mechanisms array', () => {
    const result = calculateFundingScenario(kenya, simulationResult, [], 'test');
    expect(result.mechanisms).toHaveLength(0);
    expect(result.totalRevenuePppUsd).toBe(0);
    expect(result.coverageOfUbiCost).toBe(0);
    expect(result.gapPppUsd).toBe(27231120000);
  });

  it('assigns simulationId when provided', () => {
    const result = calculateFundingScenario(kenya, simulationResult, [], 'test', 'sim-123');
    expect(result.simulationId).toBe('sim-123');
  });

  it('is deterministic', () => {
    const mechanisms: FundingMechanismInput[] = [
      { type: 'income_tax_surcharge', rate: 0.03 },
      { type: 'carbon_tax', dollarPerTon: 25 },
    ];
    const a = calculateFundingScenario(kenya, simulationResult, mechanisms, 'test');
    const b = calculateFundingScenario(kenya, simulationResult, mechanisms, 'test');
    expect(a).toEqual(b);
  });
});
