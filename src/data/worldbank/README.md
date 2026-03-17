# World Bank Data Sources

The country dataset in `countries.json` is derived from the following World Bank indicators:

| Indicator | Code | Description |
|---|---|---|
| GDP per capita (current US$) | NY.GDP.PCAP.CD | Gross domestic product divided by midyear population |
| GNI per capita, Atlas method (current US$) | NY.GNP.PCAP.CD | Gross national income per capita using the Atlas method |
| PPP conversion factor (GDP, LCU per international $) | PA.NUS.PPP | Purchasing power parity conversion factor |
| Gini index | SI.POV.GINI | Measure of income inequality (0 = perfect equality, 100 = perfect inequality) |
| Population, total | SP.POP.TOTL | Total population count |
| Income group | — | World Bank classification: HIC, UMC, LMC, LIC |

## Data version

The current dataset uses `dataVersion: "worldbank-2023"`, reflecting the most recent available data points (primarily 2022–2023 values).

## How to update

In a future phase, the `importer.ts` script will automate fetching the latest data from the World Bank API (`api.worldbank.org/v2/`). For now, the dataset is curated manually from publicly available World Bank Open Data tables.

## Income group codes

| Code | Meaning | GNI per capita (2022 Atlas) |
|---|---|---|
| HIC | High income | > $14,005 |
| UMC | Upper middle income | $4,516 – $14,005 |
| LMC | Lower middle income | $1,146 – $4,515 |
| LIC | Low income | ≤ $1,145 |
