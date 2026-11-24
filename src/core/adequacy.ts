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
 * Since ruleset v3 (0.3.0) the paid amount is max(anchor, adequacy line):
 * high-income countries are paid this line, everyone else the $210 anchor.
 * The line still never feeds the need score, which stays anchor-based so
 * need rankings remain comparable across countries.
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
  'Derived from the country-appropriate poverty line (see Methodology) — not a budget-standard ' +
  'costing. Ruleset v3 pays this line where it is above the $210 global floor (high-income ' +
  'countries); it never feeds the need score, which always uses the fixed floor.';

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
