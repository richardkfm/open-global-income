# Open Global Income

**The shared infrastructure layer for universal basic income** — the neutral, auditable protocol that any government, NGO, or DAO can build on to deliver income floors to people.

Like what OpenStreetMap did for geographic data, or what SMTP did for email: a shared standard that makes every program built on top of it cheaper, faster, and more trustworthy than if they built alone.

## Key Principles

- **Neutral** — no hard dependency on any specific blockchain or token. Values expressed in PPP-adjusted USD, mapped to currencies/tokens via adapters.
- **Transparent** — all formulas, parameters, and data sources are open. Every result includes `ruleset_version` and `data_version`.
- **Modular** — clean separation between data sources, rules engine, simulation, disbursement, and chain adapters.
- **Non-custodial** — the platform calculates and prepares payment instructions but never holds or moves funds directly.

## Architecture

```
src/
├── core/        Pure domain logic (types, rules engine) — zero framework deps
├── data/        Data loading, normalization, World Bank source docs
├── api/         HTTP layer (Fastify), middleware (auth, audit, metrics)
├── db/          SQLite persistence, PostgreSQL migrations
├── admin/       Server-rendered admin UI (htmx)
├── adapters/    Chain/currency adapters (Solana, EVM)
└── webhooks/    Event dispatch with HMAC-SHA256 signatures
scripts/         SDK generation, tooling
sdk/             Generated TypeScript client SDK
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full module breakdown, dependency rules, and design decisions.

## Quickstart

```bash
# Install dependencies
npm install

# Run in development (hot-reload)
npm run dev

# Run tests
npm test

# Type-check
npm run typecheck

# Lint
npm run lint

# Build for production
npm run build
npm start
```

### Docker

```bash
docker compose up
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3333` | Server port |
| `LOG_LEVEL` | `info` | Pino log level |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `API_KEY_REQUIRED` | — | Set to `true` to require API keys |
| `ENABLE_ADMIN` | — | Set to `true` to enable admin UI |
| `ADMIN_PASSWORD` | `admin` | Admin UI login password |
| `ENABLE_METRICS` | `true` | Set to `false` to disable Prometheus |
| `DB_BACKEND` | `sqlite` | Database backend (`sqlite` or `postgres`) |
| `DATABASE_URL` | — | PostgreSQL connection string |

## API

Interactive API docs available at `/docs` (Swagger UI) when the server is running.

### `GET /health`

Returns `{ "status": "ok" }`.

### `GET /v1/income/calc?country=XX`

Calculate the global income entitlement for a country (ISO 3166-1 alpha-2 code).

```bash
curl http://localhost:3333/v1/income/calc?country=NG
```

```json
{
  "ok": true,
  "data": {
    "countryCode": "NG",
    "pppUsdPerMonth": 210,
    "localCurrencyPerMonth": 35385,
    "score": 1,
    "meta": {
      "rulesetVersion": "v1",
      "dataVersion": "worldbank-2023"
    }
  }
}
```

### `POST /v1/income/batch`

Batch calculate entitlements for multiple countries. Body: `{ "countries": ["NG", "DE", "BR"] }`. Max 50 items (configurable via `BATCH_MAX_ITEMS`).

### `GET /v1/income/countries`

List all supported countries with income group and data availability.

### `GET /v1/income/countries/:code`

Get full country details including all economic statistics.

### `GET /v1/income/rulesets`

List all available rulesets with formula, parameters, and active status.

### `GET /v1/income/rulesets/:version`

Get a single ruleset by version string.

### `POST /v1/users`

Register a user with a country code. Body: `{ "country_code": "DE" }`

### `GET /v1/users/:id/income`

Get a registered user's income entitlement.

### `POST /v1/simulate`

Run a budget simulation for a country. Returns full cost breakdown.

```bash
curl -X POST http://localhost:3333/v1/simulate \
  -H "Content-Type: application/json" \
  -d '{"country":"KE","coverage":0.2,"targetGroup":"all","durationMonths":12,"adjustments":{"floorOverride":null,"householdSize":null}}'
```

Body fields:
- `country` — ISO 3166-1 alpha-2 code (required)
- `coverage` — fraction of population to cover, 0–1 (required)
- `targetGroup` — `"all"` or `"bottom_quintile"` (default `"all"`)
- `durationMonths` — programme duration 1–120 (default `12`)
- `adjustments.floorOverride` — override the $210 PPP-USD floor (optional)

### `POST /v1/simulate/compare`

Compare the same scenario across multiple countries, sorted by annual cost ascending. Body: `{ "countries": ["KE","MZ","BI"], "coverage": 0.2, "durationMonths": 12 }`. Max 20 countries.

### `POST /v1/simulations`

Save a simulation with an optional name. Body: same as `POST /v1/simulate` plus `"name"`.

### `GET /v1/simulations`

List saved simulations. Query params: `page`, `limit`.

### `GET /v1/simulations/:id`

Retrieve a saved simulation by ID.

### `DELETE /v1/simulations/:id`

Delete a saved simulation.

### `GET /v1/disbursements/channels`

List all active disbursement channels and available providers (solana, evm, safaricom).

### `POST /v1/disbursements/channels`

Register a new disbursement channel. Body: `{ "name", "type", "provider", "config", "countryCode?" }`.
- `type`: `"mobile_money"` | `"bank_transfer"` | `"crypto"`
- `provider`: `"solana"` | `"evm"` | `"safaricom"`
- `config`: provider-specific config (validated before saving)

### `POST /v1/disbursements`

Create a disbursement in `draft` status. Body: `{ "channelId", "countryCode", "recipientCount", "amountPerRecipient", "totalAmount", "currency", "simulationId?" }`.

### `POST /v1/disbursements/:id/approve`

Approve a `draft` disbursement for processing. Sets status to `approved`.

### `POST /v1/disbursements/:id/submit`

Submit an `approved` disbursement to its payment provider. Sets status to `completed` (or `failed`). Response includes provider-specific transaction payload (unsigned tx data for crypto, mock receipt for M-Pesa stub).

### `GET /v1/disbursements/:id`

Get a disbursement's current status and full audit log.

### `GET /v1/disbursements`

List all disbursements (paginated). Query params: `page`, `limit`, `status`, `channelId`.

### `POST /v1/pilots`

Create a pilot program linked to a simulation. Body: `{ "name", "countryCode", "simulationId?", "description?", "startDate?", "endDate?", "targetRecipients?" }`. Status starts at `planning`.

### `GET /v1/pilots`

List pilots (paginated). Query params: `page`, `limit`, `status`, `countryCode`.

### `GET /v1/pilots/:id`

Get a pilot with all linked disbursements.

### `PATCH /v1/pilots/:id`

Update pilot status, description, dates, or target recipients. Status transitions are validated: `planning → active/completed`, `active → paused/completed`, `paused → active/completed`, `completed` is terminal.

### `POST /v1/pilots/:id/disbursements`

Link an existing disbursement to a pilot. Body: `{ "disbursementId" }`.

### `GET /v1/pilots/:id/report`

Generate a structured JSON report with summary stats, disbursement list, and simulation variance analysis. Suitable for donor and auditor reporting.

### `GET /metrics`

Prometheus metrics endpoint (request counts, duration histograms, active connections, Node.js runtime metrics).

All responses follow a consistent shape:
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

## Authentication

API key authentication is optional by default. Set `API_KEY_REQUIRED=true` to enforce it.

Pass your key via the `X-API-Key` header:
```bash
curl -H "X-API-Key: ogi_..." http://localhost:3333/v1/income/calc?country=NG
```

API keys are managed through the admin UI or programmatically. Keys are stored as SHA-256 hashes. Three tiers with different rate limits:
- **free** — 30 req/min
- **standard** — 100 req/min
- **premium** — 500 req/min

## Rulesets

### Ruleset v1 (active)

The current formula (`rulesetVersion: "v1"`):

```
pppUsdPerMonth  = 210                                (global floor, PPP-USD/month)
localCurrency   = pppUsdPerMonth × pppConversionFactor
incomeRatio     = 210 / (gniPerCapitaUsd / 12)
giniPenalty     = (giniIndex / 100) × 0.15           (0 if Gini unavailable)
score           = clamp(incomeRatio + giniPenalty, 0, 1)
```

- **$210/month** is derived from the World Bank upper-middle-income poverty line ($6.85/day)
- **GNI per capita** (not GDP) reflects what residents actually earn
- **Gini penalty** amplifies need for countries with high inequality

See [RULESET_V1.md](./RULESET_V1.md) for the full specification with worked examples and data source details.

### Ruleset v2 (preview)

Extends v1 with HDI and urbanization factors. Registered but not yet active. See `GET /v1/income/rulesets/v2` for details.

## Admin UI

A server-rendered admin dashboard (no SPA framework — uses htmx for interactivity). Enable with `ENABLE_ADMIN=true`.

- **Dashboard** — country count, users, API keys, request stats
- **API Key Management** — create and revoke keys with tier selection
- **Audit Log** — recent API requests with live-refresh
- **Simulate** — run budget simulations with live cost preview, compare countries, save/delete scenarios
- **Pilots** — create and manage pilot programs, link disbursements, track status lifecycle, view summary cards and simulation variance

Access at `http://localhost:3333/admin`. Login with the password set in `ADMIN_PASSWORD`.

## Chain Adapters

Adapters map a `GlobalIncomeEntitlement` (in PPP-USD/month) to a concrete token or currency amount for a specific chain. They are pure calculation modules — no chain writes.

- **Solana** (`src/adapters/solana/`) — maps entitlements to any SPL token amount via a configurable exchange rate
- **EVM** (`src/adapters/evm/`) — Ethereum, Polygon, Arbitrum, Optimism, Base with pre-configured chain settings

See `src/adapters/types.ts` for the `ChainAdapter<TConfig>` interface.

## Disbursement Providers

The disbursement system is non-custodial — it calculates and prepares payment instructions but never holds or moves funds directly.

| Provider | ID | Currency | Notes |
|----------|-----|----------|-------|
| Solana USDC | `solana` | USDC | Returns unsigned transaction payload for multisig signing |
| EVM USDC | `evm` | USDC | Returns unsigned ERC-20 calldata for Ethereum/Polygon/Arbitrum/Optimism/Base |
| M-Pesa (stub) | `safaricom` | KES | Validates config, logs intent — no live Safaricom connection |

## Webhooks

Subscribe to events (`entitlement.calculated`, `user.created`, `api_key.created`, `api_key.revoked`, `data.updated`, `simulation.created`, `disbursement.created`, `disbursement.approved`, `disbursement.completed`, `disbursement.failed`, `pilot.created`, `pilot.status_changed`, `pilot.report_generated`) and receive HMAC-SHA256 signed payloads at your endpoint. See `src/webhooks/` for the dispatcher and type definitions.

## TypeScript SDK

Generate a typed client SDK from the OpenAPI spec:

```bash
npm run sdk:generate
```

This produces `sdk/client.ts` with the `OgiClient` class providing type-safe methods for all API endpoints.

## Database

SQLite by default (zero-config). PostgreSQL supported for production deployments:

```bash
# Run PostgreSQL migrations
npm run db:migrate
```

Set `DB_BACKEND=postgres` and `DATABASE_URL` to switch backends.

## Phases

- [x] **Phase 1 (v0.0.1)** — Project scaffold, stub rules engine, dummy data
- [x] **Phase 2 (v0.0.2)** — Real World Bank data, Ruleset v1, unit tests
- [x] **Phase 3 (v0.0.3)** — API expansion, rulesets endpoint, countries endpoint, error handling
- [x] **Phase 4 (v0.0.4)** — Documentation ([ARCHITECTURE](./ARCHITECTURE.md), [RULESET_V1](./RULESET_V1.md), [USECASE](./USECASE.md), [CONTRIBUTING](./CONTRIBUTING.md)), CI
- [x] **Phase 5 (v0.0.5)** — Currency/unit model, Solana adapter skeleton
- [x] **Phase 6 (v0.0.6)** — Batch endpoint, OpenAPI/Swagger, security headers, CORS, rate limiting
- [x] **Phase 7 (v0.0.7)** — PostgreSQL migrations, database adapter layer
- [x] **Phase 8 (v0.0.8)** — Admin UI with htmx, session auth, API key management
- [x] **Phase 9 (v0.0.9)** — EVM adapter, webhooks, SDK generation
- [x] **Phase 10 (v0.1.0)** — Prometheus metrics, Ruleset v2 preview, governance, API stability
- [x] **Phase 11 (v0.1.1)** — Budget simulation engine (cost modeling, targeting presets, comparison, saved simulations)
- [x] **Phase 12 (v0.1.2)** — Disbursement integration (Solana USDC, EVM, M-Pesa stub, approval workflow)
- [x] **Phase 13 (v0.1.3)** — Pilot dashboard (pilot lifecycle, disbursement tracking, donor reports)

See [ROADMAP.md](./ROADMAP.md) for the full plan with data models, endpoints, and rationale.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, code style, testing requirements, and the PR process.

## Governance

See [GOVERNANCE.md](./GOVERNANCE.md) for the decision-making process, API stability declaration, and versioning policy.

## Current Status

**Version 0.1.3** — Pilot Dashboard. 233 tests across 15 test suites.

See [CHANGELOG.md](./CHANGELOG.md) for full version history.

## License

[MIT](./LICENSE)
