# Government Readiness Review

**What can Open Global Income (OGI) do for a government running a large-scale
basic income experiment — and what can't it do yet?**

This document is written from the perspective of a government program team
tasked with designing, funding, launching, paying, and evaluating a
large-scale basic income (UBI) pilot. It maps each stage of that real-world
workflow to what OGI delivers today (v0.1.33, 671 tests / 37 suites), and
states plainly where the platform is **ready**, **partially ready**, or **not
yet able to deliver**.

The headline: **OGI takes you right up to execution on every rail, but it never
moves the money itself.** The planning, funding, impact, and accountability
layers are real and strong, and all four payment rails now emit real
operator-executable instructions (unsigned crypto txns, a Daraja B2C batch, an
ISO 20022 pain.001 file). By design OGI is **non-custodial** — the operator
submits those instructions and runs the verifier. The remaining "last mile"
gaps are operator-side execution (and optional server-side auto-submission),
authoritative KYC, and research-grade experimental measurement.

---

## Capability map by workflow stage

| # | Stage (what a government actually does) | OGI support | Verdict |
|---|------------------------------------------|-------------|---------|
| 1 | **Feasibility** — where, and how much per person? | Data + Calculation: 49 countries, regional cost-of-living (`/v1/income/calc`, `/v1/income/calc/regional`) | ✅ Ready |
| 2 | **Budget projection** — what will it cost? | Simulation: coverage %, targeting, duration; single, multi-country compare, regional | ✅ Ready *(see %-of-GDP caveat)* |
| 3 | **Funding** — how do we pay for it? | 7 mechanism calculators + fiscal-context analysis | ⚠️ Works; assumptions optimistic, no uncertainty ranges |
| 4 | **Impact** — what will it achieve? | 4-dimension model + policy brief with citations | ⚠️ Transparent, but deterministic point estimates only |
| 5 | **Buy-in** — convince treasury / ministers / donors | Print-ready Program Briefs stitching sim + funding + impact | ✅ Ready |
| 6 | **Stand up the pilot** | Pilot lifecycle, targeting rules, actual-vs-projected variance | ⚠️ Single sim per pilot; no multi-region roll-up |
| 7 | **Enroll & verify people** | Recipient registry + cross-program dedup; four non-custodial `IdentityProvider` connectors (national-ID, mobile-KYC, wallet, community) + admin enrollment/verify UI + bulk CSV import | ⚠️ Built; authoritative KYC delegated to the operator's verifier |
| 8 | **Actually pay people** | Solana/EVM produce real *unsigned* txns; M-Pesa emits a Daraja **B2C** instruction batch and SEPA an **ISO 20022 pain.001** (+ Wise skeleton) — all operator-executable | ⚠️ Non-custodial: OGI prepares; the operator signs/submits (no server-side auto-submission) |
| 9 | **Measure outcomes / run as an RCT** | Evidence layer: record, compare, aggregate, export (all built) | ⚠️ No randomization, significance testing, or survey delivery |
| 10 | **Audit & accountability** | Signed (SHA-256) per-pilot audit exports; full disbursement log; HMAC webhooks | ✅ Ready |
| 11 | **Operate as an institution** | DB-persisted admin sessions + login | ⚠️ RBAC not enforced; no user-management UI |

Legend: ✅ ready to use · ⚠️ partially there / use with caveats · ❌ not deliverable as shipped.

---

## What OGI does well (and can deliver today)

- **Pre-commitment modeling is the strongest part of the platform.** A
  non-technical policy analyst can, entirely through the admin UI, pick a
  country and region, set coverage + targeting + duration, see recipient counts
  and cost (annual, local currency + PPP, % of GDP), compare 2–5 candidate pilot
  sites side by side, design a funding mix, project four impact dimensions, and
  print a stakeholder-ready brief. This is real and working.
- **Transparency is a genuine differentiator.** Every computed headline number
  carries an inline citation and a "how this is calculated" drawer; impact
  briefs enumerate every assumption and caveat. This is exactly what survives
  treasury and audit scrutiny.
- **Regional precision** via the "adjusted Country" pattern is well-designed:
  a floor in Nairobi (cost-of-living 1.35×) is correctly distinguished from
  rural Turkana (0.68×). Rich sub-national data exists for Kenya (47 counties),
  Germany, France, and the Netherlands.
- **Accountability spine is solid.** Recipients are deduplicated across programs
  (so the same person isn't paid twice), every disbursement state change is
  logged, and per-pilot audit exports are integrity-hashed.

---

## Where it cannot yet deliver for a *real* large-scale experiment

### 1. Payment rails are non-custodial — OGI prepares, the operator executes
All four rails now emit real, operator-executable payment instructions, but OGI
never moves the money itself. For a Kenyan pilot the natural channel is
**M-Pesa**: the provider (`src/disbursements/providers/mpesa.ts`) emits a
Safaricom Daraja **B2C PaymentRequest** instruction batch (env-correct
endpoints + a populated request template; secrets never echoed) that the
operator submits from their own authenticated environment. **SEPA**
(`src/disbursements/providers/sepa.ts`) emits a standards-compliant **ISO 20022
pain.001** document plus a Wise Payouts bulk skeleton. **Solana** and **EVM**
produce real but **unsigned** transactions — the government runs its own
multisig signing and RPC infrastructure to broadcast them. **Net: you can pay
real recipients through every rail today, but your operator must run the
execution step (sign / submit) — OGI stores no recipient PII and does not
custody funds or auto-submit.** A future opt-in mode could submit Daraja / Wise
server-side, but that is deliberately outside the default non-custodial flow.

### 2. Identity & enrollment: connectors are built; authoritative KYC is delegated
Recipients are real and tested (`src/db/recipients-db.ts`,
`src/api/routes/recipients.ts`): enrollment, SHA-256 account-hash deduplication
across programs, and pending → verified → suspended transitions. The platform
deliberately stores only *verified claims* and a non-reversible routing
reference — never raw identity data, which is good design. The
`IdentityProvider` interface now ships with **four concrete non-custodial
connectors** (`src/identity/`): national-ID (MOSIP-compatible, Verhoeff check
digit), mobile-KYC (E.164 MSISDN), wallet (EVM / Solana), and
community-attestation. `POST /v1/recipients/:id/verify` runs a claim through a
provider and stores only the derived hash + routing ref, and the admin Identity
page (`/admin/identity`) supports enrollment, per-recipient verify, bulk CSV
import, and filtered export. **What's still delegated:** each connector does
deterministic offline format/checksum validation only — the *authoritative*
KYC / personhood assertion (national-ID registry lookup, MNO KYC, on-chain
proof) is performed by the external provider the operator integrates, not by
OGI.

### 3. The evidence layer records, but it doesn't run an experiment
Phase 23 shipped a real framework: record recipient/control cohort measurements,
compute deltas, compare projected-vs-actual, aggregate anonymized results across
programs, and export CSV/JSON. **What's missing for a research-grade RCT:**
- randomized treatment assignment / control-group management,
- statistical significance testing and confidence intervals,
- power analysis (what sample size do you need?),
- survey instrument delivery (data is fed in via API from external systems).

### 4. No statistical uncertainty anywhere
Funding revenue and impact figures are deterministic point estimates. A
government statistician will immediately ask for ranges and sensitivity
analysis. Instead, the models bake in fixed proxies — and some are optimistic,
notably the wealth-tax collection factor (0.55 for high-income countries, vs.
the 0.30–0.40 that European repeals suggest) and the speculative automation tax.

---

## Bugs & limitations to be aware of (they affect the numbers you'd quote)

1. **PPP-USD is treated as nominal USD throughout — this distorts every
   "% of GDP" figure for poorer countries.** The simulation computes cost as a
   share of GDP by dividing a PPP-dollar cost by a *nominal*-USD GDP
   (`src/core/simulations.ts:42-44`), and the funding module uses the same
   convention everywhere (`gdpTotal = gdpPerCapitaUsd × population`, revenue in
   USD then `× pppConversionFactor`). Because the two layers share the
   convention, they are *consistent with each other* — but both **inflate the
   cost-as-%-of-GDP headline for low-income countries** by roughly the PPP gap
   (often ~2–3× for a country like Kenya, where $210 PPP buys far more than $210
   nominal). This is the single most important number a treasury would quote, so
   it matters. **It is not a one-line bug** — a correct fix requires adding a
   PPP-GDP (or market-FX) field to the data and applying it consistently across
   funding, simulation, and impact. Tracked in the roadmap below.

2. **Targeting filters don't change the simulated cost.** Advanced filters (age,
   income ceiling, region) are applied only "at disbursement time" and do not
   affect the simulated recipient count. The Simulate view already notes this
   (`src/admin/views/simulate.ts:140`), so it isn't misleading — but read the
   cost as an *untargeted upper bound*.

3. **Admin RBAC is declared but not enforced.** Sessions are correctly persisted
   to the database (`admin_sessions`), but the route guard only checks "is there
   a valid session" — it never checks the `role` (admin/editor/viewer) column,
   which is only displayed in the layout. Every authenticated user therefore has
   full access, and there is no user-management UI (bootstrap is via env vars).

4. **The admin "Refresh data" button is a stub** — it updates a timestamp but
   performs no provider fetch. Country data is manually seeded (2022–2023;
   `taxBreakdown` is null for all countries) and Kenya's county data is from
   2019.

5. **Disbursement → pilot linking is a raw ID text field** with no validation or
   picker (`src/admin/views/pilots.ts`), making mis-linking easy.

---

## Roadmap — closing the gaps before a real experiment

Sized roughly to help prioritize. RCT rigor is now the main difference between a
**modeling platform** and a **program you can trust with real money** — the
non-custodial payment rails and the identity connectors that used to head this
list have since shipped.

| Priority | Gap | Why it matters | Rough size |
|----------|-----|----------------|-----------|
| 🔴 P0 | **RCT rigor in the Evidence layer** | A government experiment must withstand academic scrutiny | L: randomized assignment, significance tests, confidence intervals, power analysis, survey delivery |
| 🟡 P1 | **An authoritative verifier integration** (national-ID registry / MNO KYC) behind the existing `IdentityProvider` connectors | The connectors do offline format/checksum validation only; real enrollment needs an authoritative KYC source | M: wire one external verifier (e.g. MOSIP IDA) into the national-ID connector |
| 🟡 P1 | **PPP-vs-nominal correction for `% of GDP`** | The headline cost figure is currently distorted for low-income countries | M: add PPP-GDP/market-FX data field, apply across funding + simulation + impact, add regression tests |
| 🟡 P1 | **Uncertainty ranges** on funding + impact (low/central/high) | Statisticians require sensitivity analysis, not point estimates | M: thread ranges through `funding.ts` / `impact.ts` and surface inline |
| 🟡 P1 | **Live / automated data refresh** | Stale 2019–2023 data undermines credibility; `taxBreakdown` is empty | M: wire the World Bank importer (`npm run data:update`) into the refresh button with provenance/versioning |
| 🟢 P2 | **RBAC enforcement + user-management UI** | Institutional deployment needs least-privilege access | S–M: enforce `role` in the route guard + add user CRUD screens |
| 🟢 P2 | **Multi-region pilot orchestration** | A national rollout spans many regions; today each pilot links one simulation | M: roll-up across region-level pilots |
| 🟢 P2 | **Automated budget-variance alerts** | Ops teams need to know when a pilot runs over budget | S: threshold alert on the existing actual-vs-projected variance |
| ⚪ Optional | **Server-side auto-submission** of the Daraja B2C / Wise instructions | Removes the operator's manual submit step — deliberately outside the default non-custodial flow | M (per provider): API creds + secure secret handling + callback handling + compliance approvals |
| ⚪ Future | **Federation** — cross-program interop, cross-border portability, open evidence base | The long-term protocol vision | XL |

Size key: S ≈ days · M ≈ 1–2 weeks · L ≈ multi-week · XL ≈ multi-month/program.

---

## Bottom line for a government

- **Use OGI today for:** site selection, cost modeling, funding design, impact
  projection, and a defensible, citation-backed brief to win buy-in — plus
  pilot tracking, recipient enrollment + deduplication, audit-grade reporting,
  and preparing operator-executable payment instructions on every rail (M-Pesa
  Daraja B2C, SEPA ISO 20022, unsigned Solana / EVM txns).
- **Understand the boundary:** OGI is **non-custodial** — your operator runs the
  execution step (signs / submits the prepared instructions) and supplies the
  *authoritative* KYC verifier behind the identity connectors. OGI does not move
  funds, store recipient PII, or auto-submit.
- **Do not yet rely on OGI for:** producing research-grade experimental evidence
  (no randomization / significance testing / survey delivery) — this requires the
  P0 roadmap work above.
- **Interpret the cost-as-%-of-GDP headline with care** for low-income
  countries until the PPP/nominal correction lands.
