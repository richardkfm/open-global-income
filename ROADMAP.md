# Roadmap: From Calculator to Pilot Platform

This document describes the next three major phases that transform Open Global Income from a calculation API into an operational platform that can power real basic income pilots.

**Why these phases matter:** The calculation layer (v0.1.0) answers *"how much per person?"* — but an LLM query could do the same. The phases below answer *"how much will it cost, how does the money move, and is it working?"* — that's what makes this project indispensable for anyone running a real program.

---

## Phase 11: Budget Simulation Engine

**Goal:** Enable governments and NGOs to model realistic basic income scenarios before committing resources. Answer: *"What would it actually cost to cover X% of the population?"*

### 11.1 — Core simulation endpoint

`POST /v1/simulate`

Accept a simulation request with targeting parameters:

```json
{
  "country": "KE",
  "coverage": 0.2,
  "targetGroup": "all",
  "durationMonths": 12,
  "adjustments": {
    "floorOverride": null,
    "householdSize": null
  }
}
```

Return a full cost breakdown:

```json
{
  "ok": true,
  "data": {
    "country": { "code": "KE", "name": "Kenya", "population": 54030000 },
    "simulation": {
      "recipientCount": 10806000,
      "coverageRate": 0.2,
      "entitlementPerPerson": {
        "pppUsdPerMonth": 210,
        "localCurrencyPerMonth": 10367.7
      },
      "cost": {
        "monthlyLocalCurrency": 112012662000,
        "annualLocalCurrency": 1344151944000,
        "annualPppUsd": 27223260000,
        "asPercentOfGdp": 24.1
      },
      "meta": { "rulesetVersion": "v1", "dataVersion": "worldbank-2023" }
    }
  }
}
```

**Key calculations:**
- `recipientCount = population × coverage`
- `monthlyTotal = recipientCount × localCurrencyPerMonth`
- `annualTotal = monthlyTotal × durationMonths`
- `asPercentOfGdp = annualPppUsd / (gdpPerCapitaUsd × population) × 100`

### 11.2 — Targeting presets

Predefined targeting strategies beyond a flat coverage percentage:

| Preset | Logic |
|--------|-------|
| `all` | Universal — entire population |
| `bottom_quintile` | Bottom 20% by income (approximated from Gini) |
| `below_poverty_line` | Population below national poverty line (requires additional data source) |
| `children` | Age 0–17 (requires age distribution data — use UN Population Division estimates) |
| `elderly` | Age 65+ (same source) |

Start with `all` and `bottom_quintile` (derivable from existing Gini data). Add age-based presets when UN demographic data is integrated.

### 11.3 — Comparison simulation

`POST /v1/simulate/compare`

Compare the same scenario across multiple countries in one request:

```json
{
  "countries": ["KE", "MZ", "BI"],
  "coverage": 0.2,
  "durationMonths": 12
}
```

Returns an array of simulation results sorted by annual cost, enabling side-by-side comparison for NGOs choosing pilot sites.

### 11.4 — Saved simulations (database)

New `simulations` table:

```sql
CREATE TABLE simulations (
  id TEXT PRIMARY KEY,
  name TEXT,
  country_code TEXT NOT NULL,
  parameters TEXT NOT NULL,  -- JSON blob
  results TEXT NOT NULL,     -- JSON blob
  api_key_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);
```

Endpoints:
- `POST /v1/simulations` — save a simulation with a name
- `GET /v1/simulations` — list saved simulations (paginated)
- `GET /v1/simulations/:id` — retrieve a saved simulation
- `DELETE /v1/simulations/:id` — delete

### 11.5 — Admin UI: simulation page

Add `/admin/simulate` page with:
- Country dropdown + coverage slider + duration input
- Live cost preview (htmx partial refresh)
- Comparison table for multi-country simulations
- Save/load simulation presets

### 11.6 — Webhook event

New event: `simulation.created` — fired when a simulation is saved, so downstream systems can react (e.g., update a donor dashboard).

### 11.7 — Tests & documentation

- Unit tests for simulation math (pure functions)
- API integration tests for all simulation endpoints
- Update OpenAPI spec
- Update USECASE.md with simulation examples

---

## Phase 12: Disbursement Integration — Complete ✅

**Goal:** Connect the calculation layer to real payment rails. Answer: *"How does the money actually reach people?"*

### 12.1 — Disbursement data model

New tables:

```sql
CREATE TABLE disbursement_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,           -- e.g., "M-Pesa Kenya", "USDC Solana"
  type TEXT NOT NULL,           -- "mobile_money" | "bank_transfer" | "crypto"
  provider TEXT NOT NULL,       -- "safaricom" | "solana" | "evm"
  country_code TEXT,            -- NULL for crypto (global)
  config TEXT NOT NULL,         -- JSON: provider-specific config
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE disbursements (
  id TEXT PRIMARY KEY,
  simulation_id TEXT,           -- links to the cost model that justified this
  channel_id TEXT NOT NULL,
  country_code TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  amount_per_recipient TEXT NOT NULL,  -- local currency or token
  total_amount TEXT NOT NULL,
  currency TEXT NOT NULL,       -- "KES", "USDC", etc.
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | processing | completed | failed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  completed_at TEXT,
  api_key_id TEXT,
  FOREIGN KEY (channel_id) REFERENCES disbursement_channels(id),
  FOREIGN KEY (simulation_id) REFERENCES simulations(id),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE TABLE disbursement_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disbursement_id TEXT NOT NULL,
  event TEXT NOT NULL,          -- "created" | "approved" | "submitted" | "confirmed" | "failed"
  details TEXT,                 -- JSON: provider response, tx hash, error
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (disbursement_id) REFERENCES disbursements(id)
);
```

### 12.2 — Disbursement provider interface

```typescript
interface DisbursementProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly supportedCurrencies: string[];

  /** Validate that the channel config is correct (API keys, endpoints, etc.) */
  validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; error?: string }>;

  /** Submit a disbursement for processing */
  submit(disbursement: Disbursement): Promise<DisbursementResult>;

  /** Check the status of a submitted disbursement */
  checkStatus(externalId: string): Promise<DisbursementStatus>;
}
```

### 12.3 — Crypto provider: Solana USDC

First concrete provider — build on the existing Solana adapter:

- Takes a disbursement, maps entitlement → USDC token amount via `solanaAdapter.toTokenAmount()`
- Generates unsigned transactions (the platform doesn't hold keys)
- Returns transaction payloads for signing by the DAO's multisig or treasury wallet
- Status checks via Solana RPC (transaction confirmation)

This keeps the platform **non-custodial** — it calculates and prepares, but never holds or moves funds directly.

### 12.4 — Crypto provider: EVM USDC

Same pattern for EVM chains using the existing EVM adapter:

- Generate unsigned ERC-20 transfer calldata
- Support batch transfers via multicall patterns
- Pre-configured for Ethereum, Polygon, Arbitrum, Optimism, Base

### 12.5 — Mobile money provider: M-Pesa (stub)

Stub implementation with the provider interface — validates config, accepts submissions, returns "pending" status. Real M-Pesa integration requires Safaricom API credentials and compliance approvals, so the stub:
- Documents the required config fields (app key, app secret, shortcode, environment)
- Validates the config shape
- Logs what *would* be sent
- Returns a mock transaction ID

This lets the full pipeline be tested end-to-end while the real integration is developed separately.

### 12.6 — API endpoints

- `GET /v1/disbursements/channels` — list available channels
- `POST /v1/disbursements/channels` — register a new channel (admin)
- `POST /v1/disbursements` — create a disbursement (status: draft)
- `POST /v1/disbursements/:id/approve` — approve for processing
- `POST /v1/disbursements/:id/submit` — submit to payment provider
- `GET /v1/disbursements/:id` — get status and log
- `GET /v1/disbursements` — list all disbursements (paginated, filterable)

### 12.7 — Webhook events

New events:
- `disbursement.created`
- `disbursement.approved`
- `disbursement.completed`
- `disbursement.failed`

### 12.8 — Tests & documentation

- Unit tests for each provider (mocked)
- Integration tests for the disbursement lifecycle (draft → approved → submitted → completed)
- Update OpenAPI spec
- Update USECASE.md Scenario C (DAO) with real disbursement flow

---

## Phase 13: Pilot Dashboard ✅

**Goal:** Give NGOs and government stakeholders a real-time view of a running pilot. Answer: *"Is it working, and can we prove it?"*

### 13.1 — Pilot data model

```sql
CREATE TABLE pilots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,           -- e.g., "Kenya Bottom-20% Pilot 2026"
  country_code TEXT NOT NULL,
  description TEXT,
  simulation_id TEXT,           -- the simulation that scoped this pilot
  status TEXT NOT NULL DEFAULT 'planning',  -- planning | active | paused | completed
  start_date TEXT,
  end_date TEXT,
  target_recipients INTEGER,
  api_key_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (simulation_id) REFERENCES simulations(id),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE TABLE pilot_disbursements (
  pilot_id TEXT NOT NULL,
  disbursement_id TEXT NOT NULL,
  PRIMARY KEY (pilot_id, disbursement_id),
  FOREIGN KEY (pilot_id) REFERENCES pilots(id),
  FOREIGN KEY (disbursement_id) REFERENCES disbursements(id)
);
```

### 13.2 — Pilot CRUD API

- `POST /v1/pilots` — create a pilot (linked to a simulation)
- `GET /v1/pilots` — list pilots (paginated)
- `GET /v1/pilots/:id` — full pilot detail with linked disbursements and stats
- `PATCH /v1/pilots/:id` — update status, dates, description
- `POST /v1/pilots/:id/disbursements` — link a disbursement to the pilot
- `GET /v1/pilots/:id/report` — generate a summary report (JSON)

### 13.3 — Admin UI: pilot dashboard page

New `/admin/pilots` section with:

**Pilot list view:**
- All pilots with status badges (planning / active / paused / completed)
- Country, recipient count, total disbursed, date range

**Single pilot detail view:**
- Header: pilot name, country, status, date range
- Summary cards: total recipients, total disbursed, disbursements count, average per recipient
- Disbursement timeline: chronological list of all linked disbursements with status
- Cost vs. simulation: compare actual spend against the original simulation estimate
- Audit trail: all events related to this pilot's disbursements

### 13.4 — Pilot report endpoint

`GET /v1/pilots/:id/report`

Structured JSON report suitable for donors and auditors:

```json
{
  "pilot": { "name": "...", "country": "KE", "status": "active" },
  "summary": {
    "totalRecipients": 10806000,
    "totalDisbursed": { "localCurrency": 1120126620000, "pppUsd": 22692600000 },
    "disbursementCount": 12,
    "averagePerRecipient": { "localCurrency": 103677, "pppUsd": 2100 },
    "periodCovered": { "from": "2026-01-01", "to": "2026-12-31" }
  },
  "simulation": { "id": "...", "projectedCost": "...", "variance": "+2.3%" },
  "disbursements": [ ... ],
  "meta": { "rulesetVersion": "v1", "dataVersion": "worldbank-2023", "generatedAt": "..." }
}
```

### 13.5 — Webhook events

New events:
- `pilot.created`
- `pilot.status_changed`
- `pilot.report_generated`

### 13.6 — Tests & documentation

- Unit tests for report generation
- Integration tests for pilot lifecycle
- API tests for all pilot endpoints
- Update OpenAPI spec
- Update USECASE.md with end-to-end pilot scenario

---

## Dependency chain

```
Phase 11 (Simulation)
    ↓ simulation_id
Phase 12 (Disbursement)  ← uses adapters (Solana, EVM)
    ↓ disbursement_id
Phase 13 (Pilot Dashboard) ← ties simulations + disbursements together
```

Each phase builds on the previous. Phase 11 can be used standalone (an NGO just modeling costs). Phase 12 adds the ability to act on those models. Phase 13 wraps everything in operational visibility.

---

## What this enables

After all three phases, the platform supports this end-to-end workflow:

1. **Model** — NGO runs `POST /v1/simulate` for Kenya, bottom 20%, 12 months → sees it costs ~1.34T KES/year
2. **Decide** — Compares against Mozambique and Burundi via `/v1/simulate/compare`
3. **Fund** — Creates a pilot, links it to the simulation
4. **Pay** — Creates disbursements via Solana USDC or M-Pesa, approves and submits
5. **Monitor** — Views the pilot dashboard, tracks actual vs. projected spend
6. **Report** — Generates a structured report for donors with full audit trail

*That* is something an LLM query cannot do.
