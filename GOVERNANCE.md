# Governance

This document describes the governance model for the Open Global Income (OGI) project.

## Project Structure

### Maintainers

Maintainers have write access to the repository and are responsible for:
- Reviewing and merging pull requests
- Managing releases and versioning
- Ensuring code quality and test coverage
- Making architectural decisions

### Contributors

Anyone can contribute to the project by:
- Reporting issues
- Submitting pull requests
- Improving documentation
- Adding country data or data sources
- Proposing new rulesets

## Decision-Making Process

### Ruleset Changes

Changes to the entitlement calculation formula (rulesets) require:
1. A written proposal with rationale, formula specification, and worked examples
2. Review by at least one maintainer
3. A deprecation period for the previous ruleset (both versions available via API)
4. Backward-compatible API — old ruleset versions remain queryable indefinitely

### Data Source Changes

Adding or modifying data sources (World Bank, IMF, UNDP) requires:
1. Documentation of the data source, indicators used, and update frequency
2. Validation rules to ensure data quality
3. A migration path that doesn't break existing API consumers

### API Changes

- **Non-breaking changes** (new endpoints, new optional fields) can be merged with standard review
- **Breaking changes** require a new API version prefix (e.g., `/v2/`)
- The current API version (`/v1/`) will remain stable and supported

## Versioning

The project follows [Semantic Versioning](https://semver.org/):
- **Patch** (0.0.x): Bug fixes, data updates, documentation
- **Minor** (0.x.0): New features, new endpoints, new rulesets
- **Major** (x.0.0): Breaking API changes

## API Stability Declaration

As of v0.1.0, the following API contracts are considered stable:

### Stable Endpoints
- `GET /health`
- `GET /v1/income/calc?country=XX`
- `POST /v1/income/batch`
- `GET /v1/income/countries`
- `GET /v1/income/countries/:code`
- `GET /v1/income/rulesets`
- `GET /v1/income/rulesets/:version`
- `POST /v1/users`
- `GET /v1/users/:id/income`

### Stable Response Format
All endpoints return:
```json
{ "ok": true, "data": { ... } }
```
or
```json
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

### Stable Error Codes
- `MISSING_PARAMETER` (400)
- `VALIDATION_ERROR` (400)
- `BATCH_TOO_LARGE` (400)
- `INVALID_API_KEY` (401)
- `API_KEY_REQUIRED` (401)
- `COUNTRY_NOT_FOUND` (404)
- `USER_NOT_FOUND` (404)
- `NOT_FOUND` (404)
- `RATE_LIMIT_EXCEEDED` (429)
- `INTERNAL_ERROR` (500)

## Data Sources

### Current
- **World Bank** — 18 indicators: GDP and GNI per capita, GDP per capita PPP, PPP conversion factor, Gini, population, tax revenue, social-protection spending, inflation, labour force, unemployment, government debt, social contributions, poverty headcount, GDP growth, health and education expenditure, urbanization
- **ILO** — 4 social-protection indicators: overall coverage, expenditure (ILO basis), pension coverage, child-benefit coverage

### Wired but not yet populated
- **IMF** — the importer (`src/data/imf/`) and the `stats.taxBreakdown` field exist; no country carries a value yet

### Planned
- **UNDP** — Human Development Index (HDI), required before Ruleset v2 can move from published specification to implementation
- **UN DESA** — average household size, for the household-size reporting phase

## Security

- Security vulnerabilities should be reported privately to maintainers
- API keys are stored as SHA-256 hashes (never in plaintext)
- Rate limiting is enforced per-IP and per-API-key tier
- Admin UI is feature-flagged and requires authentication
