# Ruleset v1 — Specification

**Ruleset identifier:** `v1`
**Data snapshot:** `worldbank-2023`
**Status:** Active (used by all `/v1/income/calc` responses)

---

## Purpose

Ruleset v1 defines a deterministic, reproducible formula for calculating a **global income entitlement** for any supported country. It answers the question:

> *Given a country's economic statistics, what is a fair minimum monthly income (in PPP-adjusted USD), and how does that floor compare to what residents of this country typically earn?*

Every result produced by this ruleset includes both `rulesetVersion` and `dataVersion` so consumers can detect when either the formula or the underlying data has changed.

---

## Inputs

The formula takes a `Country` object containing:

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `gniPerCapitaUsd` | `number` | World Bank `NY.GNP.PCAP.CD` | GNI per capita, Atlas method, current USD |
| `pppConversionFactor` | `number` | World Bank `PA.NUS.PPP` | LCU per international dollar (PPP) |
| `giniIndex` | `number \| null` | World Bank `SI.POV.GINI` | Gini coefficient, 0–100 scale; `null` if unavailable |

---

## Formula

### Step 1 — Base entitlement (PPP-USD per month)

```
pppUsdPerMonth = GLOBAL_INCOME_FLOOR_PPP = 210
```

This value is constant across all countries. It represents the minimum monthly income that the model considers a baseline entitlement for any person globally, regardless of where they live.

### Step 2 — Local currency amount

```
localCurrencyPerMonth = round(pppUsdPerMonth × pppConversionFactor, 2)
```

Converts the PPP-USD floor into local currency units using the World Bank PPP conversion factor. This gives a locally-meaningful figure that accounts for price level differences between countries.

### Step 3 — Income ratio

```
monthlyGniPerCapita = gniPerCapitaUsd / 12
incomeRatio         = GLOBAL_INCOME_FLOOR_PPP / monthlyGniPerCapita   (or 1 if monthlyGniPerCapita ≤ 0)
```

Measures how large the global floor is relative to the country's average monthly income. A higher ratio means the floor represents a larger fraction of what residents typically earn — indicating greater relative need.

**Why GNI and not GDP?** GNI better reflects what residents actually earn: it adjusts for cross-border income flows (remittances, profit repatriation), while GDP measures production within borders regardless of who captures the value.

### Step 4 — Gini penalty (inequality amplifier)

```
giniPenalty = (giniIndex / 100) × GINI_WEIGHT   (or 0 if giniIndex is null)
```

Two countries with identical average incomes may have very different distributions. A higher Gini coefficient means the poorest residents are further from the average — the global floor matters more for them. The Gini penalty increases the score for unequal societies.

`GINI_WEIGHT = 0.15` means a country with perfect inequality (Gini = 100) adds 0.15 to its raw score.

### Step 5 — Normalized need score

```
rawScore = incomeRatio + giniPenalty
score    = clamp(rawScore, 0, 1)
```

The score is clamped to the range [0, 1]:

- **0** — the global floor is negligible relative to local incomes (very high-income country)
- **1** — the global floor exceeds or equals monthly income; maximum need (low-income country)

In practice, most high-income countries score < 0.1 and most low-income countries score = 1.0 (clamped).

---

## Constants

| Constant | Value | Rationale |
|----------|-------|-----------|
| `GLOBAL_INCOME_FLOOR_PPP` | `210` PPP-USD/month | World Bank upper-middle-income poverty line: $6.85/day (2017 PPP) × 365 ÷ 12 ≈ $208.35, rounded to $210 |
| `GINI_WEIGHT` | `0.15` | Controls inequality amplification. At 0.15, extreme inequality (Gini=100) adds 0.15 to the raw score. Calibrated so inequality is a meaningful but not dominant factor. |
| `RULESET_VERSION` | `"v1"` | Semver-like identifier — increment when the formula or constants change in a result-altering way |

---

## Worked examples

### Example 1 — Germany (HIC, high income, low need)

**Inputs:**
- `gniPerCapitaUsd`: 51,640
- `pppConversionFactor`: 0.78
- `giniIndex`: 31.7

**Calculation:**
```
pppUsdPerMonth        = 210
localCurrencyPerMonth = round(210 × 0.78, 2) = 163.80 EUR/month

monthlyGniPerCapita = 51,640 / 12 = 4,303.33
incomeRatio         = 210 / 4,303.33 ≈ 0.0488
giniPenalty         = (31.7 / 100) × 0.15 = 0.04755 × 0.15 ≈ 0.04755... → 0.0476

rawScore = 0.0488 + 0.0476 ≈ 0.0488 + 0.0476 = 0.0488
```

Wait — let me be precise:
```
incomeRatio = 210 / 4303.33 ≈ 0.04880
giniPenalty = (31.7 / 100) × 0.15 = 0.3170 × 0.15 = 0.04755
rawScore    = 0.04880 + 0.04755 = 0.09635
score       = clamp(0.09635, 0, 1) ≈ 0.0964
```

**Result:** `score ≈ 0.0964`, `localCurrencyPerMonth = 163.80`

Interpretation: The global floor is about 10% of Germany's average monthly GNI per capita — very low relative need.

---

### Example 2 — Brazil (UMC, upper-middle income, moderate need)

**Inputs:**
- `gniPerCapitaUsd`: 9,140
- `pppConversionFactor`: 2.55
- `giniIndex`: 48.9

**Calculation:**
```
pppUsdPerMonth        = 210
localCurrencyPerMonth = round(210 × 2.55, 2) = 535.50 BRL/month

monthlyGniPerCapita = 9,140 / 12 = 761.67
incomeRatio         = 210 / 761.67 ≈ 0.2757
giniPenalty         = (48.9 / 100) × 0.15 = 0.489 × 0.15 = 0.07335

rawScore = 0.2757 + 0.0734 = 0.3491
score    = clamp(0.3491, 0, 1) = 0.3491
```

**Result:** `score ≈ 0.3491`, `localCurrencyPerMonth = 535.50`

Interpretation: The global floor is 35% of Brazil's average monthly GNI. Brazil's high inequality (Gini=48.9) adds a meaningful penalty on top of the income ratio.

---

### Example 3 — Burundi (LIC, low income, maximum need)

**Inputs:**
- `gniPerCapitaUsd`: 240
- `pppConversionFactor`: 741.0
- `giniIndex`: 38.6

**Calculation:**
```
pppUsdPerMonth        = 210
localCurrencyPerMonth = round(210 × 741.0, 2) = 155,610.00 BIF/month

monthlyGniPerCapita = 240 / 12 = 20
incomeRatio         = 210 / 20 = 10.5
giniPenalty         = (38.6 / 100) × 0.15 = 0.386 × 0.15 = 0.0579

rawScore = 10.5 + 0.0579 = 10.5579
score    = clamp(10.5579, 0, 1) = 1.0
```

**Result:** `score = 1.0` (clamped), `localCurrencyPerMonth = 155,610.00`

Interpretation: Burundi's average monthly GNI per capita is only $20 — the global floor is more than 10× that amount. Score is clamped to 1.0, indicating maximum relative need.

---

## Data sources

The `worldbank-2023` snapshot uses the following World Bank Open Data indicators:

| Indicator | Code | Notes |
|-----------|------|-------|
| GNI per capita, Atlas method (current USD) | `NY.GNP.PCAP.CD` | Primary income reference |
| PPP conversion factor (GDP, LCU per international $) | `PA.NUS.PPP` | Local currency conversion |
| Gini index | `SI.POV.GINI` | Inequality amplifier; `null` if not reported |
| GDP per capita (current USD) | `NY.GDP.PCAP.CD` | Stored but not used in v1 formula |
| Population, total | `SP.POP.TOTL` | Stored for context |
| Income group | — | World Bank classification: HIC / UMC / LMC / LIC |

Data reflects primarily 2022–2023 values. See `src/data/worldbank/README.md` for full details and update instructions.

---

## Versioning policy

- **`rulesetVersion`** changes when the formula, constants, or score semantics change in a way that would produce different numeric results.
- **`dataVersion`** changes when the country dataset (`countries.json`) is refreshed with newer World Bank data.
- Both fields are included in every API response so downstream consumers can cache results and invalidate when either version changes.

Backward-incompatible formula changes will use a new ruleset identifier (e.g. `v2`), and the old ruleset will remain available for a transition period.
