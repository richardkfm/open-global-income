import type {
  Country,
  FundingMechanismInput,
  FundingEstimate,
  FiscalContext,
  FundingScenarioResult,
  SimulationResult,
} from './types.js';

// ── Proxy constants for mechanisms without direct data ─────────────────────

/**
 * Approximate wealth-to-GDP ratios by income group.
 * Source: Credit Suisse Global Wealth Report averages.
 */
const WEALTH_TO_GDP_RATIO: Record<string, number> = {
  HIC: 4.5,
  UMC: 2.5,
  LMC: 1.8,
  LIC: 1.2,
};

/**
 * Approximate CO2 emissions per GDP (tons per $1000 GDP).
 * Source: World Bank, rough averages by income group.
 */
const CO2_PER_1000_GDP: Record<string, number> = {
  HIC: 0.20,
  UMC: 0.45,
  LMC: 0.35,
  LIC: 0.25,
};

/**
 * Approximate stock market turnover as % of GDP by income group.
 * Source: World Bank CM.MKT.TRNR averages.
 */
const STOCK_TURNOVER_PCT_GDP: Record<string, number> = {
  HIC: 80,
  UMC: 30,
  LMC: 10,
  LIC: 2,
};

/**
 * Estimated automation-exposed GDP share by income group.
 *
 * Represents the portion of GDP produced by industries with high automation
 * potential (manufacturing, logistics, financial services, IT, agriculture).
 * Higher-income countries have larger automated sectors.
 *
 * Source: McKinsey Global Institute automation potential estimates and
 * OECD employment-by-sector data, aggregated by income group.
 */
const AUTOMATION_GDP_SHARE: Record<string, number> = {
  HIC: 0.45,
  UMC: 0.35,
  LMC: 0.25,
  LIC: 0.15,
};

// ── Individual mechanism calculators ───────────────────────────────────────

/**
 * Flat income tax surcharge.
 *
 * Revenue ≈ surchargeRate × GNI per capita × population × laborForceParticipation
 *
 * If laborForceParticipation is unavailable, falls back to 60% (global average).
 */
export function calcIncomeTaxSurcharge(
  country: Country,
  rate: number,
): FundingEstimate {
  const lfp = (country.stats.laborForceParticipation ?? 60) / 100;
  const revenueUsd = rate * country.stats.gniPerCapitaUsd * country.stats.population * lfp;
  const revenuePpp = revenueUsd;
  const revenueLocal = revenuePpp * country.stats.pppConversionFactor;

  const assumptions = [
    `Income tax surcharge of ${(rate * 100).toFixed(1)}% applied to GNI per capita`,
    `Labor force participation: ${(lfp * 100).toFixed(1)}%${country.stats.laborForceParticipation == null ? ' (estimated, data unavailable)' : ''}`,
    'Assumes uniform tax base across all employed individuals (simplified)',
  ];

  return {
    mechanism: 'income_tax_surcharge',
    label: `${(rate * 100).toFixed(1)}% income tax surcharge`,
    annualRevenueLocal: Math.round(revenueLocal),
    annualRevenuePppUsd: Math.round(revenuePpp),
    coversPercentOfUbiCost: 0, // filled in by scenario builder
    assumptions,
  };
}

/**
 * VAT increase.
 *
 * If IMF tax breakdown is available, uses actual VAT/GDP share to estimate
 * the tax base. Otherwise uses a proxy based on income group.
 */
export function calcVatIncrease(
  country: Country,
  points: number,
): FundingEstimate {
  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const currentVatShare = country.stats.taxBreakdown?.vatPercentGdp;
  const taxRevPct = country.stats.taxRevenuePercentGdp;

  let revenueUsd: number;
  const assumptions: string[] = [];

  if (currentVatShare != null && currentVatShare > 0) {
    // Estimate existing VAT rate: vatShare / consumption-to-GDP
    // Simplified: each percentage point of VAT rate raises ~(currentVatRevenue / currentImplicitRate) in revenue
    // Use proportional approach: additionalRevenue = (points / impliedRate) × currentVatRevenue
    // But we don't know implied rate. Simpler: 1pp VAT ≈ vatShare × GDP / (standard rate ~15%)
    const impliedRate = 15; // typical VAT rate
    const vatRevenueUsd = (currentVatShare / 100) * gdpTotal;
    revenueUsd = (points / impliedRate) * vatRevenueUsd;
    assumptions.push(
      `Current VAT revenue: ${currentVatShare.toFixed(1)}% of GDP`,
      `Assumed implied VAT rate of ~15% to estimate per-point revenue`,
    );
  } else if (taxRevPct != null) {
    // Proxy: VAT is typically ~30% of total tax revenue
    const estimatedVatRevenue = (0.3 * taxRevPct / 100) * gdpTotal;
    revenueUsd = (points / 15) * estimatedVatRevenue;
    assumptions.push(
      `VAT breakdown unavailable; estimated as 30% of total tax revenue (${taxRevPct.toFixed(1)}% of GDP)`,
      'Assumed implied VAT rate of ~15%',
    );
  } else {
    // Fallback: income group proxy
    const vatPctProxy: Record<string, number> = { HIC: 7, UMC: 5, LMC: 4, LIC: 3 };
    const proxy = vatPctProxy[country.stats.incomeGroup] ?? 4;
    const estimatedVatRevenue = (proxy / 100) * gdpTotal;
    revenueUsd = (points / 15) * estimatedVatRevenue;
    assumptions.push(
      `No tax data available; used income-group proxy VAT/GDP of ${proxy}%`,
      'Assumed implied VAT rate of ~15%',
    );
  }

  assumptions.push(`VAT increase of ${points} percentage point(s)`);

  return {
    mechanism: 'vat_increase',
    label: `${points}pp VAT increase`,
    annualRevenueLocal: Math.round(revenueUsd * country.stats.pppConversionFactor),
    annualRevenuePppUsd: Math.round(revenueUsd),
    coversPercentOfUbiCost: 0,
    assumptions,
  };
}

/**
 * Carbon tax.
 *
 * Revenue ≈ dollarPerTon × estimated CO2 emissions
 * Emissions estimated from GDP × income-group emission intensity.
 */
export function calcCarbonTax(
  country: Country,
  dollarPerTon: number,
): FundingEstimate {
  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const co2PerThousand = CO2_PER_1000_GDP[country.stats.incomeGroup] ?? 0.3;
  const totalEmissionsKt = (gdpTotal / 1000) * co2PerThousand;
  const revenueUsd = dollarPerTon * totalEmissionsKt * 1000; // kt → tons

  return {
    mechanism: 'carbon_tax',
    label: `$${dollarPerTon}/ton carbon tax`,
    annualRevenueLocal: Math.round(revenueUsd * country.stats.pppConversionFactor),
    annualRevenuePppUsd: Math.round(revenueUsd),
    coversPercentOfUbiCost: 0,
    assumptions: [
      `Carbon tax of $${dollarPerTon} per metric ton of CO2`,
      `Estimated CO2 emissions: ${formatLargeNumber(totalEmissionsKt * 1000)} tons (${co2PerThousand} tons per $1,000 GDP for ${country.stats.incomeGroup})`,
      'Emission intensity is an income-group proxy, not country-specific',
    ],
  };
}

/**
 * Wealth tax.
 *
 * Revenue ≈ rate × GDP × wealth-to-GDP ratio (by income group).
 */
export function calcWealthTax(
  country: Country,
  rate: number,
): FundingEstimate {
  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const wealthRatio = WEALTH_TO_GDP_RATIO[country.stats.incomeGroup] ?? 2.0;
  const totalWealth = gdpTotal * wealthRatio;
  const revenueUsd = rate * totalWealth;

  return {
    mechanism: 'wealth_tax',
    label: `${(rate * 100).toFixed(1)}% wealth tax`,
    annualRevenueLocal: Math.round(revenueUsd * country.stats.pppConversionFactor),
    annualRevenuePppUsd: Math.round(revenueUsd),
    coversPercentOfUbiCost: 0,
    assumptions: [
      `Wealth tax of ${(rate * 100).toFixed(2)}% on total private wealth`,
      `Wealth-to-GDP ratio: ${wealthRatio}x (${country.stats.incomeGroup} income group proxy)`,
      'Based on Credit Suisse Global Wealth Report averages; actual wealth concentration varies',
    ],
  };
}

/**
 * Financial transaction tax.
 *
 * Revenue ≈ rate × estimated stock market turnover.
 */
export function calcFinancialTransactionTax(
  country: Country,
  rate: number,
): FundingEstimate {
  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const turnoverPct = STOCK_TURNOVER_PCT_GDP[country.stats.incomeGroup] ?? 10;
  const turnoverUsd = (turnoverPct / 100) * gdpTotal;
  const revenueUsd = rate * turnoverUsd;

  return {
    mechanism: 'financial_transaction_tax',
    label: `${(rate * 100).toFixed(2)}% financial transaction tax`,
    annualRevenueLocal: Math.round(revenueUsd * country.stats.pppConversionFactor),
    annualRevenuePppUsd: Math.round(revenueUsd),
    coversPercentOfUbiCost: 0,
    assumptions: [
      `FTT of ${(rate * 100).toFixed(2)}% on financial transactions`,
      `Estimated stock market turnover: ${turnoverPct}% of GDP (${country.stats.incomeGroup} proxy)`,
      'Does not include OTC, bond, or forex transactions',
    ],
  };
}

/**
 * Automation tax.
 *
 * A tax on companies that deploy AI systems, robotics, or automated processes
 * to replace human labor. As automation displaces workers, this mechanism
 * captures a share of the productivity gains to fund universal basic income —
 * ensuring that the economic benefits of automation are broadly distributed.
 *
 * Revenue ≈ rate × GDP × automation-exposed sector share
 *
 * The tax base is estimated from the share of GDP produced by industries
 * with high automation potential: manufacturing, logistics, financial
 * services, IT, and industrialized agriculture. The rate represents a
 * levy on the revenue of companies in those sectors that use AI or
 * robotic systems in production.
 */
export function calcAutomationTax(
  country: Country,
  rate: number,
): FundingEstimate {
  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const automationShare = AUTOMATION_GDP_SHARE[country.stats.incomeGroup] ?? 0.25;
  const taxableBase = gdpTotal * automationShare;
  const revenueUsd = rate * taxableBase;

  return {
    mechanism: 'automation_tax',
    label: `${(rate * 100).toFixed(1)}% automation tax`,
    annualRevenueLocal: Math.round(revenueUsd * country.stats.pppConversionFactor),
    annualRevenuePppUsd: Math.round(revenueUsd),
    coversPercentOfUbiCost: 0,
    assumptions: [
      `Automation tax of ${(rate * 100).toFixed(1)}% on revenue from AI and robotics-intensive production`,
      `Automation-exposed GDP share: ${(automationShare * 100).toFixed(0)}% (${country.stats.incomeGroup} income group estimate)`,
      'Covers manufacturing, logistics, financial services, IT, and industrialized agriculture',
      'Based on McKinsey/OECD automation potential estimates; actual exposure varies by country',
      'Assumes companies self-report or are classified by sector automation intensity',
    ],
  };
}

/**
 * Redirect existing social spending.
 *
 * Revenue = redirectPercent × social protection spending.
 * Uses ILO data if available, falls back to World Bank indicator.
 */
export function calcRedirectSocialSpending(
  country: Country,
  percent: number,
): FundingEstimate {
  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const socialPct =
    country.stats.socialProtectionExpenditureIloPercentGdp ??
    country.stats.socialProtectionSpendingPercentGdp;

  const assumptions: string[] = [];
  let revenueUsd: number;

  if (socialPct != null) {
    const socialSpendUsd = (socialPct / 100) * gdpTotal;
    revenueUsd = percent * socialSpendUsd;
    const source = country.stats.socialProtectionExpenditureIloPercentGdp != null ? 'ILO' : 'World Bank';
    assumptions.push(
      `Current social protection spending: ${socialPct.toFixed(1)}% of GDP (${source})`,
      `Redirecting ${(percent * 100).toFixed(0)}% of current social spending`,
    );
  } else {
    // Fallback: income group proxy
    const proxyPct: Record<string, number> = { HIC: 12, UMC: 5, LMC: 2.5, LIC: 1.5 };
    const proxy = proxyPct[country.stats.incomeGroup] ?? 3;
    revenueUsd = percent * (proxy / 100) * gdpTotal;
    assumptions.push(
      `Social protection spending data unavailable; used ${proxy}% of GDP proxy for ${country.stats.incomeGroup}`,
      `Redirecting ${(percent * 100).toFixed(0)}% of estimated social spending`,
    );
  }

  assumptions.push('Assumes redirected spending does not reduce essential services');

  return {
    mechanism: 'redirect_social_spending',
    label: `Redirect ${(percent * 100).toFixed(0)}% of social spending`,
    annualRevenueLocal: Math.round(revenueUsd * country.stats.pppConversionFactor),
    annualRevenuePppUsd: Math.round(revenueUsd),
    coversPercentOfUbiCost: 0,
    assumptions,
  };
}

// ── Dispatch: calculate a single mechanism ─────────────────────────────────

export function calculateFundingMechanism(
  country: Country,
  input: FundingMechanismInput,
): FundingEstimate {
  switch (input.type) {
    case 'income_tax_surcharge':
      return calcIncomeTaxSurcharge(country, input.rate);
    case 'vat_increase':
      return calcVatIncrease(country, input.points);
    case 'carbon_tax':
      return calcCarbonTax(country, input.dollarPerTon);
    case 'wealth_tax':
      return calcWealthTax(country, input.rate);
    case 'financial_transaction_tax':
      return calcFinancialTransactionTax(country, input.rate);
    case 'automation_tax':
      return calcAutomationTax(country, input.rate);
    case 'redirect_social_spending':
      return calcRedirectSocialSpending(country, input.percent);
  }
}

// ── Fiscal context ─────────────────────────────────────────────────────────

export function calculateFiscalContext(
  country: Country,
  annualUbiCostPppUsd: number,
): FiscalContext {
  const gdpTotal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const taxRev = country.stats.taxRevenuePercentGdp;
  const socialSpend =
    country.stats.socialProtectionExpenditureIloPercentGdp ??
    country.stats.socialProtectionSpendingPercentGdp;
  const debt = country.stats.governmentDebtPercentGdp;

  const taxRevenueAbsolute = taxRev != null ? Math.round((taxRev / 100) * gdpTotal) : null;
  const socialAbsolute = socialSpend != null ? Math.round((socialSpend / 100) * gdpTotal) : null;

  return {
    totalTaxRevenue: {
      percentGdp: taxRev ?? null,
      absolutePppUsd: taxRevenueAbsolute,
    },
    currentSocialSpending: {
      percentGdp: socialSpend ?? null,
      absolutePppUsd: socialAbsolute,
    },
    governmentDebt: {
      percentGdp: debt ?? null,
    },
    ubiAsPercentOfTaxRevenue:
      taxRevenueAbsolute != null && taxRevenueAbsolute > 0
        ? Math.round((annualUbiCostPppUsd / taxRevenueAbsolute) * 1000) / 10
        : null,
    ubiAsPercentOfSocialSpending:
      socialAbsolute != null && socialAbsolute > 0
        ? Math.round((annualUbiCostPppUsd / socialAbsolute) * 1000) / 10
        : null,
  };
}

// ── Full scenario builder ──────────────────────────────────────────────────

/**
 * Calculate a complete funding scenario for a simulation result.
 *
 * Pure function — no side effects.
 */
export function calculateFundingScenario(
  country: Country,
  simulation: SimulationResult,
  mechanisms: FundingMechanismInput[],
  dataVersion: string,
  simulationId?: string | null,
): FundingScenarioResult {
  const annualCost = simulation.simulation.cost.annualPppUsd;

  const estimates = mechanisms.map((m) => {
    const est = calculateFundingMechanism(country, m);
    est.coversPercentOfUbiCost =
      annualCost > 0
        ? Math.round((est.annualRevenuePppUsd / annualCost) * 10000) / 100
        : 0;
    return est;
  });

  const totalRevenue = estimates.reduce((sum, e) => sum + e.annualRevenuePppUsd, 0);
  const coverage = annualCost > 0 ? Math.round((totalRevenue / annualCost) * 10000) / 100 : 0;
  const gap = Math.max(0, annualCost - totalRevenue);

  const fiscal = calculateFiscalContext(country, annualCost);

  return {
    simulationId: simulationId ?? null,
    country: {
      code: country.code,
      name: country.name,
      population: country.stats.population,
    },
    ubiCost: {
      annualPppUsd: annualCost,
      asPercentOfGdp: simulation.simulation.cost.asPercentOfGdp,
    },
    fiscalContext: fiscal,
    mechanisms: estimates,
    totalRevenuePppUsd: Math.round(totalRevenue),
    coverageOfUbiCost: coverage,
    gapPppUsd: Math.round(gap),
    meta: simulation.simulation.meta,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatLargeNumber(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
