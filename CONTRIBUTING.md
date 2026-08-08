# Contributing to Open Global Income

Thank you for your interest in contributing! This project is open to contributions of all kinds — data updates, formula improvements, documentation fixes, new adapters, and bug reports.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Making changes](#making-changes)
- [Code style](#code-style)
- [Testing](#testing)
- [Adding or updating country data](#adding-or-updating-country-data)
- [Proposing a new ruleset version](#proposing-a-new-ruleset-version)
- [Adding a chain adapter](#adding-a-chain-adapter)
- [Pull request checklist](#pull-request-checklist)

---

## Code of conduct

Be respectful and constructive. Assume good faith, critique the work rather than the person, and keep discussion focused on the technical and methodological merits. Harassment of any kind is not tolerated. Maintainers may edit, lock, or remove contributions that do not meet this standard, and may block repeat offenders.

Report concerns privately to the maintainers.

---

## Development setup

**Prerequisites:**
- Node.js 20+
- npm 10+

```bash
# 1. Clone the repo
git clone https://github.com/richardkfm/open-global-income.git
cd open-global-income

# 2. Install dependencies
npm install

# 3. Run the development server (hot-reload)
npm run dev

# 4. Run all tests
npm test

# 5. Type-check without emitting
npm run typecheck
```

The server starts on port **3333** by default. Override with the `PORT` environment variable:

```bash
PORT=4000 npm run dev
```

Test the API:

```bash
curl "http://localhost:3333/v1/income/calc?country=DE"
curl "http://localhost:3333/health"
```

---

## Project structure

```
src/
├── core/          Pure domain logic — no I/O, no side effects
├── data/          Country/region datasets, World Bank + ILO + IMF importers
├── api/           Fastify HTTP server and routes
├── db/            SQLite persistence and PostgreSQL migrations
├── admin/         Server-rendered admin UI (htmx)
├── web/           Public advocacy site at /
├── i18n/          Translation strings for the public site
├── adapters/      Optional chain/currency adapters
├── disbursements/ Non-custodial payment providers
├── identity/      Identity verification connectors
└── webhooks/      Outbound event dispatch
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full details.

---

## Making changes

1. **Fork** the repository and create a feature branch:
   ```bash
   git checkout -b feat/my-change
   ```

2. Make your changes. Keep commits small and focused — one logical change per commit.

3. Ensure **all tests pass** and **no TypeScript errors** before opening a PR:
   ```bash
   npm test
   npm run typecheck
   ```

4. Open a pull request against `main` with a clear title and description of what changed and why.

---

## Code style

- **Language:** TypeScript 5.7+ in strict mode (`"strict": true` in `tsconfig.json`)
- **Imports:** Use ESM with `.js` extensions (e.g. `import { foo } from './bar.js'`), even when importing `.ts` files
- **Naming:** `camelCase` for variables/functions, `PascalCase` for types/interfaces/classes
- **No default exports** — use named exports throughout
- **No `any`** — use proper types; if unavoidable, add a comment explaining why
- **Pure functions** in `src/core/` — no side effects, no external I/O
- **Comments:** Add comments only where the logic is not self-evident. Prefer clear naming over comments.

ESLint (`eslint.config.js`) and Prettier (`.prettierrc`) are both configured — `npm run lint` and `npm run format:check` run them. Neither is gated in CI yet, because both currently fail on pre-existing issues across the codebase; until that debt is cleared, follow the style of the surrounding code and don't reformat files you aren't otherwise touching.

---

## Testing

Tests are written with [Vitest](https://vitest.dev/).

```bash
npm test           # Run all tests once
npm run test:watch # Run in watch mode during development
```

**Rules for tests:**

- Every new function in `src/core/` must have corresponding unit tests in a sibling `*.test.ts` file.
- API route tests use Fastify's `inject()` method (no real network calls).
- Adapter tests must be pure — no blockchain or network I/O.
- Test names should describe the expected behavior, not the implementation.

When adding a new test scenario, follow the existing pattern in `src/core/rules.test.ts` and use meaningful country data rather than arbitrary numbers.

---

## Adding or updating country data

Country data lives in `src/data/countries.json`. Each entry must have:

```json
{
  "code": "XX",
  "name": "Country Name",
  "stats": {
    "gdpPerCapitaUsd": 0,
    "gdpPerCapitaPppUsd": 0,
    "gniPerCapitaUsd": 0,
    "pppConversionFactor": 1.0,
    "giniIndex": null,
    "population": 0,
    "incomeGroup": "LIC"
  }
}
```

`gdpPerCapitaPppUsd` is required — it is the denominator for every "% of GDP" figure in the simulation, funding, and impact layers, which are all PPP-denominated. Omitting it silently distorts those figures. The remaining fiscal, labour, and social-protection fields are optional; the model degrades explicitly when they are absent rather than imputing.

**Data sources:** Use the World Bank Open Data indicators listed in `src/data/worldbank/config.json` (documented in `src/data/worldbank/README.md`) and the ILO indicators in `src/data/ilo/config.json`. Prefer the most recent available year (typically the year before the current `dataVersion`).

Prefer refreshing through the importers (`npm run data:update`) over editing `countries.json` by hand — hand edits are how the committed snapshot came to hold seeded estimates rather than fetched values.

When you refresh the dataset:
1. Update all countries with the latest available data.
2. Bump `dataVersion` in `src/data/countries.json` (e.g. `"worldbank-2024"`); `src/data/loader.ts` reads it from there.
3. Re-run tests — snapshot values in `rules.test.ts` may need updating if real countries changed.
4. Document the refresh in `CHANGELOG.md`.

---

## Proposing a new ruleset version

`src/core/rules.ts` holds the formula implementations and `src/core/rulesets.ts` is the registry that declares each version's status (`active` / `preview` / `deprecated`). v1 is active; v2 is registered as a preview. To propose a change:

1. **Open an issue first** — describe the motivation, the proposed formula changes, and any data requirements.
2. After discussion and approval, add the new constants to `src/core/constants.ts` and the new formula as a **new exported function** in `src/core/rules.ts` alongside the existing ones.
3. Register it in `src/core/rulesets.ts` with status `preview`. **Never** change an existing version's formula or repoint `RULESET_VERSION` in a way that silently alters results already published under that version — every response carries `rulesetVersion` precisely so consumers can trust it.
4. A new ruleset stays `preview` (queryable via `GET /v1/income/rulesets/:version`, not used for default calculations) until it is promoted deliberately.
5. Write tests covering all four income groups.
6. Document it in a `RULESET_VX.md` file with the same structure as [RULESET_V1.md](./RULESET_V1.md).

See [RULESET_V1.md](./RULESET_V1.md) for the expected documentation format.

---

## Adding a chain adapter

Adapters live in `src/adapters/`. To add a new chain:

1. Create a directory: `src/adapters/<chain-name>/`
2. Implement the `ChainAdapter<TConfig>` interface from `src/adapters/types.ts`
3. Keep the adapter **pure** — no chain writes, no RPC calls, no network I/O. It must be a deterministic calculation only.
4. Add tests in `src/adapters/<chain-name>/index.test.ts`
5. Update `src/adapters/README.md` to list the new adapter

See `src/adapters/solana/` for a reference implementation.

---

## Pull request checklist

Before submitting a PR, confirm:

- [ ] `npm test` passes with no failures
- [ ] `npm run typecheck` passes with no errors
- [ ] New code includes appropriate tests
- [ ] `CHANGELOG.md` is updated under `[Unreleased]`
- [ ] Documentation is updated if the change affects public API or architecture
- [ ] Commit messages are clear and describe *why* the change was made

CI (`.github/workflows/ci.yml`) re-runs `npm run typecheck` and `npm test` on every pull request and on pushes to `main`, so the first two boxes are verified automatically — but run them locally first rather than using CI as the feedback loop. `npm run lint` and `npm run format:check` are not yet gated: both fail on pre-existing issues across the codebase, and fixing that is its own change.
