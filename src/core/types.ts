/** ISO 3166-1 alpha-2 country code */
export type CountryCode = string;

/** World Bank income group classification */
export type IncomeGroup = 'HIC' | 'UMC' | 'LMC' | 'LIC';

/** Tax revenue breakdown by type, sourced from IMF Government Finance Statistics */
export interface TaxBreakdown {
  /** Personal and corporate income taxes as % of GDP */
  incomeTaxPercentGdp: number | null;
  /** VAT / sales taxes as % of GDP */
  vatPercentGdp: number | null;
  /** Import/export duties and trade taxes as % of GDP */
  tradeTaxPercentGdp: number | null;
  /** All other taxes as % of GDP */
  otherTaxPercentGdp: number | null;
}

export interface CountryStats {
  /** GDP per capita in current USD */
  gdpPerCapitaUsd: number;
  /** GNI per capita, Atlas method, current USD */
  gniPerCapitaUsd: number;
  /** PPP conversion factor (LCU per international $) */
  pppConversionFactor: number;
  /** Gini coefficient (0–100 scale), null if unavailable */
  giniIndex: number | null;
  /** Total population */
  population: number;
  /** World Bank income group */
  incomeGroup: IncomeGroup;

  // ── Fiscal indicators (World Bank) ───────────────────────────────────────
  /** Total tax revenue as % of GDP */
  taxRevenuePercentGdp?: number | null;
  /** Central government spending on social protection / compensation as % of GDP */
  socialProtectionSpendingPercentGdp?: number | null;
  /** Central government debt as % of GDP */
  governmentDebtPercentGdp?: number | null;
  /** Social security contributions as % of revenue */
  socialContributionsPercentRevenue?: number | null;
  /** GDP growth rate (annual %) */
  gdpGrowthRate?: number | null;

  // ── Social & labor indicators (World Bank) ────────────────────────────────
  /** Consumer price inflation rate (annual %) */
  inflationRate?: number | null;
  /** Labor force participation rate (% of working-age population) */
  laborForceParticipation?: number | null;
  /** Unemployment rate (% of labor force) */
  unemploymentRate?: number | null;
  /** Population below $2.15/day poverty line (%) */
  povertyHeadcountRatio?: number | null;
  /** Urban population as % of total */
  urbanizationRate?: number | null;

  // ── Expenditure indicators (World Bank) ───────────────────────────────────
  /** Current health expenditure as % of GDP */
  healthExpenditurePercentGdp?: number | null;
  /** Government education expenditure as % of GDP */
  educationExpenditurePercentGdp?: number | null;

  // ── ILO Social Protection Data Dashboard ─────────────────────────────────
  /** % of population covered by at least one social protection benefit (ILO) */
  socialProtectionCoveragePercent?: number | null;
  /** Social protection expenditure excluding health as % of GDP (ILO) */
  socialProtectionExpenditureIloPercentGdp?: number | null;
  /** % of elderly receiving a pension (ILO) */
  pensionCoveragePercent?: number | null;
  /** % of children receiving child/family benefit (ILO) */
  childBenefitCoveragePercent?: number | null;

  // ── IMF Government Finance Statistics ────────────────────────────────────
  /** Tax revenue breakdown by type (IMF GFS) */
  taxBreakdown?: TaxBreakdown | null;
}

export interface Country {
  /** ISO 3166-1 alpha-2 code */
  code: CountryCode;
  /** English country name */
  name: string;
  /** Economic statistics used for entitlement calculation */
  stats: CountryStats;
}

export interface RulesetMeta {
  /** Semver-like identifier for the formula version */
  rulesetVersion: string;
  /** Identifier for the data snapshot used */
  dataVersion: string;
}

/** Full description of a ruleset for the /rulesets endpoint */
export interface RulesetInfo {
  version: string;
  name: string;
  description: string;
  active: boolean;
  parameters: Record<string, number>;
  formula: string;
}

/** Minimal user record for the optional user layer */
export interface User {
  id: string;
  countryCode: CountryCode;
  createdAt: string;
}

export interface GlobalIncomeEntitlement {
  /** ISO country code this was calculated for */
  countryCode: CountryCode;
  /** Entitlement in PPP-adjusted USD per month (neutral base unit) */
  pppUsdPerMonth: number;
  /** Entitlement converted to local currency units per month */
  localCurrencyPerMonth: number;
  /**
   * Normalized score 0–1 representing relative entitlement need.
   * Higher score = the global floor is a larger fraction of the country's
   * average income, indicating greater need. Inequality (Gini) amplifies need.
   */
  score: number;
  /** Which ruleset and data snapshot produced this result */
  meta: RulesetMeta;
}

/** Target group for budget simulation */
export type TargetGroup = 'all' | 'bottom_quintile';

/** Parameters for a budget simulation request */
export interface SimulationParameters {
  country: string;
  coverage: number;
  targetGroup: TargetGroup;
  durationMonths: number;
  adjustments: {
    floorOverride: number | null;
    householdSize: number | null;
  };
}

/** Full result of a budget simulation */
export interface SimulationResult {
  country: {
    code: string;
    name: string;
    population: number;
  };
  simulation: {
    recipientCount: number;
    coverageRate: number;
    entitlementPerPerson: {
      pppUsdPerMonth: number;
      localCurrencyPerMonth: number;
    };
    cost: {
      monthlyLocalCurrency: number;
      annualLocalCurrency: number;
      annualPppUsd: number;
      asPercentOfGdp: number;
    };
    meta: RulesetMeta;
  };
}

/** A saved simulation record from the database */
export interface SavedSimulation {
  id: string;
  name: string | null;
  countryCode: string;
  parameters: SimulationParameters;
  results: SimulationResult;
  apiKeyId: string | null;
  createdAt: string;
}

// ── Disbursement types ────────────────────────────────────────────────────────

export type DisbursementChannelType = 'mobile_money' | 'bank_transfer' | 'crypto';

export type DisbursementStatus = 'draft' | 'approved' | 'processing' | 'completed' | 'failed';

export type DisbursementLogEvent = 'created' | 'approved' | 'submitted' | 'confirmed' | 'failed';

export interface DisbursementChannel {
  id: string;
  name: string;
  type: DisbursementChannelType;
  provider: string;
  countryCode: string | null;
  config: Record<string, unknown>;
  active: boolean;
  createdAt: string;
}

export interface Disbursement {
  id: string;
  simulationId: string | null;
  channelId: string;
  countryCode: string;
  recipientCount: number;
  amountPerRecipient: string;
  totalAmount: string;
  currency: string;
  status: DisbursementStatus;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  apiKeyId: string | null;
}

export interface DisbursementLogEntry {
  id: number;
  disbursementId: string;
  event: DisbursementLogEvent;
  details: Record<string, unknown> | null;
  timestamp: string;
}

// ── Pilot types ──────────────────────────────────────────────────────────────

export type PilotStatus = 'planning' | 'active' | 'paused' | 'completed';

export interface Pilot {
  id: string;
  name: string;
  countryCode: string;
  description: string | null;
  simulationId: string | null;
  status: PilotStatus;
  startDate: string | null;
  endDate: string | null;
  targetRecipients: number | null;
  apiKeyId: string | null;
  createdAt: string;
}

// ── Funding types ─────────────────────────────────────────────────────────

/** Supported funding mechanism types */
export type FundingMechanismType =
  | 'income_tax_surcharge'
  | 'vat_increase'
  | 'carbon_tax'
  | 'wealth_tax'
  | 'financial_transaction_tax'
  | 'automation_tax'
  | 'redirect_social_spending';

/** Parameters for a specific funding mechanism */
export type FundingMechanismInput =
  | { type: 'income_tax_surcharge'; rate: number }
  | { type: 'vat_increase'; points: number }
  | { type: 'carbon_tax'; dollarPerTon: number }
  | { type: 'wealth_tax'; rate: number }
  | { type: 'financial_transaction_tax'; rate: number }
  | { type: 'automation_tax'; rate: number }
  | { type: 'redirect_social_spending'; percent: number };

/** Result of a single funding mechanism estimate */
export interface FundingEstimate {
  mechanism: FundingMechanismType;
  label: string;
  annualRevenueLocal: number;
  annualRevenuePppUsd: number;
  coversPercentOfUbiCost: number;
  assumptions: string[];
}

/** Fiscal context for a country relative to a UBI cost */
export interface FiscalContext {
  totalTaxRevenue: { percentGdp: number | null; absolutePppUsd: number | null };
  currentSocialSpending: { percentGdp: number | null; absolutePppUsd: number | null };
  governmentDebt: { percentGdp: number | null };
  ubiAsPercentOfTaxRevenue: number | null;
  ubiAsPercentOfSocialSpending: number | null;
}

/** Combined funding scenario: multiple mechanisms applied together */
export interface FundingScenarioResult {
  simulationId: string | null;
  country: { code: string; name: string; population: number };
  ubiCost: { annualPppUsd: number; asPercentOfGdp: number };
  fiscalContext: FiscalContext;
  mechanisms: FundingEstimate[];
  totalRevenuePppUsd: number;
  coverageOfUbiCost: number;
  gapPppUsd: number;
  meta: RulesetMeta;
}

/** A saved funding scenario record */
export interface SavedFundingScenario {
  id: string;
  name: string | null;
  simulationId: string | null;
  countryCode: string;
  mechanisms: FundingMechanismInput[];
  results: FundingScenarioResult;
  createdAt: string;
}

export interface PilotReport {
  pilot: {
    id: string;
    name: string;
    country: string;
    status: PilotStatus;
    startDate: string | null;
    endDate: string | null;
  };
  summary: {
    totalRecipients: number;
    totalDisbursed: number;
    disbursementCount: number;
    averagePerRecipient: number;
    periodCovered: { from: string | null; to: string | null };
  };
  simulation: { id: string; projectedCost: number; variance: string } | null;
  disbursements: Disbursement[];
  meta: { generatedAt: string };
}
