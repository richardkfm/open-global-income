# Ruleset v3 — Specification

**Status:** active since v0.3.0 (supersedes [Ruleset v1](./RULESET_V1.md), which stays reproducible via `calculateEntitlementV1`).
**Code:** `src/core/rules.ts` (`calculateEntitlement`, `resolveEntitlementFloor`), `src/core/poverty.ts` (`estimateMedianIncome`, `resolveCountryPovertyLine`), registry entry in `src/core/rulesets.ts`.

## What changed from v1, and why

v1 paid the same $210 PPP per person per month everywhere. That number is the World Bank upper-middle-income poverty line, so it is a meaningful floor in Kenya or India. In Germany, though, it comes to about €164 a month: a top-up, not a basic income. Anyone reading the numbers for the first time saw that immediately.

v3 pays each person the **higher** of two figures:

1. the global floor, $210 PPP per month, unchanged; and
2. the country's **local adequacy line** (§2).

Low- and middle-income countries keep $210 and never receive less. High-income countries are paid their own at-risk-of-poverty line, which is a level a person can live on there.

The **need score does not change**. It still compares the fixed $210 floor with GNI per capita, so need rankings stay comparable across countries and between v1 and v3. Only the paid amount changes.

## 1. Formula

```
adequacy              = localAdequacyLine(country)                 PPP-USD / month
pppUsdPerMonth        = max(GLOBAL_INCOME_FLOOR_PPP, adequacy)      GLOBAL_INCOME_FLOOR_PPP = 210
localCurrencyPerMonth = pppUsdPerMonth × pppConversionFactor

incomeRatio = GLOBAL_INCOME_FLOOR_PPP / (gniPerCapitaUsd / 12)      (as v1)
giniPenalty = (giniIndex / 100) × GINI_WEIGHT                       (as v1, 0 if Gini missing)
score       = clamp(incomeRatio + giniPenalty, 0, 1)                (as v1)
```

Responses carry `floor: { pppUsdPerMonth, basis, anchorPppUsdPerMonth, adequacyPppUsdPerMonth }`, where `basis` is `global_anchor` or `local_adequacy`. This field records which branch was taken.

An explicit `floorOverride` on a simulation still takes precedence over the default amount.

## 2. The local adequacy line

| Income group | Line | Result vs. $210 |
|---|---|---|
| Low income | World Bank $2.15/day ≈ $65/month | below, so $210 is paid |
| Lower-middle income | World Bank $3.65/day ≈ $110/month | below, so $210 is paid |
| Upper-middle income | World Bank $6.85/day ≈ $206/month | below (the floor is this line, rounded up), so $210 is paid |
| High income | 60% of **median equivalised disposable income** | above, so the line is paid |

For high-income countries, the line is the EU / OECD at-risk-of-poverty standard, built from survey data:

```
medianPppUsd = medianAnnualLcu / pppConversionFactor
adequacy     = 0.6 × medianPppUsd / 12
```

Converting with the same PPP factor that turns PPP-USD back into local currency means the paid amount in local currency equals the official threshold exactly. For Germany: 28,891 € × 0.6 / 12 = **€1,444.55 a month**, which is the Eurostat EU-SILC 2025 at-risk-of-poverty threshold for a single adult.

### Data sources (`src/data/median-income.json`, refreshed with `npm run data:update:median`)

The importer tries each source in this order and uses the first one that has data:

1. **Eurostat EU-SILC** (EU / EFTA): `ilc_di03` gives the median equivalised net income in national currency, and `ilc_li02` gives the at-risk-of-poverty rate.
2. **OECD Income Distribution Database**: median equivalised disposable income and the poverty rate at 60% of the median.
3. **World Bank PIP**: the survey median per capita. It is not equivalised, so it is flagged as lower quality.

The survey's at-risk-of-poverty rate also fills `relativePovertyHeadcountRatioPercent`. High-income countries therefore get a poverty baseline at the same line, where previously the poverty-reduction model had none.

**Countries with no survey median** (in the current snapshot, only Singapore) use a proxy: `0.6 × GDP per capita (PPP)` as the median. The factor 0.6 (`MEDIAN_INCOME_TO_GDP_PPP_RATIO`) is the median ratio across the 15 surveyed high-income countries. A test recomputes it from the snapshot and fails if it drifts. These lines are marked `dataQuality: 'low'`.

### Regions

`buildRegionAdjustedCountry` scales the national median by the region's cost-of-living index, by the same factor as the PPP conversion factor. The adequacy line in PPP-USD therefore stays national, and the regional amount in local currency moves with prices. For example: Hamburg (1.15) €1,661, Berlin (1.08) €1,560, Sachsen-Anhalt (0.82) €1,185.

## 3. Effect on high-income countries (committed snapshot)

| Country | Median source | v1 paid / month | v3 paid / month | v3 (PPP-USD) | Universal, % of GDP (v1 → v3) |
|---|---|--:|--:|--:|--:|
| Australia | OECD IDD 2020 | 317 AUD | 2,796 AUD | $1,852 | 3.6% → 31.4% |
| Canada | OECD IDD 2023 | 265 CAD | 2,830 CAD | $2,246 | 4.0% → 43.0% |
| France | Eurostat EU-SILC 2025 | 153 EUR | 1,323 EUR | $1,812 | 4.4% → 37.9% |
| Germany | Eurostat EU-SILC 2025 | 164 EUR | 1,445 EUR | $1,852 | 3.7% → 33.0% |
| Israel | OECD IDD 2023 | 783 ILS | 6,024 ILS | $1,615 | 4.6% → 35.2% |
| Italy | Eurostat EU-SILC 2025 | 139 EUR | 1,103 EUR | $1,671 | 4.8% → 38.3% |
| Japan | OECD IDD 2021 | 21,882 JPY | 127,000 JPY | $1,219 | 4.7% → 27.0% |
| Netherlands | Eurostat EU-SILC 2025 | 166 EUR | 1,723 EUR | $2,181 | 3.5% → 36.0% |
| Norway | Eurostat EU-SILC 2025 | 2,253 NOK | 24,376 NOK | $2,272 | 2.4% → 26.4% |
| Singapore | proxy (no survey) | 176 SGD | 2,732 SGD | $3,252 | 2.3% → 36.0% |
| South Korea | OECD IDD 2023 | 184,086 KRW | 1,878,501 KRW | $2,143 | 4.6% → 47.1% |
| Spain | Eurostat EU-SILC 2025 | 137 EUR | 1,018 EUR | $1,567 | 5.2% → 38.6% |
| Sweden | Eurostat EU-SILC 2025 | 1,987 SEK | 16,334 SEK | $1,727 | 3.6% → 29.7% |
| Switzerland | Eurostat EU-SILC 2024 | 254 CHF | 2,523 CHF | $2,085 | 2.9% → 29.2% |
| United Kingdom | OECD IDD 2023 | 145 GBP | 1,183 GBP | $1,715 | 4.7% → 38.3% |
| United States | OECD IDD 2023 | 210 USD | 2,494 USD | $2,494 | 3.3% → 38.6% |

All 33 low- and middle-income countries are paid exactly the same amount as under v1.

A universal basic income at the poverty line costs roughly a quarter to a half of GDP in high-income countries. That is the real order of magnitude of the policy question, and it is what an operator needs to see. In the recommended funding mix, a high-income country's residual gap is shown as a domestic funding gap. It is never attributed to an international solidarity transfer, because these countries would be donors to such a pool, not recipients.

## 4. Caveats

- **One adult, no household economies of scale.** The line is the threshold for a single adult. Paying it to every person, children included, overstates what a household needs. The per-adult-equivalent refinement (Phase 3 household size, then a later ruleset) addresses this.
- **Equivalence scales differ.** Eurostat uses the modified OECD scale and the OECD IDD uses the square-root scale, so the medians are close but not identical for the same country. Eurostat is preferred wherever it has data.
- **Survey years differ** (2020–2025). The PPP factor is from the country snapshot. Both are refreshed by `npm run data:update`.
- **Gross of existing benefits.** v3 states the amount needed for a floor. It does not net out existing transfers such as Bürgergeld. The funding mechanism "redirect social spending" is where that interaction is modelled.

## 5. Decision record

This reverses Row E of [INCOME_FLOOR_PROPOSED_ANSWERS.md](./INCOME_FLOOR_PROPOSED_ANSWERS.md) (the "dual-track" design, where the adequacy line was informational only). The maintainer decided on 2026-11-24 that a $210 payment in high-income countries does not work as a basic income. Comparability is preserved through the unchanged need score and the `floor.basis` field. The global floor remains the minimum everywhere.
