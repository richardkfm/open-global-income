# Roadmap: From Calculator to Pilot Platform

This document describes the phases that transform Open Global Income from a calculation API into a policy simulation platform that can convince governments, donors, and NGOs to fund basic income programs.

**Why these phases matter:** The calculation layer (v0.1.0) answers *"how much per person?"* — but an LLM query could do the same. Phases 11–13 answer *"how much will it cost, how does the money move, and is it working?"* Phases 14–16 answer the harder questions: *"where does the money come from, what happens to the economy, and why should we do this?"* — that's what makes this project a tool that sells basic income to policymakers.

---

## Phase 11: Budget Simulation Engine — Complete ✅

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

---

## Phase 14: Macro-Economic Data Expansion

**Goal:** Transform thin country profiles into rich economic dashboards. The current 5 indicators per country (GDP, GNI, PPP, Gini, population) are enough to calculate a cost — but not enough to argue a policy. Answer: *"What's the full economic picture?"*

### 14.1 — New World Bank indicators

Expand `src/data/worldbank/config.json` to fetch additional indicators. Add to the existing `npm run data:update` pipeline:

| Field | World Bank Code | Why it matters |
|-------|----------------|---------------|
| `taxRevenuePercentGdp` | `GC.TAX.TOTL.GD.ZS` | Total tax revenue as % of GDP — fiscal capacity |
| `socialProtectionSpendingPercentGdp` | `GC.XPN.COMP.ZS` | Government spending on compensation + social benefits |
| `inflationRate` | `FP.CPI.TOTL.ZG` | Consumer price inflation — UBI's effect on purchasing power |
| `laborForceParticipation` | `SL.TLF.CACT.ZS` | Labor force participation rate — baseline for employment effects |
| `unemploymentRate` | `SL.UEM.TOTL.ZS` | Unemployment rate — who is UBI reaching? |
| `governmentDebtPercentGdp` | `GC.DOD.TOTL.GD.ZS` | Central government debt — fiscal space constraint |
| `socialContributionsPercentRevenue` | `GC.REV.SOCL.ZS` | Social security contributions as % of revenue |
| `povertyHeadcountRatio` | `SI.POV.DDAY` | Population below $2.15/day — extreme poverty baseline |
| `gdpGrowthRate` | `NY.GDP.MKTP.KD.ZG` | GDP growth — economic context for sustainability |
| `healthExpenditurePercentGdp` | `SH.XPD.CHEX.GD.ZS` | Health spending — existing social infrastructure |
| `educationExpenditurePercentGdp` | `SE.XPD.TOTL.GD.ZS` | Education spending — existing social infrastructure |
| `urbanizationRate` | `SP.URB.TOTL.IN.ZS` | Urban population share — cost-of-living context |

All nullable — many countries have sparse data. The transformer validates gracefully; missing indicators don't block the rest. The `CountryStats` type in `src/core/types.ts` gains these as optional fields.

### 14.2 — ILO social protection data

World Bank indicators don't capture the granularity of existing social transfer programs. The ILO Social Protection Data Dashboard provides:

- `socialProtectionCoveragePercent` — % of population covered by at least one social protection benefit
- `socialProtectionExpenditurePercentGdp` — social protection expenditure excluding health (more precise than WB)
- `pensionCoveragePercent` — % of elderly receiving a pension
- `childBenefitCoveragePercent` — % of children receiving child/family benefits

New `src/data/ilo/` module following the same fetcher/transformer/validator pattern as `src/data/worldbank/`. The ILO SDMX API is publicly accessible.

### 14.3 — IMF fiscal data

For countries where World Bank tax data is sparse, supplement with IMF Government Finance Statistics:

- Tax revenue breakdown by type (income tax, VAT/sales tax, property tax, trade taxes)
- More granular than the World Bank single-indicator tax revenue figure
- Enables the funding mechanism modeling in Phase 15

New `src/data/imf/` module. The IMF SDMX REST API is publicly accessible.

### 14.4 — Enriched country profile API

Extend `GET /v1/income/countries/:code` to return the full economic dashboard:

```json
{
  "code": "KE",
  "name": "Kenya",
  "stats": {
    "gdpPerCapitaUsd": 2099,
    "gniPerCapitaUsd": 2010,
    "pppConversionFactor": 49.37,
    "giniIndex": 38.7,
    "population": 54030000,
    "incomeGroup": "LMC",
    "taxRevenuePercentGdp": 16.1,
    "socialProtectionSpendingPercentGdp": 2.3,
    "socialProtectionCoveragePercent": 28.4,
    "inflationRate": 7.7,
    "laborForceParticipation": 72.3,
    "unemploymentRate": 5.7,
    "governmentDebtPercentGdp": 68.2,
    "povertyHeadcountRatio": 29.4,
    "gdpGrowthRate": 5.4,
    "taxBreakdown": {
      "incomeTaxPercentGdp": 6.2,
      "vatPercentGdp": 4.8,
      "tradeTaxPercentGdp": 1.4,
      "otherTaxPercentGdp": 3.7
    }
  }
}
```

### 14.5 — Admin UI: country economic dashboard

New `/admin/countries/:code` page showing the full economic profile with visual indicators:

- Key stats in card format with color-coded indicators (e.g., debt/GDP > 60% = amber)
- Comparison against income group averages ("Kenya's tax/GDP is 16.1% vs. LMC average of 14.3%")
- Data completeness indicator per country (so users know what's available)

### 14.6 — Tests & validation

- Extend the data validator to check new indicators (reasonable ranges, no negative tax rates, etc.)
- API tests for enriched country profiles
- Graceful degradation tests (missing ILO/IMF data doesn't break anything)

---

## Phase 15: Funding & Fiscal Simulation — Complete ✅

**Goal:** Answer the question that every finance minister and donor asks first: *"Where does the money come from?"* Model concrete funding mechanisms and show how a UBI program fits into a country's existing fiscal picture.

### 15.1 — Funding mechanism models

New pure functions in `src/core/funding.ts` — each takes a country's fiscal data and returns how much UBI a given policy change could fund:

| Mechanism | Calculation | Example |
|-----------|------------|---------|
| **Flat income tax surcharge** | `surchargeRate × gniPerCapita × population × laborForceParticipation` | "A 2% income surcharge in Kenya raises ~X billion KES/year" |
| **VAT increase** | `vatIncreasePoints × gdp × (currentVatShare / currentVatRate)` | "Raising VAT by 1pp raises ~X" |
| **Carbon tax** | `carbonTaxPerTon × countryEmissions` (new data: CO2 emissions from WB `EN.ATM.CO2E.KT`) | "A $25/ton carbon tax raises ~X" |
| **Wealth tax** | Proxy: `wealthTaxRate × gdp × wealthToGdpRatio` (using Credit Suisse Global Wealth Report estimates by income group) | "A 1% wealth tax raises ~X" |
| **Financial transaction tax** | `fttRate × stockMarketTurnover` (WB `CM.MKT.TRNR`) | "A 0.1% FTT raises ~X" |
| **Redirect social spending** | `redirectPercent × socialProtectionSpendingPercentGdp × gdp` | "Redirecting 50% of current social protection spending covers X% of UBI" |

Each mechanism is a pure function: `(country, params) → FundingEstimate`. No side effects.

```typescript
interface FundingEstimate {
  mechanism: string;
  annualRevenueLocal: number;
  annualRevenuePppUsd: number;
  coversPercentOfUbiCost: number;  // how much of the simulated UBI this funds
  assumptions: string[];            // explicit list of assumptions made
}
```

### 15.2 — Fiscal space analysis

`POST /v1/simulate/fiscal`

Given a simulation result, show how it fits into the country's fiscal picture:

```json
{
  "country": "KE",
  "ubiCost": { "annualPppUsd": 27223260000, "asPercentOfGdp": 24.1 },
  "fiscalContext": {
    "totalTaxRevenue": { "percentGdp": 16.1, "absolutePppUsd": "..." },
    "currentSocialSpending": { "percentGdp": 2.3, "absolutePppUsd": "..." },
    "governmentDebt": { "percentGdp": 68.2 },
    "ubiAsPercentOfTaxRevenue": 149.7,
    "ubiAsPercentOfSocialSpending": 1047.8
  },
  "fundingScenarios": [
    {
      "name": "Mixed: 3% income surcharge + 2pp VAT + redirect 30% social spending",
      "mechanisms": [ ... ],
      "totalRevenue": "...",
      "coverageOfUbiCost": 0.34,
      "gap": "..."
    }
  ]
}
```

The point: show that full universal UBI is expensive, but targeted UBI (bottom quintile, children, elderly) with mixed funding can be realistic. The numbers tell the story.

### 15.3 — Funding scenario builder API

`POST /v1/simulate/fund`

Accept a simulation ID plus a list of funding mechanisms with parameters:

```json
{
  "simulationId": "...",
  "mechanisms": [
    { "type": "income_tax_surcharge", "rate": 0.03 },
    { "type": "vat_increase", "points": 2 },
    { "type": "redirect_social_spending", "percent": 0.3 }
  ]
}
```

Returns the combined funding estimate with coverage gap analysis.

### 15.4 — Admin UI: funding scenario builder

Interactive page at `/admin/simulate/fund`:

- Start from a saved simulation (or run one inline)
- Add funding mechanisms with sliders (tax rate, VAT points, redirect %)
- **Live preview** via htmx: as sliders move, the funding estimate updates
- Stacked bar chart showing: UBI cost vs. combined funding sources vs. gap
- Side panel: fiscal context (debt/GDP, tax/GDP, social spending/GDP)
- "What would it take?" mode: auto-calculate the tax rate needed to fully fund the scenario
- Export as JSON or printable summary

### 15.5 — Saved funding scenarios

Extend the `simulations` table or add a `funding_scenarios` table to persist scenarios with their mechanism configurations and results.

### 15.6 — Tests

- Unit tests for each funding mechanism calculation (pure functions)
- Verify that assumptions are explicitly listed in output
- API tests for fiscal analysis and scenario builder
- Edge cases: missing fiscal data, zero tax revenue, 100% redirect

---

## Phase 16: Economic Impact Modeling — Complete ✅

**Goal:** Model what UBI *does* to an economy, not just what it *costs*. Answer: *"What happens to poverty, purchasing power, and existing social systems?"*

### What was built

- **`calculateImpactAnalysis()`** in `src/core/impact.ts` — pure function, zero side effects, four dimensions
- **Poverty reduction model** — World Bank poverty headcount × recipient reach × transfer-vs-line comparison
- **Purchasing power model** — Lorenz curve approximation (`L(p) = p^(1+2G)`) for bottom quintile income share; validated against World Bank quintile data for 40+ countries
- **Social coverage model** — ILO social protection coverage + 1.4× poverty concentration factor for bottom-quintile targeting
- **Fiscal multiplier model** — Keynesian cash-transfer multiplier calibrated by income group (LIC=2.3×, LMC=1.9×, UMC=1.5×, HIC=1.1×)
- **Policy brief generator** — every assumption explicitly listed, exports as JSON or plain text
- **5 new API endpoints:** `POST /v1/impact`, `POST /v1/impact/brief` (with `?format=text`), `POST/GET/DELETE /v1/impact-analyses`
- **Admin UI** at `/admin/impact` with tabbed breakdown, headline cards, data quality indicators, and brief export
- **`impact_analyses` database table** with full CRUD
- **`impact_analysis.created` webhook event**
- **61 new tests** (35 core + 26 API) — all dimensions, edge cases, data quality fallbacks, determinism
- **[IMPACT_METHODOLOGY.md](./IMPACT_METHODOLOGY.md)** — full model documentation, formulas, sources, interpretation guide



### 16.1 — Poverty reduction modeling

Pure functions in `src/core/impact.ts`:

- **Poverty gap closure:** Given the poverty headcount ratio and UBI amount, estimate how many people move above the poverty line
- **Poverty depth reduction:** By how much does the average poor person's income improve?
- Uses the $2.15/day (extreme) and $3.65/day (moderate) poverty lines from World Bank
- Output: `{ extremePovertyReduction: 0.73, moderatePovertyReduction: 0.41 }` — "UBI at this level would lift an estimated 73% of the extreme poor above the line"

Simplifying assumption: uniform distribution of income below the poverty line (acknowledged in output). More sophisticated models can replace this later.

### 16.2 — Purchasing power & inflation modeling

- **Direct transfer effect:** UBI increases disposable income for recipients. For bottom-quintile targeting, show the percentage increase in income for the poorest 20%
- **Inflation risk indicator:** Based on the transfer size relative to GDP and the country's current inflation rate, flag inflation risk levels:
  - Low: UBI < 5% of GDP and inflation < 5%
  - Medium: UBI 5–15% of GDP or inflation 5–10%
  - High: UBI > 15% of GDP or inflation > 10%
- **Real value adjustment:** Show the UBI amount adjusted for expected inflation over the program duration
- These are indicators and estimates, not predictions — clearly labeled as such

### 16.3 — Social security interaction analysis

For countries with social protection data (from ILO in Phase 14):

- **Overlap analysis:** "X% of the population already receives some social protection. UBI would reach the remaining Y%"
- **Complement vs. replace scenarios:**
  - *Complement*: UBI on top of existing programs → total cost is additive
  - *Replace*: UBI replaces existing programs → net cost is UBI minus current spending
  - *Hybrid*: UBI replaces some programs (cash transfers, pensions below UBI level) while keeping others (health, education)
- Show the **coverage gap**: people who currently receive no social protection and would be reached by UBI
- Output as structured data: `{ currentCoverage, ubiBeneficiaries, overlap, newlyCovered, coverageGap }`

### 16.4 — Economic multiplier estimates

Simple fiscal multiplier modeling:

- Cash transfers to low-income populations have multiplier effects (recipients spend locally)
- Literature-based multiplier ranges by income group: LIC ~1.5x, LMC ~1.3x, UMC ~1.1x, HIC ~0.8x
- Show the estimated GDP stimulus: `ubiCost × multiplier = stimulusEffect`
- Clearly labeled as estimates based on published research ranges, not predictions

### 16.5 — Comprehensive impact report

`GET /v1/simulate/:id/impact`

Combines all impact dimensions into a single structured report:

```json
{
  "simulation": { "id": "...", "country": "KE", "coverage": 0.2 },
  "impact": {
    "povertyReduction": {
      "extremePovertyReduction": 0.73,
      "moderatePovertyReduction": 0.41,
      "peopleLiftedAbovePovertyLine": 3900000
    },
    "purchasingPower": {
      "incomeIncreaseForPoorest20Percent": 0.85,
      "inflationRiskLevel": "medium",
      "realValueAfterInflation": 194.3
    },
    "socialProtection": {
      "currentCoveragePercent": 28.4,
      "newCoveragePercent": 48.4,
      "newlyCoveredPopulation": 10800000,
      "replacementSavings": 1200000000
    },
    "economicStimulus": {
      "multiplier": 1.3,
      "estimatedGdpStimulus": 35390238000,
      "stimulusAsPercentOfGdp": 31.3
    }
  },
  "assumptions": [
    "Poverty distribution assumed uniform below poverty line",
    "Multiplier based on World Bank meta-analysis of cash transfer programs in LMCs",
    "Inflation risk is an indicator, not a forecast"
  ],
  "meta": { "rulesetVersion": "v1", "dataVersion": "worldbank-2023" }
}
```

### 16.6 — Admin UI: impact dashboard

The centerpiece of the "sell the concept" vision. New `/admin/simulate/:id/impact` page:

- **Hero section:** "UBI for Kenya's poorest 20%" with the key number front-and-center
- **Poverty card:** People lifted out of poverty, with before/after comparison bar
- **Purchasing power card:** Income increase for recipients, inflation risk badge
- **Social protection card:** Current vs. new coverage, Venn-style overlap visualization
- **Fiscal card:** Cost vs. funding sources (links to Phase 15 scenario), GDP stimulus
- **Assumptions footer:** Every simplification explicitly listed — builds trust
- **Export:** "Download as PDF brief" (server-rendered HTML → PDF via headless Chrome or Puppeteer)
- **Share:** Unique URL per impact report for linking in proposals and presentations

### 16.7 — Tests

- Unit tests for poverty reduction models with known inputs
- Inflation risk classification tests
- Social protection overlap calculation tests
- Multiplier estimation tests
- Verify assumptions are always included in output
- End-to-end: create simulation → run impact → verify all sections populated

---

## Phase 17: Sub-national Data — Complete ✅

**Goal:** National averages hide enormous variation. A basic income floor in Nairobi versus rural Turkana should not be the same amount. Answer: *"What should the entitlement be in this specific region?"*

### What was built

- **"Adjusted Country" pattern** — `buildRegionAdjustedCountry()` in `src/core/regions.ts` multiplies the national PPP conversion factor by a region's cost-of-living index and substitutes regional population. All existing formulas (rules, simulations, funding, impact) work transparently — zero formula changes needed.
- **Kenya seed data** — all 47 counties in `src/data/regions.json` with population, COL index, urban/rural classification, and poverty headcount ratios (KNBS 2019 Census)
- **Region data loader** — `getAllRegions()`, `getRegionById()`, `getRegionsByCountry()` in `src/data/loader.ts`
- **4 new API endpoints:**
  - `GET /v1/income/regions` — list all regions (filterable by `?country=KE`)
  - `GET /v1/income/regions/:id` — region detail
  - `GET /v1/income/calc/regional?country=KE&region=KE-NAI` — regionally-adjusted entitlement with national comparison
  - `POST /v1/income/simulate/regional` — budget simulation for a specific region
- **Admin UI** at `/admin/regions` — region list grouped by country, detail page with entitlement comparison
- **38 new tests** across 3 suites

---

---

## Phase 18: Western Europe Disbursement & EU Regional Data — Complete ✅

**Goal:** Enable large test groups in western Europe, where SEPA bank wire is the standard payment rail and regional cost-of-living variation is significant. Answer: *"How do we pay people in Europe, and how does the entitlement vary by region?"*

### Why SEPA over Solana for western Europe

For pilots operating through governments, NGOs, or research institutes in the EU:

| Factor | SEPA/EUR | Solana USDC |
|---|---|---|
| Recipient bank accounts | Near-universal (99%+) | Requires wallet setup |
| Regulatory path | EU Payment Services Directive | MiCA compliance overhead |
| Government partnership | Standard requirement | Unlikely without extra legal structure |
| Donor auditor comfort | Expected | Requires explanation |
| Settlement speed | SEPA Instant < 10s | Fast, but irrelevant without wallets |

Solana remains the right choice for crypto-native DAOs. SEPA is the right default for any real-world European pilot.

### What was built

- **SEPA Credit Transfer provider** — `src/disbursements/providers/sepa.ts` implements the full `DisbursementProvider` interface:
  - `validateConfig()` — validates `apiKey`, `payoutAccountId`, `environment` (sandbox/production)
  - `submit()` — converts PPP-USD → EUR via ECB reference rate (0.92), generates ISO-20022-style end-to-end reference (`OGI-{ts}-{rand}`), returns SEPA Credit Transfer instruction ready for submission via Wise Payouts API
  - `checkStatus()` — documents the Wise `GET /v2/transfers/{id}` polling path
  - Registered under `providerId: 'sepa'` in `src/disbursements/providers/registry.ts`
  - Immediately available via `GET /v1/disbursements/channels` and `POST /v1/disbursements/channels`

- **EU sub-national region data** — 41 new entries in `src/data/regions.json` (data version `curated-2024-02`):
  - **Germany** — 16 Bundesländer (Destatis 2022 regional price levels; COL range 0.82 Saxony-Anhalt → 1.15 Hamburg)
  - **France** — 13 metropolitan regions (INSEE 2022 regional price indices; COL range 0.89 Hauts-de-France → 1.22 Île-de-France)
  - **Netherlands** — 12 provinces (CBS 2022 regional price levels; COL range 0.88 Drenthe → 1.18 Noord-Holland)
  - All existing regional endpoints (`GET /v1/income/regions`, `GET /v1/income/calc/regional`, `POST /v1/simulate/regional`) work with no code changes

- **18 new tests** — `sepa.test.ts` covers metadata, config validation, EUR conversion math, SEPA reference generation, uniqueness, and checkStatus

### Live integration path

Real SEPA disbursement requires Wise Payouts API credentials (or equivalent processor). The integration steps are:

1. Obtain Wise API key + Business profile ID
2. Set `environment: 'production'` in channel config
3. Replace the stub `submit()` logic with:
   - `POST /v2/quotes` — get live EUR/USD rate
   - `POST /v1/transfers` per recipient (or batch via Wise Batch API)
4. Implement `checkStatus()` via `GET /v2/transfers/{id}`

No interface changes — the stub is a drop-in replacement.

---

## Dependency chain

```
Phase 11 (Simulation) ✅
    ↓ simulation_id
Phase 12 (Disbursement) ✅ ← Solana, EVM, M-Pesa stub, SEPA stub
    ↓ disbursement_id
Phase 13 (Pilot Dashboard) ✅
    ↓
Phase 14 (Macro-Economic Data) ✅ ← 17 indicators, World Bank + ILO + IMF
    ↓
Phase 15 (Funding Simulation) ✅ ← 6 funding mechanisms
    ↓
Phase 16 (Economic Impact) ✅ ← 4 impact dimensions, policy brief export
    ↓
Phase 17 (Sub-national Data) ✅ ← Kenya 47 counties
    ↓
Phase 18 (EU Disbursement & Regions) ✅ ← SEPA stub + DE/FR/NL regions
    ↓
Phase 19 (Recipient & Identity Model) ✅ ← operational foundation
    ↓ recipient_id links to disbursements
Phase 20 (Inbound Webhooks) ✅ ← provider callbacks update disbursement state
    ↓
Phase 21 (Audit Exports) ✅ ← compliance-grade signed document per pilot
    ↓
Phase 22 (Programmable Targeting) ✅ ← TargetingRules engine, simulate + pilot integration
    ↓
Phase 23 (Evidence Layer) ← outcomes per cohort, cross-program benchmarks
    ↓
Phase 24 (Scenario Versioning) ← data-version diffing on saved simulations
    ↓
Phase 25 (Multi-tenancy) ← tenant isolation, shared calculation, federation foundation
```

---

## Phase 19: Recipient & Identity Model

**Goal:** Give the platform a concept of an individual person. Without this, every disbursement is a headcount and an amount — there is nobody on the other end. This phase is the operational foundation everything else builds on. Answer: *"Who are we paying, and how do we know it's them?"*

### The design constraint: no raw identity data

The platform must never store biometric data, plaintext IBANs, or government ID numbers. Instead it stores *verified claims*: a hash of an account reference, a pointer to which identity provider performed the verification, and when. The actual verification is delegated to a pluggable `IdentityProvider` interface.

### 19.1 — Core types

New types in `src/core/types.ts`:

```typescript
export type RecipientStatus = 'pending' | 'verified' | 'suspended';
export type PaymentMethod = 'sepa' | 'mobile_money' | 'crypto';

export interface RecipientProfile {
  id: string;
  countryCode: string;
  /** SHA-256 of the account identifier (IBAN, phone number, wallet address) — never stored in plaintext */
  accountHash: string | null;
  /** Which identity provider verified this recipient */
  identityProvider: string | null;
  verifiedAt: string | null;
  paymentMethod: PaymentMethod | null;
  /** Provider-specific routing reference (e.g. last-4 of IBAN, phone suffix) — non-reversible */
  routingRef: string | null;
  status: RecipientStatus;
  /** Optional link to a pilot program */
  pilotId: string | null;
  apiKeyId: string | null;
  createdAt: string;
}

/** Pluggable identity verification interface — platform stores claims, not data */
export interface IdentityProvider {
  readonly providerId: string;
  readonly providerName: string;
  verify(claim: IdentityClaim): Promise<VerificationResult>;
}

export interface IdentityClaim {
  recipientId: string;
  countryCode: string;
  providedBy: string;
  claimType: 'national_id' | 'bank_account' | 'phone' | 'wallet' | 'community';
  claimReference: string; // will be hashed before storage
}

export interface VerificationResult {
  verified: boolean;
  accountHash: string | null;
  routingRef: string | null;
  error?: string;
}
```

### 19.2 — Database table

```sql
CREATE TABLE recipients (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  account_hash TEXT,           -- SHA-256 of account identifier
  identity_provider TEXT,
  verified_at TEXT,
  payment_method TEXT,
  routing_ref TEXT,            -- non-reversible suffix for display only
  status TEXT NOT NULL DEFAULT 'pending',
  pilot_id TEXT,
  api_key_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (pilot_id) REFERENCES pilots(id),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- Fast duplicate detection by account hash within a country
CREATE UNIQUE INDEX idx_recipients_account ON recipients(country_code, account_hash)
  WHERE account_hash IS NOT NULL;
```

### 19.3 — API endpoints

- `POST /v1/recipients` — enroll a recipient (status: `pending`)
- `GET /v1/recipients` — list recipients (filterable by `countryCode`, `status`, `pilotId`)
- `GET /v1/recipients/:id` — profile + payment history
- `PATCH /v1/recipients/:id` — update status (`pending` → `verified` → `suspended`) or payment method
- `POST /v1/recipients/check-duplicate` — given an `accountHash`, returns whether it is already enrolled and in which program — prevents double-payment without exposing identity

### 19.4 — Link recipients to disbursements

Add optional `recipientId` to the `Disbursement` type and DB row. When set, `GET /v1/recipients/:id` can return a full payment history.

### 19.5 — Admin UI

New `/admin/recipients` page:
- List with status badges, country filter, pilot filter
- Detail page: status, payment method, verification provider, payment history
- Manual status transitions (verify, suspend) with audit log entry

### 19.6 — Tests

- Enrollment happy path
- Duplicate detection (same `accountHash` same country → 409)
- Status transition rules (cannot go `suspended` → `verified` without re-verification)
- `check-duplicate` returns correct cross-program flag
- `GET /v1/recipients/:id/disbursements` returns linked payments

---

## Phase 20: Inbound Webhooks & Payment Confirmations

**Goal:** Make the platform reactive rather than purely transactional. Right now disbursement status only moves forward when the API is polled. Real payment rails send callbacks. Answer: *"Did the money actually arrive?"*

### 20.1 — Inbound webhook endpoint

```
POST /v1/webhooks/inbound/:provider
```

- `provider` matches a registered `DisbursementProvider` `providerId` (e.g. `sepa`, `safaricom`)
- Each provider implements a new optional interface method:

```typescript
interface DisbursementProvider {
  // ... existing methods ...
  /** Verify and parse an inbound callback from this provider */
  parseCallback?(
    headers: Record<string, string>,
    body: unknown
  ): Promise<CallbackEvent | null>;
}

interface CallbackEvent {
  externalId: string;
  status: 'confirmed' | 'failed';
  details: Record<string, unknown>;
}
```

### 20.2 — Callback processing

On receiving a verified callback:
1. Look up disbursement by `externalId`
2. Transition status: `processing` → `completed` or `failed`
3. Write a `disbursement_log` entry with the provider's raw callback payload
4. Fire `disbursement.confirmed` or `disbursement.failed` webhook event outward

### 20.3 — Security

- Each channel config stores a `webhookSecret` (set at channel creation, never returned via API)
- The platform verifies HMAC-SHA256 of the raw request body against the secret before processing
- Replays rejected via timestamp window (± 5 minutes)
- Unknown `externalId` returns 200 (avoid leaking information) but logs a warning

### 20.4 — Wise (SEPA) callback

Wise sends a `POST` to a configured URL when a transfer changes state. The `sepaProvider` gains a `parseCallback()` implementation that:
- Verifies the `X-Wise-Signature-SHA256` header
- Parses the `resource_type: "transfer"` + `current_state: "outgoing_payment_sent"` fields
- Returns a `CallbackEvent` with `status: 'confirmed'`

### 20.5 — Tests

- Valid HMAC signature → callback processed, disbursement status updated
- Invalid HMAC → 401, no state change
- Unknown `externalId` → 200, no crash
- Replay outside time window → rejected
- Confirmed callback fires outbound `disbursement.confirmed` webhook

---

## Phase 21: Structured Audit Exports — Complete ✅

**Goal:** Generate a compliance-grade, self-contained document for every pilot that regulators, donors, and auditors can independently verify. Answer: *"Can we prove, to a court standard, what happened, to whom, and why?"*

### 21.1 — Audit export endpoint

```
GET /v1/pilots/:id/audit-export
```

Returns a structured JSON document covering:

```json
{
  "exportVersion": "1.0",
  "generatedAt": "2026-04-12T10:00:00Z",
  "pilot": { ... },
  "methodology": {
    "rulesetVersion": "v1",
    "dataVersion": "worldbank-2023",
    "formulaDescription": "...",
    "entitlementPerRecipient": { "pppUsd": 210, "eur": 193.2 },
    "fxRateUsed": 0.92,
    "fxRateSource": "ECB reference rate"
  },
  "recipients": {
    "totalEnrolled": 500,
    "totalVerified": 487,
    "totalSuspended": 13,
    "byCountry": { "DE": 300, "NL": 187 }
  },
  "disbursements": [
    {
      "id": "...",
      "status": "completed",
      "recipientCount": 487,
      "totalEur": 94176.84,
      "approvedAt": "...",
      "completedAt": "...",
      "providerReference": "OGI-...",
      "log": [ ... ]
    }
  ],
  "integrity": {
    "sha256": "...",  // hash of the canonical payload above
    "signedBy": "ogi-platform",
    "algorithm": "SHA-256"
  }
}
```

### 21.2 — Integrity hash

The `integrity.sha256` field is a SHA-256 hash of the canonical JSON (sorted keys, no whitespace) of everything above the `integrity` field. Recipients can independently recompute this hash to verify the document has not been tampered with.

### 21.3 — GDPR considerations

- No raw account identifiers — only `accountHash` and `routingRef` appear in recipient records
- The document is suitable for submission to a data protection authority because it contains no personal data beyond what is strictly necessary for accountability

### 21.4 — Admin UI

New "Export Audit Document" button on the pilot detail page. Downloads the signed JSON directly.

### 21.5 — Tests

- All disbursement log entries appear in export
- Integrity hash is stable for same input, changes with any modification
- Endpoint requires auth (no anonymous audit dumps)
- GDPR check: no plaintext IBANs or phone numbers appear in output

---

## Phase 22: Programmable Targeting Rules — Complete ✅

**Goal:** Replace the five coarse targeting presets with a structured rules engine that operators define at program creation time. Answer: *"Which specific people should receive this payment, and why?"*

### 22.1 — Targeting rule schema

```typescript
interface TargetingRules {
  /** Age range in years — requires recipient date-of-birth claim */
  ageRange?: [number, number];
  /** Urban/rural filter — matches region.stats.urbanRural */
  urbanRural?: 'urban' | 'rural' | 'mixed';
  /** Maximum monthly income in PPP-USD */
  maxMonthlyIncomePppUsd?: number;
  /** Only include recipients verified by specific providers */
  identityProviders?: string[];
  /** Exclude recipients who received a payment within N days */
  excludeIfPaidWithinDays?: number;
  /** Limit to a specific set of region IDs */
  regionIds?: string[];
  /** Named preset — expands to a standard set of rules */
  preset?: TargetGroup;
}
```

### 22.2 — Integration points

- `POST /v1/simulate` accepts `targetingRules` in addition to (or replacing) `targetGroup`
- `POST /v1/pilots` stores `targetingRules` alongside the simulation
- At disbursement time, `targetingRules` filter the enrolled recipient list to produce the actual payment batch
- `GET /v1/pilots/:id/report` shows how many recipients were filtered out by each rule

### 22.3 — Backward compatibility

Existing `targetGroup` presets expand to equivalent `TargetingRules` objects internally. No breaking change.

---

## Phase 23: Evidence Layer

**Goal:** Close the loop between projected impact and observed outcomes. This is the layer that makes the platform indispensable long-term — programs that use OGI accumulate a cross-program evidence base that no individual program could build alone. Answer: *"Did it work, and how does that compare to similar programs?"*

### 23.1 — Outcome recording

```
POST /v1/pilots/:id/outcomes
```

```json
{
  "cohortType": "recipient" | "control",
  "measurementDate": "2026-10-01",
  "indicators": {
    "employmentRate": 0.62,
    "averageMonthlyIncomeUsd": 380,
    "foodSecurityScore": 3.8,
    "childSchoolAttendanceRate": 0.91
  },
  "sampleSize": 487,
  "dataSource": "NGO field survey — October 2026"
}
```

### 23.2 — Pre/post comparison

```
GET /v1/pilots/:id/outcomes/compare
```

Returns the difference between baseline (pre-program) and latest measurement, alongside the projected impact from Phase 16. Shows:
- Projected vs. actual employment change
- Projected vs. actual poverty reduction
- Effect size with confidence interval (if control group exists)

### 23.3 — Anonymized cross-program benchmarks

```
GET /v1/evidence/aggregate?country=DE&incomeGroup=HIC&coverageMin=0.1&coverageMax=0.3
```

Returns anonymized, aggregated outcome statistics across all pilots matching the filter. No program names, no individual data — only aggregate distributions (median, p25, p75 for each indicator).

This is the network effect endpoint: it becomes more valuable with every program that joins.

### 23.4 — Research export

```
GET /v1/evidence/export?format=csv&country=DE
```

Anonymized, aggregated dataset in CSV or Parquet for academic partners. Standardized column names so researchers can combine data across programs without cleaning.

---

## Phase 24: Scenario Versioning & Data Diffing

**Goal:** Saved simulations are point-in-time snapshots. When World Bank data updates, projections change — but there is no record of how or why. Answer: *"How much did the cost estimate change since we last ran this, and what drove it?"*

### 24.1 — Diff endpoint

```
GET /v1/simulations/:id/diff?targetDataVersion=worldbank-2024
```

Returns:
```json
{
  "simulationId": "...",
  "baseline": { "dataVersion": "worldbank-2023", "annualCostPppUsd": 27223260000 },
  "comparison": { "dataVersion": "worldbank-2024", "annualCostPppUsd": 28100000000 },
  "delta": { "absolute": 876740000, "percent": 3.2 },
  "drivers": [
    { "field": "gniPerCapitaUsd", "before": 2010, "after": 2080, "impact": "increases entitlement by $4.2/month" },
    { "field": "population", "before": 54030000, "after": 55210000, "impact": "increases recipient count by 236,000" }
  ]
}
```

### 24.2 — Data version registry

New `GET /v1/data-versions` endpoint listing all available World Bank/ILO/IMF snapshots with their `dataVersion` strings, dates, and country coverage. Operators can pin simulations to a specific version for reproducibility.

---

## Phase 25: Multi-tenancy Foundation

**Goal:** Multiple independent programs — run by different governments, funded by different donors — share a single platform instance with full data isolation. Answer: *"Can two NGOs use the same infrastructure without seeing each other's data?"*

### 25.1 — Tenant model

- Each organization is a **tenant** with its own set of API keys, pilots, recipients, disbursements, and saved scenarios
- The shared layers (countries, regions, rulesets, calculation engine) are global — every tenant benefits from data and formula updates
- A tenant's data is never visible to another tenant

### 25.2 — Scoped API keys

API keys gain a `tenantId` field. All data operations are filtered by `tenantId` at the database query level — not application-level filtering, which can be bypassed.

### 25.3 — Aggregate benchmarks remain cross-tenant

The `GET /v1/evidence/aggregate` endpoint (Phase 23) aggregates anonymized outcomes across tenants. This is the designed network effect — you opt into the evidence base by using the platform, but your raw data stays private.

### 25.4 — Admin segregation

A new super-admin tier can view tenant metadata (program count, disbursement volume) without accessing any tenant's actual data. Normal admin accounts are scoped to a single tenant.

---

## What this enables (full stack)

After all phases, the platform supports this end-to-end workflow:

1. **Model** — `POST /v1/simulate` for Germany bottom quintile, 12 months, programmatic targeting rules
2. **Fund** — Funding scenario builder shows a 2pp VAT increase covers 60% of cost
3. **Impact** — Policy brief: "Lifts 340,000 people above poverty line; 85% income increase for poorest quintile"
4. **Enroll** — `POST /v1/recipients` for 50,000 verified participants; duplicate check across programs
5. **Disburse** — SEPA Credit Transfer instruction batch; Wise callback confirms settlement
6. **Track** — Pilot dashboard shows actual vs. projected spend; audit export for regulator
7. **Measure** — Post-program outcomes recorded; comparison against projection; control group analysis
8. **Share** — Anonymized outcomes contribute to cross-program evidence base
9. **Compare** — Next program queries benchmark: "What were employment outcomes in comparable pilots?"
10. **Prove** — Independent researchers download the research export and replicate the findings

*That* is infrastructure that outlives any single organization — the SMTP of basic income.

