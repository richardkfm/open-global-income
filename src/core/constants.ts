/** Identifies this stub formula — kept for backward compatibility */
export const STUB_RULESET_VERSION = 'stub-v0.0.1';

/** Identifies Ruleset v1, the first real formula */
export const RULESET_V1_VERSION = 'v1';

/** Active ruleset version used by the API */
export const RULESET_VERSION = RULESET_V1_VERSION;

/**
 * Global income floor in PPP-adjusted USD per month.
 *
 * Derived from the World Bank upper-middle-income poverty line of $6.85/day
 * (2017 PPP), annualized and divided by 12:
 *   $6.85 × 365 / 12 ≈ $208.35, rounded to $210.
 *
 * This represents the minimum monthly income (in PPP terms) that the model
 * considers a baseline entitlement for any person globally.
 */
export const GLOBAL_INCOME_FLOOR_PPP = 210;

/**
 * Weight applied to the Gini inequality adjustment (0–1).
 * Controls how much inequality (Gini index) amplifies the need score.
 * At 0.15, a country with Gini=100 would add 0.15 to its raw score.
 */
export const GINI_WEIGHT = 0.15;
