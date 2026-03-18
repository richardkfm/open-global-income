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

### Step 4 — Back-of-envelope budget

Kenya's population is 54.03 million (available via `GET /v1/income/countries/KE`). The API does not expose a budget calculation, but the math is straightforward:

```
10,368 KES/month × 12 months × 54,030,000 people ≈ 6.72 trillion KES/year
```

At market exchange rates (~130 KES/USD), that's roughly **$51.7 billion/year** for universal coverage — clearly illustrating why most programs target a subset of the population. A ministry would need to model coverage rates (e.g., bottom 20% only), age targeting, and phased rollout.

### Step 5 — Subscribe to updates

When the dataset or ruleset changes, the ministry can be notified automatically via **webhooks**:

Subscribe to `data.updated` and `ruleset.updated` events to receive HMAC-SHA256 signed payloads at your endpoint. This means recalculations trigger automatically when World Bank data is refreshed.

### Step 6 — What the API does NOT provide yet

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
| Total budget estimate | No | Population is available but no budget simulation endpoint |
| Coverage/targeting simulation | No | No sub-national, age, or income-bracket modeling |
| Disbursement mechanism | No | Calculation only — no M-Pesa, bank, or blockchain integration |
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
- **Budget simulation** — coverage rate and targeting scenarios
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

### Step 3 — Subscribe to recalculation events

Register a webhook for `entitlement.calculated` events to trigger on-chain updates when data changes.

### Step 4 — What's missing for DAOs

- **API endpoint for token mapping** — adapters are libraries, not API endpoints; the DAO must import them
- **On-chain program** — no smart contract for storing entitlements or triggering distributions
- **Wallet-based identity** — user model uses UUIDs, not wallet addresses
- **Oracle integration** — exchange rates are static config, no live price feeds
- **Multi-sig governance** — no on-chain governance for ruleset changes

---

## Summary

### What works today (v0.1.0)

- Transparent, auditable entitlement calculation for **49 countries**
- PPP-adjusted amounts in **local currency**
- Need-based **score (0–1)** incorporating inequality via Gini index
- **Batch endpoint** for comparing up to 50 countries at once
- **Country detail endpoint** with full economic stats and population
- **Persistent user store** (SQLite default, PostgreSQL supported)
- **API key authentication** with tiered rate limits
- **Audit logging** of all API requests
- **Webhooks** for event-driven integration (HMAC-SHA256 signed)
- **Chain adapters** for Solana and EVM (Ethereum, Polygon, Arbitrum, Optimism, Base)
- **TypeScript SDK** generated from OpenAPI spec
- **Admin UI** for API key management and monitoring
- **Prometheus metrics** for operational observability
- **Ruleset v2 preview** with HDI and urbanization factors
- **Versioned results** (ruleset + data) for reproducibility
- Configurable data pipeline with World Bank source

### What's needed for real-world deployment

Listed roughly by priority (unblocks the most scenarios first):

1. **Budget simulation endpoint** — `GET /v1/income/simulate?country=KE&coverage=0.2` returning total cost, per-person amount, and population covered
2. **Sub-national data** — regional income and cost-of-living differences within a country
3. **Market exchange rate conversion** — in addition to PPP conversion
4. **Time series / projections** — historical data snapshots for trend analysis
5. **Export formats** — CSV, PDF for policymakers and donors
6. **On-chain programs** — Solana and EVM smart contracts for entitlement storage and distribution
7. **Wallet-based identity** — link users to wallet addresses for on-chain disbursement
8. **Oracle integration** — live exchange rates for adapter calculations
9. **KYC / identity verification** — integration with national ID or biometric systems
10. **Disbursement adapters** — M-Pesa, bank transfer, stablecoin rails

---

See [CONTRIBUTING.md](./CONTRIBUTING.md) to help close these gaps.
