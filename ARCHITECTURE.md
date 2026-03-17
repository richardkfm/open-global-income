# Architecture

This document describes the module structure and design principles of **Open Global Income**.

## Overview

Open Global Income is a TypeScript/Node.js project that exposes a versioned, auditable calculation engine for global income entitlements. It is intentionally **chain-agnostic** and **currency-agnostic** at the core — on-chain and token-specific logic lives only in adapters.

```
open-global-income/
├── src/
│   ├── core/          Pure domain logic — types, rules engine, constants
│   ├── data/          Data loading and normalization (World Bank snapshot)
│   ├── api/           HTTP layer (Fastify server + route handlers)
│   └── adapters/      Optional chain/currency adapters (Solana, future chains)
├── ARCHITECTURE.md    This file
├── RULESET_V1.md      Formula specification for Ruleset v1
├── CONTRIBUTING.md    Contributor guide
└── CHANGELOG.md       Version history
```

## Dependency rules

```
adapters  →  core/types
api       →  core/types, core/rules, data/loader
data      →  core/types
core      →  (no internal dependencies)
```

**The core layer has zero knowledge of any blockchain, token, or currency.** Adapters import from core but core never imports from adapters. This is the central invariant of the codebase.

---

## Module descriptions

### `src/core/`

Pure domain logic. No I/O, no side effects, no framework dependencies.

| File | Purpose |
|------|---------|
| `types.ts` | All shared TypeScript types and interfaces (`Country`, `CountryStats`, `GlobalIncomeEntitlement`, `RulesetMeta`, `IncomeGroup`, `BaseUnit`) |
| `constants.ts` | Named constants: `RULESET_VERSION`, `GLOBAL_INCOME_FLOOR_PPP`, `GINI_WEIGHT` |
| `rules.ts` | `calculateEntitlement(country, dataVersion)` — the Ruleset v1 formula (pure function) |
| `rules.test.ts` | Unit tests for the rules engine (10 tests across all income groups) |

### `src/data/`

Data loading and normalization. Reads the World Bank snapshot from disk and exposes a clean API.

| File | Purpose |
|------|---------|
| `countries.json` | Static dataset — 49 countries across HIC / UMC / LMC / LIC income groups |
| `loader.ts` | `getAllCountries()`, `getCountryByCode(code)`, `getDataVersion()` |
| `loader.test.ts` | Unit tests for data loading and normalization (6 tests) |
| `worldbank/README.md` | Data source documentation (World Bank indicators and update instructions) |

### `src/api/`

HTTP layer built on [Fastify](https://fastify.dev/). Thin — delegates all business logic to `core` and `data`.

| File | Purpose |
|------|---------|
| `server.ts` | `buildServer()` — creates and configures the Fastify instance |
| `routes/health.ts` | `GET /health` — liveness check |
| `routes/income.ts` | `GET /v1/income/calc?country=XX` — main entitlement endpoint |
| `routes/income.test.ts` | Integration tests using Fastify's `inject()` |

Entry point `src/index.ts` calls `buildServer()` and starts listening (default port 3333, overridable via `PORT` env var).

### `src/adapters/`

Optional chain-specific or currency-specific adapters. Each adapter:

1. Imports `GlobalIncomeEntitlement` from `src/core/types.ts`.
2. Implements the `ChainAdapter<TConfig>` interface from `src/adapters/types.ts`.
3. Is a **pure calculation module** — no chain writes, no external I/O.

| File | Purpose |
|------|---------|
| `types.ts` | `ChainAdapter<TConfig>` interface and `TokenAmount` type |
| `solana/index.ts` | Maps entitlements to Solana SPL token amounts |
| `solana/program-types.ts` | TypeScript types for a future on-chain Solana program account layout |

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
