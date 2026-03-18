# Use Case: Setting Up a Basic Income Program

Open Global Income is a **calculation and scoring layer**. It does not distribute money. It answers one question transparently: *how much should a basic income floor be for a given country, and how urgent is the need?*

Any actor — government, NGO, DAO — builds their distribution and identity layer on top. This document walks through what the API (v0.1.0) can do today, using real data, and where the gaps are.

---

## Quick Setup

```bash
npm install
npm run dev
# Verify:
curl http://localhost:3333/health
# → { "status": "ok" }
```

The API is now running on `http://localhost:3333`. Interactive docs at `http://localhost:3333/docs` (Swagger UI).

---

## Scenario A: Government Ministry Exploring Basic Income (Kenya)

A ministry of social protection wants to understand what a basic income floor would look like for Kenya, grounded in international data.

### Step 1 — Check if Kenya is supported

```bash
curl http://localhost:3333/v1/income/countries
```

Find Kenya in the response:

```json
{
  "code": "KE",
  "name": "Kenya",
  "incomeGroup": "LMC",
  "hasGiniData": true
}
```

49 countries are supported across all four World Bank income groups. If a country is missing, it can be added by editing `src/data/worldbank/config.json` and running `npm run data:update`.

For full economic data, use the country detail endpoint:

```bash
curl http://localhost:3333/v1/income/countries/KE
```

```json
{
  "ok": true,
  "data": {
    "code": "KE",
    "name": "Kenya",
    "stats": {
      "gdpPerCapitaUsd": 2099,
      "gniPerCapitaUsd": 2010,
      "pppConversionFactor": 49.37,
      "giniIndex": 38.7,
      "population": 54030000,
      "incomeGroup": "LMC"
    },
    "dataVersion": "worldbank-2023"
  }
}
```

### Step 2 — Audit the formula

```bash
curl http://localhost:3333/v1/income/rulesets
```

```json
{
  "ok": true,
  "data": [
    {
      "version": "v1",
      "name": "Ruleset v1",
      "active": true,
      "formula": "pppUsdPerMonth = 210; localCurrency = 210 × pppFactor; score = clamp(incomeRatio + giniPenalty, 0, 1)",
      "parameters": {
        "globalIncomeFloorPpp": 210,
        "giniWeight": 0.15
      }
    }
  ]
}
```

The ministry can verify: the formula uses **GNI per capita** and **Gini index** from World Bank Open Data — both publicly available. The `rulesetVersion` and `dataVersion` fields in every response act as audit anchors. A Ruleset v2 (preview, not yet active) extends v1 with HDI and urbanization factors. See [RULESET_V1.md](./RULESET_V1.md) for the full v1 specification.

### Step 3 — Calculate the entitlement for Kenya

```bash
curl "http://localhost:3333/v1/income/calc?country=KE"
```

```json
{
  "ok": true,
  "data": {
    "countryCode": "KE",
    "pppUsdPerMonth": 210,
    "localCurrencyPerMonth": 10367.7,
    "score": 1,
    "meta": {
      "rulesetVersion": "v1",
      "dataVersion": "worldbank-2023"
    }
  }
}
```

**What this means for a policymaker:**

- The global floor of **210 PPP-USD/month** converts to roughly **10,368 KES/month** (~$80 USD at market rates) in Kenyan purchasing power.
- A **score of 1.0** means the global floor exceeds Kenya's average monthly GNI — maximum relative need. This is typical for LMC and LIC countries.
- The $210/month figure is derived from the World Bank upper-middle-income poverty line ($6.85/day in 2017 PPP). It is a **reference point**, not a policy recommendation — a ministry could adopt it directly, use it as a starting point, or scale it.

### Step 4 — Budget simulation

Use the simulation endpoint to model the full program cost directly:

```bash
curl -X POST http://localhost:3333/v1/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "country": "KE",
    "coverage": 0.2,
    "targetGroup": "all",
    "durationMonths": 12,
    "adjustments": { "floorOverride": null, "householdSize": null }
  }'
```

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
        "monthlyLocalCurrency": 112032886200,
        "annualLocalCurrency": 1344394634400,
        "annualPppUsd": 27231120000,
        "asPercentOfGdp": 23.96
      },
      "meta": { "rulesetVersion": "v1", "dataVersion": "worldbank-2023" }
    }
  }
}
```

Covering the **bottom quintile** (a common targeting approach) instead of a flat 20%:

```bash
curl -X POST http://localhost:3333/v1/simulate \
  -H "Content-Type: application/json" \
  -d '{"country":"KE","coverage":1.0,"targetGroup":"bottom_quintile","durationMonths":12,"adjustments":{"floorOverride":null,"householdSize":null}}'
```

To save a simulation for later reference:

```bash
curl -X POST http://localhost:3333/v1/simulations \
  -H "Content-Type: application/json" \
  -d '{"name":"Kenya 20% coverage 2026","country":"KE","coverage":0.2,"targetGroup":"all","durationMonths":12,"adjustments":{"floorOverride":null,"householdSize":null}}'
```

Saved simulations can be listed (`GET /v1/simulations`), retrieved (`GET /v1/simulations/:id`), and deleted (`DELETE /v1/simulations/:id`). They also trigger the `simulation.created` webhook event.

### Step 5 — Subscribe to updates

When the dataset or ruleset changes, the ministry can be notified automatically via **webhooks**:

Subscribe to `data.updated` and `ruleset.updated` events to receive HMAC-SHA256 signed payloads at your endpoint. This means recalculations trigger automatically when World Bank data is refreshed.

### Step 6 — Create a pilot program

With a saved simulation in hand, the ministry can create an operational pilot:

```bash
curl -X POST http://localhost:3333/v1/pilots \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kenya Bottom-20% Pilot 2026",
    "countryCode": "KE",
    "simulationId": "<simulation-id-from-step-4>",
    "description": "12-month pilot targeting bottom quintile",
    "targetRecipients": 10806000,
    "startDate": "2026-01-01",
    "endDate": "2026-12-31"
  }'
# → { "ok": true, "data": { "id": "...", "status": "planning", ... } }
```

### Step 7 — Activate and link disbursements

When funding is secured, activate the pilot and link disbursements as they are created:

```bash
# Activate the pilot
curl -X PATCH http://localhost:3333/v1/pilots/<pilot-id> \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'

# Link a disbursement to the pilot
curl -X POST http://localhost:3333/v1/pilots/<pilot-id>/disbursements \
  -H "Content-Type: application/json" \
  -d '{"disbursementId": "<disbursement-id>"}'
```

### Step 8 — Monitor and report

Track actual spending against the original simulation, and generate structured reports for donors:

```bash
# Get pilot details with all linked disbursements
curl http://localhost:3333/v1/pilots/<pilot-id>

# Generate a structured report
curl http://localhost:3333/v1/pilots/<pilot-id>/report
# → {
#     "pilot": { "name": "...", "status": "active" },
#     "summary": { "totalRecipients": 1000, "totalDisbursed": 210000, "variance": "-99.2%" },
#     "simulation": { "projectedCost": 27231120000, "variance": "-99.2%" },
#     "disbursements": [ ... ],
#     "meta": { "generatedAt": "..." }
#   }
```

The variance shows how actual disbursements compare to the simulation projection — essential for donor accountability.

### Step 9 — Complete the pilot

```bash
curl -X PATCH http://localhost:3333/v1/pilots/<pilot-id> \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### Step 10 — What the API does NOT provide yet

| What a real program needs | Available today? | Notes |
|---------------------------|:---:|-------|
| Entitlement amount per person | Yes | 210 PPP-USD = ~10,368 KES/month |
| Formula transparency & auditability | Yes | `/rulesets` endpoint, open source |
| Country detail with population | Yes | `GET /v1/income/countries/KE` returns full stats |
| Batch country comparison | Yes | `POST /v1/income/batch` with up to 50 countries |
| User persistence | Yes | SQLite (default) or PostgreSQL |
| API authentication | Yes | API key auth with free/standard/premium tiers |
| Audit logging | Yes | All API requests logged |
| Event notifications | Yes | Webhooks with HMAC-SHA256 signatures |
| Total budget estimate | Yes | `POST /v1/simulate` returns full cost breakdown |
| Coverage/targeting simulation | Yes | `all` and `bottom_quintile` targeting presets supported |
| Disbursement mechanism | Yes | Solana USDC, EVM USDC, M-Pesa (stub) with approval workflow |
| Pilot lifecycle tracking | Yes | `planning → active → paused → completed` with donor reports |
| Variance analysis | Yes | Actual spend vs. simulation projection in pilot reports |
| Identity / deduplication | No | User model has no KYC or national ID integration |
| Household size adjustment | No | Entitlement is per-person, flat |
| Historical trends / projections | No | Single data snapshot (worldbank-2023) |
| Market exchange rate conversion | No | Only PPP conversion is provided |

---

## Scenario B: NGO Comparing Countries for a Pilot

An NGO wants to pilot basic income in one of several low-income countries and needs data to justify the choice.

### Step 1 — Compare candidate countries

Use the batch endpoint to compare in a single call:

```bash
curl -X POST http://localhost:3333/v1/income/batch \
  -H "Content-Type: application/json" \
  -d '{"countries": ["MZ", "BI", "ET"]}'
```

| Country | Local currency/month | Score | GNI/capita | Gini | Population |
|---------|--------------------:|:-----:|-----------:|-----:|-----------:|
| Mozambique (MZ) | 5,565 MZN | 1.0 | $480 | 54.0 | 32.97M |
| Burundi (BI) | 155,610 BIF | 1.0 | $240 | 38.6 | 12.89M |
| Ethiopia (ET) | 3,631 ETB | 1.0 | $1,020 | 35.0 | 123.4M |

All three score 1.0 (maximum need). The score alone doesn't differentiate between LIC countries — the useful comparison is on **local currency amounts** (cost per person) and **population** (total program cost). Mozambique's high Gini (54.0) might also factor into the NGO's decision as an indicator of inequality.

**Observation:** The current scoring model saturates at 1.0 for most LMC/LIC countries. Ruleset v2 (preview) aims to provide finer granularity within the high-need tier using HDI and urbanization factors.

### Step 1b — Compare full program costs

The batch endpoint compares per-person entitlements. To compare total **program costs** (including population scale) use the comparison simulation endpoint:

```bash
curl -X POST http://localhost:3333/v1/simulate/compare \
  -H "Content-Type: application/json" \
  -d '{"countries": ["MZ", "BI", "ET"], "coverage": 0.2, "durationMonths": 12}'
```

This returns results sorted by annual PPP-USD cost ascending, making it easy to identify which country is most cost-efficient for a given coverage rate. For example, Burundi (population 12.89M) will be much cheaper than Ethiopia (123.4M) at the same 20% coverage, even though per-person costs differ.

Save the chosen simulation for future reference:

```bash
curl -X POST http://localhost:3333/v1/simulations \
  -H "Content-Type: application/json" \
  -d '{"name":"Burundi 20% pilot scoping","country":"BI","coverage":0.2,"targetGroup":"all","durationMonths":12,"adjustments":{"floorOverride":null,"householdSize":null}}'
```

### Step 2 — Model a pilot cohort

```bash
# Register a test user
curl -X POST http://localhost:3333/v1/users \
  -H "Content-Type: application/json" \
  -d '{"country_code": "MZ"}'
# → { "ok": true, "data": { "id": "...", "countryCode": "MZ", "createdAt": "..." } }

# Get their entitlement
curl http://localhost:3333/v1/users/{id}/income
```

Users are now persisted in SQLite (or PostgreSQL with `DB_BACKEND=postgres`), so data survives restarts. However, an NGO running a real pilot would still need:
- KYC / identity verification
- Enrollment workflows with demographic data
- Integration with local payment systems

### Step 3 — Integrate programmatically

Use the generated TypeScript SDK for type-safe integration:

```bash
npm run sdk:generate
```

```typescript
import { OgiClient } from './sdk/client.js';

const client = new OgiClient('http://localhost:3333');
const result = await client.calcIncome('MZ');
console.log(result.data.localCurrencyPerMonth); // 5565
```

### Step 4 — What's missing for NGOs

- **CSV/spreadsheet export** — for reports and grant proposals
- **Sub-national data** — districts and provinces vary widely within a country
- **Disbursement integration** — M-Pesa, bank transfer, etc.
- **Donor reporting** — structured reports beyond the audit log

---

## Scenario C: DAO Distributing Funds On-Chain

A ReFi DAO wants to distribute USDC to participants based on Open Global Income scores.

### Step 1 — Calculate entitlement

```bash
curl "http://localhost:3333/v1/income/calc?country=NG"
# → 210 PPP-USD/month, score 1.0
```

### Step 2 — Map to token amount using chain adapters

Both **Solana** and **EVM** adapters are available as TypeScript libraries. They convert a `GlobalIncomeEntitlement` into a `TokenAmount` with raw amounts (lamports/wei) and display amounts:

```typescript
import { solanaAdapter } from './src/adapters/solana/index.js';

const entitlement = await fetch('http://localhost:3333/v1/income/calc?country=NG')
  .then(r => r.json())
  .then(r => r.data);

const tokenAmount = solanaAdapter.toTokenAmount(entitlement, {
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  exchangeRate: 1, // 1 PPP-USD = 1 USDC
});

console.log(tokenAmount);
// {
//   rawAmount: 210000000n,  (210 USDC in lamports)
//   displayAmount: "210.000000",
//   symbol: "USDC",
//   decimals: 6
// }
```

For EVM chains, pre-configured settings are available for Ethereum, Polygon, Arbitrum, Optimism, and Base:

```typescript
import { evmAdapter, evmChains } from './src/adapters/evm/index.js';

const tokenAmount = evmAdapter.toTokenAmount(entitlement, {
  ...evmChains.polygon,
  exchangeRate: 1,
});
```

### Step 3 — Run a budget simulation

Use the simulation engine to plan the distribution before committing funds:

```bash
curl -X POST http://localhost:3333/v1/simulate \
  -H "Content-Type: application/json" \
  -d '{"country":"NG","coverage":0.2,"targetGroup":"bottom_quintile","durationMonths":1,"adjustments":{"floorOverride":null,"householdSize":null}}'
# → recipientCount: 8_600_000, monthlyPppUsd: ~1,806,000,000
```

### Step 4 — Register a disbursement channel

Register the DAO's Solana USDC channel once:

```bash
curl -X POST http://localhost:3333/v1/disbursements/channels \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Solana USDC Global",
    "type": "crypto",
    "provider": "solana",
    "config": { "rpcUrl": "https://api.mainnet-beta.solana.com" }
  }'
# → { "ok": true, "data": { "id": "ch_abc123", "provider": "solana", ... } }
```

### Step 5 — Create and approve a disbursement

```bash
# Create (status: draft)
curl -X POST http://localhost:3333/v1/disbursements \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "ch_abc123",
    "countryCode": "NG",
    "recipientCount": 1000,
    "amountPerRecipient": "210.00",
    "totalAmount": "210000.00",
    "currency": "USDC",
    "simulationId": "sim_xyz"
  }'
# → { "data": { "id": "d_789", "status": "draft", ... } }

# Approve (status: approved — triggers disbursement.approved webhook)
curl -X POST http://localhost:3333/v1/disbursements/d_789/approve
```

### Step 6 — Submit to the payment provider

```bash
curl -X POST http://localhost:3333/v1/disbursements/d_789/submit
# → {
#     "data": {
#       "disbursement": { "status": "completed", "completedAt": "..." },
#       "result": {
#         "externalId": "...",
#         "status": "submitted",
#         "payload": {
#           "transactionPayload": {
#             "type": "solana_usdc_transfer",
#             "recipientCount": 1000,
#             "amountPerRecipient": { "rawAmount": "210000000", "symbol": "USDC" },
#             "totalRawAmount": "210000000000",
#             "note": "Unsigned — sign with your treasury multisig before broadcasting."
#           }
#         }
#       }
#     }
#   }
```

The platform returns **unsigned transaction data** — the DAO's multisig or treasury wallet signs and broadcasts. The platform never holds keys.

### Step 7 — Track status and subscribe to events

```bash
# Audit log for this disbursement
curl http://localhost:3333/v1/disbursements/d_789
# → { "disbursement": { "status": "completed" }, "log": [created, submitted, confirmed] }
```

Register webhooks for `disbursement.created`, `disbursement.approved`, `disbursement.completed`, and `disbursement.failed` to integrate with your treasury dashboard.

### Step 8 — What's still missing for full on-chain DAOs

- **On-chain program** — no smart contract for storing entitlements or triggering distributions
- **Wallet-based identity** — user model uses UUIDs, not wallet addresses
- **Oracle integration** — exchange rates are static config, no live price feeds
- **Multi-sig governance** — no on-chain governance for ruleset changes

---

## Summary

### What works today (v0.1.3)

- Transparent, auditable entitlement calculation for **49 countries**
- PPP-adjusted amounts in **local currency**
- Need-based **score (0–1)** incorporating inequality via Gini index
- **Batch endpoint** for comparing up to 50 countries at once
- **Budget simulation** (`POST /v1/simulate`) — full cost breakdown with coverage and targeting presets
- **Comparison simulation** (`POST /v1/simulate/compare`) — side-by-side cost comparison across countries
- **Saved simulations** — CRUD API for persisting and retrieving simulation scenarios
- **Country detail endpoint** with full economic stats and population
- **Persistent user store** (SQLite default, PostgreSQL supported)
- **API key authentication** with tiered rate limits
- **Audit logging** of all API requests
- **Webhooks** for event-driven integration (HMAC-SHA256 signed), including `simulation.created`, `disbursement.*`, and `pilot.*` events
- **Disbursement system** — non-custodial payment preparation for Solana USDC, EVM USDC, and M-Pesa (stub) with approval workflow, full audit log, and status tracking
- **Pilot dashboard** — create pilot programs linked to simulations, track status lifecycle (`planning → active → paused → completed`), link disbursements, generate structured donor reports with variance analysis
- **Chain adapters** for Solana and EVM (Ethereum, Polygon, Arbitrum, Optimism, Base)
- **TypeScript SDK** generated from OpenAPI spec
- **Admin UI** for API key management, monitoring, simulation playground, and pilot management
- **Prometheus metrics** for operational observability
- **Ruleset v2 preview** with HDI and urbanization factors
- **Versioned results** (ruleset + data) for reproducibility
- Configurable data pipeline with World Bank source

### What's needed for real-world deployment

Listed roughly by priority (unblocks the most scenarios first):

1. **Sub-national data** — regional income and cost-of-living differences within a country
2. **Age-based targeting presets** — `children` and `elderly` groups (requires UN demographic data)
3. **Market exchange rate conversion** — in addition to PPP conversion
4. **Time series / projections** — historical data snapshots for trend analysis
5. **Export formats** — CSV, PDF for policymakers and donors
6. **On-chain programs** — Solana and EVM smart contracts for entitlement storage and distribution
7. **Wallet-based identity** — link users to wallet addresses for on-chain disbursement
8. **Oracle integration** — live exchange rates for adapter calculations
9. **KYC / identity verification** — integration with national ID or biometric systems
10. **Live M-Pesa integration** — replace the stub with real Safaricom B2C API calls

---

See [ROADMAP.md](./ROADMAP.md) for the full plan to close these gaps (Phases 11–13).

See [CONTRIBUTING.md](./CONTRIBUTING.md) to get involved.
