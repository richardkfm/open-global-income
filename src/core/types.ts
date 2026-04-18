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
  /** Population below $2.15/day poverty line (%) — World Bank SI.POV.DDAY */
  povertyHeadcountRatio?: number | null;
  /** Population below $3.65/day poverty line (%) — World Bank SI.POV.LMIC */
  povertyHeadcountRatio365Percent?: number | null;
  /** Population below $6.85/day poverty line (%) — World Bank SI.POV.UMIC */
  povertyHeadcountRatio685Percent?: number | null;
  /** Population below the country's own national poverty line (%) — World Bank SI.POV.NAHC */
  nationalPovertyHeadcountRatioPercent?: number | null;
  /**
   * Population below a relative at-risk-of-poverty threshold (60% of median
   * equivalised income). Primarily populated for HIC/OECD countries from
   * Eurostat / OECD IDD. World Bank indicator SI.POV.MDIM.MA is a rough
   * proxy when OECD data is not yet wired up.
   */
  relativePovertyHeadcountRatioPercent?: number | null;
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

/**
 * Programmable targeting rules for recipient filtering.
 * Rules are evaluated at disbursement time to filter the enrolled recipient list.
 * For simulation purposes, only the `preset` field (and optionally `urbanRural`) affect
 * the estimated recipient count; other fields constrain actual recipients at pay time.
 */
export interface TargetingRules {
  /** Age range in years — requires recipient date-of-birth claim */
  ageRange?: [number, number];
  /** Urban/rural filter — matches region.stats.urbanRural */
  urbanRural?: 'urban' | 'rural' | 'mixed';
  /** Maximum monthly income in PPP-USD */
  maxMonthlyIncomePppUsd?: number;
  /** Only include recipients verified by specific providers */
  identityProviders?: string[];
  /** Exclude recipients who received a payment within N days */
  excludeIfPaidWithinDays?: number;
  /** Limit to a specific set of region IDs */
  regionIds?: string[];
  /** Named preset — expands to a standard population fraction for simulation */
  preset?: TargetGroup;
}

/** Parameters for a budget simulation request */
export interface SimulationParameters {
  country: string;
  coverage: number;
  targetGroup: TargetGroup;
  /** Optional programmable targeting rules — preset takes precedence over targetGroup */
  targetingRules?: TargetingRules;
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
  externalId: string | null;
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
  /** Programmable targeting rules stored with this pilot */
  targetingRules: TargetingRules | null;
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

/** How the country-specific poverty line was chosen. See src/core/poverty.ts. */
export type PovertyLineBasis =
  | 'extreme'
  | 'lower_middle'
  | 'upper_middle'
  | 'relative_median'
  | 'national';

/** Poverty reduction estimate — how many people lifted above the country-appropriate poverty line */
export interface PovertyReductionEstimate {
  /**
   * Count of people below the COUNTRY-APPROPRIATE poverty line BEFORE the program.
   * This is the primary headline baseline — it uses a line calibrated to the
   * country's income group (not a fixed $2.15/day). For backwards compatibility,
   * the field name is unchanged.
   */
  extremePoorBaseline: number;
  /** Estimated count lifted above the country-appropriate poverty line by this program */
  estimatedLifted: number;
  /** Share of poor reached and lifted (0–100) */
  liftedAsPercentOfPoor: number;
  /** The country-appropriate poverty line in PPP-USD per month */
  povertyLineMonthlyPppUsd: number;
  /** The country-appropriate poverty line in PPP-USD per day */
  povertyLineDailyPppUsd: number;
  /** How the line was chosen (extreme / lower_middle / upper_middle / relative_median / national) */
  povertyLineBasis: PovertyLineBasis;
  /** Human-readable label for the line, suitable for UI display */
  povertyLineLabel: string;
  /** Citation / source for the chosen line */
  povertyLineSource: string;
  /**
   * Count of people below the global $2.15/day extreme poverty line, shown
   * alongside the country-appropriate line so global comparisons remain
   * possible. May be `null` if no extreme headcount data is available.
   */
  extremePoorGlobalBaseline: number | null;
  /** Whether the transfer amount alone exceeds the country poverty line */
  transferExceedsPovertyLine: boolean;
  /** Data quality flag based on availability of matching headcount data */
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

/** One category of potential fiscal cost saving attributable to UBI */
export interface CostSavingsCategory {
  /** Stable machine ID (e.g. "healthcare", "administrative", "crime_justice") */
  id: 'healthcare' | 'administrative' | 'crime_justice';
  /** Human-readable short label */
  label: string;
  /**
   * Range of annual savings in PPP-USD: low / central / high.
   * All three are present; central is a point estimate for headlines.
   * Zero if the effect is gated out (e.g. inadequate transfer, missing data).
   */
  annualSavingsPppUsdLow: number;
  annualSavingsPppUsdCentral: number;
  annualSavingsPppUsdHigh: number;
  /**
   * The elasticity / share used at the central estimate (e.g. 0.085 for an
   * 8.5% hospitalization reduction). Null when the data is too sparse.
   */
  centralElasticity: number | null;
  /** Which country stat served as the baseline the elasticity is applied to */
  baselineBasis: string;
  /** The baseline spend in PPP-USD that the elasticity was applied against */
  baselineAnnualPppUsd: number | null;
  /** All explicit assumptions used in the calculation */
  assumptions: string[];
  /** One or more citations — peer-reviewed where available */
  sources: string[];
  /** 'medium' when built on published evidence; 'low' when data is missing */
  dataQuality: 'medium' | 'low';
}

/**
 * Estimated fiscal cost savings from UBI across healthcare, social-benefits
 * administration, and criminal-justice systems. Every number is a
 * modeled estimate with a range and a source citation; nothing is point-
 * estimated without an explicit elasticity.
 *
 * This is intentionally CONSERVATIVE: estimates are heavily gated on
 * transfer adequacy (must meet the country poverty line), coverage
 * fraction, and availability of the relevant country baseline data.
 * Read: if any gate fails, the category's savings are zero.
 *
 * Savings in this dimension are REDIRECTABLE spending the government
 * could repurpose — they are not added to the UBI budget automatically;
 * policymakers decide whether to recycle them.
 */
export interface CostSavingsEstimate {
  /** Bundled per-category results */
  categories: CostSavingsCategory[];
  /** Sum of category central estimates */
  totalAnnualSavingsPppUsdCentral: number;
  /** Sum of lows and highs */
  totalAnnualSavingsPppUsdLow: number;
  totalAnnualSavingsPppUsdHigh: number;
  /** Savings as % of annual UBI cost (central / total UBI cost) */
  savingsAsPercentOfUbiCostCentral: number;
  /** Whether the transfer clears the country poverty line — gates most categories */
  transferAdequateForSavings: boolean;
  /** The per-person monthly transfer used in this estimate (PPP USD) */
  transferPppUsdPerMonth: number;
  /** Country poverty line used as the adequacy threshold (PPP USD / month) */
  countryPovertyLineMonthlyPppUsd: number;
  /** The coverage saturation factor applied uniformly (min(1, coverage × 1)) */
  coverageFactor: number;
  /** Top-level sources list for UI display */
  sources: string[];
  /** Aggregate assumptions across all categories (deduplicated) */
  assumptions: string[];
  /** Data quality: 'low' if no category yielded an estimate */
  dataQuality: 'medium' | 'low';
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
  costSavings: CostSavingsEstimate;
  policyBrief: PolicyBrief;
  meta: RulesetMeta & { generatedAt: string };
}

/**
 * A typed citation linking a claim in the policy brief to its data source.
 * Used to render inline superscripts and a numbered footnote block.
 */
export interface Citation {
  /** Stable identifier used for anchor links, e.g. "c1" */
  id: string;
  /** World Bank / ILO / IMF indicator code, e.g. "SI.POV.DDAY" */
  indicatorCode?: string;
  /** Name of the publishing organisation, e.g. "World Bank" */
  source: string;
  /** Year of the data vintage */
  year?: number;
  /** Optional canonical URL */
  url?: string;
  /** Short human-readable description of what the citation supports */
  note?: string;
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
    costSavings: { value: number; formatted: string; label: string };
  };
  programDescription: string;
  /** Summary methodology paragraphs — one per dimension */
  methodology: {
    povertyModel: string;
    incomeDistributionModel: string;
    socialCoverageModel: string;
    fiscalMultiplierModel: string;
    costSavingsModel: string;
  };
  /** Complete flat list of every assumption, explicitly stated */
  assumptions: string[];
  dataSources: string[];
  caveats: string[];
  /**
   * Typed citation list — deduplicated across all data sources referenced
   * in the brief. Always present; may be empty if no indicator data is used.
   * Each entry has a stable `id` (e.g. "c1") that can be used for anchor
   * links and inline superscripts via renderCitationSup().
   */
  citations: Citation[];
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

// ── Evidence Layer types (Phase 23) ──────────────────────────────────────────

export type OutcomeCohortType = 'recipient' | 'control';

/**
 * Measured economic indicators for a cohort at a point in time.
 * All fields are optional — programs record what they can measure.
 */
export interface OutcomeIndicators {
  /** Employment rate (0–1) */
  employmentRate?: number | null;
  /** Average monthly income in USD */
  averageMonthlyIncomeUsd?: number | null;
  /** Food security score (e.g. 1–5 scale) */
  foodSecurityScore?: number | null;
  /** Child school attendance rate (0–1) */
  childSchoolAttendanceRate?: number | null;
  /** % of cohort above the extreme poverty line ($2.15/day) */
  abovePovertyLinePercent?: number | null;
  /** Self-reported health score (0–1) */
  selfReportedHealthScore?: number | null;
  /** Savings rate (0–1) */
  savingsRate?: number | null;
}

/** A single outcome measurement for a pilot cohort at a point in time */
export interface OutcomeRecord {
  id: string;
  pilotId: string;
  cohortType: OutcomeCohortType;
  /** ISO 8601 date of measurement */
  measurementDate: string;
  indicators: OutcomeIndicators;
  sampleSize: number;
  dataSource: string;
  /** True if this is the baseline (pre-program) measurement */
  isBaseline: boolean;
  createdAt: string;
}

/** Delta between two indicator snapshots */
export interface OutcomeDelta {
  employmentRate?: { baseline: number | null; latest: number | null; change: number | null } | null;
  averageMonthlyIncomeUsd?: { baseline: number | null; latest: number | null; change: number | null } | null;
  foodSecurityScore?: { baseline: number | null; latest: number | null; change: number | null } | null;
  childSchoolAttendanceRate?: { baseline: number | null; latest: number | null; change: number | null } | null;
  abovePovertyLinePercent?: { baseline: number | null; latest: number | null; change: number | null } | null;
  selfReportedHealthScore?: { baseline: number | null; latest: number | null; change: number | null } | null;
  savingsRate?: { baseline: number | null; latest: number | null; change: number | null } | null;
}

/** Pre/post comparison result for a pilot */
export interface OutcomeComparison {
  pilotId: string;
  recipient: {
    baseline: OutcomeRecord | null;
    latest: OutcomeRecord | null;
    delta: OutcomeDelta | null;
  };
  control: {
    baseline: OutcomeRecord | null;
    latest: OutcomeRecord | null;
    delta: OutcomeDelta | null;
  } | null;
  /** Projected impact from the linked impact analysis, if any */
  projectedImpact: {
    povertyReductionPercent: number | null;
    incomeIncreasePercent: number | null;
  } | null;
  allMeasurements: OutcomeRecord[];
  meta: { generatedAt: string };
}

/** Anonymized cross-program benchmark — aggregate distributions only, no program names */
export interface EvidenceAggregate {
  filters: {
    country?: string;
    incomeGroup?: string;
    coverageMin?: number;
    coverageMax?: number;
  };
  programCount: number;
  measurementCount: number;
  indicators: {
    [K in keyof OutcomeIndicators]?: {
      median: number | null;
      p25: number | null;
      p75: number | null;
      sampleSize: number;
    };
  };
  meta: { generatedAt: string; dataVersion: string };
}

/** Per-rule filtering statistics for the targeting rules report section */
export interface TargetingFilterStat {
  rule: string;
  description: string;
  recipientsFiltered: number;
  notes?: string;
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
  targeting: {
    rules: TargetingRules | null;
    filterStats: TargetingFilterStat[];
  };
  simulation: { id: string; projectedCost: number; variance: string } | null;
  disbursements: Disbursement[];
  meta: { generatedAt: string };
}
