/** ISO 3166-1 alpha-2 country code */
export type CountryCode = string;

export interface CountryStats {
  /** GDP per capita in current USD */
  gdpPerCapitaUsd: number;
  /** PPP conversion factor (LCU per international $) */
  pppConversionFactor: number;
  /** Gini coefficient (0–100 scale), null if unavailable */
  giniIndex: number | null;
  /** Total population */
  population: number;
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
   * average income, indicating greater need.
   */
  score: number;
  /** Which ruleset and data snapshot produced this result */
  meta: RulesetMeta;
}
