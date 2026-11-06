# Developer Guide

Run, configure, call and extend Open Global Income. For what each layer does
and the state of the shipped data see [CAPABILITIES.md](CAPABILITIES.md); for
contribution rules see [CONTRIBUTING.md](../CONTRIBUTING.md).

**Contents:** [Quickstart](#quickstart) · [Environment variables](#environment-variables) · [API](#api) · [Authentication](#authentication) · [Webhooks](#webhooks) · [TypeScript SDK](#typescript-sdk) · [Database](#database) · [Architecture](#architecture) · [README assets](#readme-assets)

---

## Quickstart

### Clone & run locally

```bash
git clone https://github.com/richardkfm/open-global-income.git
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
git clone https://github.com/richardkfm/open-global-income.git
cd open-global-income
cp .env.example .env          # fill in ADMIN_USERNAME and ADMIN_PASSWORD
docker compose up --build
```

The compose file uses `ADMIN_USERNAME` and `ADMIN_PASSWORD` from the environment (or a `.env` file). Both are **required** — compose will refuse to start if either is unset to prevent accidental deployment with default credentials.

The SQLite database is persisted in `./data/ogi.sqlite` on the host via a volume mount, so data survives container restarts.

Once the container is running, the following URLs are available:

| URL | Description |
|-----|-------------|
| `http://localhost:3333/` | Public site — fact sheets, calculator, comparison, methodology, downloads |
| `http://localhost:3333/health` | Health check — verify the server is up |
| `http://localhost:3333/docs` | Swagger UI — interactive API documentation |
| `http://localhost:3333/docs/json` | Raw OpenAPI spec (JSON) |
| `http://localhost:3333/v1/income/calc?country=KE` | Example: calculate Kenya's entitlement |
| `http://localhost:3333/admin` | Admin UI |
| `http://localhost:3333/metrics` | Prometheus metrics |

#### Production essentials

All available environment variables are documented in `.env.example`. The most important ones for production:

| Variable | Default | Notes |
|----------|---------|-------|
| `ADMIN_USERNAME` | — | **Required.** No default; compose refuses to start without it |
| `ADMIN_PASSWORD` | — | **Required.** No default; compose refuses to start without it |
| `DB_PATH` | `./data/ogi.sqlite` | Set to `/app/data/ogi.sqlite` inside Docker |
| `API_KEY_REQUIRED` | `false` | Set to `true` to enforce API keys on all endpoints |
| `CORS_ORIGIN` | `*` | Restrict to your frontend origin in production |

#### Docker build only

```bash
docker build -t open-global-income .
docker run -p 3333:3333 \
  -v "$(pwd)/data:/app/data" \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=changeme \
  open-global-income
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

## Environment Variables

Every variable the application reads is declared in `src/config.ts` and mirrored in `.env.example`.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3333` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | `info` | Pino log level |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `CORS_METHODS` | `GET,POST,OPTIONS` | Allowed CORS methods |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `BATCH_MAX_ITEMS` | `50` | Max items accepted by `POST /v1/income/batch` |
| `API_KEY_REQUIRED` | `false` | Set to `true` to require an `X-Api-Key` header on every request |
| `ENABLE_ADMIN` | `true` | Set to `false` to disable the admin UI at `/admin` |
| `ENABLE_WEB` | `true` | Set to `false` to disable the public site at `/` |
| `ENABLE_METRICS` | `true` | Set to `false` to disable Prometheus `/metrics` |
| `ENABLE_AUDIT_LOG` | `true` | Set to `false` to stop recording requests in `audit_log` |
| `ADMIN_USERNAME` | `admin` | Admin UI login username, seeded on first boot |
| `ADMIN_PASSWORD` | `admin` | Admin UI login password, seeded on first boot — **change in production** |
| `DB_BACKEND` | `sqlite` | Database backend (`sqlite` or `postgres`) |
| `DB_PATH` | `./data/ogi.sqlite` | SQLite file path (ignored when `DB_BACKEND=postgres`) |
| `DATABASE_URL` | — | PostgreSQL connection string — required when `DB_BACKEND=postgres` |
| `DB_SSL` | `true` | Set to `false` to disable SSL on the PostgreSQL connection |

Note that the four `ENABLE_*` flags and `DB_SSL` are **opt-out**: each is on unless explicitly set to the string `false`.

---

## API

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
| `GET` | `/v1/income/regions` | List regions (`?country=KE` to filter) |
| `GET` | `/v1/income/regions/:id` | Region detail |
| `GET` | `/v1/income/calc/regional` | Regional entitlement (`?country=KE&region=KE-NAI`) |
| `POST` | `/v1/income/simulate/regional` | Budget simulation for a specific region |
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
| `POST` | `/v1/webhooks/inbound/:provider` | Inbound payment confirmation callback (HMAC-verified) |

Disbursement status moves `draft` → `approved` → `processing` → `completed`, or `failed` at any point after approval.

### Recipients & Identity

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/recipients` | Enrol a recipient (status: `pending`) |
| `GET` | `/v1/recipients` | List the registry (paginated, filterable) |
| `GET` | `/v1/recipients/:id` | Get a single recipient |
| `PATCH` | `/v1/recipients/:id` | Update a recipient / transition status |
| `POST` | `/v1/recipients/:id/verify` | Run a claim through an identity provider and mark `verified` |
| `POST` | `/v1/recipients/check-duplicate` | Cross-program duplicate check on an account hash |
| `GET` | `/v1/recipients/export` | Export the registry as CSV (default) or JSON (`?format=json`) |
| `GET` | `/v1/identity/providers` | List the available identity connectors |

### Funding & Fiscal Simulation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/simulate/fiscal` | Fiscal context analysis for a country's UBI cost |
| `POST` | `/v1/simulate/fund` | Build a funding scenario with multiple mechanisms |
| `POST` | `/v1/funding-scenarios` | Save a funding scenario |
| `GET` | `/v1/funding-scenarios` | List saved scenarios (paginated) |
| `GET` | `/v1/funding-scenarios/:id` | Retrieve a saved scenario |
| `DELETE` | `/v1/funding-scenarios/:id` | Delete a saved scenario |

Mechanism details: [CAPABILITIES.md → Funding and impact models](CAPABILITIES.md#funding-and-impact-models).

### Economic Impact

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/impact` | Run a full economic impact analysis (not saved) |
| `POST` | `/v1/impact/brief` | Generate exportable policy brief (`?format=json` or `?format=text`) |
| `POST` | `/v1/impact-analyses` | Run and save an impact analysis |
| `GET` | `/v1/impact-analyses` | List saved analyses (paginated) |
| `GET` | `/v1/impact-analyses/:id` | Retrieve a saved analysis |
| `DELETE` | `/v1/impact-analyses/:id` | Delete a saved analysis |

Impact dimensions and their caveats: [CAPABILITIES.md → Funding and impact models](CAPABILITIES.md#funding-and-impact-models) and [IMPACT_METHODOLOGY.md](../IMPACT_METHODOLOGY.md).

### Pilots

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/pilots` | Create a pilot linked to a simulation |
| `GET` | `/v1/pilots` | List pilots (paginated) |
| `GET` | `/v1/pilots/:id` | Get pilot with linked disbursements |
| `PATCH` | `/v1/pilots/:id` | Update status, dates, description |
| `POST` | `/v1/pilots/:id/disbursements` | Link a disbursement to a pilot |
| `GET` | `/v1/pilots/:id/report` | Generate structured donor report |
| `GET` | `/v1/pilots/:id/audit-export` | Compliance-grade audit export with SHA-256 integrity hash |

### Evidence

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/pilots/:id/outcomes` | Record a recipient- or control-cohort measurement |
| `GET` | `/v1/pilots/:id/outcomes` | List a pilot's measurements |
| `GET` | `/v1/pilots/:id/outcomes/compare` | Pre/post comparison and projected vs. actual |
| `GET` | `/v1/evidence/aggregate` | Anonymized cross-program benchmarks (median, p25, p75) |
| `GET` | `/v1/evidence/export` | CSV or JSON research export |

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/metrics` | Prometheus metrics |

---

## Authentication

API key authentication is optional by default. Set `API_KEY_REQUIRED=true` to enforce it.

```bash
curl -H "X-API-Key: ogi_..." http://localhost:3333/v1/income/calc?country=NG
```

Keys are stored as SHA-256 hashes. Three tiers:
- **free** — 30 req/min
- **standard** — 100 req/min
- **premium** — 500 req/min

---

## Webhooks

**Outbound** — subscribe to events and receive HMAC-SHA256 signed payloads. The 18 event types (`WebhookEvent` in `src/webhooks/types.ts`):

`entitlement.calculated` · `user.created` · `api_key.created` · `api_key.revoked` · `data.updated` · `simulation.created` · `disbursement.created` · `disbursement.approved` · `disbursement.completed` · `disbursement.confirmed` · `disbursement.failed` · `pilot.created` · `pilot.status_changed` · `pilot.report_generated` · `pilot.audit_export_generated` · `pilot.outcome_recorded` · `funding_scenario.created` · `impact_analysis.created`

**Inbound** — `POST /v1/webhooks/inbound/:provider` accepts payment confirmations from a disbursement provider. The provider's `parseCallback()` implementation verifies an HMAC-SHA256 signature against the raw body *before* deserialization, with a replay timestamp window. A confirmed callback transitions the disbursement's status, writes a log entry, and fires the outbound `disbursement.confirmed` / `disbursement.failed` event.

See `src/webhooks/` for the dispatcher and type definitions.

---

## TypeScript SDK

```bash
npm run sdk:generate
```

Produces `sdk/client.ts` with the `OgiClient` class — type-safe methods for all API endpoints.

---

## Database

SQLite by default (zero-config). PostgreSQL for production:

```bash
npm run db:migrate
```

Set `DB_BACKEND=postgres` and `DATABASE_URL` to switch backends.

---

## Architecture

```
src/
├── core/          Pure domain logic — types, rules, simulations, funding, impact,
│                  regions, poverty, adequacy, targeting. No I/O, zero framework deps
├── data/          Data loading, World Bank/ILO/IMF importers, countries.json, regions.json
├── api/           HTTP layer (Fastify), middleware (auth, audit, metrics), OpenAPI
├── db/            SQLite persistence, PostgreSQL migrations
├── admin/         Server-rendered admin UI (htmx)
├── web/           Public advocacy site at / (fact sheets, calculator, methodology)
├── i18n/          Translation strings for the public site
├── adapters/      Chain/currency adapters (Solana, EVM)
├── disbursements/ Payment providers (Solana USDC, EVM USDC, M-Pesa B2C, SEPA)
├── identity/      Identity verification connectors (national ID, mobile, wallet, community)
└── webhooks/      Event dispatch with HMAC-SHA256 signatures
public/            Static assets for the public site and admin UI
scripts/           SDK generation, tooling
sdk/               Generated TypeScript client SDK
```

See [ARCHITECTURE.md](../ARCHITECTURE.md) for dependency rules and design decisions.

---

## README assets

The banner and the animated pipeline at the top of the README are generated SVGs in `docs/assets/`:

```bash
node scripts/generate-readme-assets.mjs
```

The pipeline quotes real Kenya figures from the committed snapshot. `src/api/readme-scenario.test.ts` re-derives them through the same API calls the animation shows, so a data or formula change that moves them fails CI until the generator's `STAGES` figures are updated and the SVG regenerated. The evidence bars are illustrative and labelled as such in the image.
