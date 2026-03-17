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

Please read and follow the [Code of Conduct](./CODE_OF_CONDUCT.md) before participating.

---

## Development setup

**Prerequisites:**
- Node.js 20+
- npm 10+

```bash
# 1. Clone the repo
git clone https://github.com/alcoolio/open-global-income.git
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
├── core/       Pure domain logic — no I/O, no side effects
├── data/       World Bank dataset and loader
├── api/        Fastify HTTP server and routes
└── adapters/   Optional chain/currency adapters
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

Formatting is not currently enforced by a linter, but please follow the style of surrounding code.

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
    "gniPerCapitaUsd": 0,
    "pppConversionFactor": 1.0,
    "giniIndex": null,
    "population": 0,
    "incomeGroup": "LIC"
  }
}
```

**Data sources:** Use World Bank Open Data indicators listed in `src/data/worldbank/README.md`. Prefer the most recent available year (typically the year before the current `dataVersion`).

When you refresh the dataset:
1. Update all countries with the latest available data.
2. Bump `dataVersion` in `src/data/loader.ts` (e.g. `"worldbank-2024"`).
3. Re-run tests — snapshot values in `rules.test.ts` may need updating if real countries changed.
4. Document the refresh in `CHANGELOG.md`.

---

## Proposing a new ruleset version

The formula in `src/core/rules.ts` implements **Ruleset v1**. If you want to change the formula:

1. **Open an issue first** — describe the motivation, the proposed formula changes, and any data requirements.
2. After discussion and approval, implement the new ruleset in a new file, e.g. `src/core/rules-v2.ts`.
3. **Do not modify** `src/core/rules.ts` or change `RULESET_VERSION` to something that would silently alter existing results.
4. The new ruleset should be opt-in until it is ready to replace v1.
5. Document the new ruleset in a `RULESET_V2.md` file with the same structure as [RULESET_V1.md](./RULESET_V1.md).
6. Update the API to expose the new ruleset alongside the old one.

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
