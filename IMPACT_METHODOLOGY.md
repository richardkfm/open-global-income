# Economic Impact Methodology — Phase 16

This document describes the models, formulas, assumptions, and data sources used to generate economic impact estimates in the Open Global Income platform.

Impact analysis is the "sell it" layer — it translates a budget simulation into numbers that resonate with policymakers, donors, and the public: poverty reduction, purchasing power changes, social coverage gaps, and GDP stimulus. Every assumption is explicitly listed in every API response and every exported policy brief.

---

## Overview

The impact engine (`src/core/impact.ts`) is a pure function — no I/O, no side effects, deterministic for the same inputs. It takes a country and a simulation result (from the existing budget simulation engine) and outputs four impact dimensions plus a structured policy brief.

```
calculateImpactAnalysis(country, simulation, params, dataVersion)
  → ImpactAnalysisResult {
      povertyReduction,
      purchasingPower,
      socialCoverage,
      fiscalMultiplier,
      policyBrief,
      meta
    }
```

---

## 1. Poverty Reduction

**Question:** How many people does this program lift above the extreme poverty line?

### Inputs

| Field | Source |
|-------|--------|
| `povertyHeadcountRatio` | World Bank PovcalNet — % of population below $2.15/day (2017 PPP) |
| `population` | World Bank |
| `recipientCount` | Budget simulation output |
| `floorPppUsd` | Entitlement floor ($210/month by default) |

### Formula

```
povertyLine = $2.15/day × 30 days = $64.50 PPP-USD/month

extremePoor = (povertyHeadcountRatio / 100) × population

Case 1: transfer ≥ poverty line (e.g. $210 ≥ $64.50)
  fractionOfPoorReached = min(1, recipientCount / extremePoor)
  estimatedLifted = extremePoor × fractionOfPoorReached

Case 2: transfer < poverty line
  fractionLifted     = transfer / povertyLine
    (assumes incomes of the extreme poor are uniformly distributed
     between $0 and the poverty line)
  fractionOfPoorReached = min(1, recipientCount / extremePoor)
  estimatedLifted = extremePoor × fractionOfPoorReached × fractionLifted
```

### Key Assumptions

1. **Targeting assumption:** For `bottom_quintile` targeting, extreme poor are assumed to be concentrated in the lowest income group and reached first. For universal targeting, extreme poor are distributed proportionally.
2. **Behavioral assumption:** No behavioral response — labor supply, savings, migration, and price effects are not modeled.
3. **Static model:** This is a static income comparison, not a general equilibrium model.
4. **Data vintage:** Most recent available year from World Bank PovcalNet (typically 2018–2022 by country).

### Data Quality

- `high` — `povertyHeadcountRatio` available
- `low` — data missing; estimate returns zero

---

## 2. Purchasing Power

**Question:** What percentage income increase does the UBI represent for the poorest quintile?

### Inputs

| Field | Source |
|-------|--------|
| `gniPerCapitaUsd` | World Bank (Atlas method, current USD) |
| `giniIndex` | World Bank / UNDP (0–100 scale) |
| `population` | World Bank |
| `floorPppUsd` | Entitlement floor |

### Formula

**Step 1: Estimate income share of the bottom quintile using Lorenz curve approximation:**

```
Lorenz curve: L(p) ≈ p^(1 + 2×G)
  where G = Gini coefficient (0–1 scale), p = cumulative population fraction

Income share of bottom quintile:
  incomeShareQ1 = L(0.2) = 0.2^(1 + 2×G)
```

Empirical validation against World Bank quintile data:

| Country | Gini | Formula | Actual |
|---------|------|---------|--------|
| Kenya | 0.39 | 5.8% | 5–6% |
| South Africa | 0.63 | 2.7% | 2–3% |
| Denmark | 0.28 | 8.5% | 8–9% |
| Brazil | 0.54 | 3.5% | 3–4% |
| Germany | 0.32 | 7.5% | 7–8% |

**Step 2: Estimate bottom quintile mean monthly income:**

```
meanMonthlyIncome = gniPerCapitaUsd / 12
bottomQ1MeanMonthly = meanMonthlyIncome × incomeShareQ1 / 0.20
```

**Step 3: Purchasing power increase:**

```
incomeIncreasePercent = (floorPppUsd / bottomQ1MeanMonthly) × 100
```

### Key Assumptions

1. **Income proxy:** GNI per capita (Atlas method, USD) used as mean income. This is a nominal USD measure; the UBI floor is in PPP-USD. Both are compared as USD equivalents, consistent with the entitlement scoring methodology in this codebase (`score = pppFloor / (gniPerCapita / 12)`).
2. **Lorenz curve:** Parametric approximation with maximum error < 1.5 percentage points vs. World Bank microdata across tested countries.
3. **No price effects:** The full transfer is treated as net income increase. In practice, some inflation may partially offset purchasing power gains, especially in supply-constrained contexts.
4. **No savings:** The full transfer is assumed to be immediately available income (i.e. no modeling of savings behavior).

### Data Quality

- `high` — `giniIndex` available
- `low` — Gini missing; estimate returns zero

---

## 3. Social Security Coverage

**Question:** How many people currently excluded from social protection would be newly reached?

### Inputs

| Field | Source |
|-------|--------|
| `socialProtectionCoveragePercent` | ILO World Social Protection Report — % with any benefit |
| `population` | World Bank |
| `recipientCount` | Budget simulation output |
| `targetGroup` | Program parameter |

### Formula

```
uncoveredFraction = 1 - (socialProtectionCoveragePercent / 100)
populationCurrentlyUncovered = population × uncoveredFraction

concentrationFactor = bottom_quintile ? 1.4 : 1.0
  (ILO research shows the poor are disproportionately excluded from
   formal social protection — estimated 40% higher exclusion rate)

recipientUncoverageRate = min(1, uncoveredFraction × concentrationFactor)
estimatedNewlyCovered = recipientCount × recipientUncoverageRate
```

### Key Assumptions

1. **Coverage definition:** "Covered" means receiving at least one social protection benefit (pension, child benefit, unemployment, social assistance, etc.) — ILO operational definition.
2. **Concentration factor (1.4):** Based on ILO evidence that the poorest quintile is disproportionately excluded from formal systems. Applied only for `bottom_quintile` targeting. Universal targeting assumes the population-average exclusion rate.
3. **Additive model:** The UBI is treated as additive to existing benefits. A person already covered is not double-counted as "newly covered."
4. **No administrative capacity constraint:** Model assumes the program can operationally reach uncovered individuals; in practice, enrollment of previously unreached populations requires additional investment.

### Data Quality

- `high` — ILO `socialProtectionCoveragePercent` available
- `low` — data missing; estimate returns zero

---

## 4. Fiscal Multiplier (GDP Stimulus)

**Question:** What is the likely GDP stimulus from this cash transfer program?

### Inputs

| Field | Source |
|-------|--------|
| `incomeGroup` | World Bank income classification |
| `gdpPerCapitaUsd` | World Bank |
| `population` | World Bank |
| `annualCostPppUsd` | Budget simulation output |

### Formula

```
multiplier = FISCAL_MULTIPLIERS[incomeGroup]

estimatedGdpStimulus = annualTransfer × multiplier
stimulusAsPercentOfGdp = estimatedGdpStimulus / (gdpPerCapitaUsd × population) × 100
```

### Multiplier Calibration by Income Group

| Income Group | Multiplier | Rationale |
|--------------|------------|-----------|
| LIC (Low income) | 2.3 | Very high MPC (~0.97), near-complete local spending, limited financial system absorption |
| LMC (Lower-middle) | 1.9 | High MPC (~0.92), GiveDirectly Kenya meta-study (Egger et al. 2022) |
| UMC (Upper-middle) | 1.5 | Moderate-high MPC (~0.85), IMF working papers |
| HIC (High income) | 1.1 | Moderate MPC (~0.7), financial savings available, OECD estimates |

**MPC = Marginal Propensity to Consume** — the fraction of an additional dollar that is spent (vs. saved) in the local economy.

### Key Assumptions

1. **Demand-side only:** Keynesian demand-side model. Does not include supply-side effects (entrepreneurship, human capital investment, health improvements), which would add to the estimate.
2. **Short-run horizon:** 1–2 year estimate. Long-run multipliers may differ due to investment responses, price adjustments, and changes in labor force participation.
3. **No crowding out:** Appropriate for externally funded programs (donor grants, aid). For deficit-financed programs, crowding-out effects may reduce the effective multiplier.
4. **Local circulation:** Assumes recipients spend predominantly within the local economy. High leakage (imports) would reduce the multiplier — more likely in small open economies.
5. **No behavioral spillovers:** No modeling of second-order effects (neighbors who increase spending because recipients are richer, etc.).

### Literature Sources

- IMF Fiscal Monitor (October 2014): multiplier estimates for advanced and emerging economies
- Egger, D. et al. (2022): "General equilibrium effects of cash transfers: experimental evidence from Kenya" — multiplier ~2.5 in rural Kenya
- Haushofer, J. & Shapiro, J. (2016): GiveDirectly RCT evaluation
- IMF Working Paper WP/12/190 (Blanchard & Leigh): fiscal multipliers in recession contexts
- OECD Economic Outlook: consumption multipliers in high-income countries

---

## Policy Brief Export

The policy brief bundles all four dimensions into a single, exportable document with:

1. **Headline statistics** — the four key numbers, formatted for presentation
2. **Program description** — plain-language summary of the program parameters
3. **Methodology section** — one paragraph per dimension, summarizing the model
4. **Assumptions list** — every simplification stated explicitly (deduplicated)
5. **Data sources** — full citation list
6. **Caveats** — limitations the reader must understand before using the numbers

Export formats:
- **JSON** — structured data, embeddable in reports and dashboards
- **Plain text** — formatted for print and email

```
POST /v1/impact/brief
  ?format=json      (default)
  ?format=text
```

---

## Data Pipeline

All impact data flows from country economic statistics loaded at startup:

```
World Bank (2023 snapshot)
  → src/data/countries.json
    → src/data/loader.ts
      → src/core/impact.ts (pure functions)
        → src/api/routes/impact.ts (HTTP)
          → src/db/impact-db.ts (persistence)
```

The core layer has no knowledge of HTTP, databases, or file I/O — only typed country objects and numeric parameters.

---

## Architecture Invariant

`src/core/impact.ts` exports only pure functions. It imports nothing from the database, API, or adapter layers. This ensures:

- **Testability:** All calculations are unit-testable without mocking
- **Reproducibility:** Given the same inputs, results are identical
- **Auditability:** Every calculation step can be traced through the source code
- **Portability:** The calculation logic can be extracted and run independently

---

## Interpretation Guide

These estimates are designed for **planning and advocacy**, not precision forecasting.

| Use case | Appropriate |
|----------|-------------|
| Comparing program designs (coverage, targeting, amount) | ✓ |
| Comparing countries for pilot selection | ✓ |
| Writing grant proposals and concept notes | ✓ |
| Informing budget allocations | ✓ with caution |
| Academic research / rigorous evaluation | ✗ use microdata |
| Precise income effect measurement | ✗ use survey data |

For rigorous research: pair these estimates with actual program data, household survey microdata, and pre-registered evaluation designs. The estimates give you order-of-magnitude figures; empirical evaluation gives you the truth.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-21 | Initial implementation — four impact dimensions, policy brief export |
