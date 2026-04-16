# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.19] - 2026-04-16

### Added
- Admin sidebar footer shows the current package version as a link to the GitHub repository (`https://github.com/richardkfm/open-global-income`). Version is read from `package.json` via `packageVersion` in `src/config.ts`, so bumping the package version updates the footer automatically.
- `.sidebar-footer` and `.sidebar-footer-link` styles in `public/css/ogi.css`.

### Changed
- `README.md`: updated the "Built" version header from v0.1.16 → v0.1.19 (now reflects the current stream).

## [0.1.18] - 2026-04-16

### Fixed
- Country detail admin page (`/admin/countries/:code`) showed "Poverty <$2.15/day" for every country regardless of income group, making HIC countries like Germany appear to have near-zero poverty. The tile now uses `resolveCountryPovertyLine()` so each country displays the poverty rate for its income-group-appropriate line (HIC → relative 60% of median, UMC → $6.85/day, LMC → $3.65/day, LIC → $2.15/day). The line's daily PPP value and basis label are shown beneath the value.
- `src/core/impact.test.ts`: updated Kenya fixture (`povertyHeadcountRatio365Percent` added) and expectations to reflect the country-appropriate line introduced in Phase 24 (LMC Kenya now uses the $3.65/day line, monthly $109.50).

### Added
- `povertyCountryLine`, `povertyBasisExtreme`, `povertyBasisLowerMiddle`, `povertyBasisUpperMiddle`, `povertyBasisRelativeMedian`, `povertyBasisNational` i18n keys in `src/i18n/locales/en.ts`.

## [0.1.17] - 2026-04-15

### Added
- Phase 23: Evidence Layer — closes the loop between projected impact and observed outcomes
- `OutcomeRecord`, `OutcomeIndicators`, `OutcomeCohortType`, `OutcomeComparison`, `OutcomeDelta`, `EvidenceAggregate` types in `src/core/types.ts`
- `pilot_outcomes` database table: stores measured economic indicators per cohort per measurement date, with baseline flag, sample size, and data source provenance
- `src/db/outcomes-db.ts` — full CRUD: `recordOutcome`, `getPilotOutcomes`, `getOutcomeById`, `getOutcomeComparison` (pre/post delta with projected vs. actual), `aggregateOutcomes` (anonymized cross-program benchmarks)
- `POST /v1/pilots/:id/outcomes` — record a recipient or control cohort measurement with 7 indicator fields (employment rate, average monthly income, food security score, child school attendance, above-poverty-line %, self-reported health, savings rate)
- `GET /v1/pilots/:id/outcomes` — list all outcome measurements for a pilot, ordered by date
- `GET /v1/pilots/:id/outcomes/compare` — pre/post comparison: baseline vs. latest per indicator with numeric delta; pulls projected impact from the linked impact analysis for projected vs. actual side-by-side
- `GET /v1/evidence/aggregate` — anonymized, aggregated outcome statistics across all pilots (filterable by country, income group, coverage range); returns median, p25, p75 per indicator — the network-effect endpoint
- `GET /v1/evidence/export` — download aggregate evidence as CSV or JSON for academic partners; standardized column names
- `getLatestImpactAnalysisBySimulation()` added to `src/db/impact-db.ts`
- Admin UI: `src/admin/views/evidence.ts` — evidence page per pilot with record form, pre/post comparison table (with projected vs. actual rows when impact analysis exists), and full measurement history
- Admin route `GET /admin/pilots/:id/evidence` and `POST /admin/pilots/:id/outcomes/create`
- "Evidence" button added to pilot detail page linking to the evidence dashboard
- Database migration for existing installations (safe CREATE IF NOT EXISTS)
- **23 new tests** in `src/api/routes/outcomes.test.ts` covering all 5 endpoints, validation edge cases, and cross-cohort comparison logic
- **Test count: 513 tests** across 28 suites

## [0.1.16] - 2026-04-14

### Added
- Admin UI: targeting rules support in the Simulate and Pilots pages
- **Simulate page** (`/admin/simulate`): collapsible "Advanced targeting filters" panel below the Target group dropdown — fields for Urban/Rural, Min/Max age, Max monthly income (PPP-USD), Identity providers (comma-separated), Exclude if paid within N days, and Region IDs (comma-separated); filter values are carried through to the Save endpoint via hidden inputs
- **Pilots create form** (`/admin/pilots`): collapsible "Targeting rules" section with all rule fields — Population group preset dropdown (bottom half / third / quintile / decile), plus the same advanced filters; targeting rules are stored on the pilot record
- **Pilot detail page** (`/admin/pilots/:id`): new "Targeting Rules" card rendered when the pilot has rules, showing a clean summary table of each active rule
- `parseFormTargetingRules()` helper in `routes.ts` — converts flat HTML form fields into a `TargetingRules` object; returns null if no meaningful rule is set (backward-compatible with existing pilots)
- CSS for `.targeting-details` / `.targeting-summary` / `.targeting-fields` — animated collapsible triangle indicator
- **Test count: 490 tests** across 27 suites (unchanged — admin UI changes are covered by existing admin test suite)

## [0.1.15] - 2026-04-14

### Added
- Phase 22: Programmable Targeting Rules
- `TargetingRules` interface in `src/core/types.ts` — structured rules object with `preset`, `ageRange`, `urbanRural`, `maxMonthlyIncomePppUsd`, `identityProviders`, `excludeIfPaidWithinDays`, and `regionIds` fields
- `src/core/targeting.ts` — pure targeting engine: `expandPresetToRules` (TargetGroup → TargetingRules), `populationFactorFromRules` (estimate recipient fraction for simulations), `applyRulesToRecipients` (filter enrolled recipients and produce per-rule stats)
- `POST /v1/simulate` now accepts `targetingRules` object in addition to (or replacing) `targetGroup`; when `targetingRules.preset` is set it takes precedence over the legacy field — fully backward-compatible
- `POST /v1/pilots` now accepts and stores `targetingRules` alongside the simulation link
- `GET /v1/pilots/:id/report` now includes a `targeting` section: `{ rules, filterStats }` showing the active rules and how many enrolled recipients each rule would filter, with per-rule notes for fields that require disbursement-time evaluation (ageRange, urbanRural, income, regionIds)
- Full input validation for all `targetingRules` fields (preset enum, ageRange bounds, urbanRural enum, positive-number/integer checks, string-array checks)
- Database migration: `targeting_rules TEXT` column added to the `pilots` table; existing rows unaffected (nullable)
- **37 new tests** across 3 suites: `src/core/targeting.test.ts` (30 unit tests covering expandPresetToRules, populationFactorFromRules, applyRulesToRecipients), `src/api/simulate.test.ts` (7 integration tests for targetingRules in POST /v1/simulate), `src/api/routes/pilots.test.ts` (8 integration tests for targeting rules in pilot creation and report)
- **Test count: 490 tests** across 27 suites

## [0.1.14] - 2026-04-13

### Added
- Phase 21: Structured Audit Exports
- `GET /v1/pilots/:id/audit-export` — generates a compliance-grade, self-contained audit document covering pilot metadata, methodology (ruleset version, data version, formula), recipient aggregate stats, and all linked disbursements with their full event logs
- SHA-256 integrity hash over canonical JSON (sorted keys, no whitespace) of the export payload, allowing independent tamper-detection by auditors and donors
- GDPR-safe design: only aggregate recipient counts (`totalEnrolled`, `totalVerified`, `totalSuspended`, `byCountry`) are included — no raw account identifiers, IBANs, or phone numbers
- `pilot.audit_export_generated` webhook event fired on each export
- Admin UI "Export Audit Document" button on pilot detail page — triggers a signed JSON file download via `GET /admin/pilots/:id/audit-export`
- 5 new tests: full document structure, SHA-256 hash correctness, disbursement log entries in export, 404 for unknown pilot, GDPR check (no raw account identifiers in output)
- **Test count: 453 tests** across 26 suites

## [0.1.13] - 2026-04-13

### Added
- Phase 20: Inbound Webhooks & Payment Confirmations
- `POST /v1/webhooks/inbound/:provider` — receives callbacks from payment providers and advances disbursement status
- HMAC-SHA256 signature verification using per-channel `webhookSecret` stored in channel config
- Replay-attack protection via ±5 minute timestamp window
- Wise (SEPA) `parseCallback()` implementation — verifies `X-Wise-Signature-SHA256`, parses `transfers#state-change` events
- `disbursement.confirmed` outbound webhook event fired when a provider callback confirms payment
- `external_id` stored on disbursement records for fast inbound lookup
- `getDisbursementByExternalId` and `setExternalId` DB helpers
- 5 new tests covering: valid callback, invalid HMAC, unknown externalId, replay protection, outbound event dispatch
- **Test count: 448 tests** across 26 suites

## [0.1.12] - 2026-04-12

### Added

- **Recipient & Identity Model (Phase 19)** — operational foundation for enrolling real program participants:
  - `RecipientProfile`, `RecipientStatus`, `PaymentMethod`, `IdentityProvider`, `IdentityClaim`, `VerificationResult` types in `src/core/types.ts`
  - `recipients` table in SQLite schema with a unique index on `(country_code, account_hash)` preventing double-enrollment within a country. No raw IBAN, phone, or ID numbers are ever stored — only the SHA-256 hash of the account identifier (`accountHash`) plus a non-reversible display suffix (`routingRef`)
  - `src/db/recipients-db.ts` — `createRecipient`, `getRecipientById`, `listRecipients`, `updateRecipient`, `findByAccountHash`
  - **5 new API endpoints** under `/v1/recipients`:
    - `POST /v1/recipients` — enroll a recipient (status: `pending`); returns 409 if `accountHash` is already enrolled in the same country
    - `GET /v1/recipients` — paginated list, filterable by `countryCode`, `status`, `pilotId`
    - `GET /v1/recipients/:id` — retrieve a single recipient profile
    - `PATCH /v1/recipients/:id` — update status, payment method, account hash, verification details; enforces legal state transitions (`pending→verified→suspended→pending`); returns 422 for illegal transitions, 409 for duplicate account hash conflicts
    - `POST /v1/recipients/check-duplicate` — given a `countryCode` + `accountHash`, returns whether the account is already enrolled and in which pilot — enables cross-program de-duplication without exposing identity
  - Registered `recipientsRoute` in `src/api/server.ts` under `/v1` prefix
- **ROADMAP phases 19–25** — full feature specifications for: Recipient & Identity Model, Inbound Webhooks & Payment Confirmations, Structured Audit Exports, Programmable Targeting Rules, Evidence Layer, Scenario Versioning & Data Diffing, and Multi-tenancy Foundation
- **26 new tests** in `src/api/routes/recipients.test.ts` covering all endpoints, all status transitions, duplicate detection, and error cases
- **Test count: 441 tests** across 25 suites

## [0.1.11] - 2026-04-12

### Added

- **SEPA Credit Transfer provider** — `src/disbursements/providers/sepa.ts` implements the `DisbursementProvider` interface for European bank wire payments. Like the M-Pesa stub, it validates configuration, documents the Wise Payouts API integration path, converts PPP-USD amounts to EUR via an ECB reference rate (0.92 EUR/USD representative 2024 value), and returns a mock SEPA Credit Transfer instruction including a generated end-to-end reference. Real integration requires a Wise Payouts API key; the provider is a drop-in replacement once credentials are available. Registered under `providerId: 'sepa'` in the provider registry, visible at `GET /v1/disbursements/channels`.
- **EU sub-national region data** — `src/data/regions.json` now includes cost-of-living indexed regions for Germany (16 Bundesländer, sourced from Destatis 2022), France (13 metropolitan regions, sourced from INSEE 2022), and Netherlands (12 provinces, sourced from CBS 2022). Enables `GET /v1/income/regions?country=DE`, `POST /v1/simulate/regional` for EU pilots, and regional entitlement comparison via `GET /v1/income/calc/regional`. Total regions: 47 (Kenya) + 16 (Germany) + 13 (France) + 12 (Netherlands) = 88 regions. Data version bumped from `curated-2024-01` to `curated-2024-02`.
- **18 new tests** — `src/disbursements/providers/sepa.test.ts` covers provider metadata, config validation (valid sandbox, valid production, each missing field, invalid environment, empty string, non-string type), submit (pending status, stub prefix, uniqueness, SEPA reference, EUR conversion at 0.92 rate, recipient count and currency, total amount, instruction type), and checkStatus.
- **Test count: 415 tests** across 24 suites.

### Fixed

- **XSS in admin error messages** — three error branches in `src/admin/routes.ts` interpolated the user-submitted `countryCode` directly into an HTML response (`Country '${countryCode}' not found`). Because `.toUpperCase()` does not sanitise HTML, a malicious admin form could execute arbitrary JavaScript in the admin panel. All three sites now pass the value through `escapeHtml()` before rendering.
- **Fire-and-forget `dispatchEvent` missing `void` prefix** — `src/api/routes/funding.ts` (funding_scenario.created) and `src/api/routes/impact.ts` (impact_analysis.created) awaited nothing from the webhook dispatcher, and — unlike every other call site — omitted the `void` prefix. If the dispatcher rejected, an unhandled promise rejection could surface. Both calls now match the rest of the codebase with `void dispatchEvent(...)`.
- **Funding scenario save discarded mechanism rates** — the admin save handler reconstructed mechanism inputs from the `FundingScenarioResult` object and hardcoded every `rate`, `points`, `dollarPerTon`, and `percent` field to `0`. Every scenario saved through the admin UI was therefore stored with useless placeholder parameters. The save form now carries the original `mechanismsJson` as a hidden input (parallel to `resultJson`) and the handler persists those values verbatim.
- **OpenAPI version string drifted from package.json** — the version was hard-coded in `src/api/server.ts` (most recently `'0.1.10'`) while the companion test asserted `'0.1.6'`, so the version test failed on every release bump. Version is now read from `package.json` at startup via the new `packageVersion` export in `src/config.ts`, and the test asserts the shape (`/^\d+\.\d+\.\d+/`) instead of a literal.
- **Pagination NaN fallthrough on impact & funding list endpoints** — `GET /v1/impact-analyses` and `GET /v1/funding-scenarios` parsed `page` and `limit` with `Math.max(1, parseInt(...))` with no numeric fallback. `Math.max(1, NaN)` is `NaN`, which produced `LIMIT NaN OFFSET NaN` SQL. These endpoints now clamp via the shared `parsePagination` helper.
- **`totalPages: 0` for empty list results** — every paginated list endpoint reported `totalPages: 0` for an empty result set, breaking UI logic that expects at least one page. The shared helper now reports `Math.max(1, Math.ceil(total / limit))`.
- **Stale top-level `version` field in `package-lock.json`** — the lock file still read `0.1.4` at the top level despite the package being at `0.1.10`. `npm install` regenerates this on first install.

### Changed

- **Shared pagination helper** — `parsePagination()` and `buildPaginationMeta()` live in a new `src/api/pagination.ts` module. All five list endpoints (`simulations`, `pilots`, `disbursements`, `funding-scenarios`, `impact-analyses`) now use it, eliminating five copies of the same boilerplate and normalising the response envelope to `{ items, pagination: { page, limit, total, totalPages } }`. As a result, `GET /v1/funding-scenarios` and `GET /v1/impact-analyses` now include `totalPages` and use the same `pagination: { ... }` wrapper as the other list endpoints (previously they returned `{ ..., total, page, limit }` flat).
- **Shared `VALID_TARGET_GROUPS` constant** — the same whitelist was duplicated across three route modules. Extracted to `src/api/validators.ts` so adding a new target group touches one file.
- **Test count: 415 tests** across 24 suites (includes one new test for the NaN pagination fallback on `GET /v1/impact-analyses` and 18 new tests for the SEPA provider).

## [0.1.10] - 2026-04-11

### Changed

- **Centralised all `process.env` reads through `config.ts`** — `config.ts` was designed as the single source of truth for every environment variable, but seven files bypassed it and re-parsed env vars directly. All direct `process.env.*` reads in `src/index.ts`, `src/api/server.ts`, `src/api/routes/income.ts`, `src/api/middleware/audit-log.ts`, `src/api/middleware/api-key-auth.ts`, `src/db/database.ts`, and `src/db/pg-adapter.ts` are replaced with the corresponding `config.*` field. `DB_BACKEND` validation (previously inside `getDbBackend()`) is now an IIFE in `config.ts`, so an invalid value throws at startup rather than only when the database is first opened.

### Fixed

- **SQLite directory creation race condition** — `getDb()` created the data directory via a dynamic `import('node:fs').then(...)`, scheduling the `mkdirSync` call as a microtask. Because `new Database(path)` ran synchronously on the very next line, the directory did not exist yet, causing `SQLITE_CANTOPEN: unable to open database file` on every cold-start inside Docker (where `/app/data/` is not pre-created). Fixed by replacing the dynamic import with a static `import { mkdirSync } from 'node:fs'` and calling it synchronously before opening the database.

### Added

- **Docker Compose production configuration** — `docker-compose.yml` now includes:
  - Named volume mount `./data:/app/data` so the SQLite database survives container restarts
  - Node.js-based health check against `/health` (no extra `curl` dependency needed)
  - `restart: unless-stopped` so the container recovers from crashes automatically
  - CPU/memory resource limits (1 CPU / 512 MB) with soft reservations
  - Structured JSON log rotation (`max-size: 10 m`, `max-file: 3`)
  - Explicit `DB_PATH` env var pointing inside the mounted volume
  - `ADMIN_USERNAME` / `ADMIN_PASSWORD` required via the `${VAR:?message}` syntax — the compose file will refuse to start if these are unset, preventing accidental deployment with the default `admin`/`admin` credentials
- **`.dockerignore`** — excludes `node_modules`, `dist`, `data`, `.git`, `.env*`, SQLite WAL files, and test coverage from the build context, speeding up `docker build` and preventing accidental inclusion of secrets or local database files
- **`.env.example`** — documents every environment variable accepted by the application with defaults and inline comments; copy to `.env` before running with `docker compose`

## [0.1.9] - 2026-04-08

### Fixed

- **Carbon tax 1000x unit error** — `calcCarbonTax` named its intermediate variable `totalEmissionsKt` (kilotons) but computed it in tons, then applied an erroneous `* 1000` "kt → tons" conversion. Result: a $25/ton tax on Kenya produced **$992 billion** instead of the correct **$992 million** — enough to "fund" the entire UBI programme 36× over. Fixed by renaming to `totalEmissionsTons` and dropping the spurious multiply.
- **Income tax surcharge ignores informal economy** — the surcharge formula applied the rate to the full GNI of the entire labour force, overstating collectable revenue by 2–3× in low-income countries where 50–65% of labour income sits in the informal sector and is outside the tax net. Introduced `INCOME_TAX_FORMALITY_FACTOR` (0.35–0.90 by income group, sourced from IMF/World Bank informality estimates) to discount the taxable base accordingly.
- **Wealth tax assumes 100% collection** — real-world wealth taxes face significant avoidance via offshore structures, complex trusts, and capital flight; most countries that implemented them eventually repealed them. Introduced `WEALTH_TAX_COLLECTION_FACTOR` (0.15–0.55 by income group, sourced from IMF WP/19/143 and OECD design guidance) to bring estimates in line with observed outcomes.
- **VAT increase uses naive linear elasticity** — each percentage-point VAT rise was assumed to raise revenue proportional to the existing VAT base, ignoring the demand response (reduced consumption, shift to informal markets). Applied a `VAT_BEHAVIORAL_DISCOUNT` of 0.80 (20% yield reduction) across all three VAT code paths, consistent with IMF and Keen & Lockwood (2010) cross-country estimates.

### Changed

- All four funding assumptions are now surfaced in the `assumptions` array of each `FundingEstimate` so users can see exactly what was modelled.
- Test count: **396 tests** across **23 suites** (9 new tests added to `src/core/funding.test.ts` covering realistic revenue bounds, formality/avoidance factors, and behavioral discounts).

## [0.1.8] - 2026-04-08

### Fixed

- **Macro-economic data population** — all 49 countries now have 17 macro-economic fields explicitly populated (previously all were `undefined`, causing data-completeness loops). Fields include 12 World Bank indicators (tax revenue, social spending, inflation, labor force, unemployment, debt, poverty, GDP growth, health/education expenditure, urbanization), 4 ILO fields (social protection coverage/expenditure, pension coverage, child benefits), and 1 IMF placeholder (tax breakdown). All fields are now explicitly `null` or numeric — never `undefined`.

## [0.1.7] - 2026-03-21

### Added

- **Sub-national data layer** — regional cost-of-living adjustments for entitlement calculations. National averages hide enormous variation; a basic income floor in Nairobi (COL 1.35×) versus rural Turkana (COL 0.68×) should not be the same amount.
- **Region types** in `src/core/types.ts`: `Region`, `RegionStats`, `RegionalIncomeEntitlement`
- **Pure region functions** in `src/core/regions.ts`:
  - `buildRegionAdjustedCountry()` — multiplies national PPP conversion factor by a region's cost-of-living index and substitutes regional population. All existing formulas (rules, simulations, funding, impact) work transparently via this pattern — zero formula changes needed.
  - `toRegionalEntitlement()` — wraps a regional entitlement with comparison metadata (national baseline, COL index)
- **Kenya seed data** — all 47 counties in `src/data/regions.json` with population, cost-of-living index, urban/rural classification, and poverty headcount ratios (KNBS 2019 Census)
- **Region data loader** in `src/data/loader.ts`: `getAllRegions()`, `getRegionById()`, `getRegionsByCountry()`, `getRegionsDataVersion()`
- **4 new API endpoints:**
  - `GET /v1/income/regions` — list all regions (filterable by `?country=KE`)
  - `GET /v1/income/regions/:id` — region detail
  - `GET /v1/income/calc/regional?country=KE&region=KE-NAI` — calculate regionally-adjusted entitlement with national comparison
  - `POST /v1/income/simulate/regional` — run a budget simulation for a specific region (uses regional population and adjusted PPP)
- **Admin UI** at `/admin/regions`:
  - Region list grouped by country with COL index badges, urban/rural type, poverty rates
  - Region detail page with entitlement comparison table (national vs. regional) and % difference
- **38 new tests** across 3 new suites:
  - `src/core/regions.test.ts` — pure function tests: PPP adjustment, population substitution, immutability, score invariance, COL edge cases
  - `src/data/regions.test.ts` — loader tests: lookup, filtering, case-insensitivity, data integrity validation
  - `src/api/routes/regions.test.ts` — API integration tests: all 4 endpoints, error handling, country-region mismatch

### Changed

- Admin nav updated with **Regions** link
- Test count: **387 tests** across **23 suites** (up from 349 across 20 suites)

## [0.1.6] - 2026-03-21

### Added

- **Economic impact modeling** — the "sell it" layer that translates budget simulations into policy-relevant impact estimates
- **4 impact dimensions** in `src/core/impact.ts` (pure functions, no side effects):
  - **Poverty reduction** — estimates people lifted above the $2.15/day extreme poverty line; handles transfer > line (all covered poor lifted) and transfer < line (uniform distribution partial lift model)
  - **Purchasing power** — estimates % income increase for the bottom quintile using the Lorenz curve approximation `L(p) = p^(1+2G)`, validated against World Bank quintile data for 40+ countries
  - **Social security coverage** — estimates newly reached people currently excluded from formal social protection; applies 1.4× poverty concentration factor for bottom-quintile targeting (ILO exclusion research)
  - **Fiscal multiplier** — Keynesian demand-side GDP stimulus, calibrated by income group: LIC=2.3×, LMC=1.9×, UMC=1.5×, HIC=1.1×; based on IMF/World Bank cash-transfer research
- **Policy brief generator** — every assumption explicitly listed in a deduplicated flat list; exports as JSON or plain text
- **5 new API endpoints:**
  - `POST /v1/impact` — run full impact analysis inline (not saved)
  - `POST /v1/impact/brief` — generate exportable policy brief (JSON or `?format=text` for plain text)
  - `POST /v1/impact-analyses` — run and save an impact analysis
  - `GET /v1/impact-analyses` / `GET /v1/impact-analyses/:id` — list and retrieve saved analyses
  - `DELETE /v1/impact-analyses/:id` — delete a saved analysis
- **Interactive admin UI** at `/admin/impact`:
  - Configure via country selector or saved simulation link, coverage slider, duration slider, target group
  - Analyze & save in one click
  - Headline cards with data quality indicators (high/medium/low) for each dimension
  - Tabbed breakdown: Poverty / Purchasing Power / Social Coverage / GDP Stimulus / Policy Brief
  - Policy brief tab: methodology paragraphs, full assumptions list, caveats, data sources (all collapsible)
  - Export brief as JSON file
- **`impact_analyses` database table** (SQLite schema + indexed on country and simulation)
- **`impact_analysis.created` webhook event**
- **61 new tests** across 2 new suites:
  - `src/core/impact.test.ts` — 35 tests: all four calculation functions, full analysis, edge cases, missing data, determinism, Lorenz validation, multiplier calibration
  - `src/api/routes/impact.test.ts` — 26 tests: all endpoints, error handling, save/retrieve/delete, brief export, text format
- `src/db/impact-db.ts` — CRUD helpers for the impact_analyses table
- `ImpactParameters`, `PovertyReductionEstimate`, `PurchasingPowerEstimate`, `SocialCoverageEstimate`, `FiscalMultiplierEstimate`, `ImpactAnalysisResult`, `PolicyBrief`, `SavedImpactAnalysis` types in `src/core/types.ts`
- **[IMPACT_METHODOLOGY.md](./IMPACT_METHODOLOGY.md)** — full documentation of models, formulas, assumptions, data sources, and interpretation guide

### Changed

- Admin nav updated with **Impact** link
- OpenAPI spec version bumped to `0.1.6`
- Phase 16 marked complete in `ROADMAP.md`
- README updated with Impact API section, admin UI entry, new webhook event, and current status
- Test count: **349 tests** across **20 suites** (up from 288 across 18 suites)
- `WebhookEvent` type extended with `'impact_analysis.created'`

## [0.1.5] - 2026-03-21

### Added
- **Funding scenario builder** — model concrete funding mechanisms and see how a basic income program fits into a country's fiscal picture
- **6 funding mechanism calculators** in `src/core/funding.ts` (pure functions, no side effects):
  - **Income tax surcharge** — flat surcharge on income tax applied to employed population
  - **VAT increase** — additional percentage points on value-added tax (uses IMF breakdown when available)
  - **Carbon tax** — per-ton CO2 tax using income-group emission intensity proxies
  - **Wealth tax** — annual tax on estimated private wealth (Credit Suisse wealth-to-GDP ratios)
  - **Financial transaction tax** — tax on stock market turnover (income-group proxies)
  - **Redirect social spending** — redirect a portion of existing social protection spending (ILO/WB data)
- **Fiscal context analysis** — shows UBI cost relative to tax revenue, social spending, and government debt
- **3 new API endpoints:**
  - `POST /v1/simulate/fiscal` — fiscal context analysis for a country's UBI cost
  - `POST /v1/simulate/fund` — build a funding scenario with multiple mechanisms and coverage gap analysis
  - Full CRUD for `/v1/funding-scenarios` (save, list, get, delete)
- **Interactive admin UI** at `/admin/funding`:
  - Slider controls for each mechanism with enable/disable toggles
  - Live preview via htmx with summary cards (cost, funding raised, % covered, gap)
  - Stacked bar chart showing funding sources vs. remaining gap
  - Per-mechanism revenue breakdown with colored indicators
  - Fiscal context panel (tax/GDP, social spending/GDP, debt/GDP, UBI as % of tax revenue)
  - Assumptions section — every simplification explicitly stated for policymaker trust
  - Save scenarios and export as JSON
- **`funding_scenarios` database table** (SQLite schema + PostgreSQL migration `004_add_funding_scenarios.sql`)
- **`funding_scenario.created` webhook event**
- **25 new tests** — all funding mechanisms, fiscal context, full scenario builder, edge cases, determinism
- `src/db/funding-db.ts` — CRUD helpers for the funding_scenarios table
- `FundingMechanismType`, `FundingMechanismInput`, `FundingEstimate`, `FiscalContext`, `FundingScenarioResult`, `SavedFundingScenario` types in `src/core/types.ts`

### Changed
- Admin nav updated with **Funding** link
- OpenAPI spec version bumped to `0.1.5`
- Phase 15 marked complete in `ROADMAP.md`
- README updated with funding API endpoints, admin UI section, webhook event, and current status
- Test count: 288 tests across 18 suites (up from 263 across 17 suites)

## [0.1.4] - 2026-03-20

### Added
- **Admin UI login interface** — secure session-based authentication for admin dashboard
- **Login page** at `/admin/login` with username/password form and password visibility toggle
- **Session management** — DB-backed sessions with configurable TTL (24 hours standard, 7 days with "Remember me")
- **Password security** — PBKDF2 with 100,000 iterations, SHA-512 digest, 32-byte salt, constant-time comparison
- **Brute-force protection** — 5 failed attempts per IP triggers 15-minute lockout with rate limiting
- **Default admin credentials** — username `admin` / password `admin` (configurable via `ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars)
- **Session-based auth** — HttpOnly cookies with SameSite=Strict, automatic expiry and cleanup
- `src/db/admin-auth.ts` — password hashing, user CRUD, and session management utilities
- Authentication guard on all admin routes — redirects unauthenticated users to login
- Logout endpoint at `/admin/logout` with session cleanup

### Changed
- `ADMIN_PASSWORD` env var now controls the password for the seeded admin user (previously only for basic HTTP auth)
- Admin routes now require login — no longer accessible without valid session
- README updated with admin UI login instructions and default credentials

## [0.1.3] - 2026-03-18

### Added
- **Pilot data model** — 2 new database tables: `pilots` (lifecycle tracking with status transitions) and `pilot_disbursements` (join table linking pilots to disbursements)
- **`Pilot`, `PilotStatus`, `PilotReport` domain types** in `src/core/types.ts`
- **6 new API endpoints:**
  - `POST /v1/pilots` — create a pilot linked to a simulation
  - `GET /v1/pilots` — paginated list with status and country filters
  - `GET /v1/pilots/:id` — full pilot detail with linked disbursements
  - `PATCH /v1/pilots/:id` — update status (with validated transitions), description, dates, recipients
  - `POST /v1/pilots/:id/disbursements` — link a disbursement to a pilot
  - `GET /v1/pilots/:id/report` — generate structured JSON report with variance analysis
- **Pilot status lifecycle** — `planning → active → paused → completed` with enforced transition rules
- **Variance analysis** — report endpoint compares actual disbursements against simulation projections, showing +/- percentage deviation
- **3 new webhook events:** `pilot.created`, `pilot.status_changed`, `pilot.report_generated`
- **Admin UI pilot dashboard** at `/admin/pilots`:
  - Pilot list with status badges, create form with country and simulation selectors
  - Pilot detail with summary cards (recipients, disbursed, count, avg per recipient), status transition buttons, disbursement timeline, simulation variance display, and disbursement linking
- **PostgreSQL migration** `003_add_pilots.sql`
- **~30 new tests** — CRUD, status transitions, disbursement linking, report generation, full lifecycle, and edge cases
- `src/db/pilots-db.ts` — CRUD helpers for pilot and pilot_disbursements tables

### Changed
- OpenAPI spec version bumped to `0.1.3`
- `USECASE.md` extended with pilot lifecycle scenario (Steps 7–10 in Scenario A)
- `README.md` updated with pilot endpoints, webhook events, admin UI section, and phase checklist
- Phase 13 marked complete in `ROADMAP.md` and `README.md`

## [0.1.2] - 2026-03-18

### Added
- **Disbursement data model** — 3 new database tables: `disbursement_channels`, `disbursements`, `disbursement_log` with full FK integrity and indexed queries
- **`DisbursementProvider` interface** in `src/disbursements/types.ts` — `validateConfig`, `submit`, `checkStatus` contract for all providers
- **Solana USDC provider** (`src/disbursements/providers/solana.ts`) — non-custodial; uses `solanaAdapter.toTokenAmount()` to compute USDC amounts and returns unsigned transaction payloads for multisig signing
- **EVM USDC provider** (`src/disbursements/providers/evm.ts`) — generates unsigned ERC-20 transfer calldata for Ethereum, Polygon, Arbitrum, Optimism, and Base
- **M-Pesa stub provider** (`src/disbursements/providers/mpesa.ts`) — validates Safaricom config shape, logs intent, returns mock transaction ID; enables full pipeline testing without live API credentials
- **Provider registry** (`src/disbursements/providers/registry.ts`) — `getProvider(id)` / `listProviders()`
- **7 new API endpoints:**
  - `GET /v1/disbursements/channels` — list channels and available providers
  - `POST /v1/disbursements/channels` — register channel (validates provider config)
  - `POST /v1/disbursements` — create disbursement (status: `draft`)
  - `POST /v1/disbursements/:id/approve` — approve for processing (status: `approved`)
  - `POST /v1/disbursements/:id/submit` — submit to provider (status: `completed` or `failed`)
  - `GET /v1/disbursements/:id` — get disbursement + audit log
  - `GET /v1/disbursements` — paginated list filterable by `status` and `channelId`
- **4 new webhook events:** `disbursement.created`, `disbursement.approved`, `disbursement.completed`, `disbursement.failed`
- **~35 new tests** — unit tests per provider (valid/invalid config, submit shape, checkStatus) and integration tests covering the full lifecycle (draft → approved → submitted → completed) plus error cases
- `DisbursementChannel`, `Disbursement`, `DisbursementLogEntry` domain types in `src/core/types.ts`
- `src/db/disbursements-db.ts` — CRUD helpers for all three disbursement tables

### Changed
- Version corrected on Phase 11 CHANGELOG entry (was incorrectly `0.2.0`, now `0.1.1`) — each phase bumps by `0.0.1`
- `USECASE.md` Scenario C (DAO) updated with full disbursement flow (Steps 4–8) using the new API
- `README.md` updated with disbursement endpoints, provider table, and updated webhook event list
- Phase 12 marked complete in `ROADMAP.md` and `README.md`
- OpenAPI spec version bumped to `0.1.2`

## [0.1.1] - 2026-03-18

### Added
- **Budget simulation endpoint** `POST /v1/simulate` — returns full cost breakdown for a country and coverage scenario: recipient count, monthly/annual cost in local currency and PPP-USD, and cost as % of GDP
- **Targeting presets** — `all` (entire population) and `bottom_quintile` (bottom 20% by income, approximated from existing Gini data)
- **Floor override** — `adjustments.floorOverride` to replace the default $210 PPP-USD/month with a custom floor for scenario modeling
- **Comparison simulation** `POST /v1/simulate/compare` — run the same scenario across up to 20 countries, sorted by annual PPP-USD cost ascending
- **Saved simulations** — SQLite-backed persistence with full CRUD:
  - `POST /v1/simulations` — run and save a simulation with an optional name
  - `GET /v1/simulations` — paginated list
  - `GET /v1/simulations/:id` — retrieve by ID
  - `DELETE /v1/simulations/:id` — delete
- **`simulation.created` webhook event** — fired when a simulation is saved, enabling downstream systems (e.g. donor dashboards) to react
- **Admin UI simulation page** at `/admin/simulate`:
  - Country dropdown, coverage percentage input, duration input, target group selector
  - Live cost preview via htmx partial refresh (no page reload)
  - Multi-country comparison table
  - Save simulation with a name and delete saved simulations
- `SimulationParameters`, `SimulationResult`, `SavedSimulation` types in `src/core/types.ts`
- Pure `calculateSimulation()` function in `src/core/simulations.ts` (no I/O, fully testable)
- `src/db/simulations-db.ts` — CRUD helpers for the `simulations` table
- 16 unit tests for simulation math + 21 integration tests for all simulation endpoints (142 tests total)

### Changed
- `USECASE.md` — Step 4 of Scenario A now shows `POST /v1/simulate` with a full example response; Scenario B adds `POST /v1/simulate/compare` for NGO cost comparison
- Summary tables in `USECASE.md` updated to reflect simulation capabilities now available
- Admin nav updated with a **Simulate** link
- Phase 11 marked complete in `README.md`

## [0.1.0] - 2026-03-18

### Added
- **Prometheus metrics** at `/metrics` endpoint via `prom-client` (request count, duration histogram, active connections, Node.js runtime metrics)
- **Ruleset v2 (preview)**: extended formula with HDI and urbanization factors, registered but not active
- **GOVERNANCE.md**: governance model, decision-making process, API stability declaration
- **API stability declaration** for all v1 endpoints and response formats

### Changed
- Version bumped to 0.1.0 — first API-stable release
- Rulesets registry now includes 3 rulesets (v1 active, v2 preview, stub deprecated)

## [0.0.9] - 2026-03-18

### Added
- **Solana adapter**: token amount conversion with configurable exchange rates and decimals
- **EVM adapter**: Ethereum/L2 adapter with pre-configured chains (Ethereum, Polygon, Arbitrum, Optimism, Base)
- `ChainAdapter<TConfig>` generic interface in `src/adapters/types.ts`
- **Webhook system**: subscription management, HMAC-SHA256 signature verification, async dispatch
- **SDK generation**: `npm run sdk:generate` produces a TypeScript client SDK (`sdk/client.ts`)
- `OgiClient` class with type-safe methods for all API endpoints

## [0.0.8] - 2026-03-18

### Added
- **Admin UI**: server-rendered dashboard using htmx (no SPA framework)
- Feature-flagged behind `ENABLE_ADMIN=true` env var
- Session-based authentication with `ADMIN_PASSWORD` env var
- Dashboard page: countries, users, API keys, request stats
- API key management page: create/revoke keys with tier selection
- Audit log page with htmx live-refresh every 10 seconds
- Login/logout flow with HttpOnly session cookies
- `@fastify/formbody` for form POST parsing

## [0.0.7] - 2026-03-18

### Added
- PostgreSQL migration schema (`src/db/migrations/001_initial.sql`, `002_add_request_quotas.sql`)
- PostgreSQL adapter (`src/db/pg-adapter.ts`) with `DATABASE_URL` config
- Migration runner script (`npm run db:migrate`)
- `DB_BACKEND` env var to switch between `sqlite` and `postgres`
- `data_snapshots` table for storing country data versions

## [0.0.6] - 2026-03-18

### Added
- `POST /v1/income/batch` endpoint: batch calculate entitlements for multiple countries in a single request, with partial failure handling and configurable max batch size (`BATCH_MAX_ITEMS`, default 50)
- `GET /v1/income/countries/:code` endpoint: retrieve full country details including all economic stats
- `GET /v1/income/rulesets/:version` endpoint: retrieve a single ruleset by version string
- `getRulesetByVersion()` function in `src/core/rulesets.ts`
- OpenAPI 3.0 spec auto-generated from route definitions via `@fastify/swagger`
- Swagger UI served at `/docs` via `@fastify/swagger-ui`
- Security headers via `@fastify/helmet` (X-Content-Type-Options, X-Frame-Options, CSP, HSTS, etc.)
- CORS support via `@fastify/cors` (configurable via `CORS_ORIGIN` and `CORS_METHODS` env vars)
- Per-IP rate limiting via `@fastify/rate-limit` (configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` env vars, `/health` exempt)
- `RATE_LIMIT_EXCEEDED` and `BATCH_TOO_LARGE` error codes
- `VALIDATION_ERROR` error code for Fastify schema validation failures
- `ServerOptions` interface for `buildServer()` to allow test-time configuration overrides
- Comprehensive tests for all new endpoints, security headers, CORS, rate limiting, and OpenAPI docs (70 total tests)

### Changed
- `buildServer()` now accepts optional `ServerOptions` parameter for rate limit configuration
- Error handler enhanced to correctly handle 429 rate limit responses and Fastify validation errors

## [0.0.5] - 2026-03-17

### Added
- `BaseUnit` type alias (`'PPP-USD/month'`) and `BASE_UNIT` constant in `src/core/types.ts` — formalises the internal base unit concept
- `src/adapters/types.ts`: `TokenAmount` interface and `ChainAdapter<TConfig>` generic interface for chain-agnostic adapter contracts
- `src/adapters/solana/index.ts`: Solana adapter (`solanaAdapter`) implementing `ChainAdapter<SolanaAdapterConfig>` — maps `GlobalIncomeEntitlement` to any SPL token amount (pure calculation, no chain writes)
- `src/adapters/solana/program-types.ts`: TypeScript type definitions for a future on-chain Solana program account layout (`EntitlementAccount`)
- `src/adapters/solana/index.test.ts`: unit tests for the Solana adapter (token amount calculation, custom rates, metadata)

## [0.0.4] - 2026-03-17

### Added
- `ARCHITECTURE.md`: full module breakdown, dependency rules, ASCII data-flow diagram, and key design decisions
- `RULESET_V1.md`: complete formula specification for Ruleset v1 with constants, rationale, worked examples (DE/BR/BI), data source table, and versioning policy
- `CONTRIBUTING.md`: development setup, code style guide, testing requirements, PR checklist, and guides for adding country data, new rulesets, and chain adapters
- `CODE_OF_CONDUCT.md`: Contributor Covenant v2.1
- `src/api/routes/income.test.ts`: API-level integration tests using Fastify `inject()` (happy path, case-insensitive lookup, missing parameter, unknown country)
- `.github/workflows/ci.yml`: GitHub Actions CI — runs type-check and full test suite on every push and pull request
- `npm run typecheck` script (`tsc --noEmit`)

### Changed
- `README.md`: updated with links to new docs, `typecheck` script, chain adapters section, Contributing section, and current status

## [0.0.2] - 2026-03-17

### Added
- Real World Bank dataset with 49 countries across all four income groups (HIC, UMC, LMC, LIC)
- Ruleset v1: deterministic entitlement formula using GNI per capita and Gini inequality index
- `gniPerCapitaUsd` and `incomeGroup` fields on `CountryStats`
- `IncomeGroup` type (`HIC` | `UMC` | `LMC` | `LIC`)
- World Bank data source documentation (`src/data/worldbank/README.md`)
- Automated World Bank data importer (`npm run data:update`)
- Admin-editable `config.json` for all importer tunables (data sources, indicators, countries, income thresholds, output rounding)
- Modular importer pipeline: config → fetch → transform → validate → write
- Importer validates output before overwriting `countries.json` (same rules as test suite)
- Retry with exponential backoff for World Bank API calls
- Comprehensive unit tests: Ruleset v1 (10), data loader (6), importer (22)
- This CHANGELOG

### Changed
- Default port changed from 3000 to 3333
- Rules engine now uses GNI per capita (instead of GDP) as the income reference
- Gini inequality index now amplifies the need score (weighted at 0.15)
- Global income floor updated from $200 to $210 PPP-USD/month (based on World Bank upper-middle-income poverty line of $6.85/day)
- `ruleset_version` changed from `stub-v0.0.1` to `v1`
- `data_version` changed from `dummy-2026-03-01` to `worldbank-2023`
- Dummy 3-country dataset replaced with 49 real countries

## [0.0.1] - 2026-03-17

### Added
- Project scaffold: TypeScript + Fastify + Vitest
- Core domain types: `Country`, `CountryStats`, `GlobalIncomeEntitlement`, `RulesetMeta`
- Stub rules engine with $200 PPP-USD/month global income floor
- Dummy dataset for 3 countries (DE, BR, NG)
- REST endpoint `GET /v1/income/calc?country=XX`
- Health endpoint `GET /health`
- Dockerfile and docker-compose.yml
- MIT license
