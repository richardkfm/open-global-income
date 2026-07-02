import type {
  Country,
  FundingMechanismInput,
  FundingMechanismType,
  FundingEstimate,
  FiscalContext,
  FundingScenarioResult,
  SimulationResult,
} from './types.js';

// ── Collection-effectiveness factors ──────────────────────────────────────

/**
 * Share of labor income that is effectively reachable by income tax,
 * accounting for informal-economy size by income group.
 *
 * LIC/LMC economies have large informal sectors (smallholder agriculture,
 * street trade, cash services) that sit outside the formal tax base.
 * Sources: IMF Fiscal Monitor informality estimates; World Bank informality
 * database.
 */
const INCOME_TAX_FORMALITY_FACTOR: Record<string, number> = {
  HIC: 0.90, // ~10% informal
  UMC: 0.70, // ~30% informal
  LMC: 0.50, // ~50% informal
  LIC: 0.35, // ~65% informal
};

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
 * Effective collection rate for a wealth tax, accounting for avoidance,
 * capital flight, and enforcement capacity.
 *
 * High-net-worth individuals use offshore structures, complex trusts, and
 * asset reclassification to reduce taxable wealth. The few countries that
 * have implemented wealth taxes (France, Sweden, Germany) observed actual
 * revenues well below naive estimates; most eventually repealed the tax.
 * Lower-income countries have weaker enforcement and greater capital
 * mobility risk.
 *
 * Sources: IMF Working Paper WP/19/143 "Taxing Wealth"; OECD "The Role and
 * Design of Net Wealth Taxes".
 */
const WEALTH_TAX_COLLECTION_FACTOR: Record<string, number> = {
  HIC: 0.55, // strong institutions, but high capital mobility
  UMC: 0.40,
  LMC: 0.25,
  LIC: 0.15, // limited enforcement, large informal wealth
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
  const formalityFactor = INCOME_TAX_FORMALITY_FACTOR[country.stats.incomeGroup] ?? 0.60;
  // GNI is nominal USD; scale to PPP-USD by the country's PPP/nominal GDP ratio
  // so the surcharge compares like-for-like with the PPP-denominated UBI cost.
  const pppRatio =
    country.stats.gdpPerCapitaUsd > 0
      ? country.stats.gdpPerCapitaPppUsd / country.stats.gdpPerCapitaUsd
      : 1;
  const revenueNominalUsd =
    rate * country.stats.gniPerCapitaUsd * country.stats.population * lfp * formalityFactor;
  const revenuePpp = revenueNominalUsd * pppRatio;
  const revenueLocal = revenuePpp * country.stats.pppConversionFactor;

  const assumptions = [
    `Income tax surcharge of ${(rate * 100).toFixed(1)}% applied to GNI per capita`,
    `Labor force participation: ${(lfp * 100).toFixed(1)}%${country.stats.laborForceParticipation == null ? ' (estimated, data unavailable)' : ''}`,
    `Formal-economy adjustment: ${(formalityFactor * 100).toFixed(0)}% of labor income is in the tax base (${country.stats.incomeGroup} informality estimate)`,
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
 * Behavioral response factor for VAT increases.
 *
 * When VAT rates rise, consumers reduce spending, substitute to
 * lower-taxed goods, or shift to informal markets. Each percentage
 * point of VAT increase therefore raises less than the naive
 * proportional amount. Empirical estimates put the discount at
 * 15–25% of theoretical yield.
 *
 * Source: IMF "Value Added Tax: Principles and Practice" (2011);
 * Keen & Lockwood (2010) cross-country estimates.
 */
const VAT_BEHAVIORAL_DISCOUNT = 0.80; // 20% demand response

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
  // PPP-USD GDP base: a share/multiple of GDP is unit-invariant, so expressing
  // it in PPP-USD keeps the revenue comparable to the PPP-denominated UBI cost.
  const gdpTotal = country.stats.gdpPerCapitaPppUsd * country.stats.population;
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
    revenueUsd = (points / impliedRate) * vatRevenueUsd * VAT_BEHAVIORAL_DISCOUNT;
    assumptions.push(
      `Current VAT revenue: ${currentVatShare.toFixed(1)}% of GDP`,
      `Assumed implied VAT rate of ~15% to estimate per-point revenue`,
    );
  } else if (taxRevPct != null) {
    // Proxy: VAT is typically ~30% of total tax revenue
    const estimatedVatRevenue = (0.3 * taxRevPct / 100) * gdpTotal;
    revenueUsd = (points / 15) * estimatedVatRevenue * VAT_BEHAVIORAL_DISCOUNT;
    assumptions.push(
      `VAT breakdown unavailable; estimated as 30% of total tax revenue (${taxRevPct.toFixed(1)}% of GDP)`,
      'Assumed implied VAT rate of ~15%',
    );
  } else {
    // Fallback: income group proxy
    const vatPctProxy: Record<string, number> = { HIC: 7, UMC: 5, LMC: 4, LIC: 3 };
    const proxy = vatPctProxy[country.stats.incomeGroup] ?? 4;
    const estimatedVatRevenue = (proxy / 100) * gdpTotal;
    revenueUsd = (points / 15) * estimatedVatRevenue * VAT_BEHAVIORAL_DISCOUNT;
    assumptions.push(
      `No tax data available; used income-group proxy VAT/GDP of ${proxy}%`,
      'Assumed implied VAT rate of ~15%',
    );
  }

  assumptions.push(
    `VAT increase of ${points} percentage point(s)`,
    `Behavioral discount of 20% applied (demand response reduces yield below linear estimate)`,
  );

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
  // Emissions are a physical quantity, so they are estimated from *nominal*
  // GDP (the intensity constant is calibrated to market-rate GDP). The carbon
  // price then yields revenue in nominal USD, which we convert to PPP-USD via
  // the country's PPP/nominal ratio for like-for-like comparison with the cost.
  const gdpTotalNominal = country.stats.gdpPerCapitaUsd * country.stats.population;
  const co2PerThousand = CO2_PER_1000_GDP[country.stats.incomeGroup] ?? 0.3;
  // co2PerThousand is tons of CO2 per $1,000 of GDP
  // gdpTotalNominal / 1000 = number of $1,000-of-GDP units → result is in tons
  const totalEmissionsTons = (gdpTotalNominal / 1000) * co2PerThousand;
  const revenueNominalUsd = dollarPerTon * totalEmissionsTons;
  const pppRatio =
    country.stats.gdpPerCapitaUsd > 0
      ? country.stats.gdpPerCapitaPppUsd / country.stats.gdpPerCapitaUsd
      : 1;
  const revenuePppUsd = revenueNominalUsd * pppRatio;

  return {
    mechanism: 'carbon_tax',
    label: `$${dollarPerTon}/ton carbon tax`,
    annualRevenueLocal: Math.round(revenuePppUsd * country.stats.pppConversionFactor),
    annualRevenuePppUsd: Math.round(revenuePppUsd),
    coversPercentOfUbiCost: 0,
    assumptions: [
      `Carbon tax of $${dollarPerTon} per metric ton of CO2`,
      `Estimated CO2 emissions: ${formatLargeNumber(totalEmissionsTons)} tons (${co2PerThousand} tons per $1,000 GDP for ${country.stats.incomeGroup})`,
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
  // PPP-USD GDP base: a share/multiple of GDP is unit-invariant, so expressing
  // it in PPP-USD keeps the revenue comparable to the PPP-denominated UBI cost.
  const gdpTotal = country.stats.gdpPerCapitaPppUsd * country.stats.population;
  const wealthRatio = WEALTH_TO_GDP_RATIO[country.stats.incomeGroup] ?? 2.0;
  const collectionFactor = WEALTH_TAX_COLLECTION_FACTOR[country.stats.incomeGroup] ?? 0.30;
  const totalWealth = gdpTotal * wealthRatio;
  const revenueUsd = rate * totalWealth * collectionFactor;

  return {
    mechanism: 'wealth_tax',
    label: `${(rate * 100).toFixed(1)}% wealth tax`,
    annualRevenueLocal: Math.round(revenueUsd * country.stats.pppConversionFactor),
    annualRevenuePppUsd: Math.round(revenueUsd),
    coversPercentOfUbiCost: 0,
    assumptions: [
      `Wealth tax of ${(rate * 100).toFixed(2)}% on total private wealth`,
      `Wealth-to-GDP ratio: ${wealthRatio}x (${country.stats.incomeGroup} income group proxy)`,
      `Effective collection rate: ${(collectionFactor * 100).toFixed(0)}% (accounts for avoidance, offshore structures, capital flight)`,
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
  // PPP-USD GDP base: a share/multiple of GDP is unit-invariant, so expressing
  // it in PPP-USD keeps the revenue comparable to the PPP-denominated UBI cost.
  const gdpTotal = country.stats.gdpPerCapitaPppUsd * country.stats.population;
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
  // PPP-USD GDP base: a share/multiple of GDP is unit-invariant, so expressing
  // it in PPP-USD keeps the revenue comparable to the PPP-denominated UBI cost.
  const gdpTotal = country.stats.gdpPerCapitaPppUsd * country.stats.population;
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
  // PPP-USD GDP base: a share/multiple of GDP is unit-invariant, so expressing
  // it in PPP-USD keeps the revenue comparable to the PPP-denominated UBI cost.
  const gdpTotal = country.stats.gdpPerCapitaPppUsd * country.stats.population;
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

/**
 * Pooled international solidarity transfer.
 *
 * Not a domestic mechanism: this represents the residual funding gap after
 * the seven domestic mechanisms above are sized at realistic ceilings,
 * relabeled as an explicit external-transfer requirement instead of an
 * unlabeled shortfall (row D of INCOME_FLOOR_PROPOSED_ANSWERS.md). The
 * amount is a modeled need, not a real revenue estimate — it is sized by
 * the caller (see `calculateRecommendedFundingMix`), not computed here.
 *
 * Precedents for GNI-proportional, rules-based cross-border transfers:
 * EU cohesion funds, the IMF Poverty Reduction and Growth Trust (PRGT),
 * and Green Climate Fund contributions. Sizing the donor-side pool and its
 * allocation key is Federation-layer work (see `src/core/solidarity.ts`,
 * once built); this function only states the recipient-side requirement.
 */
export function calcInternationalSolidarityTransfer(
  country: Country,
  annualAmountPppUsd: number,
): FundingEstimate {
  const revenuePpp = Math.max(0, annualAmountPppUsd);

  return {
    mechanism: 'international_solidarity_transfer',
    label: 'Pooled international solidarity transfer',
    annualRevenueLocal: Math.round(revenuePpp * country.stats.pppConversionFactor),
    annualRevenuePppUsd: Math.round(revenuePpp),
    coversPercentOfUbiCost: 0, // filled in by scenario builder
    assumptions: [
      'Not a domestic mechanism: the residual gap after the seven domestic mechanisms are sized at realistic ceilings, relabeled as an explicit external-transfer requirement rather than left unlabeled',
      'Modeled on precedents for rules-based, GNI-proportional cross-border transfers: EU cohesion funds, the IMF Poverty Reduction and Growth Trust (PRGT), and Green Climate Fund contributions',
      'Sizing the donor-side pool and allocation key across contributing countries is separate, Federation-layer work — this figure states only the recipient-side requirement',
    ],
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
    case 'international_solidarity_transfer':
      return calcInternationalSolidarityTransfer(country, input.annualAmountPppUsd);
  }
}

// ── Fiscal context ─────────────────────────────────────────────────────────

export function calculateFiscalContext(
  country: Country,
  annualUbiCostPppUsd: number,
): FiscalContext {
  // PPP-USD GDP base: a share/multiple of GDP is unit-invariant, so expressing
  // it in PPP-USD keeps the revenue comparable to the PPP-denominated UBI cost.
  const gdpTotal = country.stats.gdpPerCapitaPppUsd * country.stats.population;
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

  const domesticRevenue = estimates
    .filter((e) => e.mechanism !== 'international_solidarity_transfer')
    .reduce((sum, e) => sum + e.annualRevenuePppUsd, 0);
  const domesticCoveragePercent =
    annualCost > 0 ? Math.round((domesticRevenue / annualCost) * 10000) / 100 : 0;

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
    domesticCoveragePercent,
    gapPppUsd: Math.round(gap),
    meta: simulation.simulation.meta,
  };
}

// ── Recommended funding mix ─────────────────────────────────────────────────

/**
 * Per-mechanism parameters used to build a recommended mix: a small "probe"
 * value used to measure marginal revenue per unit of the mechanism's rate,
 * a realistic ceiling on that rate, and a way to build the mechanism input
 * once a value has been chosen.
 */
interface MixMechanismConfig {
  type: FundingMechanismType;
  probe: number;
  cap: number;
  toInput: (value: number) => FundingMechanismInput;
  round: (value: number) => number;
}

const MIX_MECHANISMS: MixMechanismConfig[] = [
  {
    type: 'income_tax_surcharge',
    probe: 0.01,
    cap: 0.15,
    toInput: (rate) => ({ type: 'income_tax_surcharge', rate }),
    round: (v) => Math.round(v * 1000) / 1000, // nearest 0.1pp
  },
  {
    type: 'vat_increase',
    probe: 1,
    cap: 10,
    toInput: (points) => ({ type: 'vat_increase', points }),
    round: (v) => Math.round(v * 2) / 2, // nearest 0.5pp
  },
  {
    type: 'carbon_tax',
    probe: 1,
    cap: 100,
    toInput: (dollarPerTon) => ({ type: 'carbon_tax', dollarPerTon }),
    round: (v) => Math.round(v),
  },
  {
    type: 'wealth_tax',
    probe: 0.001,
    cap: 0.03,
    toInput: (rate) => ({ type: 'wealth_tax', rate }),
    round: (v) => Math.round(v * 10000) / 10000, // nearest 0.01pp
  },
  {
    type: 'financial_transaction_tax',
    probe: 0.0001,
    cap: 0.005,
    toInput: (rate) => ({ type: 'financial_transaction_tax', rate }),
    round: (v) => Math.round(v * 100000) / 100000, // nearest 0.001pp
  },
  {
    type: 'automation_tax',
    probe: 0.01,
    cap: 0.08,
    toInput: (rate) => ({ type: 'automation_tax', rate }),
    round: (v) => Math.round(v * 1000) / 1000, // nearest 0.1pp
  },
  {
    type: 'redirect_social_spending',
    probe: 0.01,
    cap: 0.5,
    toInput: (percent) => ({ type: 'redirect_social_spending', percent }),
    round: (v) => Math.round(v * 100) / 100, // nearest 1pp
  },
];

/**
 * Base suitability weights per income group, reflecting which mechanisms
 * are realistic revenue levers in that kind of economy: formal-sector
 * income and wealth taxes scale with formality and wealth concentration
 * (both rise with income group), while consumption taxes and redirected
 * social spending carry more of the load where the formal tax base is
 * thin. These are starting weights only — {@link adjustMixWeights} nudges
 * them using the country's actual tax and social-spending data where
 * available.
 */
const MIX_WEIGHTS_BY_INCOME_GROUP: Record<string, Record<FundingMechanismType, number>> = {
  HIC: {
    income_tax_surcharge: 0.28,
    vat_increase: 0.12,
    carbon_tax: 0.12,
    wealth_tax: 0.18,
    financial_transaction_tax: 0.08,
    automation_tax: 0.14,
    redirect_social_spending: 0.08,
    international_solidarity_transfer: 0, // never part of the domestic mix; appended separately if a gap remains
  },
  UMC: {
    income_tax_surcharge: 0.20,
    vat_increase: 0.20,
    carbon_tax: 0.16,
    wealth_tax: 0.10,
    financial_transaction_tax: 0.05,
    automation_tax: 0.09,
    redirect_social_spending: 0.20,
    international_solidarity_transfer: 0,
  },
  LMC: {
    income_tax_surcharge: 0.10,
    vat_increase: 0.28,
    carbon_tax: 0.12,
    wealth_tax: 0.04,
    financial_transaction_tax: 0.02,
    automation_tax: 0.04,
    redirect_social_spending: 0.40,
    international_solidarity_transfer: 0,
  },
  LIC: {
    income_tax_surcharge: 0.05,
    vat_increase: 0.30,
    carbon_tax: 0.08,
    wealth_tax: 0.02,
    financial_transaction_tax: 0.01,
    automation_tax: 0.02,
    redirect_social_spending: 0.52,
    international_solidarity_transfer: 0,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Nudges the income-group base weights using the country's own data where
 * it's available, so the mix reflects that specific economy rather than
 * just its income bracket:
 *  - a country that already leans heavily on VAT (relative to its income
 *    group's typical VAT/GDP share) has less realistic room to raise it
 *    further, so its weight is reduced (and vice versa)
 *  - a country with above-proxy existing social protection spending has
 *    more to realistically redirect toward a UBI, so that weight rises
 */
function adjustMixWeights(
  country: Country,
  base: Record<FundingMechanismType, number>,
): Record<FundingMechanismType, number> {
  const adjusted = { ...base };

  const vatProxy: Record<string, number> = { HIC: 7, UMC: 5, LMC: 4, LIC: 3 };
  const vatPct = country.stats.taxBreakdown?.vatPercentGdp;
  if (vatPct != null && vatPct > 0) {
    const proxy = vatProxy[country.stats.incomeGroup] ?? 4;
    adjusted.vat_increase *= clamp(proxy / vatPct, 0.5, 1.5);
  }

  const socialProxy: Record<string, number> = { HIC: 12, UMC: 5, LMC: 2.5, LIC: 1.5 };
  const socialPct =
    country.stats.socialProtectionExpenditureIloPercentGdp ??
    country.stats.socialProtectionSpendingPercentGdp;
  if (socialPct != null && socialPct > 0) {
    const proxy = socialProxy[country.stats.incomeGroup] ?? 3;
    adjusted.redirect_social_spending *= clamp(socialPct / proxy, 0.4, 2.0);
  }

  return adjusted;
}

/**
 * Recommends a *mix* of funding mechanisms sized to a country's economic
 * profile, instead of showing seven mechanisms each at one fixed
 * illustrative rate (where, e.g., a single mechanism can look like it
 * massively over- or under-shoots the UBI cost depending on the country).
 *
 * Approach: start from income-group suitability weights, adjust them with
 * the country's actual VAT and social-spending data, then water-fill the
 * UBI cost across mechanisms in proportion to weight — capping any
 * mechanism that would need an unrealistic rate and redistributing the
 * remainder across the mechanisms still below their cap. The result is a
 * scenario (same shape as {@link calculateFundingScenario}) where each
 * mechanism is set to a plausible rate and the mix, taken together,
 * targets full coverage rather than any single mechanism doing so alone.
 */
export function calculateRecommendedFundingMix(
  country: Country,
  simulation: SimulationResult,
  dataVersion: string,
  simulationId?: string | null,
): FundingScenarioResult {
  const annualCost = simulation.simulation.cost.annualPppUsd;
  const baseWeights =
    MIX_WEIGHTS_BY_INCOME_GROUP[country.stats.incomeGroup] ?? MIX_WEIGHTS_BY_INCOME_GROUP.UMC;
  const weights = adjustMixWeights(country, baseWeights);

  // Marginal revenue per unit of each mechanism's rate parameter (these
  // calculators are all linear in their rate, so one probe point suffices).
  const revenuePerUnit = new Map<FundingMechanismType, number>();
  for (const m of MIX_MECHANISMS) {
    const probeEstimate = calculateFundingMechanism(country, m.toInput(m.probe));
    revenuePerUnit.set(m.type, probeEstimate.annualRevenuePppUsd / m.probe);
  }

  const finalValue = new Map<FundingMechanismType, number>();
  const active = new Set(MIX_MECHANISMS.map((m) => m.type));

  for (let iteration = 0; iteration < 8 && active.size > 0; iteration++) {
    let coveredByCapped = 0;
    for (const m of MIX_MECHANISMS) {
      if (active.has(m.type)) continue;
      coveredByCapped += (finalValue.get(m.type) ?? 0) * (revenuePerUnit.get(m.type) ?? 0);
    }
    const remaining = Math.max(0, annualCost - coveredByCapped);
    const activeWeightSum = MIX_MECHANISMS.filter((m) => active.has(m.type)).reduce(
      (sum, m) => sum + (weights[m.type] ?? 0),
      0,
    );
    if (activeWeightSum <= 0 || remaining <= 0) break;

    let anyCapped = false;
    for (const m of MIX_MECHANISMS) {
      if (!active.has(m.type)) continue;
      const share = (weights[m.type] ?? 0) / activeWeightSum;
      const targetRevenue = remaining * share;
      const perUnit = revenuePerUnit.get(m.type) ?? 0;
      const requiredValue = perUnit > 0 ? targetRevenue / perUnit : 0;
      if (requiredValue >= m.cap) {
        finalValue.set(m.type, m.cap);
        active.delete(m.type);
        anyCapped = true;
      } else {
        finalValue.set(m.type, requiredValue);
      }
    }
    if (!anyCapped) break;
  }

  const mechanisms: FundingMechanismInput[] = MIX_MECHANISMS.filter((m) => {
    const value = finalValue.get(m.type) ?? 0;
    const perUnit = revenuePerUnit.get(m.type) ?? 0;
    return annualCost > 0 && (value * perUnit) / annualCost >= 0.005; // drop sub-0.5% noise
  }).map((m) => m.toInput(m.round(finalValue.get(m.type) ?? 0)));

  const domesticScenario = calculateFundingScenario(country, simulation, mechanisms, dataVersion, simulationId);

  // If even the seven domestic mechanisms at realistic ceilings can't close
  // the cost, attribute the residual to an explicit, labeled international
  // solidarity transfer (row D of INCOME_FLOOR_PROPOSED_ANSWERS.md) instead
  // of leaving it as an unlabeled gap.
  if (domesticScenario.gapPppUsd > 0) {
    mechanisms.push({
      type: 'international_solidarity_transfer',
      annualAmountPppUsd: domesticScenario.gapPppUsd,
    });
    return calculateFundingScenario(country, simulation, mechanisms, dataVersion, simulationId);
  }

  return domesticScenario;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatLargeNumber(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
