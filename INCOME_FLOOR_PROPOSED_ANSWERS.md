# Proposed Answers & Plan: The Income Floor Open Questions

**Status:** Proposal — nothing here is implemented or ratified.
**Companion to:** [INCOME_FLOOR_OPEN_QUESTIONS.md](./INCOME_FLOOR_OPEN_QUESTIONS.md), which captures the
original discussion. This document proposes a concrete answer for each open row (A–E) and a phased
implementation plan. Row letters below refer to the gap table in §6 of that document.

---

## 1. The proposed resolution in one paragraph

Answer row E first, because it constrains everything else: **keep $210 PPP as the single global
entitlement anchor, and never make the anchor itself vary by country.** The protocol property —
one auditable formula that lets a Kenyan and a German pilot be compared on equal terms — is the
platform's reason to exist, and per-country entitlement logic would quietly destroy it. Instead,
answer the adequacy critique by **surfacing a second, clearly-labeled, locally-calibrated
"adequacy line" next to the anchor everywhere the anchor appears**, derived from data and code the
platform already has (the poverty-line ladder in `src/core/poverty.ts`), later refined with
household-size data. Programs that want to *pay* the local figure can already do so via the
existing `floorOverride` — the platform's job is to make the locally-honest number visible and
auditable, not to impose it. The funding gap question (row D) is answered with an explicit eighth
"international solidarity transfer" mechanism sized by a GNI-proportional donor key, which is the
first concrete step toward the Federation layer rather than a new concern.

The rest of this document justifies each answer and sequences the work.

---

## 2. Proposed answers, row by row

### Row E — Should the entitlement amount itself ever vary by country? → **No. Dual-track it.**

**Proposal:** adopt the synthesis floated in §3.4 of the open-questions doc as the decided design:

1. **`GLOBAL_INCOME_FLOOR_PPP = 210` remains the sole entitlement anchor** used for need scoring,
   cross-country comparison, federation-level accounting, and headline figures. It is documented
   explicitly as a *comparability anchor*, not an adequacy claim.
2. **A per-country `localAdequacyLine` becomes a first-class, read-only output** shown alongside
   the anchor on fact sheets, calc responses, and simulations. It answers "what would be enough to
   live on *here*" — the question the platform currently cannot answer.
3. **The paid amount stays a program-operator choice.** The existing `floorOverride` /
   transfer-amount parameter is the escape hatch; the UI should offer the local adequacy line as a
   one-click suggested override rather than a buried manual field. The default remains the anchor.

**Why this and not per-country entitlements:** a per-country formula turns one protocol into ~190
bespoke calculators, makes "cost of global UBI" claims non-comparable, and moves a political
judgment (what is adequate in country X) into the core formula where it can't be cleanly audited.
The dual-track keeps the political judgment *visible but separate*: the anchor is the protocol;
the adequacy line is information.

**A consequence worth stating up front, because it makes the platform more honest in both
directions:** the adequacy line will sit *below* the anchor in poor countries and *above* it in
rich ones. Concretely, using the existing ladder: LIC adequacy ≈ $2.15/day ≈ **$65/month** (so the
$210 anchor is ~3.2× the local extreme-poverty line in Afghanistan — quantifying critique 3.1's
"multi-person household income" intuition); LMC ≈ $111/month; UMC ≈ $208/month (≈ the anchor, by
construction — the anchor *is* the UMC line); HIC ≈ 60% of median, e.g. well over $1,000/month in
Germany (quantifying "trivial in the West"). Today those magnitudes are invisible; after this
change they are on every fact sheet.

### Row A — PPP documentation fix → **Do immediately, unconditionally.**

Rewrite `/methodology#floor` in `src/web/views/methodology.ts` to state:

- The PPP conversion factor (ICP, ~1,000+ items weighted by consumption share) equalizes
  purchasing power **in aggregate over a whole national basket**, not per good.
- Non-traded, labor-intensive goods (local food, rent, services, transport) are systematically
  cheaper in poor countries than the aggregate factor implies (Balassa–Samuelson); traded goods
  price closer to world levels everywhere.
- A basic-income recipient's spending skews heavily toward non-tradables, so **$210-PPP likely
  buys *more* recipient-relevant consumption in a poor country than the headline suggests, and
  less in a rich one** — the PPP adjustment is conservative in exactly the direction critique 3.1
  claims.
- Cross-reference the (new) adequacy line as the number that accounts for this, once it ships.

This is a factual-accuracy fix; it does not wait on any design decision. It changes rendered site
content, so per the commit checklist treat it as a behaviour-adjacent patch bump, not a
docs-only commit.

### Row C — Locally-calibrated adequacy figure → **Ship v1 purely from existing data.**

**v1 (presentational, no new data):** add a pure function `localAdequacyLine(country)` in
`src/core/` that reuses `countryPovertyLine()` from `src/core/poverty.ts` — the income-group
ladder (HIC: 60%-of-estimated-median; UMC: $6.85/day; LMC: $3.65/day; LIC: $2.15/day) converted to
a monthly PPP-USD figure with its `basis`, `label`, and caveat text passed through. The platform
already computes this for poverty *measurement*; v1 simply re-presents it as an *adequacy
estimate* with honest labeling ("estimate derived from the country-appropriate poverty line — not
a budget-standard costing"). Surface it in:

- `GET /v1/calc/:country` (and regional variant) response, as a sibling field to the floor;
- country fact sheets and the admin country dashboard, side by side with the $210 anchor;
- `POST /v1/simulate` output as an optional comparison line ("cost at local adequacy line").

**v2 (better data, later):** replace the income-group ladder with each country's *own* national
poverty line where a monetary value is obtainable. Note honestly: the World Bank API publishes the
national-line *headcount* (`SI.POV.NAHC`) but not uniformly the line's monetary value; the
practical source is the harmonized national poverty lines research dataset (Jolliffe & Prydz
2016, and successors) or per-country statistics-bureau values curated the same way
`regions.json` is. v2 is data curation, not new architecture.

**Explicit non-goal:** the adequacy line never feeds the need score or the default entitlement.
One-way data flow: poverty data → adequacy line → display/suggested override only.

### Row B — Household economies of scale → **Report it; don't change the paid amount (yet).**

1. Add `avgHouseholdSize?: number | null` to `CountryStats` (it is absent today). Source: **UN
   DESA Population Division, Database on Household Size and Composition** (most countries,
   survey-year provenance) — this is not in the World Bank API, so it enters via the same curated
   path as other snapshot data, with `dataAsOf`/source recorded in the importer config.
2. Add a pure helper implementing the **OECD-modified equivalence scale** (1.0 first adult, 0.5
   each additional adult, 0.3 per child; where adult/child split is unavailable, apply a
   documented approximation, e.g. 0.5 per additional member as a conservative bound).
3. Derive and display: *"effective per-person adequacy in an average household of N"* = adequacy
   line × (equivalized household need ÷ N). For Afghanistan (N≈7–8) this roughly **halves** the
   per-person cost of adequacy versus the naive per-person line — compounding, in the honest
   direction, with the PPP-non-tradables point.
4. **Decision embedded in this proposal:** household adjustment affects *reported adequacy and
   simulation comparison lines only*, not the transfer amount. Paying per-adult-equivalent is a
   real policy option, but it belongs in a **ruleset v3 preview** (per the existing
   ruleset-versioning machinery in `src/core/rulesets.ts`) proposed separately, after the evidence
   layer can say something about intra-household pooling in practice. This keeps the protocol's
   "same formula everywhere" guarantee intact while making the arithmetic public.

### Row D — Who pays when a country can't fund it domestically? → **An explicit 8th mechanism.**

Add `international_solidarity_transfer` as an eighth mechanism in `src/core/funding.ts`, following
the existing `MixMechanismConfig` pattern:

- **Recipient-country view (ships first):** in `calculateRecommendedFundingMix`, after the seven
  domestic mechanisms are sized and capped, the residual gap is attributed to the solidarity
  mechanism instead of today's unlabeled remainder — the fact sheet reads *"domestic mechanisms
  realistically close X%; a pooled international transfer would need to cover the remaining Y%
  (≈ $Z)"*. Zero new data needed; it is a re-labeling of an already-computed residual, plus copy
  explaining the EU-cohesion / IMF-PRGT / GCF precedent and the stability/migration policy
  argument (currently mentioned nowhere in OGI).
- **Donor-side view (second step):** a small pure module (`src/core/solidarity.ts`) that sizes a
  global (or regional) pool: sum of recipient-side gaps = required pool; each donor country's
  share proportional to total GNI (Atlas: `gniPerCapitaUsd × population`) among countries whose
  own domestic mix covers ≥100% — mirroring how EU own-resources GNI keys work, with the UN 0.7%-
  of-GNI ODA target and current EU cohesion (~0.3% of EU GNI) as displayed reference points
  ("this pool would equal 0.X% of donor GNI"). The allocation key is a **named, swappable
  strategy** (GNI-proportional first; population- or emissions-weighted variants can be added
  later without API changes), because the formula choice is political and must stay auditable and
  pluggable rather than hard-coded.
- **Where it lives:** recipient view inside the existing funding output (it is just mechanism #8);
  donor view is new but small and pure. Both are Calculation/Simulation-layer work; actual
  cross-border *flows* remain Federation-layer future work. This mechanism is the bridge between
  the two — the number the Federation layer will eventually settle.

---

## 3. The plan

Sequencing follows §8 of the open-questions doc: decision first, reversible/presentational before
structural, funding-formula debate isolated from the adequacy work.

### Phase 0 — Ratify the design decision (this document)
- Maintainer reviews §2/Row E above. Accepting this PR = adopting the dual-track model as the
  decided answer to row E. All later phases assume it.
- Effort: review only. No code.

### Phase 1 — PPP methodology fix (row A)
- Rewrite `/methodology#floor` per §2/Row A; add an explicit "what the anchor is and is not"
  paragraph (comparability anchor, not adequacy claim).
- Files: `src/web/views/methodology.ts` (+ its test). Patch version bump + CHANGELOG.
- Effort: small (hours). No data, no API changes. **Can ship independently of everything else.**

### Phase 2 — Adequacy line v1 (row C, presentational)
- New pure function `localAdequacyLine(country)` in core, wrapping `countryPovertyLine()`;
  monthly PPP-USD value + basis + caveat.
- Expose in calc endpoints, fact sheet, admin country page, and simulation output as a labeled
  comparison line; wire the "use as override" affordance to the existing `floorOverride`.
- Tests: one per income group (the ladder already has fixtures), API contract tests, view tests.
- Effort: medium (days). Reversible — pure addition, no existing number changes meaning.

### Phase 3 — Household size (row B, reporting only)
- Add `avgHouseholdSize` to `CountryStats` + importer config + curated UN DESA values for the
  49 countries (provenance recorded); equivalence-scale helper in core; "effective per-person
  adequacy in an average household" derived figure on fact sheet + calc response.
- Tests: scale math, null-handling for countries without data, API contract.
- Effort: medium (days; the curation of 49 values is the slow part). Depends on Phase 2's
  display surface.

### Phase 4 — Solidarity mechanism, recipient view (row D, part 1)
- Mechanism #8 in `funding.ts` capturing the post-cap residual; fact-sheet copy with precedents.
- Tests: Afghanistan-type case (large residual), Australia-type case (zero residual).
- Effort: small-medium (days). Independent of Phases 2–3; can run in parallel after Phase 1.

### Phase 5 — Solidarity pool, donor view (row D, part 2)
- `src/core/solidarity.ts`: pool sizing + pluggable GNI-proportional allocation key; a donor-side
  admin/API view ("your country's share of closing the global gap: $X = 0.Y% of GNI").
- This is the first concrete Federation-layer artifact; document it as such in `ROADMAP.md`.
- Effort: medium. Needs the allocation-key design note (one page in the PR) more than code.

### Phase 6 (deferred, explicitly not committed) — Ruleset v3 preview
- Only if pilot evidence (Phase 23 evidence layer) supports it: a *preview* ruleset paying
  per-adult-equivalent rather than per-person, using Phase 3's data, via the normal ruleset
  registry process (constants → rules → rulesets registration → `RULESET_V3.md`). Until then the
  transfer amount stays strictly per-person at the anchor (or operator override).

### Dependency sketch

```
Phase 0 (decide)
  ├── Phase 1 (PPP docs)            — independent, ship first
  ├── Phase 2 (adequacy v1) ──► Phase 3 (household reporting) ──► Phase 6 (ruleset v3, maybe)
  └── Phase 4 (solidarity, recipient) ──► Phase 5 (solidarity, donor/pool)
```

---

## 4. Risks and counterarguments kept in view

| Risk | Mitigation |
|------|------------|
| Two numbers on a fact sheet confuse non-technical users | Strict, repeated labeling: "global anchor (comparable)" vs "local adequacy estimate"; methodology page explains the split; the anchor stays visually primary |
| Adequacy line mistaken for a promise/entitlement | Never enters need score, default floor, or disbursement math; API field named `adequacyEstimate`, not `floor` |
| HIC adequacy figures (>$1,000/mo) make global-UBI totals look unaffordable | That is honesty, not a bug — pair with the solidarity view so the gap has a modeled answer instead of silence |
| GNI-proportional donor key is contestable | Keys are named, pluggable strategies with the choice documented; platform shows the arithmetic, does not pick the politics |
| Household approximation wrong where adult/child split unknown | Conservative documented fallback + per-country provenance; field nullable, display degrades gracefully |
| Scope creep into paying different amounts per country | Guarded by Phase 6's explicit gate: only via a versioned preview ruleset, never by mutating the anchor |

## 5. Still open after this proposal

- v2 source for true national poverty-line *values* (harmonized research dataset vs. per-country
  curation) — decide during Phase 2→3 window.
- Whether the solidarity pool is global or regional-first (EU-style blocs) — decide in Phase 5's
  design note.
- Whether adequacy comparison lines belong in audit exports (Phase 21 format is versioned; adding
  fields is additive) — decide when Phase 2 lands.
