```
     ╔═══════════════════════════════════════════════════════╗
     ║                                                       ║
     ║        ██████╗  ██████╗ ██╗                           ║
     ║       ██╔═══██╗██╔════╝ ██║                           ║
     ║       ██║   ██║██║  ███╗██║                           ║
     ║       ██║   ██║██║   ██║██║                           ║
     ║       ╚██████╔╝╚██████╔╝██║                           ║
     ║        ╚═════╝  ╚═════╝ ╚═╝                           ║
     ║                                                       ║
     ║   O P E N   G L O B A L   I N C O M E                 ║
     ║                                                       ║
     ║   Shared infrastructure for universal basic income    ║
     ║   ─────────────────────────────────────────────────   ║
     ║   DATA → CALCULATION → SIMULATION → DISTRIBUTION      ║
     ║                                                       ║
     ╚═══════════════════════════════════════════════════════╝
```

**The shared infrastructure layer for universal basic income** — the neutral, auditable protocol that any government, NGO, or DAO can build on to deliver income floors to people.

Like what OpenStreetMap did for geographic data, or what SMTP did for email: a shared standard that makes every program built on top of it cheaper, faster, and more trustworthy than if they built alone.

[Vision](#-vision) · [Who It's For](#-who-its-for) · [Principles](#-principles) · [Quickstart](#-quickstart) · [API](#-api) · [Public Site](#-public-site) · [Admin UI](#-admin-ui) · [Rulesets](#-rulesets) · [Chain Adapters](#-chain-adapters) · [Disbursements](#-disbursement-providers) · [Webhooks](#-webhooks) · [SDK](#-typescript-sdk) · [Database](#-database) · [Auth](#-authentication) · [Config](#%EF%B8%8F-environment-variables) · [Contributing](#-contributing) · [Governance](#-governance)

---

## 🔭 Vision

Open Global Income is a stack. Each layer builds on the one below it. The lower layers are useful on their own; the upper layers multiply their impact.

```
┌─────────────────────────────────────────────────┐
│  🤝 FEDERATION                                 │
│  Multi-program interop, cross-border portability│
├─────────────────────────────────────────────────┤
│  📊 EVIDENCE                                   │
│  Impact measurement, outcome tracking, research │
├─────────────────────────────────────────────────┤
│  💸 DISTRIBUTION                               │
│  Payment rails — crypto, mobile money, bank     │
├─────────────────────────────────────────────────┤
│  🧮 SIMULATION                                 │
│  Budget modeling, targeting, cost projection    │
├─────────────────────────────────────────────────┤
│  ⚖️  CALCULATION                               │
│  Entitlement formulas, scoring, rulesets        │
├─────────────────────────────────────────────────┤
│  📦 DATA                                       │
│  World Bank indicators, country economics       │
└─────────────────────────────────────────────────┘
```

### ✅ Built (v0.1.31)

**The API is the product.** Everything below is exposed through a REST API with OpenAPI docs, a generated TypeScript SDK, and webhook events — not locked behind a UI.

| Layer | What it does | Phase |
|-------|-------------|-------|
| **Data** | 49 countries with all 17 macro-economic indicators fully populated (World Bank, ILO, IMF); sub-national data for Kenya (47 counties), Germany (16 Bundesländer), France (13 regions), Netherlands (12 provinces) — 88 regions total | 14, 17 |
| **Calculation** | Entitlement formulas (v1 active, v2 preview), scoring, country comparison, regional COL adjustments | 1–10, 17 |
| **Simulation** | Budget modeling with targeting presets and programmable rules, multi-country comparison, regional simulation, saved scenarios | 11, 17, 22 |
| **Disbursement** | Non-custodial payment rails — Solana USDC, EVM USDC, M-Pesa B2C (Daraja instruction batch), SEPA Credit Transfer (ISO 20022 pain.001 + Wise skeleton) — with approval workflow and audit trail | 12 |
| **Recipients** | Enrollment, identity verification, cross-program duplicate detection — no raw identity data stored | 19 |
| **Identity** | Four pluggable, non-custodial verification connectors (national ID / MOSIP-Verhoeff, mobile-money MSISDN, wallet EVM/Solana, NGO community attestation); `POST /v1/recipients/:id/verify` runs a claim through a provider and stores only the derived hash + routing ref | 24 |
| **Pilots** | Lifecycle management (planning → active → completed), programmable targeting rules, variance analysis, structured donor reports | 13, 22 |
| **Audit Exports** | Compliance-grade signed export per pilot — methodology, recipient aggregate stats, full disbursement log, SHA-256 integrity hash | 21 |
| **Targeting** | Programmable `TargetingRules` object: age range, urban/rural, income ceiling, identity provider filter, recency exclusion, region filter; `applyRulesToRecipients` for disbursement batch generation with per-rule filtering stats | 22 |
| **Funding** | 6 funding mechanisms (income tax, VAT, carbon tax, wealth tax, FTT, redirect social spending) with informality, avoidance, and demand-response adjustments; fiscal context analysis | 15 |
| **Impact** | Poverty reduction, purchasing power, social coverage, GDP stimulus estimates — with exportable policy briefs | 16 |
| **Public site** | Advocacy-facing web UI at `/` — country fact sheets with copy-ready citations, cost & funding calculator with shareable scenario URLs, country comparison, methodology, dataset downloads | 25 |

The funding and impact layers (Phases 14–16) are not a departure from the API — they are the **demand-side tools** that make the API worth building. A calculation engine answers "how much per person?" but nobody funds a program based on that alone. Governments need to see where the money comes from. Donors need to see what happens to poverty. NGOs need a policy brief they can attach to a grant proposal. These layers turn the API into a tool that **sells basic income to policymakers**.

The sub-national data layer (Phase 17) brings precision where it matters most. A basic income floor in Nairobi (COL 1.35×) should not be the same local-currency amount as in rural Turkana (COL 0.68×). Regional cost-of-living indices adjust the national PPP conversion factor, and existing formulas work transparently via the "adjusted Country" pattern — zero formula changes needed.

Secure admin UI with login, approval workflows, and audit trails — plus a public, no-login advocacy site at `/` for journalists, researchers and policy makers. **708 tests** across 38 suites.

### Phase 23: Evidence Layer ✅

- `POST /v1/pilots/:id/outcomes` — record recipient or control cohort measurements (employment, income, food security, school attendance, poverty, health, savings)
- `GET /v1/pilots/:id/outcomes/compare` — pre/post comparison with numeric deltas and projected vs. actual from linked impact analysis
- `GET /v1/evidence/aggregate` — anonymized, cross-program benchmark statistics (median, p25, p75 per indicator) — filterable by country, income group, coverage
- `GET /v1/evidence/export` — CSV or JSON research export for academic partners
- Admin evidence page per pilot: record form, comparison table, full measurement history

### 🔜 Next

- **More countries** — sub-national data now covers Kenya (47 counties), Germany (16 Bundesländer), France (13 regions), and Netherlands (12 provinces). Next priority: Tanzania, Uganda, Ghana, Nigeria, India. The region data format and loader are country-agnostic; each country needs a curated `regions.json` entry with cost-of-living indices sourced from national statistics bureaus.

### 🌐 Future

- **More identity connectors** — the `IdentityProvider` interface now ships with four concrete connectors (national ID, mobile-money, wallet, community attestation); future work adds live-API binding (MOSIP IDA auth, World ID proofs, Daraja KYC) behind the same non-custodial contract
- **Fully-automated submission** (optional) — the M-Pesa and SEPA connectors currently prepare operator-executable instructions (non-custodial). A future opt-in mode could submit them server-side to Safaricom Daraja / Wise directly, given credentials and compliance approvals
- **Multi-currency settlement** — cross-rail reconciliation with live exchange rates
- **Federation** — multi-program interop, cross-border portability, open evidence base

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
git clone https://github.com/alcoolio/open-global-income.git
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

#### Environment variables

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
| `ENABLE_WEB` | `true` | Set to `false` to disable the public site at `/` |
| `ADMIN_USERNAME` | `admin` | Admin UI login username |
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

### Funding & Fiscal Simulation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/simulate/fiscal` | Fiscal context analysis for a country's UBI cost |
| `POST` | `/v1/simulate/fund` | Build a funding scenario with multiple mechanisms |
| `POST` | `/v1/funding-scenarios` | Save a funding scenario |
| `GET` | `/v1/funding-scenarios` | List saved scenarios (paginated) |
| `GET` | `/v1/funding-scenarios/:id` | Retrieve a saved scenario |
| `DELETE` | `/v1/funding-scenarios/:id` | Delete a saved scenario |

**Supported funding mechanisms:** income tax surcharge, VAT increase, carbon tax, wealth tax, financial transaction tax, automation tax, redirect social spending. Each returns explicit assumptions and revenue estimates.

### Economic Impact

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/impact` | Run a full economic impact analysis (not saved) |
| `POST` | `/v1/impact/brief` | Generate exportable policy brief (`?format=json` or `?format=text`) |
| `POST` | `/v1/impact-analyses` | Run and save an impact analysis |
| `GET` | `/v1/impact-analyses` | List saved analyses (paginated) |
| `GET` | `/v1/impact-analyses/:id` | Retrieve a saved analysis |
| `DELETE` | `/v1/impact-analyses/:id` | Delete a saved analysis |

**Four impact dimensions — every assumption explicitly listed:**
- **Poverty reduction** — how many people lifted above the $2.15/day extreme poverty line
- **Purchasing power** — % income increase for the bottom quintile (Lorenz curve model)
- **Social coverage** — people currently uncovered by social protection, newly reached
- **GDP stimulus** — Keynesian fiscal multiplier calibrated by income group (LIC=2.3×, LMC=1.9×, UMC=1.5×, HIC=1.1×)

See [IMPACT_METHODOLOGY.md](./IMPACT_METHODOLOGY.md) for full model documentation.

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

## 🌍 Public Site

A public, no-login web UI at `/` built for the people making the case for basic income — journalists, researchers, and policy makers. Server-rendered, readable without JavaScript, print-friendly, and every scenario is fully encoded in the URL so figures are shareable and reproducible. Disable with `ENABLE_WEB=false`.

- **`/countries`** — sortable explorer of all 49 countries with headline figures and CSV/JSON download
- **`/countries/:code`** — per-country fact sheet: copy-ready summary paragraph and citation, cost in fiscal context (vs. tax revenue and social spending), targeted program options, impact estimates with every assumption listed, a **recommended funding mix** sized to the country's own economic profile, and the entitlement formula with the country's own numbers plugged in. Print → PDF yields a briefing document
- **`/calculator`** — cost & funding calculator: coverage, target group, duration, transfer amount, and **live taxation sliders** for all seven funding mechanisms — results, impact and funding coverage update as you drag, and the URL tracks every change so scenarios stay reproducible
- **`/compare`** — up to four countries side by side on identical terms
- **`/methodology`** — every formula, constant, assumption, data source, and limitation; values imported from the actual code constants
- **`/data`** — dataset downloads (`/data/countries.csv`, `/data/countries.json`) and API pointers

---

## 🖥️ Admin UI

Server-rendered dashboard using htmx (no SPA). Enable with `ENABLE_ADMIN=true`.

**Login:** Default credentials are username `admin` / password `admin` (both configurable via `ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars).

- **Dashboard** — country count, users, API keys, request stats
- **API Key Management** — create and revoke keys with tier selection
- **Audit Log** — recent API requests with live-refresh
- **Simulate** — budget simulations with live cost preview, comparison, save/delete
- **Funding** — interactive scenario builder with slider controls for 6 funding mechanisms, stacked bar chart, fiscal context panel, and assumption transparency
- **Impact** — economic impact analyzer with poverty reduction, purchasing power, social coverage, and GDP stimulus estimates; tabbed breakdown, policy brief export
- **Pilots** — create and manage pilots, link disbursements, track status, view variance
- **Countries** — economic dashboards with data completeness indicators
- **Regions** — sub-national data browser with COL index badges, entitlement comparison (national vs. regional)

Access at `http://localhost:3333/admin/login`. Sessions are secure (HttpOnly cookies, PBKDF2-hashed passwords) with brute-force protection (15-minute lockout after 5 failed attempts).

---

## ⛓️ Chain Adapters

Adapters map entitlements (PPP-USD/month) to concrete token amounts. Pure calculation — no chain writes.

- **Solana** (`src/adapters/solana/`) — SPL token amounts via configurable exchange rate
- **EVM** (`src/adapters/evm/`) — Ethereum, Polygon, Arbitrum, Optimism, Base

See `src/adapters/types.ts` for the `ChainAdapter<TConfig>` interface.

---

## 💸 Disbursement Providers

Non-custodial — calculates and prepares payment instructions, never holds or moves funds. The mobile-money and bank connectors follow the same pattern as the crypto adapters: they emit a format-correct, ready-to-execute instruction in the exact shape the existing rail consumes (Safaricom Daraja, ISO 20022 / Wise), which the program operator submits from their own authenticated environment. OGI builds no payment service and stores no recipient PII; identity/KYC is delegated entirely to the executing provider.

| Provider | ID | Currency | Notes |
|----------|-----|----------|-------|
| Solana USDC | `solana` | USDC | Returns unsigned tx payload for multisig signing |
| EVM USDC | `evm` | USDC | Unsigned ERC-20 calldata for Ethereum/Polygon/Arbitrum/Optimism/Base |
| M-Pesa B2C | `safaricom` | KES | Prepares a Daraja **B2C PaymentRequest** instruction batch (endpoints, request template) for the operator to submit — no funds moved, no MSISDNs stored |
| SEPA Credit Transfer | `sepa` | EUR | Prepares an **ISO 20022 pain.001** document + a Wise Payouts bulk skeleton; PPP-USD→EUR via the maintained FX snapshot. Accepts Wise webhooks at `/v1/webhooks/inbound/sepa` |

---

## 🔔 Webhooks

Subscribe to events and receive HMAC-SHA256 signed payloads:

`entitlement.calculated` · `user.created` · `api_key.created` · `api_key.revoked` · `data.updated` · `simulation.created` · `disbursement.created` · `disbursement.approved` · `disbursement.completed` · `disbursement.failed` · `pilot.created` · `pilot.status_changed` · `pilot.report_generated` · `funding_scenario.created` · `impact_analysis.created`

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
├── web/         Public advocacy site at / (fact sheets, calculator, methodology)
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

**Version 0.2.2** — Rotating wireframe globe on the landing page hero (dependency-free canvas animation), and a country-specific **recommended funding mix** on fact sheets — replacing the old fixed-rate 7-mechanism package (which could show wildly over- or under-shooting coverage depending on the country) with rates sized to each country's own formality, tax base, wealth concentration, and social-spending profile, water-filled across mechanisms toward full coverage. 708 tests across 38 suites.

**Version 0.2.1** — Live taxation sliders on the public calculator. The interactive funding-scenario experience from the admin panel is now public: all seven mechanisms (income tax, VAT, carbon tax, wealth tax, FTT, automation tax, redirected social spending) are sliders whose results — cost coverage, gap, chart, impact estimates — update live as you drag, with the URL tracking every change so a dragged-together scenario is still a shareable, reproducible link. Plain-GET fallback works without JavaScript. Also fixes horizontal bar charts showing tick indices instead of category labels. 701 tests across 38 suites.

**Version 0.2.0** — Public advocacy site. A new no-login web UI at `/` (`src/web/`) gives journalists, researchers and policy makers directly quotable, verifiable basic income figures: per-country **fact sheets** with copy-ready summary paragraphs and citation blocks, a **cost & funding calculator** whose entire scenario lives in a shareable URL, **country comparison** on identical terms, a **methodology** page whose numbers are imported from the actual code constants, and **dataset downloads** (CSV/JSON) with computed entitlement and cost columns. Print any fact sheet or calculator result to get a briefing PDF. Poverty figures fall back to the $2.15/day extreme line (clearly marked) where no survey exists for the country-appropriate line. Disable with `ENABLE_WEB=false`. 699 tests across 38 suites.

**Version 0.1.34** — PPP-consistent "% of GDP" everywhere. A new `gdpPerCapitaPppUsd` field (World Bank `NY.GDP.PCAP.PP.CD`) is added to all 49 countries and used as the GDP base wherever a PPP-denominated cost or revenue is expressed as a share of GDP — fixing a distortion that inflated the cost-as-%-of-GDP headline for low-income countries by roughly the PPP gap (Kenya's 20%-coverage figure drops from 24.0% to 7.7%; Nigeria from 23.1% to 2.8%). Simulation, funding, impact, savings, and the admin projection chart all share the PPP unit; funding mechanisms now emit genuine PPP-USD revenue. 671 tests across 37 suites.

**Version 0.1.33** — Recipient registry export, the round-trip counterpart to bulk import. `GET /v1/recipients/export` returns the (optionally filtered) registry as CSV or JSON (`?format=json`) as a download, and a **Download CSV** button on the admin recipients card (`/admin/identity`) streams the same, honouring the active filters. The first five CSV columns are import-compatible, so an export reads straight back through the importer; serialisation lives in a pure core module (`src/core/recipient-export.ts`). 671 tests across 37 suites.

**Version 0.1.32** — Recipient admin UI & bulk import. The Identity Providers page (`/admin/identity`) becomes a full recipient registry console: enrol a recipient from the UI, filter/paginate the registry by country, status, and pilot, and open a per-recipient detail page with status-transition controls that enforce the same `pending → verified → suspended` rules as the API. A **bulk import** form ingests pasted CSV (`countryCode` required; `paymentMethod,accountHash,routingRef,identityProvider` optional), skipping rows whose account hash is already enrolled in the same country (cross-program de-duplication) and reporting a per-line created/skipped/errored summary. CSV parsing lives in a pure, I/O-free core module (`src/core/recipient-import.ts`). 660 tests across 36 suites.

**Version 0.1.31** — Identity provider connections, the first item on the gov-ready list. The `IdentityProvider` interface now ships with four concrete, non-custodial connectors in a registry (`src/identity/`), one per deployment context: **national-id** (MOSIP-compatible, Verhoeff check digit), **mobile-kyc** (E.164 MSISDN), **wallet** (EVM / Solana), and **community-attestation** (NGO witness quorum). A new `POST /v1/recipients/:id/verify` runs a recipient's claim through a provider, marks the recipient `verified`, runs cross-program duplicate detection on the derived hash, and discards the raw claim — only the non-reversible `accountHash` + `routingRef` are stored. `GET /v1/identity/providers` exposes the catalog, and a new **Identity Providers** admin page (`/admin/identity`) lists the connectors and offers a verify form. Each connector does deterministic offline format/checksum validation and delegates the authoritative KYC/personhood assertion to the external provider. 638 tests across 34 suites.

**Version 0.1.30** — M-Pesa and SEPA promoted from stubs to real non-custodial connectors. The M-Pesa provider now emits a Safaricom Daraja **B2C PaymentRequest** instruction batch (env-correct endpoints + a populated request template, secrets never echoed); the SEPA provider emits a standards-compliant **ISO 20022 pain.001** document plus a Wise Payouts bulk skeleton, converting PPP-USD→EUR via the maintained FX snapshot (replacing the old hardcoded rate) and surfacing the applied rate + provenance. Both follow the crypto adapters' non-custodial pattern — OGI prepares operator-executable instructions, stores no recipient PII, and delegates identity/KYC to the executing provider. The `DisbursementProvider.submit`/`checkStatus` interface now receives the channel config so connectors can populate originator fields. 608 tests across 32 suites.

See [CHANGELOG.md](./CHANGELOG.md) for full version history.

## 📄 License

[MIT](./LICENSE)
