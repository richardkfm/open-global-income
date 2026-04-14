/**
 * Programmable targeting rules engine.
 *
 * Pure functions — no side effects, no I/O.
 *
 * Targeting rules serve two purposes:
 * 1. **Simulation** — estimate a population fraction for budget modelling via `populationFactorFromRules`
 * 2. **Disbursement** — filter the enrolled recipient list at pay time via `applyRulesToRecipients`
 *
 * The `preset` field is the bridge to the legacy `TargetGroup` system.
 * All existing `targetGroup` values remain fully supported — they are expanded
 * to equivalent `TargetingRules` objects internally. No breaking change.
 */

import type { RecipientProfile, TargetGroup, TargetingRules } from './types.js';

// ── Preset expansion ──────────────────────────────────────────────────────────

/**
 * Expand a TargetGroup preset name to an equivalent TargetingRules object.
 * The preset is stored as the `preset` field so the rules engine can use it
 * when computing population fractions for simulations.
 */
export function expandPresetToRules(preset: TargetGroup): TargetingRules {
  return { preset };
}

// ── Population factor ─────────────────────────────────────────────────────────

/**
 * Derive the population fraction implied by a TargetingRules object.
 *
 * Used for budget simulation estimates. The returned factor (0–1) is multiplied
 * against the country population before applying the `coverage` rate.
 *
 * Only `preset` affects the simulation population fraction.
 * Rules like `ageRange`, `maxMonthlyIncomePppUsd`, `identityProviders`, and
 * `excludeIfPaidWithinDays` are disbursement-time filters and do not change the
 * simulated recipient count estimate.
 */
export function populationFactorFromRules(rules: TargetingRules): number {
  return presetFactor(rules.preset ?? 'all');
}

function presetFactor(preset: TargetGroup): number {
  switch (preset) {
    case 'all':
      return 1.0;
    case 'bottom_decile':
      return 0.1;
    case 'bottom_quintile':
      return 0.2;
    case 'bottom_third':
      return 1 / 3;
    case 'bottom_half':
      return 0.5;
    default: {
      const exhaustive: never = preset;
      throw new Error(`Unknown preset: ${exhaustive}`);
    }
  }
}

// ── Recipient filtering ───────────────────────────────────────────────────────

/**
 * Filter an enrolled recipient list against a set of TargetingRules.
 *
 * Returns only the recipients that pass all applicable rules.
 * Rules that cannot be evaluated (e.g. `ageRange` requires DOB claim not stored
 * in the platform) are skipped and noted in the stats.
 */
export function applyRulesToRecipients(
  recipients: RecipientProfile[],
  rules: TargetingRules,
): {
  eligible: RecipientProfile[];
  stats: Array<{ rule: string; description: string; recipientsFiltered: number; notes?: string }>;
} {
  const stats: Array<{ rule: string; description: string; recipientsFiltered: number; notes?: string }> = [];
  let current = recipients;

  // identityProviders filter — evaluable from stored data
  if (rules.identityProviders && rules.identityProviders.length > 0) {
    const allowed = new Set(rules.identityProviders);
    const before = current.length;
    current = current.filter(
      (r) => r.identityProvider !== null && allowed.has(r.identityProvider),
    );
    stats.push({
      rule: 'identityProviders',
      description: `Verified by one of: ${rules.identityProviders.join(', ')}`,
      recipientsFiltered: before - current.length,
    });
  }

  // ageRange — not evaluable: DOB claims not stored in recipient profiles
  if (rules.ageRange !== undefined) {
    stats.push({
      rule: 'ageRange',
      description: `Age ${rules.ageRange[0]}–${rules.ageRange[1]} years`,
      recipientsFiltered: 0,
      notes: 'Requires date-of-birth claim — applied by identity provider at enrollment time',
    });
  }

  // urbanRural — not evaluable from recipient records alone (no region link stored)
  if (rules.urbanRural !== undefined) {
    stats.push({
      rule: 'urbanRural',
      description: `Settlement type: ${rules.urbanRural}`,
      recipientsFiltered: 0,
      notes: 'Applied via region data at disbursement batch generation',
    });
  }

  // maxMonthlyIncomePppUsd — not evaluable: income data not stored
  if (rules.maxMonthlyIncomePppUsd !== undefined) {
    stats.push({
      rule: 'maxMonthlyIncomePppUsd',
      description: `Monthly income ≤ $${rules.maxMonthlyIncomePppUsd} PPP-USD`,
      recipientsFiltered: 0,
      notes: 'Requires income verification data — not stored in recipient profiles',
    });
  }

  // excludeIfPaidWithinDays — requires disbursement history lookup, not evaluable here
  if (rules.excludeIfPaidWithinDays !== undefined) {
    stats.push({
      rule: 'excludeIfPaidWithinDays',
      description: `No payment received in last ${rules.excludeIfPaidWithinDays} days`,
      recipientsFiltered: 0,
      notes: 'Applied during disbursement batch generation from payment history',
    });
  }

  // regionIds — not evaluable from recipient records alone (no region link stored)
  if (rules.regionIds && rules.regionIds.length > 0) {
    stats.push({
      rule: 'regionIds',
      description: `Regions: ${rules.regionIds.join(', ')}`,
      recipientsFiltered: 0,
      notes: 'Applied via region assignment at disbursement batch generation',
    });
  }

  // preset — informational; population fraction already applied in simulation
  if (rules.preset !== undefined && rules.preset !== 'all') {
    stats.push({
      rule: 'preset',
      description: `Population group: ${rules.preset}`,
      recipientsFiltered: 0,
      notes: 'Applied as population fraction in budget simulation — reflects targeting intent',
    });
  }

  return { eligible: current, stats };
}
