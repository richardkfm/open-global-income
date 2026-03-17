# Adapters

This directory will contain chain-specific and currency-specific adapters.

Adapters translate the core `GlobalIncomeEntitlement` (expressed in the neutral base unit PPP-USD/month) into concrete token or currency amounts for specific platforms.

## Planned adapters

- **Solana** (Phase 5) — maps entitlement to a configurable SPL token amount
- **Ethereum / L2s** — same pattern, different chain

## Design principle

Adapters depend on `src/core/types.ts` but never the reverse. The core rules engine has zero knowledge of any blockchain or specific currency.
