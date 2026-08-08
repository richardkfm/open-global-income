# Architecture

This document describes the module structure and design principles of **Open Global Income**.

## Overview

Open Global Income is a TypeScript/Node.js project that exposes a versioned, auditable calculation engine for global income entitlements. It is intentionally **chain-agnostic** and **currency-agnostic** at the core — on-chain and token-specific logic lives only in adapters.

```
open-global-income/
├── src/
│   ├── core/            Pure domain logic — types, rules, simulations, funding,
│   │                    impact, regions, poverty, adequacy, targeting, savings, fx
│   ├── data/            Dataset loading + World Bank / ILO / IMF importers
│   ├── api/             HTTP layer (Fastify server, routes, middleware, OpenAPI)
│   ├── db/              SQLite persistence and PostgreSQL migrations
│   ├── admin/           Server-rendered admin UI (htmx)
│   ├── web/             Public advocacy site at /
│   ├── i18n/            Translation strings for the public site
│   ├── adapters/        Chain/currency adapters (Solana, EVM)
│   ├── disbursements/   Non-custodial payment providers
│   ├── identity/        Identity verification connectors
│   └── webhooks/        Outbound event dispatch (HMAC-SHA256)
├── public/              Static assets (CSS, JS, geo outlines)
├── scripts/             SDK generation and tooling
├── sdk/                 Generated TypeScript client
├── ARCHITECTURE.md      This file
├── RULESET_V1.md        Formula specification for Ruleset v1
├── CONTRIBUTING.md      Contributor guide
└── CHANGELOG.md         Version history
```

## Dependency rules

The actual cross-directory imports in non-test source, bottom-up:

```
core            →  (nothing — pure, no I/O, no framework)
webhooks        →  (nothing — node:crypto only)
i18n            →  (nothing)
data            →  core
adapters        →  core
identity        →  core
db              →  core
disbursements   →  core, data, adapters
admin           →  core, data, db, identity, i18n
web             →  core, data, admin/views (shared HTML + chart helpers)
api             →  core, data, db, webhooks, disbursements, identity, admin, web
```

**Everything points down, and the core layer has zero knowledge of any blockchain, token, currency, or framework.** Adapters import from core; core never imports from adapters — no Fastify, no SQLite, no chain SDK, no I/O of any kind. This is the central invariant of the codebase. `api` sits at the top because it composes everything, including mounting the `admin` and `web` routers.

Two edges are worth naming explicitly:

- **`web → admin/views`** is a deliberate reuse of the shared HTML escaping, formatting, and chart helpers (`admin/views/helpers.ts`, `admin/views/chart-helpers.ts`). It is a presentation-utility dependency, not a dependency on the admin application. If it ever grows past that, those helpers should move to their own module rather than the edge being widened.
- **`disbursements → adapters`** exists because the crypto providers reuse the chain adapters' amount conversion. Both remain pure calculation.

Test files may import `api/server.ts` from any layer (Fastify's `inject()` is the standard integration-test entry point); that direction does not exist in production code.

---

## Module descriptions

### `src/core/`

Pure domain logic. No I/O, no side effects, no framework dependencies.

| File | Purpose |
|------|---------|
| `types.ts` | All shared TypeScript types and interfaces (`Country`, `CountryStats`, `GlobalIncomeEntitlement`, `RulesetInfo`, `IncomeGroup`, `Pilot`, `RecipientProfile`, `TargetingRules`, …) |
| `constants.ts` | Named constants: `RULESET_VERSION`, `GLOBAL_INCOME_FLOOR_PPP`, `GINI_WEIGHT`, and the v2 preview weights |
| `rules.ts` | `calculateEntitlement(country, dataVersion)` — the Ruleset v1 formula (pure function) |
| `rulesets.ts` | Registry of every formula version: v1 (active), v2 (preview — spec only, no implementation), stub v0 (deprecated) |
| `simulations.ts` | Budget simulation math — recipient counts, cost, share of PPP GDP |
| `funding.ts` | 8 funding mechanism calculators plus `calculateRecommendedFundingMix` |
| `impact.ts` | 4-dimension impact analysis — poverty, purchasing power, social coverage, GDP stimulus |
| `poverty.ts` | The country-appropriate poverty-line ladder (HIC 60%-of-median; UMC/LMC/LIC World Bank lines) |
| `adequacy.ts` | Local adequacy estimate reported beside the $210 anchor — never fed into the entitlement |
| `regions.ts` | Regional cost-of-living adjustment via the "adjusted Country" pattern |
| `targeting.ts` | `TargetingRules` and `applyRulesToRecipients` |
| `savings.ts`, `projections.ts`, `fx.ts` | Cost-savings baselines, multi-year projections, FX snapshot conversion |
| `recipient-import.ts`, `recipient-export.ts` | Pure CSV parse/serialise for the recipient registry |

### `src/data/`

Dataset loading and normalization, plus the source importers.

| File | Purpose |
|------|---------|
| `countries.json` | Country dataset — 49 countries across HIC / UMC / LMC / LIC, keyed by `dataVersion` |
| `regions.json` | Sub-national dataset — 88 regions across KE, DE, FR, NL |
| `loader.ts` | `getAllCountries()`, `getCountryByCode(code)`, `getDataVersion()` |
| `worldbank/` | World Bank importer — config, fetcher, transformer, validator |
| `ilo/`, `imf/` | ILO social-protection and IMF fiscal importers, same shape as `worldbank/` |
| `fx-rates.json`, `currencies.ts` | Maintained FX snapshot and currency metadata |
| `worldbank/README.md` | Data source documentation (indicators and update instructions) |

Note that the committed `countries.json` holds manually seeded estimates rather than live API values — see the Data Provenance section of the [README](./README.md).

### `src/api/`

HTTP layer built on [Fastify](https://fastify.dev/). Thin — delegates all business logic to `core` and `data`.

| File | Purpose |
|------|---------|
| `server.ts` | `buildServer()` — creates and configures the Fastify instance, registers every route plugin under its prefix |
| `routes/*.ts` | One plugin per resource: income, countries, regions, rulesets, users, simulate, simulations, disbursements, pilots, funding, impact, recipients, identity, outcomes/evidence, inbound webhooks, health |
| `middleware/` | API-key auth, audit logging, Prometheus metrics |

Route tests live beside the routes as `*.test.ts` and drive the server through Fastify's `inject()` — no real network calls.

Entry point `src/index.ts` calls `buildServer()` and starts listening (default port 3333, overridable via `PORT` env var).

### `src/adapters/`

Chain-specific or currency-specific adapters. Each adapter:

1. Imports `GlobalIncomeEntitlement` from `src/core/types.ts`.
2. Implements the `ChainAdapter<TConfig>` interface from `src/adapters/types.ts`.
3. Is a **pure calculation module** — no chain writes, no external I/O.

| File | Purpose |
|------|---------|
| `types.ts` | `ChainAdapter<TConfig>` interface and `TokenAmount` type |
| `solana/index.ts` | Maps entitlements to Solana SPL token amounts |
| `solana/program-types.ts` | TypeScript types for a future on-chain Solana program account layout |
| `evm/index.ts` | Maps entitlements to ERC-20 amounts for Ethereum, Polygon, Arbitrum, Optimism, Base |

### `src/disbursements/`, `src/identity/`

The two connector layers. Both are **non-custodial by construction**: a disbursement provider prepares an instruction in the rail's native format (unsigned Solana/EVM transaction, Daraja B2C batch, ISO 20022 pain.001) for an operator to execute, and an identity provider performs deterministic offline format/checksum validation while delegating the authoritative KYC assertion to the external system. Neither moves funds; neither stores raw identity data.

### `src/db/`, `src/admin/`, `src/web/`, `src/webhooks/`, `src/i18n/`

Persistence (SQLite by default, PostgreSQL via migrations), the server-rendered htmx admin UI, the public no-login advocacy site, outbound HMAC-signed event dispatch, and the public site's translation strings. See the [README](./README.md) for the user-facing description of each.

---

## Data flow

```
HTTP Request
    │
    ▼
api/routes/income.ts
    │  getCountryByCode(code) + getDataVersion()
    ▼
data/loader.ts  ←  data/countries.json
    │
    │  country: Country, dataVersion: string
    ▼
core/rules.ts  ←  core/constants.ts
    │
    │  GlobalIncomeEntitlement
    ▼
HTTP Response { ok: true, data: entitlement }

                         (optional)
GlobalIncomeEntitlement ──────────────▶  adapters/solana/index.ts
                                              │
                                              ▼
                                         TokenAmount
```

---

## Versioning

Every calculation result includes two version fields:

- **`rulesetVersion`** — identifies the formula (e.g. `"v1"`). Increment when the formula or constants change in a way that alters results.
- **`dataVersion`** — identifies the data snapshot (e.g. `"worldbank-2023"`). Increment when the country dataset is refreshed.

This allows any downstream consumer to detect when their cached results need recomputation.

See [RULESET_V1.md](./RULESET_V1.md) for the full formula specification.

---

## Key design decisions

### Why GNI, not GDP?

GNI (Gross National Income) better reflects what residents of a country actually earn, accounting for cross-border income flows. GDP measures production within a country's borders regardless of who captures the income.

### Why PPP-USD as the base unit?

Purchasing Power Parity (PPP) adjusts for price level differences between countries, making the $210/month floor meaningful in real consumption terms regardless of local prices. Raw USD amounts would be misleading for comparisons across income groups.

### Why a score in addition to a dollar amount?

The `score` (0–1) normalizes the entitlement relative to a country's income level. A downstream system that wants to prioritize by relative need — rather than by absolute dollar amounts — can use the score directly without replicating the formula.

### Why keep adapters separate?

Coupling the entitlement calculation to a specific blockchain or token would make the core model non-neutral and harder to audit. Adapters let any party plug in their own token/chain mapping without touching the calculation logic.
