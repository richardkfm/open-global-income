# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-03-18

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
