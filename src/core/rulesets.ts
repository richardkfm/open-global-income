import type { RulesetInfo } from './types.js';
import {
  RULESET_V1_VERSION,
  RULESET_V2_VERSION,
  RULESET_V3_VERSION,
  STUB_RULESET_VERSION,
  GLOBAL_INCOME_FLOOR_PPP,
  GINI_WEIGHT,
  HDI_WEIGHT,
  URBANIZATION_WEIGHT,
} from './constants.js';
import { RELATIVE_POVERTY_MEDIAN_FRACTION } from './poverty.js';

/**
 * Registry of all rulesets, including historical ones.
 * Pure data — no HTTP or framework dependencies.
 */
export const RULESETS: RulesetInfo[] = [
  {
    version: RULESET_V3_VERSION,
    name: 'Ruleset v3',
    description:
      'Pays the higher of the $210 PPP global anchor and the country\'s local adequacy line. ' +
      'Low- and middle-income countries keep $210 (never less); high-income countries are paid ' +
      '60% of median equivalised disposable income (Eurostat / OECD survey data), so the amount ' +
      'works as a basic income there. Need score unchanged from v1. See RULESET_V3.md.',
    active: true,
    parameters: {
      globalIncomeFloorPpp: GLOBAL_INCOME_FLOOR_PPP,
      relativePovertyMedianFraction: RELATIVE_POVERTY_MEDIAN_FRACTION,
      giniWeight: GINI_WEIGHT,
    },
    formula:
      'adequacy = localAdequacyLine(country) [HIC: 0.6 × median equivalised disposable income / pppConversionFactor / 12; ' +
      'UMC $6.85/day; LMC $3.65/day; LIC $2.15/day]; ' +
      'pppUsdPerMonth = max(GLOBAL_INCOME_FLOOR_PPP, adequacy); ' +
      'localCurrencyPerMonth = pppUsdPerMonth × pppConversionFactor; ' +
      'score = v1 score (incomeRatio against GLOBAL_INCOME_FLOOR_PPP + giniPenalty)',
  },
  {
    version: RULESET_V1_VERSION,
    name: 'Ruleset v1 (superseded)',
    description:
      'Deterministic formula using GNI per capita and Gini inequality index. ' +
      'Global income floor derived from World Bank upper-middle-income poverty line ($6.85/day). ' +
      'Pays $210 PPP everywhere. Superseded by v3 in 0.3.0; still reproducible via calculateEntitlementV1.',
    active: false,
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
    version: RULESET_V2_VERSION,
    name: 'Ruleset v2 (preview)',
    description:
      'Extended formula adding HDI (Human Development Index) and urbanization factors. ' +
      'Designed for multi-source data from World Bank, IMF, and UNDP. ' +
      'Preview — not yet the default active ruleset.',
    active: false,
    parameters: {
      globalIncomeFloorPpp: GLOBAL_INCOME_FLOOR_PPP,
      giniWeight: GINI_WEIGHT,
      hdiWeight: HDI_WEIGHT,
      urbanizationWeight: URBANIZATION_WEIGHT,
    },
    formula:
      'pppUsdPerMonth = GLOBAL_INCOME_FLOOR_PPP; ' +
      'localCurrencyPerMonth = pppUsdPerMonth × pppConversionFactor; ' +
      'incomeRatio = pppUsdPerMonth / (gniPerCapitaUsd / 12); ' +
      'giniPenalty = (giniIndex / 100) × GINI_WEIGHT; ' +
      'hdiAdjustment = (1 - hdi) × HDI_WEIGHT; ' +
      'urbanPenalty = (1 - urbanizationRate) × URBANIZATION_WEIGHT; ' +
      'score = clamp(incomeRatio + giniPenalty + hdiAdjustment + urbanPenalty, 0, 1)',
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

/** Get a single ruleset by version string */
export function getRulesetByVersion(version: string): RulesetInfo | undefined {
  return RULESETS.find((r) => r.version === version);
}
