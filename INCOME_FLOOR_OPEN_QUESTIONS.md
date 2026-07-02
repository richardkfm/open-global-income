# Open Questions: Is a Single Global Income Floor the Right Model?

**Status:** Unresolved design discussion. Nothing in this document has been implemented.
**Purpose:** Capture a conversation that raised real, unaddressed gaps in the current
entitlement model, so a future session (human or model) can pick it up with full context
instead of re-deriving it.

---

## 1. The current design

The platform's entitlement amount is a single global constant:

```
GLOBAL_INCOME_FLOOR_PPP = 210   // src/core/constants.ts
```

Derived from the World Bank upper-middle-income poverty line ($6.85/day, 2017 PPP):
`$6.85 × 365 ÷ 12 ≈ $208.35`, rounded to $210.

- It is **PPP-adjusted**: converted to local currency via each country's World Bank PPP
  conversion factor (`PA.NUS.PPP`), not the market exchange rate.
- It is **the same number everywhere** — Afghanistan, Kenya, Germany, Australia all use $210/month
  as the entitlement amount. What varies by country is the *need score* (`src/core/rules.ts`) —
  how large that floor is relative to what people actually earn (GNI) and how unequal the country
  is (Gini) — not the amount itself.
- Poverty *measurement* (a separate concern from the entitlement amount) already uses a
  **country-appropriate tiered ladder** by income group (HIC: 60%-of-median; UMC: $6.85/day;
  LMC: $3.65/day; LIC: $2.15/day) — see `/methodology#poverty-lines` and
  `src/web/views/methodology.ts`. So the platform already accepts, for measuring poverty, that
  "one global line produces nonsense" (the page's own words). It has not yet applied that
  same acceptance to the *entitlement amount itself*.
- Sub-national cost-of-living adjustment already exists as a *pattern*: `src/core/regions.ts`
  scales a local floor by a region's `costOfLivingIndex` relative to its country's national
  average (Nairobi 1.35× vs. rural Turkana 0.68×, Kenya's 47 counties). This pattern is not
  currently applied at the national level — every country's *national* floor is the same $210.
- The calculator already supports an ad hoc override (`floorOverride` / transfer-amount param)
  for anyone who wants to model a different amount for a specific scenario. There is no
  *suggested* country-appropriate default — the $210 global figure is what's shown unless a user
  manually overrides it.

## 2. What prompted this discussion

A user reviewing the Afghanistan country fact sheet asked why the funding section showed the
program covering only ~6-7% of its cost from domestic mechanisms (a prior fix — see §4 —
already addressed *that* specific number being misleading). That led to a broader question:
**is $210/month even the right amount to be calculating funding for in Afghanistan, or anywhere?**

Four distinct critiques emerged, summarized below with the counter-considerations raised in the
same conversation.

## 3. The four critiques

### 3.1 — $210 is trivial in the West, plausibly a multi-person household income in the poorest countries

$210/month (PPP) is a small donation by Western cost-of-living standards, and in a country like
Afghanistan may functionally support more than one person if pooled. This is the headline
complaint: **one global number cannot be "enough" and "adequate" in both places at once**, and
it currently doesn't claim to be — it's a comparability anchor, not an adequacy target. That's a
legitimate design choice, but it means the platform has no answer today to "what would actually
be enough to live on in this country," which is a different, and arguably more important,
question than the one it currently answers.

### 3.2 — PPP does not equalize purchasing power item-by-item

Initial framing in this conversation ("$210 PPP buys the same basket of goods everywhere") was
**imprecise and was corrected mid-discussion**. What's actually true:

- The World Bank's PPP conversion factor comes from the International Comparison Program (ICP),
  which surveys ~1,000+ goods/services weighted by their share of a country's total
  consumption/GDP, and computes a factor that equalizes purchasing power **in aggregate** over
  that whole basket.
- It is **not** a per-good equivalence. Locally-produced, labor-intensive, non-traded goods
  (bread from a local bakery, a haircut, local transport, informal-sector services) are cheap in
  poor countries because local wages are low (the Balassa-Samuelson effect), while
  internationally-traded goods (imported grain, fuel, electronics, and largely the inputs to a
  McDonald's Big Mac) price closer to a global level everywhere. The Big Mac Index is well known
  specifically because it demonstrates this divergence from PPP-implied rates.
- **Consequence:** a UBI recipient spends disproportionately on non-tradables (food, rent,
  local labor/services) — the same category of goods where PPP-implied purchasing power is
  *understated* in poor countries and *overstated* in rich ones relative to a market basket.
  This means the real purchasing power of $210-PPP in Afghanistan is probably **higher** than the
  headline PPP figure alone suggests — which reinforces critique 3.1 rather than contradicting it.
- This nuance is **not currently documented anywhere on the site**. `/methodology#floor`
  (`src/web/views/methodology.ts`) still describes PPP as if it were basket-uniform. That's a
  factual gap independent of any redesign decision — it should be fixed regardless of what else
  happens with this document.

### 3.3 — No household economies of scale

The model pays every individual $210/month with no adjustment for household size. Poverty
measurement literature (e.g. the OECD-modified equivalence scale: 1.0 for the first adult, 0.5
for each additional adult, 0.3 per child) treats a household of 5 as needing roughly 2.1× a
single person's cost, not 5×, because rent, cooking fuel, appliances, etc. are shared.
Countries with large average household sizes (Afghanistan averages 7-8 people) see per-person
UBI payments pooled at the household level go further per person than the raw figure implies.
This compounds with 3.2 in the same direction — real purchasing power in poor,
large-household countries is understated at least twice over by the current model.

### 3.4 — Should the entitlement amount be locally calibrated instead of global?

The proposal: replace (or supplement) the single global $210 floor with a per-country
**living-cost line**, using the same "adjusted Country" scaling pattern that `regions.ts`
already applies sub-nationally, sourced from each country's own national poverty line data
(already present for the poverty-measurement ladder) and ideally household-size data.

**The counter-consideration, also raised in the discussion:** the entire premise of this
platform (per `CLAUDE.md`'s mission statement) is being a *shared, auditable protocol* — "the
same code that renders these pages powers budget simulation... for real pilots," explicitly
positioned as the OpenStreetMap/SMTP-equivalent for basic income. If the entitlement amount
varies per country using country-specific logic, the platform loses the one property that makes
it a *protocol* rather than 190 bespoke national calculators: a single auditable formula that
lets a Kenyan pilot and a German pilot be described, compared, and federated on equal terms.

**A synthesis floated but not agreed on:** dual-track it. Keep $210 PPP as the global
comparability anchor (used for cross-country need-scoring, federation-level accounting, and the
headline "how does this compare across countries" figures) — but *also* surface, alongside it, a
locally-calibrated "what would be adequate here" figure per country, sourced from the national
poverty line (or a household-size-adjusted version of it) that already exists in the poverty
ladder. This has not been scoped, costed, or agreed — it's one idea among possibly several.

## 4. Related, already-resolved issue (context, not open)

A prior fix in this same session addressed a related but distinct problem: the country fact
sheet's "Where could the money come from?" section previously showed a fixed illustrative
7-mechanism funding package at the same rates for every country, which produced numbers that
looked arbitrary (Australia >200% coverage, Afghanistan ~2% from one token mechanism).
`calculateRecommendedFundingMix` (`src/core/funding.ts`) now sizes each mechanism's rate to the
country's own economic profile and caps each at a realistic rate, and a callout explains when
domestic mechanisms alone cannot close the gap (because, for the poorest countries, the $210
floor's total program cost can exceed the country's own GDP — Afghanistan's is ~133% of its PPP
GDP). **This did not address whether $210 is the right amount** — it only made the funding
math for *whatever* amount is used more honest. This document is about the amount itself.

## 5. The fourth thread: who pays when a country can't fund it domestically?

Point 4 of the original conversation, and arguably the most consequential: **for a genuinely
global basic income, some countries structurally cannot fund it from domestic taxation alone,
no matter how the mix is optimized** — Afghanistan's ~133%-of-GDP cost is the concrete example
already surfaced by `calculateRecommendedFundingMix`. A truly global program requires
cross-border transfers from richer to poorer participants. This is not hypothetical — it's an
existing, working model:

- **EU Cohesion Policy / Structural Funds** — richer member states fund poorer ones through a
  shared institutional framework, with audit/reporting requirements as the price of
  participation.
- **IMF Poverty Reduction and Growth Trust**, **Green Climate Fund**, historically the
  **Marshall Plan** — similar pooled-transfer structures at different scales.

**Why this matters for OGI specifically:** the platform's own audit-trail and non-custodial
disbursement infrastructure (Phase 12-13, Phase 21 audit exports) is exactly the kind of
accountability mechanism that makes donor countries willing to participate in something like
this — it's the actual argument for *why* a donor nation would fund it as more than aid (the
"stops migration, builds stability" case the user raised is a real policy argument used for EU
cohesion transfers and is not currently modeled or even mentioned anywhere in OGI).

**Concrete idea floated (not scoped):** add an eighth, explicit funding mechanism —
"international solidarity transfer" or similar — sized by the country's estimated share of a
pooled global/regional fund (e.g. proportional to relative GNI, mirroring how EU member
contributions are calculated), so a country's fact sheet could show *"domestic mechanisms
realistically close X%; the remaining gap is what a pooled international transfer, sized the way
the EU sizes cohesion contributions, would need to cover"* — instead of the current unlabeled
gap figure. This would also connect directly to the roadmap's **Federation** layer (`ROADMAP.md`
/ `CLAUDE.md` mission doc), which already envisions "multiple independent programs... sharing a
common entitlement standard" — international transfer sizing is a natural extension of that,
not a new concern.

## 6. Summary of concrete gaps (for the next session to triage)

| # | Gap | Type | Effort guess |
|---|-----|------|---------------|
| A | `/methodology#floor` overstates PPP as a per-good equivalence; should explain it's an aggregate-basket equivalence and that non-tradable-heavy spending means real purchasing power is understated in poor countries / overstated in rich ones | Documentation fix | Small |
| B | No household-size/equivalence-scale adjustment anywhere in the cost or entitlement model | Model gap | Medium — needs household-size data source (not yet in `CountryStats`) and a decision on whether it changes the *paid* amount or just a *reported* adequacy figure |
| C | No locally-calibrated "adequacy" figure to show alongside the global $210 floor | Model + UI gap | Medium-Large — depends on whether it's presentational (derive from existing poverty-line data) or requires new data sourcing |
| D | No explicit international-transfer / global-solidarity funding mechanism; the funding mix stops at "domestic mechanisms have a gap" with no modeled answer for who closes it | New funding mechanism | Medium — the `MixMechanismConfig` pattern in `src/core/funding.ts` already generalizes to an 8th mechanism; the hard part is choosing/justifying an allocation formula (relative GNI? population? existing ODA flows?) and whether it's counted per-recipient-country or modeled as a separate donor-side view |
| E | Should the entitlement *amount itself* ever vary by country, or only stay a comparability anchor with a locally-calibrated figure shown alongside it? | Fundamental design decision | Unscoped — needs a decision before B/C/D can be finalized, since it changes what "the number" on a fact sheet means |

## 7. Explicitly not decided

- Whether $210 stays as the sole entitlement amount, becomes one of two displayed numbers, or is
  replaced outright by a per-country figure.
- Whether household-size adjustment changes the *actual transfer amount* (e.g. per-adult-equivalent
  payment) or is only used to *report* effective per-person purchasing power alongside an
  unchanged per-person payment.
- What data source would back a household-size adjustment (World Bank / UN household size
  indicators are not currently in `src/data/countries.json`).
- What formula would size an international-transfer mechanism, and whether it belongs in the
  existing `calculateFundingScenario`/`calculateRecommendedFundingMix` output (recipient-country
  view) or needs a new donor-side model entirely.
- Whether any of this is in scope for the current protocol-layer stack (Calculation/Simulation)
  or belongs to the future Federation layer.

## 8. Suggested next steps (for discussion, not commitments)

1. Fix the PPP-basket documentation gap (§3.2 / row A) regardless of any other decision — it's a
   factual accuracy issue, not a design question.
2. Decide on §5's fundamental question first (row E) — it constrains every other row.
3. Prototype a locally-calibrated "adequacy" figure (row C) as a read-only, presentational
   addition before touching the actual entitlement formula, since it's reversible and doesn't
   risk breaking the protocol's comparability guarantee.
4. Scope the international-transfer mechanism (row D) as a separate design conversation — it has
   its own hard question (whose share pays what) independent of rows B/C.
