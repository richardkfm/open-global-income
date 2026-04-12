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

// ── Sub-national region types ─────────────────────────────────────────────

export interface RegionStats {
  /** Population of this region */
  population: number;
  /**
   * Cost-of-living index relative to the national average.
   * 1.0 = identical to national average.
   * >1.0 = more expensive (e.g. capital city).
   * <1.0 = cheaper (e.g. rural area).
   * Applied as a multiplier to pppConversionFactor.
   */
  costOfLivingIndex: number;
  /** Urban/rural classification */
  urbanRural: 'urban' | 'rural' | 'mixed';
  /** Regional poverty headcount ratio (%), if known */
  povertyHeadcountRatio?: number | null;
  /** ISO 8601 date when this data was last sourced */
  dataAsOf: string;
  /** Source of this regional data */
  dataSource: string;
}

export interface Region {
  /** Unique id: countryCode + "-" + regionCode, e.g. "KE-NAI" */
  id: string;
  /** ISO 3166-1 alpha-2 of the parent country */
  countryCode: CountryCode;
  /** Short code unique within the country */
  regionCode: string;
  /** Human-readable name */
  name: string;
  stats: RegionStats;
}

/** Entitlement result for a specific region */
export interface RegionalIncomeEntitlement extends GlobalIncomeEntitlement {
  regionId: string;
  regionName: string;
  costOfLivingIndex: number;
  /** National-level localCurrencyPerMonth for comparison */
  nationalLocalCurrencyPerMonth: number;
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
export type TargetGroup = 'all' | 'bottom_decile' | 'bottom_quintile' | 'bottom_third' | 'bottom_half';

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

// ── Economic Impact types ─────────────────────────────────────────────────

/** Parameters for an economic impact analysis request */
export interface ImpactParameters {
  country: string;
  coverage: number;
  targetGroup: TargetGroup;
  durationMonths: number;
  floorOverride: number | null;
  /** If set, pulls program params from a saved simulation */
  simulationId: string | null;
}

/** Poverty reduction estimate — how many people lifted above the extreme poverty line */
export interface PovertyReductionEstimate {
  /** Count of people in extreme poverty BEFORE the program ($2.15/day line) */
  extremePoorBaseline: number;
  /** Estimated count lifted above the extreme poverty line by this program */
  estimatedLifted: number;
  /** Share of extreme poor reached and lifted (0–100) */
  liftedAsPercentOfPoor: number;
  /** Poverty line used in PPP-USD per month ($2.15/day × 30) */
  povertyLineMonthlyPppUsd: number;
  /** Whether the transfer amount alone exceeds the poverty line */
  transferExceedsPovertyLine: boolean;
  /** Data quality flag based on availability of povertyHeadcountRatio */
  dataQuality: 'high' | 'medium' | 'low';
  assumptions: string[];
}

/** Purchasing power analysis for the poorest quintile */
export interface PurchasingPowerEstimate {
  /** Count of people in the bottom 20% income group */
  bottomQuintilePopulation: number;
  /** Estimated average monthly income per person in the bottom quintile (USD) */
  estimatedMonthlyIncomeUsd: number;
  /** UBI transfer amount in PPP-USD per month */
  ubiMonthlyPppUsd: number;
  /** Percentage income increase the UBI represents for the bottom quintile */
  incomeIncreasePercent: number;
  /** Estimated income share held by the bottom quintile (0–1) */
  incomeShareQ1: number;
  dataQuality: 'high' | 'medium' | 'low';
  assumptions: string[];
}

/** Social security interaction — gap between existing coverage and new reach */
export interface SocialCoverageEstimate {
  /** Estimated count with NO existing social protection benefit */
  populationCurrentlyUncovered: number;
  /** Of the program's recipients, how many are estimated to be currently uncovered */
  estimatedNewlyCovered: number;
  /** % of total population currently without social protection */
  uncoverageRatePercent: number;
  /** % of program recipients who are estimated to lack prior coverage */
  recipientUncoverageRatePercent: number;
  dataQuality: 'high' | 'medium' | 'low';
  assumptions: string[];
}

/** Fiscal multiplier / GDP stimulus estimate */
export interface FiscalMultiplierEstimate {
  /** Multiplier applied (income-group calibrated Keynesian cash-transfer multiplier) */
  multiplier: number;
  /** Annual transfer amount in PPP-USD (the injection) */
  annualTransferPppUsd: number;
  /** Estimated total GDP stimulus: transfer × multiplier */
  estimatedGdpStimulusPppUsd: number;
  /** GDP stimulus as % of GDP */
  stimulusAsPercentOfGdp: number;
  /** Income group used to calibrate the multiplier */
  incomeGroup: IncomeGroup;
  assumptions: string[];
}

/** A complete economic impact analysis result */
export interface ImpactAnalysisResult {
  country: {
    code: string;
    name: string;
    population: number;
    incomeGroup: IncomeGroup;
  };
  program: {
    recipientCount: number;
    coverageRate: number;
    monthlyAmountPppUsd: number;
    annualCostPppUsd: number;
    durationMonths: number;
    targetGroup: TargetGroup;
  };
  povertyReduction: PovertyReductionEstimate;
  purchasingPower: PurchasingPowerEstimate;
  socialCoverage: SocialCoverageEstimate;
  fiscalMultiplier: FiscalMultiplierEstimate;
  policyBrief: PolicyBrief;
  meta: RulesetMeta & { generatedAt: string };
}

/** Exportable policy brief — every assumption explicitly listed */
export interface PolicyBrief {
  title: string;
  subtitle: string;
  generatedAt: string;
  /** Headline statistics — the "sell it" numbers */
  headline: {
    povertyReduction: { value: number; formatted: string; label: string };
    purchasingPower: { value: number; formatted: string; label: string };
    socialCoverage: { value: number; formatted: string; label: string };
    gdpStimulus: { value: number; formatted: string; label: string };
  };
  programDescription: string;
  /** Summary methodology paragraphs — one per dimension */
  methodology: {
    povertyModel: string;
    incomeDistributionModel: string;
    socialCoverageModel: string;
    fiscalMultiplierModel: string;
  };
  /** Complete flat list of every assumption, explicitly stated */
  assumptions: string[];
  dataSources: string[];
  caveats: string[];
}

/** A saved impact analysis record from the database */
export interface SavedImpactAnalysis {
  id: string;
  name: string | null;
  simulationId: string | null;
  countryCode: string;
  parameters: ImpactParameters;
  results: ImpactAnalysisResult;
  apiKeyId: string | null;
  createdAt: string;
}

// ── Recipient & Identity types ────────────────────────────────────────────────

export type RecipientStatus = 'pending' | 'verified' | 'suspended';
export type PaymentMethod = 'sepa' | 'mobile_money' | 'crypto';

export interface RecipientProfile {
  id: string;
  countryCode: CountryCode;
  /**
   * SHA-256 of the account identifier (IBAN, phone, wallet address).
   * Never stored or returned in plaintext — only the hash is persisted.
   */
  accountHash: string | null;
  /** Which identity provider performed the verification */
  identityProvider: string | null;
  verifiedAt: string | null;
  paymentMethod: PaymentMethod | null;
  /**
   * Non-reversible display suffix (e.g. last 4 of IBAN, phone suffix).
   * Safe to show in UI; cannot be used to reconstruct the full identifier.
   */
  routingRef: string | null;
  status: RecipientStatus;
  /** Optional link to a pilot program */
  pilotId: string | null;
  apiKeyId: string | null;
  createdAt: string;
}

/** Input claim provided when verifying a recipient's identity */
export interface IdentityClaim {
  recipientId: string;
  countryCode: CountryCode;
  claimType: 'national_id' | 'bank_account' | 'phone' | 'wallet' | 'community';
  /** Raw claim value — will be hashed before storage, never persisted in plaintext */
  claimReference: string;
}

export interface VerificationResult {
  verified: boolean;
  /** SHA-256 of claimReference — stored as accountHash */
  accountHash: string | null;
  /** Non-reversible display suffix for UI */
  routingRef: string | null;
  error?: string;
}

/**
 * Pluggable identity verification interface.
 * The platform stores verified claims (hashes + provider reference),
 * never raw identity data.
 */
export interface IdentityProvider {
  readonly providerId: string;
  readonly providerName: string;
  verify(claim: IdentityClaim): Promise<VerificationResult>;
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
