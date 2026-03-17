# World Bank Data Importer

Automated importer that fetches economic indicators from the World Bank API and produces the `countries.json` dataset used by the rules engine.

## Usage

```bash
npm run data:update
```

This will:
1. Load configuration from `config.json`
2. Fetch 5 indicators from the World Bank API v2 for all configured countries
3. Transform and round the data
4. Validate the output (min country count, income group coverage, value ranges)
5. Write `src/data/countries.json` with an updated `dataVersion`

If validation fails, `countries.json` is **not** overwritten.

## Configuration

All tunables are in **`config.json`** — a plain JSON file editable by anyone, no TypeScript required.

### Key sections

| Section | What it controls | Example change |
|---|---|---|
| `source` | API URL and request params | Swap `baseUrl` to a different provider |
| `indicators` | Field name → indicator code mapping | Change `gniPerCapitaUsd` to a different WB code |
| `countries` | Which countries to include | Add `"PL"` to `codes`, or set `mode: "all"` |
| `incomeGroupThresholds` | GNI thresholds for HIC/UMC/LMC/LIC | Update when World Bank publishes new thresholds |
| `giniIndex` | How far back to search for Gini data | Increase `lookbackYears` if too many nulls |
| `output` | File path, version prefix, rounding | Change decimal precision per field |
| `validation` | Rules output must pass | Adjust `minCountries` threshold |

## Data sources

| Indicator | World Bank Code | Maps to |
|---|---|---|
| GDP per capita (current US$) | `NY.GDP.PCAP.CD` | `gdpPerCapitaUsd` |
| GNI per capita, Atlas method (current US$) | `NY.GNP.PCAP.CD` | `gniPerCapitaUsd` |
| PPP conversion factor (GDP, LCU per int'l $) | `PA.NUS.PPP` | `pppConversionFactor` |
| Gini index | `SI.POV.GINI` | `giniIndex` |
| Population, total | `SP.POP.TOTL` | `population` |

## Income group thresholds (2022)

| Code | Classification | GNI per capita (Atlas) |
|---|---|---|
| HIC | High income | > $14,005 |
| UMC | Upper middle income | $4,516 – $14,005 |
| LMC | Lower middle income | $1,146 – $4,515 |
| LIC | Low income | ≤ $1,145 |

## Pipeline architecture

```
config.json
    ↓
config.types.ts    Load + validate config
    ↓
fetcher.ts         Fetch from World Bank API (5 requests, retry on failure)
    ↓
transformer.ts     Merge, classify income groups, round, sort
    ↓
validator.ts       Check output against config rules
    ↓
importer.ts        Orchestrate and write countries.json
```

Each module is independent and testable. To swap data providers, replace `fetcher.ts` — the transformer and validator work with the same intermediate format regardless of source.

## Swapping to a different data provider

1. Change `source.baseUrl` in `config.json`
2. Update `indicators` codes to match the new provider's API
3. If the API response shape differs from World Bank's, create a new fetcher (e.g., `fetcher-imf.ts`) and update the import in `importer.ts`
4. The transformer, validator, and output format remain unchanged
