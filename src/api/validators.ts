/**
 * Shared validators and whitelists for API route handlers.
 *
 * Every /v1 list/query endpoint that accepts a `targetGroup` parameter
 * must validate it against the same canonical set. Keeping that set in
 * one place prevents drift when a new group is added to the ruleset.
 */

import type { TargetGroup } from '../core/types.js';

/**
 * Canonical set of valid `targetGroup` values for simulation, regional,
 * and entitlement endpoints. Keep this in sync with the `TargetGroup`
 * union in core/types.ts.
 */
export const VALID_TARGET_GROUPS: TargetGroup[] = [
  'all',
  'bottom_decile',
  'bottom_quintile',
  'bottom_third',
  'bottom_half',
];

/** Narrow helper — returns true if the string is a valid TargetGroup. */
export function isValidTargetGroup(value: unknown): value is TargetGroup {
  return typeof value === 'string' && VALID_TARGET_GROUPS.includes(value as TargetGroup);
}

export type InlineSimulationInputs =
  | { ok: true; coverage: number; targetGroup: TargetGroup; durationMonths: number }
  | { ok: false; code: 'INVALID_PARAMETER'; message: string };

/**
 * Validate the coverage / targetGroup / durationMonths trio that funding and
 * fiscal endpoints accept when no saved simulation is referenced. Applies the
 * same bounds as POST /v1/simulate so an out-of-range value is a 400 rather
 * than a negative cost or an unhandled 500. Missing fields take the defaults
 * coverage 0.2, targetGroup "all", durationMonths 12.
 */
export function parseInlineSimulationInputs(body: Record<string, unknown>): InlineSimulationInputs {
  const coverage = body.coverage ?? 0.2;
  if (typeof coverage !== 'number' || !Number.isFinite(coverage) || coverage < 0 || coverage > 1) {
    return { ok: false, code: 'INVALID_PARAMETER', message: "'coverage' must be a number between 0 and 1" };
  }
  const targetGroup = body.targetGroup ?? 'all';
  if (!isValidTargetGroup(targetGroup)) {
    return {
      ok: false,
      code: 'INVALID_PARAMETER',
      message: `'targetGroup' must be one of: ${VALID_TARGET_GROUPS.join(', ')}`,
    };
  }
  const durationMonths = body.durationMonths ?? 12;
  if (
    typeof durationMonths !== 'number' ||
    !Number.isInteger(durationMonths) ||
    durationMonths < 1 ||
    durationMonths > 120
  ) {
    return {
      ok: false,
      code: 'INVALID_PARAMETER',
      message: "'durationMonths' must be an integer between 1 and 120",
    };
  }
  return { ok: true, coverage, targetGroup, durationMonths };
}

/**
 * True for a real calendar date in strict YYYY-MM-DD form. A regex alone
 * accepts "2027-13-45" or "2027-02-30"; this also checks the date round-trips.
 */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
