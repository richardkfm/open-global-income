# Open Global Income

## Mission

Open Global Income is building the **shared infrastructure layer for universal basic income** — the neutral, auditable protocol that any government, NGO, or DAO can build on to deliver income floors to people.

This is not a charity. Not a DAO. Not a government program. It is the **rails** — like what OpenStreetMap did for geographic data, or what SMTP did for email. A shared standard that makes every program built on top of it cheaper, faster, and more trustworthy than if they built alone.

---

## The Problem

Every basic income pilot reinvents the wheel.

A government ministry in Kenya builds its own cost model from scratch. An NGO in Mozambique builds a different one. A DAO distributing USDC builds a third. None of them can compare results, share infrastructure, or learn from each other's data — because there is no common layer.

The consequences:

- **Duplicated effort** — each program builds its own calculation model, targeting logic, payment integration, and reporting pipeline
- **No shared standard** — there is no agreed-upon, auditable answer to "how much should a person in country X receive as a basic income floor?"
- **No interoperability** — a pilot in Kenya cannot share infrastructure with one in Tanzania, even though the underlying economics are similar
- **No evidence accumulation** — outcome data stays locked in individual program silos, invisible to researchers and policymakers elsewhere
- **Trust deficit** — donors and taxpayers cannot independently verify how amounts are calculated or whether money reaches recipients

The result: billions in potential funding remains uncommitted because the infrastructure to deploy it transparently does not exist.

---

## The Vision: Six Layers

Open Global Income is a stack. Each layer builds on the one below it. The lower layers are useful on their own; the upper layers multiply their impact.

```
┌─────────────────────────────────────────────────┐
│  FEDERATION                                     │
│  Multi-program interop, cross-border portability│
├─────────────────────────────────────────────────┤
│  EVIDENCE                                       │
│  Impact measurement, outcome tracking, research │
├─────────────────────────────────────────────────┤
│  DISTRIBUTION                                   │
│  Payment rails — crypto, mobile money, bank     │
├─────────────────────────────────────────────────┤
│  SIMULATION                                     │
│  Budget modeling, targeting, cost projection     │
├─────────────────────────────────────────────────┤
│  CALCULATION                                    │
│  Entitlement formulas, scoring, rulesets        │
├─────────────────────────────────────────────────┤
│  DATA                                           │
│  World Bank indicators, country economics       │
└─────────────────────────────────────────────────┘
```

| Layer | Question it answers | Status |
|-------|-------------------|--------|
| **Data** | What are the economic facts? | Done — 49 countries, World Bank 2023 + ILO + IMF; sub-national data for Kenya (47 counties) |
| **Calculation** | How much per person? How urgent is the need? | Done — Ruleset v1 active, v2 preview; regional COL adjustments |
| **Simulation** | What will it cost to cover X% of the population? | Done — Phase 11; national + regional simulation |
| **Distribution** | How does money reach people? | Done — Phase 12–13; Solana, EVM, M-Pesa (stub) |
| **Evidence** | Is it working? Can we prove it? | Next |
| **Federation** | Can programs share infrastructure across borders? | Future |

Each layer is independently useful. A government can use just Data + Calculation to inform policy. An NGO can add Simulation to write grant proposals. A DAO can plug in Distribution to move funds. The full stack, once complete, supports end-to-end basic income delivery with built-in accountability.

---

## What's Built (v0.1.7)

All seven phases are complete. The platform covers the full workflow from "how much per person?" through "where does the money come from?" to "what happens to poverty?" — with regional precision.

**Phase 11 — Budget Simulation Engine** ✅
- `POST /v1/simulate` — model cost for a country with coverage %, targeting presets, duration
- Multi-country comparison — side-by-side cost analysis for pilot site selection
- Saved simulations — persist and share scenarios
- Admin UI with live cost preview

**Phase 12 — Disbursement Integration** ✅
- Provider interface — pluggable payment rails (crypto, mobile money, bank)
- Solana USDC & EVM providers — non-custodial, generates unsigned transactions
- M-Pesa stub — documented interface ready for real integration
- Approval workflow — draft → approved → submitted → completed
- Full audit trail on every disbursement

**Phase 13 — Pilot Dashboard** ✅
- Pilot lifecycle — planning → active → paused → completed
- Links simulations to disbursements — tracks actual vs. projected spend
- Structured reports for donors and auditors
- Admin UI with timeline, summary cards, and variance analysis

**Phase 14 — Macro-Economic Data Expansion** ✅
- 17+ indicators per country from World Bank, ILO, and IMF
- Fiscal, social, labor, and expenditure data
- Admin country dashboards with data completeness indicators

**Phase 15 — Funding & Fiscal Simulation** ✅
- 6 funding mechanism calculators (income tax, VAT, carbon tax, wealth tax, FTT, redirect)
- Fiscal context analysis and coverage gap assessment
- Interactive admin scenario builder with live preview

**Phase 16 — Economic Impact Modeling** ✅
- 4 impact dimensions: poverty reduction, purchasing power, social coverage, GDP stimulus
- Exportable policy briefs with every assumption explicitly listed
- See [IMPACT_METHODOLOGY.md](./IMPACT_METHODOLOGY.md) for full model documentation

**Phase 17 — Sub-national Data** ✅
- Regional cost-of-living adjustments via the "adjusted Country" pattern
- Kenya seed data: all 47 counties with COL indices, population, urban/rural, poverty rates
- 4 new API endpoints: `GET /regions`, `GET /regions/:id`, `GET /calc/regional`, `POST /simulate/regional`
- Admin region list and detail pages with national vs. regional entitlement comparison

**387 tests** across 23 suites. Typecheck clean. CI green.

---

## Near Term: Expanding Coverage & Evidence

### More Countries (Sub-national)

The region data format and loader are country-agnostic. Each country needs a curated entry in `src/data/regions.json` with cost-of-living indices sourced from national statistics bureaus. Priority countries:

- Tanzania, Uganda, Mozambique (East Africa pilots)
- Ghana, Nigeria (West Africa scale)
- India (largest potential beneficiary population)

### Evidence Layer

Programs live or die on evidence. This is the layer that closes the loop between "we projected X impact" and "here's what actually happened."

- **Pre/post metrics** — track economic indicators for recipient populations over time
- **Control group support** — structured comparison between recipient and non-recipient cohorts
- **Outcome surveys** — configurable survey instruments delivered through the same channels as payments
- **Research-grade exports** — anonymized, aggregated datasets in formats academic partners can use directly (CSV, Parquet, SPSS)
- **Impact dashboards** — visual summaries for non-technical stakeholders

---

## Medium Term: Real-World Deployment Infrastructure

These capabilities close the gap between "platform" and "program people trust with real money."

### Identity & Enrollment

The platform defines **integration points**, not implementations. Different contexts need different identity systems:

- Government programs → national ID, civil registry
- NGO programs → biometric enrollment, community verification
- DAO programs → wallet-based identity, soulbound tokens

OGI provides the `IdentityProvider` interface. Implementers plug in their own verification. The platform never stores biometric data — it stores verified claims (e.g., "this person was verified by provider X at time T").

### Live M-Pesa Integration

The stub provider (`src/disbursements/providers/mpesa.ts`) documents the full Safaricom B2C interface. Real integration requires API credentials and compliance approvals.

### Multi-currency Settlement

Real programs pay through multiple channels simultaneously:

- M-Pesa for mobile money users in Kenya
- Bank transfer for urban recipients with accounts
- USDC for crypto-native distribution
- Central reconciliation across all rails
- Live exchange rate feeds (not static config)
- Settlement reporting with currency-level breakdowns

---

## Long Term: The Protocol

This is the north star. Not a product — a **protocol** that outlives any single organization.

### Federation

Multiple independent programs — run by different governments, funded by different donors, operating in different countries — sharing a common entitlement standard and identity layer.

A Kenyan government program and a GiveDirectly pilot in the same country can:
- Use the same calculation model (or deliberately different ones, with the difference auditable)
- Share anonymized outcome data
- Avoid paying the same person twice
- Compare cost-efficiency on equal terms

### Portability

A person who moves from Kenya to Tanzania should not lose their entitlement history. The federation layer enables:
- Cross-border entitlement transfer
- Continuous enrollment across programs
- Portable identity claims (without centralizing personal data)

### Policy Simulation at Scale

Governments model national UBI before committing — using real data, real cost models, and confidence intervals derived from actual pilot outcomes:

- "What would universal basic income cost Ghana, phased in over 5 years?"
- "What was the employment effect in comparable pilots in East Africa?"
- "What coverage rate optimizes impact per dollar spent?"

These questions become answerable when the evidence layer aggregates data across programs.

### Open Evidence Base

Anonymized, aggregated outcome data from all programs on the federation — freely available for research. This is the dataset that currently does not exist: a cross-country, cross-program, standardized evidence base for basic income.

Every program that joins the federation contributes to the evidence base. Every program benefits from the accumulated evidence of all others.

### Self-sustaining Governance

The protocol is governed by its users — governments, NGOs, DAOs, researchers — not by any single entity. Governance includes:

- Ruleset proposals and approval (who can change the formula?)
- Data source additions (which indicators are trusted?)
- Federation membership (who can join?)
- Evidence standards (what counts as rigorous?)

The governance model evolves from benevolent-maintainer (now) to multi-stakeholder (medium term) to protocol-level governance (long term).

---

## Who This Is For

### Governments
Model costs before committing. Run pilots with built-in accountability. Generate evidence that survives political cycles. Compare your program's efficiency against others on equal terms.

### NGOs
Compare candidate countries with real data. Manage disbursements through integrated payment rails. Generate structured reports for donors without building custom reporting infrastructure. Accumulate evidence across programs.

### DAOs & ReFi
On-chain distribution backed by an auditable, World Bank-grounded calculation model. Non-custodial disbursement via Solana and EVM adapters. Transparent scoring that donors can independently verify.

### Researchers
Access standardized economic data and outcome metrics across programs. Research-grade exports in standard formats. The cross-country evidence base for basic income that the field needs but does not yet have.

### Donors
Track where money goes. Verify it reaches recipients. Compare program efficiency across countries and implementing organizations. Fund infrastructure once, benefit every program that uses it.

---

## Development Guide

### Tech Stack

- **Runtime:** Node.js + TypeScript
- **API:** Fastify with OpenAPI/Swagger at `/docs`
- **Database:** SQLite (default) / PostgreSQL (production)
- **Admin UI:** Server-rendered HTML + htmx (no SPA)
- **Testing:** Vitest — 387 tests across 23 suites
- **Metrics:** Prometheus via prom-client at `/metrics`
- **CI:** GitHub Actions (typecheck + test on every push)

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server with hot-reload
npm test             # Run all tests
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run build        # Production build
npm start            # Start production server
npm run sdk:generate # Generate TypeScript client SDK
npm run data:update  # Refresh World Bank data
npm run db:migrate   # Run PostgreSQL migrations
```

### Architecture Invariant

**The core layer (`src/core/`) has zero knowledge of any blockchain, token, currency, or framework.** Adapters import from core; core never imports from adapters. This is the central design rule. Do not break it.

```
src/
├── core/        Pure domain logic — types, rules, simulations, funding, impact, regions (NO I/O)
├── data/        Data loading, World Bank/ILO/IMF snapshots, countries.json, regions.json
├── api/         Fastify routes, middleware, OpenAPI
├── db/          SQLite + PostgreSQL persistence
├── admin/       Server-rendered admin UI (htmx)
├── adapters/    Chain/currency adapters (Solana, EVM)
├── disbursements/ Payment providers (Solana USDC, EVM USDC, M-Pesa stub)
└── webhooks/    Event dispatch, HMAC signatures
```

### Key Files

| File | What it does |
|------|-------------|
| `src/core/rules.ts` | The entitlement formula — pure function, no side effects |
| `src/core/rulesets.ts` | Registry of all formula versions (v1 active, v2 preview) |
| `src/core/constants.ts` | Named constants: income floor ($210), weights |
| `src/core/simulations.ts` | Budget simulation math — pure function |
| `src/core/funding.ts` | 6 funding mechanism calculators — pure functions |
| `src/core/impact.ts` | 4-dimension economic impact analysis — pure functions |
| `src/core/regions.ts` | Regional COL adjustment via "adjusted Country" pattern |
| `src/data/countries.json` | World Bank snapshot — 49 countries |
| `src/data/regions.json` | Sub-national data — Kenya 47 counties |
| `src/api/server.ts` | Fastify server factory |
| `src/db/database.ts` | SQLite schema and connection |
| `src/adapters/types.ts` | `ChainAdapter<TConfig>` interface |

### Response Format

All API responses follow:
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

### Adding a Country

Edit `src/data/worldbank/config.json`, run `npm run data:update`. The importer fetches from the World Bank API, validates, and writes to `countries.json`.

### Adding Regions for a Country

Edit `src/data/regions.json` and add entries following the existing Kenya format. Each region needs:

- `id` — `{countryCode}-{regionCode}`, e.g. `"TZ-DAR"`
- `countryCode` — must exist in `countries.json`
- `stats.costOfLivingIndex` — relative to national average (1.0 = same)
- `stats.population` — regional population
- `stats.urbanRural` — `"urban"` | `"rural"` | `"mixed"`
- `stats.dataAsOf` and `stats.dataSource` — provenance

No code changes needed — the loader picks up new entries automatically. Write tests to validate the new data.

### Adding a Ruleset

1. Define constants in `src/core/constants.ts`
2. Implement the formula in `src/core/rules.ts`
3. Register in `src/core/rulesets.ts` with status (active/preview/deprecated)
4. Write tests covering all income groups
5. Document in a `RULESET_VX.md` file

### Commit Style

Concise, imperative subject line. Body explains *why*, not *what*. Reference issues when applicable.

```
Add budget simulation endpoint

Enable NGOs and governments to model basic income costs before
committing resources. Supports coverage targeting and multi-country
comparison.

Closes #42
```

### Commit Checklist

Every commit that changes behaviour (bug fixes, new features, formula changes) **must** also update:

1. **`CHANGELOG.md`** — add an entry under the current version (or a new `[Unreleased]` block if the version hasn't been bumped yet). Follow Keep a Changelog conventions: `### Fixed`, `### Added`, `### Changed`, `### Removed`.
2. **`README.md`** — update any sections that reference changed behaviour: test counts, capability tables, funding mechanism descriptions, API endpoint lists, etc.

Documentation-only commits (fixing typos, rewording) do not require a CHANGELOG entry, but README must still be consistent.

### Model Usage Policy

Token efficiency matters. Use the right model for the right task:

| Model | When to use | Examples |
|-------|-------------|---------|
| **Haiku** `claude-haiku-4-5-20251001` | Quick, cheap tasks — default starting point | File searches, single-line fixes, reading docs, grepping for a symbol, status checks, typo corrections, explaining a short function |
| **Sonnet** `claude-sonnet-4-6` | Standard coding work | New features, bug fixes, multi-file refactors, writing tests, schema changes, adding endpoints |
| **Opus** `claude-opus-4-6` | Save for the hardest problems only | Architecture decisions, complex security analysis, orchestrating multi-agent plans, debugging tricky async/concurrency/race-condition bugs, analysing attack surfaces |

**Default to Haiku.** Escalate to Sonnet when a task clearly spans multiple files or requires system-wide reasoning. Reserve Opus for genuine deep-thinking — it is expensive and slow. Never use Opus for searches, reads, or anything grep can answer in one shot.
