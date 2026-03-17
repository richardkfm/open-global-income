# Open Global Income

An open, transparent standard for calculating a **global income entitlement** per person and country.

This project provides a neutral **entitlement / score layer** that other projects (NGOs, DAOs, ReFi platforms, SaaS, governments) can integrate with. It does not distribute money — it defines a versioned, auditable calculation model and exposes it through a public API.

## Key Principles

- **Neutral** — no hard dependency on any specific blockchain or token. Values expressed in PPP-adjusted USD, mapped to currencies/tokens via adapters.
- **Transparent** — all formulas, parameters, and data sources are open. Every result includes `ruleset_version` and `data_version`.
- **Modular** — clean separation between data sources, rules engine, API, and chain adapters.

## Architecture

```
src/
├── core/        Pure domain logic (types, rules engine) — zero framework deps
├── data/        Data loading, normalization, World Bank source docs
├── api/         HTTP layer (Fastify)
└── adapters/    Chain/currency adapters (Solana, Ethereum — future)
```

## Quickstart

```bash
# Install dependencies
npm install

# Run in development (hot-reload)
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

### Docker

```bash
docker compose up
```

## API

### `GET /health`

Returns `{ "status": "ok" }`.

### `GET /v1/income/calc?country=XX`

Calculate the global income entitlement for a country (ISO 3166-1 alpha-2 code).

**Example:**

```bash
curl http://localhost:3333/v1/income/calc?country=NG
```

```json
{
  "ok": true,
  "data": {
    "countryCode": "NG",
    "pppUsdPerMonth": 210,
    "localCurrencyPerMonth": 35385,
    "score": 1,
    "meta": {
      "rulesetVersion": "v1",
      "dataVersion": "worldbank-2023"
    }
  }
}
```

**49 countries available** across all World Bank income groups (HIC, UMC, LMC, LIC).

## Ruleset v1

The current formula (`rulesetVersion: "v1"`):

```
pppUsdPerMonth  = 210                                (global floor, PPP-USD/month)
localCurrency   = pppUsdPerMonth × pppConversionFactor
incomeRatio     = 210 / (gniPerCapitaUsd / 12)
giniPenalty     = (giniIndex / 100) × 0.15           (0 if Gini unavailable)
score           = clamp(incomeRatio + giniPenalty, 0, 1)
```

- **$210/month** is derived from the World Bank upper-middle-income poverty line ($6.85/day)
- **GNI per capita** (not GDP) reflects what residents actually earn
- **Gini penalty** amplifies need for countries with high inequality

## Phases

- [x] **Phase 1 (v0.0.1)** — Project scaffold, stub rules engine, dummy data
- [x] **Phase 2 (v0.0.2)** — Real World Bank data, Ruleset v1, unit tests
- [ ] **Phase 3 (v0.0.3)** — API expansion, rulesets endpoint, countries endpoint, error handling
- [ ] **Phase 4 (v0.0.4)** — Documentation (ARCHITECTURE, RULESET, CONTRIBUTING), CI
- [ ] **Phase 5 (v0.0.5)** — Currency/unit model, Solana adapter skeleton

## Current Status

**Version 0.0.2** — Phase 2 (real data + Ruleset v1)

See [CHANGELOG.md](./CHANGELOG.md) for details.

## License

[MIT](./LICENSE)
