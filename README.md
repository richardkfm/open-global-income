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
├── data/        Data loading and normalization
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
curl http://localhost:3000/v1/income/calc?country=NG
```

```json
{
  "ok": true,
  "data": {
    "countryCode": "NG",
    "pppUsdPerMonth": 200,
    "localCurrencyPerMonth": 33700,
    "score": 1,
    "meta": {
      "rulesetVersion": "stub-v0.0.1",
      "dataVersion": "dummy-2026-03-01"
    }
  }
}
```

**Available countries (Phase 1):** `DE` (Germany), `BR` (Brazil), `NG` (Nigeria)

## Current Status

**Version 0.0.1** — Phase 1 (scaffold + stub rules engine + dummy data)

See [claude.md](./claude.md) for the full roadmap.

## License

[MIT](./LICENSE)
