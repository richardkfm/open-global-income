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

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full module breakdown, dependency rules, and design decisions.

## Quickstart

```bash
# Install dependencies
npm install

# Run in development (hot-reload)
npm run dev

# Run tests
npm test

# Type-check
npm run typecheck

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

### `GET /v1/income/rulesets`

List all available rulesets with formula, parameters, and active status.

### `GET /v1/income/countries`

List all supported countries with income group and data availability.

### `POST /v1/users`

Register a user with a country code. Body: `{ "country_code": "DE" }`

### `GET /v1/users/:id/income`

Get a registered user's income entitlement.

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

See [RULESET_V1.md](./RULESET_V1.md) for the full specification with worked examples and data source details.

## Chain adapters

Adapters map a `GlobalIncomeEntitlement` (in PPP-USD/month) to a concrete token or currency amount for a specific chain. They are pure calculation modules — no chain writes.

**Available:** Solana (`src/adapters/solana/`) — maps entitlements to any SPL token amount via a configurable exchange rate.

**Planned:** Ethereum / L2s (same `ChainAdapter` interface).

See `src/adapters/` for the interface definition and implementation details.

## Phases

- [x] **Phase 1 (v0.0.1)** — Project scaffold, stub rules engine, dummy data
- [x] **Phase 2 (v0.0.2)** — Real World Bank data, Ruleset v1, unit tests
- [x] **Phase 3 (v0.0.3)** — API expansion, rulesets endpoint, countries endpoint, error handling
- [x] **Phase 4 (v0.0.4)** — Documentation ([ARCHITECTURE](./ARCHITECTURE.md), [RULESET_V1](./RULESET_V1.md), [CONTRIBUTING](./CONTRIBUTING.md)), CI
- [x] **Phase 5 (v0.0.5)** — Currency/unit model, Solana adapter skeleton

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, code style, testing requirements, and the PR process.

## Current Status

**Version 0.0.5** — Phase 5 complete (Solana adapter + currency model)

See [CHANGELOG.md](./CHANGELOG.md) for full version history.

## License

[MIT](./LICENSE)
