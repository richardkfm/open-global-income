/**
 * Local adequacy line — Phase 25 (row C of INCOME_FLOOR_PROPOSED_ANSWERS.md)
 *
 * `GLOBAL_INCOME_FLOOR_PPP` ($210/month) is a fixed comparability anchor: the
 * same number everywhere, used for need-scoring and cross-country comparison.
 * It deliberately does not answer "what would be enough to live on *here*" —
 * that is a locally-honest question the anchor is not designed to answer.
 *
 * This module re-presents the country-appropriate poverty line already
 * computed by `src/core/poverty.ts` (built for poverty *measurement*) as an
 * *adequacy estimate* for display purposes. It is one-way, presentational
 * data flow only:
 *
 *   poverty data → adequacy line → display / suggested override
 *
 * The adequacy line NEVER feeds the need score, the default entitlement, or
 * any disbursement math. It is surfaced next to the anchor so the gap
 * between "comparable" and "locally adequate" is visible rather than
 * implicit, and so program operators who want to pay the locally-calibrated
 * figure have a one-click, audited number to use as their `floorOverride`.
 *
 * v1 (this module): purely derived from the existing income-group poverty
 * ladder — no new data. v2 (future): replace the ladder with each country's
 * own national poverty line monetary value, sourced from the harmonized
 * national poverty lines research dataset (Jolliffe & Prydz 2016 and
 * successors) or curated per-country statistics-bureau values.
 */
import type { Country, LocalAdequacyEstimate } from './types.js';
import { resolveCountryPovertyLine } from './poverty.js';

export type { LocalAdequacyEstimate };

export const LOCAL_ADEQUACY_CAVEAT =
  'Estimate derived from the country-appropriate poverty line (see Methodology) — not a ' +
  'budget-standard costing. Informational only: it never feeds the need score or the default ' +
  'entitlement amount. Programs that want to pay this figure can set it as a floorOverride.';

/**
 * The v1 local adequacy line for a country: a pure re-presentation of
 * `resolveCountryPovertyLine()` with adequacy-specific labeling and caveat.
 */
export function localAdequacyLine(country: Country): LocalAdequacyEstimate {
  const line = resolveCountryPovertyLine(country);
  return {
    monthlyPppUsd: line.monthlyPppUsd,
    dailyPppUsd: line.dailyPppUsd,
    basis: line.basis,
    label: line.label,
    source: line.source,
    caveat: LOCAL_ADEQUACY_CAVEAT,
  };
}
