# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
