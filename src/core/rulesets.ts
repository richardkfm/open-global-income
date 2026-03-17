import type { RulesetInfo } from './types.js';
import {
  RULESET_V1_VERSION,
  STUB_RULESET_VERSION,
  GLOBAL_INCOME_FLOOR_PPP,
  GINI_WEIGHT,
} from './constants.js';

/**
 * Registry of all rulesets, including historical ones.
 * Pure data — no HTTP or framework dependencies.
 */
export const RULESETS: RulesetInfo[] = [
  {
    version: RULESET_V1_VERSION,
    name: 'Ruleset v1',
    description:
      'Deterministic formula using GNI per capita and Gini inequality index. ' +
      'Global income floor derived from World Bank upper-middle-income poverty line ($6.85/day).',
    active: true,
    parameters: {
      globalIncomeFloorPpp: GLOBAL_INCOME_FLOOR_PPP,
      giniWeight: GINI_WEIGHT,
    },
    formula:
      'pppUsdPerMonth = GLOBAL_INCOME_FLOOR_PPP; ' +
      'localCurrencyPerMonth = pppUsdPerMonth × pppConversionFactor; ' +
      'incomeRatio = pppUsdPerMonth / (gniPerCapitaUsd / 12); ' +
      'giniPenalty = (giniIndex / 100) × GINI_WEIGHT; ' +
      'score = clamp(incomeRatio + giniPenalty, 0, 1)',
  },
  {
    version: STUB_RULESET_VERSION,
    name: 'Stub (deprecated)',
    description:
      'Phase 1 placeholder formula with hardcoded constants. ' +
      'Replaced by Ruleset v1 in version 0.0.2.',
    active: false,
    parameters: {
      globalIncomeFloorPpp: 200,
    },
    formula:
      'pppUsdPerMonth = 200; ' +
      'localCurrencyPerMonth = pppUsdPerMonth × pppConversionFactor; ' +
      'score = clamp(200 / (gdpPerCapitaUsd / 12), 0, 1)',
  },
];

/** Get only active rulesets */
export function getActiveRulesets(): RulesetInfo[] {
  return RULESETS.filter((r) => r.active);
}

/** Get all rulesets (including deprecated) */
export function getAllRulesets(): RulesetInfo[] {
  return RULESETS;
}
