# Capabilities

What Open Global Income does today, layer by layer, what the shipped data
actually contains, and how each release got here. For running, configuring
and calling the platform see [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md); for the
short version see the [README](../README.md).

**Contents:** [Built](#built-v026) · [Evidence layer](#phase-23-evidence-layer-) · [Data provenance](#data-provenance) · [Rulesets](#rulesets) · [Funding & impact models](#funding-and-impact-models) · [Public site](#public-site) · [Admin UI](#admin-ui) · [Chain adapters](#chain-adapters) · [Disbursement providers](#disbursement-providers) · [Release history](#release-history)

---

## Built (v0.2.6)

**The API is the product.** Everything below is exposed through a REST API with OpenAPI docs, a generated TypeScript SDK, and webhook events — not locked behind a UI.

| Layer | What it does | Phase |
|-------|-------------|-------|
| **Data** | 49 countries — 18 World Bank macro-economic indicators plus 4 ILO social-protection indicators per country ([caveats](#data-provenance)); sub-national data for Kenya (47 counties), Germany (16 Bundesländer), France (13 regions), Netherlands (12 provinces) — 88 regions total | 14, 17 |
| **Calculation** | The v1 entitlement formula (v2 is a [published specification, not an implementation](#ruleset-v2-preview--specification-only)), scoring, country comparison, regional COL adjustments; a locally-calibrated adequacy estimate reported alongside the fixed $210 global anchor (informational — never fed into the entitlement) | 1–10, 17, 28 |
| **Simulation** | Budget modeling with targeting presets and programmable rules, multi-country comparison, regional simulation, saved scenarios | 11, 17, 22 |
| **Disbursement** | Non-custodial payment rails — Solana USDC, EVM USDC, M-Pesa B2C (Daraja instruction batch), SEPA Credit Transfer (ISO 20022 pain.001 + Wise skeleton) — with approval workflow and audit trail | 12 |
| **Recipients** | Enrollment, identity verification, cross-program duplicate detection — no raw identity data stored | 19 |
| **Identity** | Four pluggable, non-custodial verification connectors (national ID / MOSIP-Verhoeff, mobile-money MSISDN, wallet EVM/Solana, NGO community attestation); `POST /v1/recipients/:id/verify` runs a claim through a provider and stores only the derived hash + routing ref | 26 |
| **Pilots** | Lifecycle management (planning → active → completed), programmable targeting rules, variance analysis, structured donor reports | 13, 22 |
| **Audit Exports** | Compliance-grade signed export per pilot — methodology, recipient aggregate stats, full disbursement log, SHA-256 integrity hash | 21 |
| **Targeting** | Programmable `TargetingRules` object: age range, urban/rural, income ceiling, identity provider filter, recency exclusion, region filter; `applyRulesToRecipients` for disbursement batch generation with per-rule filtering stats | 22 |
| **Funding** | 7 domestic funding mechanisms (income tax, VAT, carbon tax, wealth tax, FTT, automation tax, redirect social spending) with informality, avoidance, and demand-response adjustments; fiscal context analysis; an 8th mechanism — a labeled international solidarity transfer — covers the residual when the recommended mix still can't close the cost domestically | 15, 28 |
| **Impact** | Poverty reduction, purchasing power, social coverage, GDP stimulus estimates — with exportable policy briefs | 16 |
| **Public site** | Advocacy-facing web UI at `/` — country fact sheets with copy-ready citations, cost & funding calculator with shareable scenario URLs, country comparison, methodology, dataset downloads | 27 |

The funding and impact layers (Phases 14–16) are not a departure from the API — they are the **demand-side tools** that make the API worth building. A calculation engine answers "how much per person?" but nobody funds a program based on that alone. Governments need to see where the money comes from. Donors need to see what happens to poverty. NGOs need a policy brief they can attach to a grant proposal. These layers turn the API into a tool that **sells basic income to policymakers**.

The sub-national data layer (Phase 17) brings precision where it matters most. A basic income floor in Nairobi (COL 1.35×) should not be the same local-currency amount as in rural Turkana (COL 0.68×). Regional cost-of-living indices adjust the national PPP conversion factor, and existing formulas work transparently via the "adjusted Country" pattern — zero formula changes needed.

Secure admin UI with login, approval workflows, and audit trails — plus a public, no-login advocacy site at `/` for journalists, researchers and policy makers. **734 tests** across 40 suites.

## Phase 23: Evidence Layer ✅

- Record recipient- or control-cohort measurements per pilot (employment, income, food security, school attendance, poverty, health, savings)
- Pre/post comparison with numeric deltas, and projected vs. actual against the linked impact analysis
- Anonymized cross-program benchmark statistics (median, p25, p75 per indicator), filterable by country, income group, and coverage
- CSV or JSON research export for academic partners
- Admin evidence page per pilot: record form, comparison table, full measurement history

Endpoints are listed under [Evidence](DEVELOPER_GUIDE.md#evidence) in the developer guide. **Not** included: randomized treatment assignment, statistical significance testing, confidence intervals, or survey delivery — measurements are fed in through the API. See [Next](../README.md#-what-it-takes-next) for what a research-grade design still needs.

---

## Data Provenance

Transparency cuts both ways, so the current state of the shipped dataset is stated plainly here.

`src/data/countries.json` carries 49 countries under `dataVersion: worldbank-2023`. Per country it holds **18 World Bank macro-economic indicators** (GDP and GNI per capita, GDP per capita PPP, PPP conversion factor, Gini, population, tax revenue, social-protection spending, inflation, labour-force participation, unemployment, government debt, social contributions, poverty headcount, GDP growth, health and education expenditure, urbanization) and **4 ILO social-protection indicators** (overall coverage, ILO-basis expenditure, pension coverage, child-benefit coverage).

Three caveats matter if you are citing these figures:

- **The committed snapshot is seeded, not fetched.** The values shipped in the repository are manually seeded estimates based on published indicator ranges — the file says so in its own `source` field. Run `npm run data:update` to replace them with live World Bank / ILO API data before using the numbers for anything that matters. Everything downstream (entitlements, simulations, funding, impact) is only as good as this snapshot.
- **Coverage is near-complete, not complete.** Gini is absent for Singapore and Afghanistan; Singapore additionally lacks poverty headcount and child-benefit coverage, and Afghanistan is missing 13 of the 22 indicators (the fiscal, expenditure, and social-protection series not published for it). Every other country carries all 22. The API returns `null` for absent fields rather than imputing, and the calculation model degrades explicitly (e.g. the Gini penalty is skipped when Gini is unavailable).
- **Some defined fields carry no data at all.** `stats.taxBreakdown` (IMF) is empty for every country — the importer in `src/data/imf/` exists but has not been run into the snapshot (`"IMF fiscal breakdown: not available"` in its own completeness report). The same is true of the tiered poverty headcounts `relativePovertyHeadcountRatioPercent`, `povertyHeadcountRatio685Percent` and `povertyHeadcountRatio365Percent`, which the impact model reads but which are populated for 0 of 49 countries — see the [poverty-reduction caveat](#funding-and-impact-models).

`GET /v1/income/countries/:code` returns per-field values as stored, and the admin country dashboards show a data-completeness indicator per country.

---

## Rulesets

### Ruleset v1 (active)

```
pppUsdPerMonth  = 210                                (global floor, PPP-USD/month)
localCurrency   = pppUsdPerMonth × pppConversionFactor
incomeRatio     = 210 / (gniPerCapitaUsd / 12)
giniPenalty     = (giniIndex / 100) × 0.15           (0 if Gini unavailable)
score           = clamp(incomeRatio + giniPenalty, 0, 1)
```

- **$210/month** — derived from the World Bank upper-middle-income poverty line ($6.85/day)
- **GNI per capita** (not GDP) — reflects what residents actually earn
- **Gini penalty** — amplifies need for high-inequality countries

See [RULESET_V1.md](../RULESET_V1.md) for the full specification.

### Ruleset v2 (preview — specification only)

Extends v1 with HDI and urbanization factors:

```
hdiAdjustment = (1 - hdi) × 0.10
urbanPenalty  = (1 - urbanizationRate) × 0.05
score         = clamp(incomeRatio + giniPenalty + hdiAdjustment + urbanPenalty, 0, 1)
```

v2 is **published, not implemented.** It exists as an entry in the ruleset registry (`src/core/rulesets.ts`) so the proposed formula and its parameters are queryable and reviewable via `GET /v1/income/rulesets/v2` — there is no `calculateEntitlement` variant behind it, and `hdi` is not yet a field on `CountryStats`. Implementing it requires a UNDP HDI data source first. Every calculation the API performs today is v1.

---

## Funding and impact models

**Supported funding mechanisms:** income tax surcharge, VAT increase, carbon tax, wealth tax, financial transaction tax, automation tax, redirect social spending — 7 domestic levers, each returning explicit assumptions and revenue estimates — plus an 8th, `international_solidarity_transfer`, which the country fact sheet's recommended mix (`calculateRecommendedFundingMix`) appends automatically to label any residual gap left after the seven domestic mechanisms are sized at realistic ceilings, instead of leaving it as an unlabeled shortfall.

Endpoints: `POST /v1/simulate/fiscal`, `POST /v1/simulate/fund`, and saved scenarios under `/v1/funding-scenarios` — see [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md#funding--fiscal-simulation).

**Four impact dimensions — every assumption explicitly listed:**
- **Poverty reduction** — how many people are lifted above the **country-appropriate** poverty line, picked by the ladder in `src/core/poverty.ts` (HIC → 60% of median income; otherwise the World Bank $6.85/day UMC, $3.65/day LMC, or $2.15/day LIC line), with the $2.15/day extreme line reported alongside as a secondary figure. **Caveat:** the headcount ratio at the resolved line is currently only in the dataset for LIC countries, so the other 39 fall back to the clearly-labelled extreme-line figure — see [IMPACT_METHODOLOGY.md](../IMPACT_METHODOLOGY.md#-current-data-limitation)
- **Purchasing power** — % income increase for the bottom quintile (Lorenz curve model)
- **Social coverage** — people currently uncovered by social protection, newly reached
- **GDP stimulus** — Keynesian fiscal multiplier calibrated by income group (LIC=2.3×, LMC=1.9×, UMC=1.5×, HIC=1.1×)

See [IMPACT_METHODOLOGY.md](../IMPACT_METHODOLOGY.md) for full model documentation.

---

## Public Site

A public, no-login web UI at `/` built for the people making the case for basic income — journalists, researchers, and policy makers. Server-rendered, readable without JavaScript, print-friendly, and every scenario is fully encoded in the URL so figures are shareable and reproducible. Disable with `ENABLE_WEB=false`.

- **`/countries`** — sortable explorer of all 49 countries with headline figures and CSV/JSON download
- **`/countries/:code`** — per-country fact sheet: copy-ready summary paragraph and citation, cost in fiscal context (vs. tax revenue and social spending), targeted program options, impact estimates with every assumption listed, a **recommended funding mix** sized to the country's own economic profile, and the entitlement formula with the country's own numbers plugged in. Print → PDF yields a briefing document
- **`/calculator`** — cost & funding calculator: coverage, target group, duration, transfer amount, and **live taxation sliders** for all seven funding mechanisms — results, impact and funding coverage update as you drag, and the URL tracks every change so scenarios stay reproducible
- **`/compare`** — up to four countries side by side on identical terms
- **`/methodology`** — every formula, constant, assumption, data source, and limitation; values imported from the actual code constants
- **`/data`** — dataset downloads (`/data/countries.csv`, `/data/countries.json`) and API pointers

---

## Admin UI

Server-rendered dashboard using htmx (no SPA). Mounted by default; disable with `ENABLE_ADMIN=false`.

**Login:** Default credentials are username `admin` / password `admin` (both configurable via `ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars).

- **Dashboard** — country count, users, API keys, request stats
- **API Key Management** — create and revoke keys with tier selection
- **Audit Log** — recent API requests with live-refresh
- **Simulate** — budget simulations with live cost preview, comparison, save/delete
- **Compare** — side-by-side country comparison on identical parameters
- **Funding** — interactive scenario builder with slider controls for all seven domestic funding mechanisms, stacked bar chart, fiscal context panel, and assumption transparency
- **Impact** — economic impact analyzer with poverty reduction, purchasing power, social coverage, and GDP stimulus estimates; tabbed breakdown, policy brief export
- **Pilots** — create and manage pilots, link disbursements, track status, view variance, generate the audit export
- **Programs** — assemble and print a program summary from a saved simulation
- **Evidence** — record outcome measurements per pilot and view the cross-program aggregate benchmarks
- **Identity & Recipients** — connector catalog with a verify form, plus a full recipient registry console: enrol, filter, paginate, per-recipient detail with status transitions, bulk CSV import and CSV export
- **Countries** — economic dashboards with data completeness indicators
- **Regions** — sub-national data browser with COL index badges, entitlement comparison (national vs. regional)
- **Data Sources** — registry of configured import sources with refresh and edit controls

Access at `http://localhost:3333/admin/login`. Sessions are secure (HttpOnly cookies, PBKDF2-hashed passwords) with brute-force protection (15-minute lockout after 5 failed attempts).

---

## Chain Adapters

Adapters map entitlements (PPP-USD/month) to concrete token amounts. Pure calculation — no chain writes.

- **Solana** (`src/adapters/solana/`) — SPL token amounts via configurable exchange rate
- **EVM** (`src/adapters/evm/`) — Ethereum, Polygon, Arbitrum, Optimism, Base

See `src/adapters/types.ts` for the `ChainAdapter<TConfig>` interface.

---

## Disbursement Providers

Non-custodial — calculates and prepares payment instructions, never holds or moves funds. The mobile-money and bank connectors follow the same pattern as the crypto adapters: they emit a format-correct, ready-to-execute instruction in the exact shape the existing rail consumes (Safaricom Daraja, ISO 20022 / Wise), which the program operator submits from their own authenticated environment. OGI builds no payment service and stores no recipient PII; identity/KYC is delegated entirely to the executing provider.

| Provider | ID | Currency | Notes |
|----------|-----|----------|-------|
| Solana USDC | `solana` | USDC | Returns unsigned tx payload for multisig signing |
| EVM USDC | `evm` | USDC | Unsigned ERC-20 calldata for Ethereum/Polygon/Arbitrum/Optimism/Base |
| M-Pesa B2C | `safaricom` | KES | Prepares a Daraja **B2C PaymentRequest** instruction batch (endpoints, request template) for the operator to submit — no funds moved, no MSISDNs stored |
| SEPA Credit Transfer | `sepa` | EUR | Prepares an **ISO 20022 pain.001** document + a Wise Payouts bulk skeleton; PPP-USD→EUR via the maintained FX snapshot. Accepts Wise webhooks at `/v1/webhooks/inbound/sepa` |

---

## Release history

**Version 0.2.6** — Documentation audit against the code, across `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `IMPACT_METHODOLOGY.md`, `GOVERNANCE.md`, `GOVERNMENT_READINESS.md`, `ROADMAP.md`, `USECASE.md` and `.env.example`. The dataset is now described as it actually is — 18 World Bank + 4 ILO indicators, a manually seeded rather than fetched snapshot, two countries with gaps, and several defined fields carrying no data — in a new **Data Provenance** section, instead of "all 17 indicators fully populated". Ruleset v2 is identified as a published specification with no implementation behind it. The poverty-reduction dimension is documented against the country-appropriate ladder it actually uses, along with the previously unstated fact that only LIC countries have a headcount at their resolved line, so the other 39 fall back to the labelled $2.15/day figure. The environment-variable table matches `src/config.ts` (notably: `ENABLE_ADMIN` is on by default, not opt-in), the endpoint tables gained the recipient, identity, evidence, audit-export and inbound-webhook routes that shipped undocumented, and the webhook list gained three missing event types. One source line changed: `POST /v1/impact/brief` was printing a nonexistent repository URL into every exported policy brief. 730 tests across 39 suites.

**Version 0.2.5** — Continuous integration, and a fix to the phase numbering. GitHub Actions now runs `npm ci`, `npm run typecheck`, and `npm test` on every pull request and on pushes to `main` (`.github/workflows/ci.yml`) — the docs had described CI for several releases, but no workflow file was ever committed, so pull requests showed zero checks. Lint and format checks stay manual for now: both fail on pre-existing issues, and clearing that is its own change. Separately, the identity connectors and public site had been labelled Phases 24 and 25 here while `ROADMAP.md` reserves those numbers for the unbuilt Scenario Versioning and Multi-tenancy phases; the shipped work is renumbered to Phases 26–28 and documented in the roadmap. 730 tests across 39 suites.

**Version 0.2.4** — Implements the first phases of [INCOME_FLOOR_PROPOSED_ANSWERS.md](../INCOME_FLOOR_PROPOSED_ANSWERS.md): a **local adequacy estimate** now appears next to the $210 PPP global anchor everywhere it's shown (calc API, simulation output, fact sheets, admin dashboard) — informational only, derived from the existing country-appropriate poverty line, never fed into the entitlement itself; a one-click "use local adequacy estimate" override on the public calculator; and an eighth, explicitly-labeled **international solidarity transfer** funding mechanism that attributes any residual gap (after the seven domestic mechanisms hit realistic ceilings) to a modeled external transfer instead of an unlabeled shortfall. 730 tests across 39 suites.

**Version 0.2.3** — The fact-sheet funding mix now explains itself when domestic coverage is low: for countries where universal coverage would cost more than the country's own GDP (common at the low-income end, e.g. Afghanistan), a callout states that plainly instead of leaving readers to assume it's a tax-rate shortfall, and points to external funding or a narrower coverage target. 708 tests across 38 suites.

**Version 0.2.2** — Rotating wireframe globe on the landing page hero (dependency-free canvas animation), and a country-specific **recommended funding mix** on fact sheets — replacing the old fixed-rate 7-mechanism package (which could show wildly over- or under-shooting coverage depending on the country) with rates sized to each country's own formality, tax base, wealth concentration, and social-spending profile, water-filled across mechanisms toward full coverage. 708 tests across 38 suites.

**Version 0.2.1** — Live taxation sliders on the public calculator. The interactive funding-scenario experience from the admin panel is now public: all seven mechanisms (income tax, VAT, carbon tax, wealth tax, FTT, automation tax, redirected social spending) are sliders whose results — cost coverage, gap, chart, impact estimates — update live as you drag, with the URL tracking every change so a dragged-together scenario is still a shareable, reproducible link. Plain-GET fallback works without JavaScript. Also fixes horizontal bar charts showing tick indices instead of category labels. 701 tests across 38 suites.

**Version 0.2.0** — Public advocacy site. A new no-login web UI at `/` (`src/web/`) gives journalists, researchers and policy makers directly quotable, verifiable basic income figures: per-country **fact sheets** with copy-ready summary paragraphs and citation blocks, a **cost & funding calculator** whose entire scenario lives in a shareable URL, **country comparison** on identical terms, a **methodology** page whose numbers are imported from the actual code constants, and **dataset downloads** (CSV/JSON) with computed entitlement and cost columns. Print any fact sheet or calculator result to get a briefing PDF. Poverty figures fall back to the $2.15/day extreme line (clearly marked) where no survey exists for the country-appropriate line. Disable with `ENABLE_WEB=false`. 699 tests across 38 suites.

**Version 0.1.34** — PPP-consistent "% of GDP" everywhere. A new `gdpPerCapitaPppUsd` field (World Bank `NY.GDP.PCAP.PP.CD`) is added to all 49 countries and used as the GDP base wherever a PPP-denominated cost or revenue is expressed as a share of GDP — fixing a distortion that inflated the cost-as-%-of-GDP headline for low-income countries by roughly the PPP gap (Kenya's 20%-coverage figure drops from 24.0% to 7.7%; Nigeria from 23.1% to 2.8%). Simulation, funding, impact, savings, and the admin projection chart all share the PPP unit; funding mechanisms now emit genuine PPP-USD revenue. 671 tests across 37 suites.

**Version 0.1.33** — Recipient registry export, the round-trip counterpart to bulk import. `GET /v1/recipients/export` returns the (optionally filtered) registry as CSV or JSON (`?format=json`) as a download, and a **Download CSV** button on the admin recipients card (`/admin/identity`) streams the same, honouring the active filters. The first five CSV columns are import-compatible, so an export reads straight back through the importer; serialisation lives in a pure core module (`src/core/recipient-export.ts`). 671 tests across 37 suites.

**Version 0.1.32** — Recipient admin UI & bulk import. The Identity Providers page (`/admin/identity`) becomes a full recipient registry console: enrol a recipient from the UI, filter/paginate the registry by country, status, and pilot, and open a per-recipient detail page with status-transition controls that enforce the same `pending → verified → suspended` rules as the API. A **bulk import** form ingests pasted CSV (`countryCode` required; `paymentMethod,accountHash,routingRef,identityProvider` optional), skipping rows whose account hash is already enrolled in the same country (cross-program de-duplication) and reporting a per-line created/skipped/errored summary. CSV parsing lives in a pure, I/O-free core module (`src/core/recipient-import.ts`). 660 tests across 36 suites.

**Version 0.1.31** — Identity provider connections, the first item on the gov-ready list. The `IdentityProvider` interface now ships with four concrete, non-custodial connectors in a registry (`src/identity/`), one per deployment context: **national-id** (MOSIP-compatible, Verhoeff check digit), **mobile-kyc** (E.164 MSISDN), **wallet** (EVM / Solana), and **community-attestation** (NGO witness quorum). A new `POST /v1/recipients/:id/verify` runs a recipient's claim through a provider, marks the recipient `verified`, runs cross-program duplicate detection on the derived hash, and discards the raw claim — only the non-reversible `accountHash` + `routingRef` are stored. `GET /v1/identity/providers` exposes the catalog, and a new **Identity Providers** admin page (`/admin/identity`) lists the connectors and offers a verify form. Each connector does deterministic offline format/checksum validation and delegates the authoritative KYC/personhood assertion to the external provider. 638 tests across 34 suites.

**Version 0.1.30** — M-Pesa and SEPA promoted from stubs to real non-custodial connectors. The M-Pesa provider now emits a Safaricom Daraja **B2C PaymentRequest** instruction batch (env-correct endpoints + a populated request template, secrets never echoed); the SEPA provider emits a standards-compliant **ISO 20022 pain.001** document plus a Wise Payouts bulk skeleton, converting PPP-USD→EUR via the maintained FX snapshot (replacing the old hardcoded rate) and surfacing the applied rate + provenance. Both follow the crypto adapters' non-custodial pattern — OGI prepares operator-executable instructions, stores no recipient PII, and delegates identity/KYC to the executing provider. The `DisbursementProvider.submit`/`checkStatus` interface now receives the channel config so connectors can populate originator fields. 608 tests across 32 suites.

See [CHANGELOG.md](../CHANGELOG.md) for full version history.
