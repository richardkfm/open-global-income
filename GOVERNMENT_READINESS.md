# Government Readiness Review

**What can Open Global Income (OGI) do for a government running a large-scale
basic income experiment — and what can't it do yet?**

This document is written from the perspective of a government program team
tasked with designing, funding, launching, paying, and evaluating a
large-scale basic income (UBI) pilot. It maps each stage of that real-world
workflow to what OGI delivers today (v0.1.29, 603 tests / 32 suites), and
states plainly where the platform is **ready**, **partially ready**, or **not
yet able to deliver**.

The headline: **OGI is excellent at everything up to the moment you pay a real
person.** The planning, funding, impact, and accountability layers are real and
strong. The operational "last mile" — live payments, identity verification, and
research-grade experimental measurement — is where the gaps are.

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
| 7 | **Enroll & verify people** | Recipient registry + cross-program dedup (built); `IdentityProvider` interface only; no admin UI | ⚠️ Half there |
| 8 | **Actually pay people** | Solana/EVM produce real *unsigned* txns; **M-Pesa & SEPA are stubs** | ❌ Biggest blocker for a live pilot |
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

### 1. No live payment rail for the obvious use case — the #1 blocker
For a Kenyan pilot the natural channel is **M-Pesa**, which is a **pure stub**
(`src/disbursements/providers/mpesa.ts`): it validates config, logs intent, and
returns `{ mock: true }` — it never calls Safaricom. **SEPA**
(`src/disbursements/providers/sepa.ts`) is likewise a stub that never calls
Wise. Only **Solana** and **EVM** produce real transactions, and only as
**unsigned** payloads — the government must run its own multisig signing and RPC
infrastructure to actually move funds. **Net: you cannot pay real recipients
through mobile money or bank transfer as shipped.**

### 2. Identity & enrollment: the data model is built, the verifier is not
Recipients are real and tested (`src/db/recipients-db.ts`,
`src/api/routes/recipients.ts`): enrollment, SHA-256 account-hash deduplication
across programs, and pending → verified → suspended transitions. The platform
deliberately stores only *verified claims* and a non-reversible routing
reference — never raw identity data, which is good design. **But there is no
concrete `IdentityProvider`** (the interface at `src/core/types.ts:706` has zero
implementations) and **no admin UI** to import, search, verify, or export the
recipient roster. Onboarding thousands of real people requires building the
verifier integration (national ID / civil registry / biometrics) yourself.

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

Sized roughly to help prioritize. The first three are the difference between a
**modeling platform** and a **program you can trust with real money**.

| Priority | Gap | Why it matters | Rough size |
|----------|-----|----------------|-----------|
| 🔴 P0 | **Live M-Pesa (and a real bank/SEPA) integration** | Without it, you cannot pay recipients through the channels they actually use | M (per provider): API creds + B2C calls + callback handling + compliance. The stub already documents the full interface. |
| 🔴 P0 | **A concrete `IdentityProvider` + recipient admin UI / bulk import** | Without it, you cannot enroll and verify recipients at scale | M–L: one verifier integration (e.g. national ID) + import/search/verify screens |
| 🔴 P0 | **RCT rigor in the Evidence layer** | A government experiment must withstand academic scrutiny | L: randomized assignment, significance tests, confidence intervals, power analysis, survey delivery |
| 🟡 P1 | **PPP-vs-nominal correction for `% of GDP`** | The headline cost figure is currently distorted for low-income countries | M: add PPP-GDP/market-FX data field, apply across funding + simulation + impact, add regression tests |
| 🟡 P1 | **Uncertainty ranges** on funding + impact (low/central/high) | Statisticians require sensitivity analysis, not point estimates | M: thread ranges through `funding.ts` / `impact.ts` and surface inline |
| 🟡 P1 | **Live / automated data refresh** | Stale 2019–2023 data undermines credibility; `taxBreakdown` is empty | M: wire the World Bank importer (`npm run data:update`) into the refresh button with provenance/versioning |
| 🟢 P2 | **RBAC enforcement + user-management UI** | Institutional deployment needs least-privilege access | S–M: enforce `role` in the route guard + add user CRUD screens |
| 🟢 P2 | **Multi-region pilot orchestration** | A national rollout spans many regions; today each pilot links one simulation | M: roll-up across region-level pilots |
| 🟢 P2 | **Automated budget-variance alerts** | Ops teams need to know when a pilot runs over budget | S: threshold alert on the existing actual-vs-projected variance |
| ⚪ Future | **Federation** — cross-program interop, cross-border portability, open evidence base | The long-term protocol vision | XL |

Size key: S ≈ days · M ≈ 1–2 weeks · L ≈ multi-week · XL ≈ multi-month/program.

---

## Bottom line for a government

- **Use OGI today for:** site selection, cost modeling, funding design, impact
  projection, and a defensible, citation-backed brief to win buy-in — plus
  pilot tracking, recipient deduplication, and audit-grade reporting.
- **Do not yet rely on OGI for:** moving real money through mobile money or
  bank transfer, verifying recipient identity, or producing research-grade
  experimental evidence — these require the P0 roadmap work above.
- **Interpret the cost-as-%-of-GDP headline with care** for low-income
  countries until the PPP/nominal correction lands.
