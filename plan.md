# Plan: Sub-national Data (Phase 1 — Kenya)

## Core Idea

A `Region` has a `costOfLivingIndex` (multiplier where 1.0 = national average). To calculate a regional entitlement, we construct a modified `Country` object where `pppConversionFactor *= costOfLivingIndex` and `population = regional population`. All existing pure functions (`calculateEntitlement`, `calculateSimulation`, etc.) work transparently — zero changes to existing formulas.

---

## Step 1: New Types (`src/core/types.ts`)

Add after the `Country` interface:

```typescript
export interface RegionStats {
  population: number;
  costOfLivingIndex: number;        // 1.0 = national avg, 1.35 = 35% pricier
  urbanRural: 'urban' | 'rural' | 'mixed';
  povertyHeadcountRatio?: number | null;
  dataAsOf: string;                 // ISO date
  dataSource: string;
}

export interface Region {
  id: string;                       // "KE-NAI"
  countryCode: CountryCode;
  regionCode: string;               // "NAI"
  name: string;                     // "Nairobi County"
  stats: RegionStats;
}

export interface RegionalIncomeEntitlement extends GlobalIncomeEntitlement {
  regionId: string;
  regionName: string;
  costOfLivingIndex: number;
  nationalLocalCurrencyPerMonth: number;  // for comparison
}
```

## Step 2: Pure Core Logic (`src/core/regions.ts` — new file)

Two pure functions, no I/O:

- `buildRegionAdjustedCountry(country, region)` → returns a new `Country` with adjusted `pppConversionFactor` and `population`
- `toRegionalEntitlement(entitlement, nationalEntitlement, region)` → wraps a `GlobalIncomeEntitlement` into `RegionalIncomeEntitlement` with comparison data

Key property: **score is unchanged** — it's derived from GNI and Gini (national stats), not PPP. The regional adjustment only affects `localCurrencyPerMonth`.

## Step 3: Seed Data (`src/data/regions.json` — new file)

Kenya's 47 counties. Key examples:

| Region | Code | Pop | COL Index | Type |
|--------|------|-----|-----------|------|
| Nairobi | KE-NAI | 4.4M | 1.35 | urban |
| Mombasa | KE-MSA | 1.2M | 1.12 | urban |
| Nakuru | KE-NKR | 2.2M | 0.95 | mixed |
| Turkana | KE-TUR | 926K | 0.68 | rural |
| Kiambu | KE-KIA | 2.4M | 1.08 | mixed |
| ... (all 47 counties) | | | | |

Source: Kenya National Bureau of Statistics (KNBS) 2019 Census for population, KNBS CPI by county for cost-of-living indices.

## Step 4: Data Loader (`src/data/loader.ts`)

Add parallel region loading (same readFileSync + cache pattern as countries):

- `getAllRegions(): Region[]`
- `getRegionById(id: string): Region | undefined`
- `getRegionsByCountry(countryCode: string): Region[]`
- `getRegionsDataVersion(): string`
- `resetRegionsCache(): void` (for tests)

## Step 5: API Endpoints (`src/api/routes/regions.ts` — new file)

Registered in `server.ts` at prefix `/v1/income`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/income/regions` | List regions, optional `?country=KE` filter |
| GET | `/v1/income/regions/:id` | Region detail |
| GET | `/v1/income/calc/regional` | Regional entitlement: `?country=KE&region=KE-NAI` |
| POST | `/v1/simulate/regional` | Regional simulation (body: standard sim params + `regionId`) |

Error codes: `REGION_NOT_FOUND`, `REGION_COUNTRY_MISMATCH`, `MISSING_PARAMETER`

## Step 6: Server Registration (`src/api/server.ts`)

Register `regionsRoute` plugin.

## Step 7: Admin UI

- `src/admin/views/regions.ts` — new: `renderRegionList`, `renderRegionDetail`
- `src/admin/routes.ts` — add GET `/admin/regions` and `/admin/regions/:id`
- `src/admin/views/layout.ts` — add "Regions" to sidebar nav

## Step 8: Tests

**`src/core/regions.test.ts`** — pure unit tests:
- Adjusted country has correct PPP factor (national × COL index)
- Regional population is substituted
- Other stats preserved unchanged
- Input objects not mutated
- COL > 1 → higher localCurrencyPerMonth; COL < 1 → lower
- Score unchanged by regional adjustment

**`src/data/regions.test.ts`** — loader tests:
- `getAllRegions()` returns seeded regions
- `getRegionsByCountry('KE')` returns Kenya regions
- `getRegionById('KE-NAI')` works
- All COL indices in valid range
- All countryCode values exist in countries.json

**`src/api/routes/regions.test.ts`** — integration tests:
- All new endpoints return correct status codes
- Regional calc produces different localCurrencyPerMonth than national
- Country mismatch returns 400
- Existing tests all pass unchanged

---

## Files Changed

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `RegionStats`, `Region`, `RegionalIncomeEntitlement` |
| `src/core/regions.ts` | **New** — `buildRegionAdjustedCountry`, `toRegionalEntitlement` |
| `src/core/regions.test.ts` | **New** — unit tests |
| `src/data/regions.json` | **New** — Kenya 47 counties seed data |
| `src/data/loader.ts` | Add region loader functions |
| `src/data/regions.test.ts` | **New** — loader tests |
| `src/api/routes/regions.ts` | **New** — 4 endpoints |
| `src/api/routes/regions.test.ts` | **New** — integration tests |
| `src/api/server.ts` | Register regions route |
| `src/admin/views/regions.ts` | **New** — region list/detail views |
| `src/admin/routes.ts` | Add region admin routes |
| `src/admin/views/layout.ts` | Add Regions nav link |

## Files NOT Changed

- `src/core/rules.ts` — formula untouched
- `src/core/simulations.ts` — untouched
- `src/core/funding.ts` — untouched
- `src/core/impact.ts` — untouched
- `src/core/constants.ts` — untouched
- `src/db/database.ts` — no new tables needed
- All existing API routes — unchanged
