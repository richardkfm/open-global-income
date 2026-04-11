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
