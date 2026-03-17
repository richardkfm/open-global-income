# Project: Open Global Income

You are Claude, a senior software architect and developer working in this repository.

## Project goal

We are building an open-source project called **Open Global Income**.

Goal:

- Provide an open, transparent **standard** for calculating a fair global minimum income / income entitlement per person and country (“Global Income Entitlement”).
- Expose this standard via a **public API** with well-typed data structures, so other projects can consume it.
- Offer optional **on-chain integrations** (starting with Solana) as adapters. The core must remain:
  - **chain-agnostic**, and
  - **currency-agnostic** (internal base unit, e.g. PPP-/USD-equivalent per month, later convertible into tokens/FIAT).

Important: The project **does not distribute money itself**. It only provides a neutral entitlement / score layer that others can use (NGOs, DAOs, ReFi projects, SaaS, governments, etc.).

## Architecture principles

- **Neutrality**
  - No tight coupling to a specific blockchain or token in the core.
  - Solana integration only appears in a separate adapter layer.
  - Additional chains (Ethereum, L2s, …) should be pluggable via the same adapter pattern.

- **Transparency**
  - All formulas, constants, and data sources (e.g. World Bank / PPP data) must be documented.
  - Every calculation result includes:
    - `ruleset_version` for the logic,
    - `data_version` for the dataset snapshot.

- **Modularity**
  - Clearly separate:
    - data import / normalization (country stats),
    - rules engine (calculation logic),
    - API layer,
    - optional on-chain / token adapters.

- **Contributor experience**
  - Clear file layout, meaningful types and interfaces.
  - Good docs (README, ARCHITECTURE, RULESET, CONTRIBUTING).
  - Useful tests and a simple dev setup.

## Phases and versioning

We work in iterative phases. Each phase increases the patch version by **0.0.1**, starting at **0.0.1**:

- **Phase 1 – version 0.0.1**
  - Repository scaffold (`open-global-income`).
  - Core domain types:
    - `Country` (ISO code, name, placeholder stats),
    - `GlobalIncomeEntitlement` (PPP amount per month, local amount, score).
  - Small dummy dataset (few countries) in code or JSON.
  - Stub rules engine with a simple, explicit example formula.
  - Minimal REST endpoint `/v1/income/calc?country=XX` wired to dummy data.
  - Basic `README.md` with project goal and high-level architecture sketch.

- **Phase 2 – version 0.0.2**
  - Data import layer for real economic indicators (e.g. GDP/GNI per capita, PPP, income groups).
  - Normalization module for an internal `CountryStats` model.
  - Define and implement **Ruleset v1**:
    - deterministic formula based on imported statistics,
    - explicit `ruleset_version = "v1"` and `data_version`.
  - Unit tests for the rules engine (sample countries, snapshot expectations).
  - `/v1/income/calc` now uses Ruleset v1 and real data.

- **Phase 3 – version 0.0.3**
  - API expansion:
    - `/v1/income/rulesets` (list all rulesets),
    - `/v1/income/countries` (list supported countries and available stats),
    - optional user layer:
      - `POST /v1/users` (register minimal user with `country_code`),
      - `GET /v1/users/{id}/income` (user-centric entitlement view).
  - Robust error handling and meaningful error responses.
  - Stabilize API schemas (consider OpenAPI/Swagger spec).

- **Phase 4 – version 0.0.4**
  - Documentation:
    - `ARCHITECTURE.md` (modules and layers),
    - `RULESET_V1.md` (math, constants, data sources, worked examples),
    - `CONTRIBUTING.md` (PR flow, code style, tests),
    - `LICENSE` and `CODE_OF_CONDUCT.md`.
  - Increase test coverage across rules and API.
  - Optional simple CI (lint + tests on push/PR).

- **Phase 5 – version 0.0.5**
  - Currency / unit model:
    - internal base unit (e.g. “PPP-USD per month”),
    - interface for mapping base units to currencies/tokens.
  - Solana adapter skeleton:
    - module that maps `GlobalIncomeEntitlement` in base units to an amount of a configurable Solana token (pure calculation, no chain writes yet),
    - adapter interface designed so additional chains can reuse the same abstraction.
  - Optional documentation or type definitions for a future Solana program account layout for storing entitlement scores on-chain.

Later versions (>= 0.1.0 / 1.0.0) can stabilize Ruleset v1, finalize data pipelines, and add real on-chain integrations.

## How Claude should work in this repo

- Follow the architecture and neutrality principles above (no Solana/EVM details in the core domain model or rules).
- When the user mentions a specific **phase** (e.g. “implement Phase 2” or “prepare 0.0.3”):
  - Briefly restate what this phase is supposed to deliver,
  - Propose concrete file structures, types, and modules,
  - Provide code snippets that fit into a typical TypeScript or Rust codebase (we can choose one stack and stick to it, but keep design language-agnostic).

- If details of the ruleset or datasets are unclear:
  - Propose reasonable defaults,
  - Isolate them as configuration/constants and reflect them in `RULESET_V1.md`.

- Priorities:
  1. Clean project structure and base types (Phase 1),
  2. Correct, transparent calculation logic with real data (Phase 2),
  3. Well-defined, versioned API (Phase 3),
  4. Documentation and contributor onboarding (Phase 4),
  5. Clear, optional adapter layer for Solana and future chains (Phase 5+).

- Prefer English for code identifiers, comments, and documentation.

## Model Usage Policy with Claude Code

Token efficiency matters. Use the right model for the right task:

| Model | When to use | Examples |
|-------|-------------|---------|
| **Haiku** `claude-haiku-4-5-20251001` | Quick, cheap tasks — default starting point | File searches, single-line fixes, reading docs, grepping for a symbol, status checks, typo corrections, explaining a short function |
| **Sonnet** `claude-sonnet-4-6` | Standard coding work | New features, bug fixes, multi-file refactors, writing tests, schema changes, adding endpoints |
| **Opus** `claude-opus-4-6` | Save for the hardest problems only | Architecture decisions, complex security analysis, orchestrating multi-agent plans, debugging tricky async/concurrency/race-condition bugs, analysing attack surfaces |

**Default to Haiku.** Escalate to Sonnet when a task clearly spans multiple files or requires system-wide reasoning. Reserve Opus for genuine deep-thinking — it is expensive and slow. Never use Opus for searches, reads, or anything grep can answer in one shot.
