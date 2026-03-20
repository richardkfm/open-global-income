# 🌍 Open Global Income

**The shared infrastructure layer for universal basic income** — the neutral, auditable protocol that any government, NGO, or DAO can build on to deliver income floors to people.

Like what OpenStreetMap did for geographic data, or what SMTP did for email: a shared standard that makes every program built on top of it cheaper, faster, and more trustworthy than if they built alone.

[Vision](#-vision) · [Who It's For](#-who-its-for) · [Principles](#-principles) · [Quickstart](#-quickstart) · [API](#-api) · [Admin UI](#-admin-ui) · [Rulesets](#-rulesets) · [Chain Adapters](#-chain-adapters) · [Disbursements](#-disbursement-providers) · [Webhooks](#-webhooks) · [SDK](#-typescript-sdk) · [Database](#-database) · [Auth](#-authentication) · [Config](#%EF%B8%8F-environment-variables) · [Contributing](#-contributing) · [Governance](#-governance)

---

## 🔭 Vision

Open Global Income is a stack. Each layer builds on the one below it. The lower layers are useful on their own; the upper layers multiply their impact.

```
┌─────────────────────────────────────────────────┐
│  🤝 FEDERATION                                  │
│  Multi-program interop, cross-border portability│
├─────────────────────────────────────────────────┤
│  📊 EVIDENCE                                    │
│  Impact measurement, outcome tracking, research │
├─────────────────────────────────────────────────┤
│  💸 DISTRIBUTION                                │
│  Payment rails — crypto, mobile money, bank     │
├─────────────────────────────────────────────────┤
│  🧮 SIMULATION                                  │
│  Budget modeling, targeting, cost projection     │
├─────────────────────────────────────────────────┤
│  ⚖️  CALCULATION                                │
│  Entitlement formulas, scoring, rulesets        │
├─────────────────────────────────────────────────┤
│  📦 DATA                                        │
│  World Bank indicators, country economics       │
└─────────────────────────────────────────────────┘
```

### ✅ Built (v0.1.3)

Transparent entitlement calculation for **49 countries**. Budget simulation with targeting presets and multi-country comparison. Non-custodial disbursement system with Solana USDC, EVM, and M-Pesa providers. Pilot lifecycle management with donor reporting and variance analysis. Approval workflows, audit trails, admin UI. **233 tests** across 15 suites.

### 🔜 Next: Identity, Evidence & Sub-national Data

- **🪪 Identity** — pluggable provider interface for national ID, biometrics, or wallet-based verification
- **📈 Evidence** — pre/post metrics, control groups, outcome surveys, research-grade exports (CSV, Parquet, SPSS)
- **🗺️ Sub-national data** — regional cost-of-living adjustments, district-level targeting
- **💱 Multi-currency settlement** — live exchange rates, multi-rail reconciliation

### 🌐 Future: Federation Protocol

- **Federation** — multiple programs sharing a common standard, avoiding double-payment, comparing efficiency
- **Portability** — cross-border entitlement transfer without centralizing personal data
- **Policy simulation at scale** — governments model national UBI with confidence intervals from real pilot outcomes
- **Open evidence base** — anonymized, aggregated outcome data across all programs, freely available for research
- **Self-sustaining governance** — protocol governed by its users (governments, NGOs, DAOs, researchers)

See [CLAUDE.md](./CLAUDE.md) for the full vision. See [ROADMAP.md](./ROADMAP.md) for technical details on completed phases.

---

## 👥 Who It's For

| Actor | How they use it |
|-------|----------------|
| 🏛️ **Governments** | Model costs before committing. Run pilots with built-in accountability. Generate evidence that survives political cycles. |
| 🌱 **NGOs** | Compare candidate countries with real data. Manage disbursements. Generate structured donor reports. |
| ⛓️ **DAOs & ReFi** | On-chain distribution backed by auditable, World Bank-grounded calculations. Non-custodial Solana & EVM adapters. |
| 🔬 **Researchers** | Standardized economic data and outcome metrics across programs. Research-grade exports. |
| 💰 **Donors** | Track where money goes. Verify it reaches recipients. Compare program efficiency across countries. |

---

## ✨ Principles

- **Neutral** — no hard dependency on any blockchain or token. Values in PPP-adjusted USD, mapped to currencies/tokens via adapters.
- **Transparent** — all formulas, parameters, and data sources are open. Every result includes `ruleset_version` and `data_version`.
- **Modular** — clean separation between data, rules engine, simulation, disbursement, and chain adapters.
- **Non-custodial** — the platform calculates and prepares payment instructions but never holds or moves funds.

---

## 🚀 Quickstart

### Clone & run locally

```bash
git clone https://github.com/alcoolio/open-global-income.git
cd open-global-income
npm install
npm run dev
```

The API is now running at `http://localhost:3333`. Interactive docs at `http://localhost:3333/docs` (Swagger UI).

```bash
# Verify it works
curl http://localhost:3333/health
# → { "status": "ok" }

# Calculate Kenya's entitlement
curl http://localhost:3333/v1/income/calc?country=KE
```

### Docker

```bash
git clone https://github.com/alcoolio/open-global-income.git
cd open-global-income
docker compose up --build
```

This builds the image and starts the API on port `3333`. No other dependencies required — the Dockerfile uses a multi-stage build with `node:20-slim`.

Once the container is running, the following URLs are available:

| URL | Description |
|-----|-------------|
| `http://localhost:3333/health` | Health check — verify the server is up |
| `http://localhost:3333/docs` | Swagger UI — interactive API documentation |
| `http://localhost:3333/docs/json` | Raw OpenAPI spec (JSON) |
| `http://localhost:3333/v1/income/calc?country=KE` | Example: calculate Kenya's entitlement |
| `http://localhost:3333/admin` | Admin UI (requires `ENABLE_ADMIN=true`) |
| `http://localhost:3333/metrics` | Prometheus metrics |

#### Docker with environment variables

Pass environment variables to configure the container:

```bash
docker compose up --build -e ENABLE_ADMIN=true -e ADMIN_PASSWORD=changeme
```

Or edit `docker-compose.yml` to add them:

```yaml
services:
  api:
    build: .
    ports:
      - "3333:3333"
    environment:
      - NODE_ENV=production
      - PORT=3333
      - ENABLE_ADMIN=true
      - ADMIN_PASSWORD=changeme
      - API_KEY_REQUIRED=false
```

#### Docker build only

```bash
docker build -t open-global-income .
docker run -p 3333:3333 open-global-income
```

### Useful commands

```bash
npm test             # Run all tests
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run build        # Production build
npm start            # Start production server
npm run sdk:generate # Generate TypeScript client SDK
npm run data:update  # Refresh World Bank data
npm run db:migrate   # Run PostgreSQL migrations
```

---

## ⚙️ Environment Variables

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

---

## 📡 API

Interactive API docs available at `/docs` (Swagger UI) when the server is running.

All responses follow a consistent shape:
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

### Entitlements

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness check |
| `GET` | `/v1/income/calc?country=XX` | Calculate entitlement for a country |
| `POST` | `/v1/income/batch` | Batch calculate (up to 50 countries) |
| `GET` | `/v1/income/countries` | List supported countries |
| `GET` | `/v1/income/countries/:code` | Full country details |
| `GET` | `/v1/income/rulesets` | List all rulesets |
| `GET` | `/v1/income/rulesets/:version` | Get a single ruleset |
| `POST` | `/v1/users` | Register a user with a country code |
| `GET` | `/v1/users/:id/income` | Get user's entitlement |

### Simulation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/simulate` | Run a budget simulation |
| `POST` | `/v1/simulate/compare` | Compare scenarios across countries (max 20) |
| `POST` | `/v1/simulations` | Save a simulation |
| `GET` | `/v1/simulations` | List saved simulations |
| `GET` | `/v1/simulations/:id` | Retrieve a saved simulation |
| `DELETE` | `/v1/simulations/:id` | Delete a saved simulation |

### Disbursements

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/disbursements/channels` | List disbursement channels |
| `POST` | `/v1/disbursements/channels` | Register a channel |
| `POST` | `/v1/disbursements` | Create disbursement (status: `draft`) |
| `POST` | `/v1/disbursements/:id/approve` | Approve for processing |
| `POST` | `/v1/disbursements/:id/submit` | Submit to payment provider |
| `GET` | `/v1/disbursements/:id` | Get status and audit log |
| `GET` | `/v1/disbursements` | List all disbursements (paginated) |

### Pilots

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/pilots` | Create a pilot linked to a simulation |
| `GET` | `/v1/pilots` | List pilots (paginated) |
| `GET` | `/v1/pilots/:id` | Get pilot with linked disbursements |
| `PATCH` | `/v1/pilots/:id` | Update status, dates, description |
| `POST` | `/v1/pilots/:id/disbursements` | Link a disbursement to a pilot |
| `GET` | `/v1/pilots/:id/report` | Generate structured donor report |

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/metrics` | Prometheus metrics |

---

## 🔐 Authentication

API key authentication is optional by default. Set `API_KEY_REQUIRED=true` to enforce it.

```bash
curl -H "X-API-Key: ogi_..." http://localhost:3333/v1/income/calc?country=NG
```

Keys are stored as SHA-256 hashes. Three tiers:
- **free** — 30 req/min
- **standard** — 100 req/min
- **premium** — 500 req/min

---

## ⚖️ Rulesets

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

See [RULESET_V1.md](./RULESET_V1.md) for the full specification.

### Ruleset v2 (preview)

Extends v1 with HDI and urbanization factors. Not yet active. See `GET /v1/income/rulesets/v2`.

---

## 🖥️ Admin UI

Server-rendered dashboard using htmx (no SPA). Enable with `ENABLE_ADMIN=true`.

- **Dashboard** — country count, users, API keys, request stats
- **API Key Management** — create and revoke keys with tier selection
- **Audit Log** — recent API requests with live-refresh
- **Simulate** — budget simulations with live cost preview, comparison, save/delete
- **Pilots** — create and manage pilots, link disbursements, track status, view variance

Access at `http://localhost:3333/admin`. Login with `ADMIN_PASSWORD`.

---

## ⛓️ Chain Adapters

Adapters map entitlements (PPP-USD/month) to concrete token amounts. Pure calculation — no chain writes.

- **Solana** (`src/adapters/solana/`) — SPL token amounts via configurable exchange rate
- **EVM** (`src/adapters/evm/`) — Ethereum, Polygon, Arbitrum, Optimism, Base

See `src/adapters/types.ts` for the `ChainAdapter<TConfig>` interface.

---

## 💸 Disbursement Providers

Non-custodial — calculates and prepares payment instructions, never holds or moves funds.

| Provider | ID | Currency | Notes |
|----------|-----|----------|-------|
| Solana USDC | `solana` | USDC | Returns unsigned tx payload for multisig signing |
| EVM USDC | `evm` | USDC | Unsigned ERC-20 calldata for Ethereum/Polygon/Arbitrum/Optimism/Base |
| M-Pesa (stub) | `safaricom` | KES | Validates config, logs intent — no live connection |

---

## 🔔 Webhooks

Subscribe to events and receive HMAC-SHA256 signed payloads:

`entitlement.calculated` · `user.created` · `api_key.created` · `api_key.revoked` · `data.updated` · `simulation.created` · `disbursement.created` · `disbursement.approved` · `disbursement.completed` · `disbursement.failed` · `pilot.created` · `pilot.status_changed` · `pilot.report_generated`

See `src/webhooks/` for the dispatcher and type definitions.

---

## 📦 TypeScript SDK

```bash
npm run sdk:generate
```

Produces `sdk/client.ts` with the `OgiClient` class — type-safe methods for all API endpoints.

---

## 🗄️ Database

SQLite by default (zero-config). PostgreSQL for production:

```bash
npm run db:migrate
```

Set `DB_BACKEND=postgres` and `DATABASE_URL` to switch backends.

---

## 🏗️ Architecture

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

See [ARCHITECTURE.md](./ARCHITECTURE.md) for dependency rules and design decisions.

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, code style, testing requirements, and the PR process.

## 📜 Governance

See [GOVERNANCE.md](./GOVERNANCE.md) for the decision-making process, API stability declaration, and versioning policy.

## 📋 Current Status

**Version 0.1.3** — Pilot Dashboard. 233 tests across 15 test suites.

See [CHANGELOG.md](./CHANGELOG.md) for full version history.

## 📄 License

[MIT](./LICENSE)
