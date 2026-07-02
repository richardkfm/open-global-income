/**
 * Public web UI routes — the advocacy-facing site at "/".
 *
 * Read-only and unauthenticated: every page is derived from the versioned
 * data snapshot and the pure functions in src/core. Nothing here touches
 * the database, and every scenario is fully encoded in the URL so pages
 * are shareable and reproducible.
 */
import type { FastifyPluginAsync } from 'fastify';
import { publicLayout } from './views/layout.js';
import { renderHome, type HomeData } from './views/home.js';
import {
  renderExplore,
  type ExploreRow,
  type ExploreSortKey,
} from './views/explore.js';
import {
  renderCountryFactSheet,
  type CountryFactSheetData,
  type TargetedOption,
} from './views/country.js';
import {
  renderCalculator,
  type CalculatorData,
  type CalculatorFormState,
  type CalculatorResult,
} from './views/calculator.js';
import { renderCompare, type CompareColumn, type CompareData } from './views/compare.js';
import { renderMethodology } from './views/methodology.js';
import { renderDataPage } from './views/data.js';
import {
  getAllCountries,
  getCountryByCode,
  getDataVersion,
  getAllRegions,
  getRegionsByCountry,
} from '../data/loader.js';
import { calculateEntitlement } from '../core/rules.js';
import { calculateSimulation } from '../core/simulations.js';
import { calculateFiscalContext, calculateFundingScenario } from '../core/funding.js';
import { calculateImpactAnalysis } from '../core/impact.js';
import { resolveCountryPovertyLine } from '../core/poverty.js';
import { getCurrencyForCountry, formatLocalCurrency } from '../data/currencies.js';
import { GLOBAL_INCOME_FLOOR_PPP } from '../core/constants.js';
import { packageVersion } from '../config.js';
import type {
  Country,
  FundingMechanismInput,
  SimulationParameters,
  SimulationResult,
  TargetGroup,
} from '../core/types.js';

// ---------------------------------------------------------------------------
// Shared computation helpers
// ---------------------------------------------------------------------------

const TARGET_GROUPS: TargetGroup[] = [
  'all',
  'bottom_half',
  'bottom_third',
  'bottom_quintile',
  'bottom_decile',
];

/**
 * Illustrative default funding package shown on fact sheets: moderate rates
 * across all seven mechanisms so readers see the whole menu. Clearly labeled
 * as illustrative; the calculator lets users set every rate themselves.
 */
const DEFAULT_FUNDING_PACKAGE: FundingMechanismInput[] = [
  { type: 'income_tax_surcharge', rate: 0.05 },
  { type: 'vat_increase', points: 2 },
  { type: 'carbon_tax', dollarPerTon: 30 },
  { type: 'wealth_tax', rate: 0.01 },
  { type: 'financial_transaction_tax', rate: 0.001 },
  { type: 'automation_tax', rate: 0.02 },
  { type: 'redirect_social_spending', percent: 0.25 },
];

function simulationParams(
  countryCode: string,
  coverage: number,
  targetGroup: TargetGroup,
  durationMonths: number,
  floorOverride: number | null,
): SimulationParameters {
  return {
    country: countryCode,
    coverage,
    targetGroup,
    durationMonths,
    adjustments: { floorOverride, householdSize: null },
  };
}

function universalSimulation(country: Country, dataVersion: string): SimulationResult {
  return calculateSimulation(
    country,
    simulationParams(country.code, 1, 'all', 12, null),
    dataVersion,
  );
}

function formatMonthlyLocal(country: Country, amountLocal: number): string {
  const currency = getCurrencyForCountry(country.code);
  return currency
    ? formatLocalCurrency(amountLocal, currency.code)
    : `${Math.round(amountLocal).toLocaleString('en-US')} (local currency)`;
}

function countryOptions(): Array<{ code: string; name: string }> {
  return getAllCountries()
    .map((c) => ({ code: c.code, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function csvEscape(value: string | number | null): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row of the downloadable dataset — shared by the CSV and JSON exports. */
function datasetRow(country: Country, dataVersion: string) {
  const entitlement = calculateEntitlement(country, dataVersion);
  const universal = universalSimulation(country, dataVersion);
  const povertyLine = resolveCountryPovertyLine(country);
  const currency = getCurrencyForCountry(country.code);
  return {
    code: country.code,
    name: country.name,
    income_group: country.stats.incomeGroup,
    population: country.stats.population,
    gdp_per_capita_usd: country.stats.gdpPerCapitaUsd,
    gdp_per_capita_ppp_usd: country.stats.gdpPerCapitaPppUsd,
    gni_per_capita_usd: country.stats.gniPerCapitaUsd,
    gini_index: country.stats.giniIndex,
    poverty_line_basis: povertyLine.basis,
    poverty_line_monthly_ppp_usd: povertyLine.monthlyPppUsd,
    poverty_rate_country_line_percent: povertyLine.headcountRatioPercent,
    poverty_rate_extreme_215_percent: country.stats.povertyHeadcountRatio ?? null,
    entitlement_ppp_usd_per_month: entitlement.pppUsdPerMonth,
    entitlement_local_currency_per_month: entitlement.localCurrencyPerMonth,
    currency_code: currency?.code ?? null,
    need_score: entitlement.score,
    universal_annual_cost_ppp_usd: universal.simulation.cost.annualPppUsd,
    universal_cost_percent_gdp: universal.simulation.cost.asPercentOfGdp,
    tax_revenue_percent_gdp: country.stats.taxRevenuePercentGdp ?? null,
    social_protection_spending_percent_gdp:
      country.stats.socialProtectionExpenditureIloPercentGdp ??
      country.stats.socialProtectionSpendingPercentGdp ??
      null,
  };
}

function buildFactSheetData(country: Country, pageUrl: string): CountryFactSheetData {
  const dataVersion = getDataVersion();
  const entitlement = calculateEntitlement(country, dataVersion);
  const universal = universalSimulation(country, dataVersion);
  const fiscal = calculateFiscalContext(country, universal.simulation.cost.annualPppUsd);
  const impact = calculateImpactAnalysis(
    country,
    universal,
    {
      country: country.code,
      coverage: 1,
      targetGroup: 'all',
      durationMonths: 12,
      floorOverride: null,
      simulationId: null,
    },
    dataVersion,
  );
  const funding = calculateFundingScenario(country, universal, DEFAULT_FUNDING_PACKAGE, dataVersion);

  const targetedOptions: TargetedOption[] = (
    [
      ['Universal — every resident', 'all'],
      ['Poorest 50%', 'bottom_half'],
      ['Poorest 20%', 'bottom_quintile'],
      ['Poorest 10%', 'bottom_decile'],
    ] as Array<[string, TargetGroup]>
  ).map(([label, targetGroup]) => {
    const sim = calculateSimulation(
      country,
      simulationParams(country.code, 1, targetGroup, 12, null),
      dataVersion,
    );
    return {
      label,
      recipients: sim.simulation.recipientCount,
      annualPppUsd: sim.simulation.cost.annualPppUsd,
      percentGdp: sim.simulation.cost.asPercentOfGdp,
    };
  });

  return {
    country,
    dataVersion,
    appVersion: packageVersion,
    entitlement,
    monthlyLocalFormatted: formatMonthlyLocal(country, entitlement.localCurrencyPerMonth),
    povertyLine: resolveCountryPovertyLine(country),
    universal,
    fiscal,
    impact,
    funding,
    targetedOptions,
    regions: getRegionsByCountry(country.code),
    generatedDate: new Date().toISOString().slice(0, 10),
    pageUrl,
  };
}

function renderNotFound(code: string): string {
  const content = `
  <div class="empty-state">
    <div class="empty-state-title">No country with code "${code.replace(/[^A-Za-z0-9-]/g, '')}"</div>
    <p class="empty-state-desc">The dataset currently covers ${getAllCountries().length} countries.</p>
    <div class="empty-state-actions">
      <a href="/countries" class="btn btn-primary">Browse all countries</a>
    </div>
  </div>`;
  return publicLayout('Country not found', content, { active: 'countries' });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const webRoutes: FastifyPluginAsync = async (app) => {
  // ── Landing page ──────────────────────────────────────────────────────
  app.get('/', async (_request, reply) => {
    const countries = getAllCountries();
    let peopleInPoverty = 0;
    let totalPopulation = 0;
    for (const c of countries) {
      totalPopulation += c.stats.population;
      const line = resolveCountryPovertyLine(c);
      const rate = line.headcountRatioPercent ?? c.stats.povertyHeadcountRatio;
      if (rate != null) {
        peopleInPoverty += (rate / 100) * c.stats.population;
      }
    }
    const data: HomeData = {
      countryCount: countries.length,
      regionCount: getAllRegions().length,
      dataVersion: getDataVersion(),
      totalPopulation,
      peopleInPoverty,
      countries: countryOptions(),
    };
    return reply.type('text/html').send(renderHome(data));
  });

  // ── Quick country jump from the landing page select ──────────────────
  app.get<{ Querystring: { country?: string } }>('/go', async (request, reply) => {
    const code = (request.query.country ?? '').toUpperCase();
    const target = getCountryByCode(code) ? `/countries/${code}` : '/countries';
    return reply.redirect(target);
  });

  // ── Country explorer ──────────────────────────────────────────────────
  app.get<{ Querystring: { sort?: string; dir?: string } }>(
    '/countries',
    async (request, reply) => {
      const dataVersion = getDataVersion();
      const validSorts: ExploreSortKey[] = ['name', 'population', 'gdp', 'poverty', 'cost', 'score'];
      const sort = validSorts.includes(request.query.sort as ExploreSortKey)
        ? (request.query.sort as ExploreSortKey)
        : 'name';
      const dir = request.query.dir === 'asc' || request.query.dir === 'desc'
        ? request.query.dir
        : sort === 'name'
          ? 'asc'
          : 'desc';

      const rows: ExploreRow[] = getAllCountries().map((country) => {
        const entitlement = calculateEntitlement(country, dataVersion);
        const universal = universalSimulation(country, dataVersion);
        const povertyLine = resolveCountryPovertyLine(country);
        return {
          code: country.code,
          name: country.name,
          incomeGroup: country.stats.incomeGroup,
          population: country.stats.population,
          gdpPerCapitaPppUsd: country.stats.gdpPerCapitaPppUsd,
          povertyRatePercent:
            povertyLine.headcountRatioPercent ?? country.stats.povertyHeadcountRatio ?? null,
          povertyRateIsExtremeFallback:
            povertyLine.headcountRatioPercent == null &&
            country.stats.povertyHeadcountRatio != null,
          monthlyLocalFormatted: formatMonthlyLocal(country, entitlement.localCurrencyPerMonth),
          universalCostPercentGdp: universal.simulation.cost.asPercentOfGdp,
          score: entitlement.score,
        };
      });

      const sortValue = (r: ExploreRow): number | string => {
        switch (sort) {
          case 'name': return r.name;
          case 'population': return r.population;
          case 'gdp': return r.gdpPerCapitaPppUsd;
          case 'poverty': return r.povertyRatePercent ?? -1;
          case 'cost': return r.universalCostPercentGdp;
          case 'score': return r.score;
        }
      };
      rows.sort((a, b) => {
        const va = sortValue(a);
        const vb = sortValue(b);
        const cmp = typeof va === 'string'
          ? va.localeCompare(vb as string)
          : (va as number) - (vb as number);
        return dir === 'asc' ? cmp : -cmp;
      });

      return reply.type('text/html').send(renderExplore({ rows, sort, dir, dataVersion }));
    },
  );

  // ── Country fact sheet ────────────────────────────────────────────────
  app.get<{ Params: { code: string } }>('/countries/:code', async (request, reply) => {
    const country = getCountryByCode(request.params.code.toUpperCase());
    if (!country) {
      return reply.status(404).type('text/html').send(renderNotFound(request.params.code));
    }
    const host = (request.headers.host as string | undefined) ?? request.hostname;
    const pageUrl = `${request.protocol}://${host}/countries/${country.code}`;
    return reply.type('text/html').send(renderCountryFactSheet(buildFactSheetData(country, pageUrl)));
  });

  // ── Cost & funding calculator ────────────────────────────────────────
  app.get<{ Querystring: Record<string, string | undefined> }>(
    '/calculator',
    async (request, reply) => {
      const q = request.query;
      const dataVersion = getDataVersion();

      const targetGroup = TARGET_GROUPS.includes(q.target as TargetGroup)
        ? (q.target as TargetGroup)
        : 'all';
      const form: CalculatorFormState = {
        country: (q.country ?? '').toUpperCase(),
        coveragePercent: toNumber(q.coverage, 100, 1, 100),
        targetGroup,
        durationMonths: toNumber(q.months, 12, 1, 120),
        monthlyAmount: toNumber(q.amount, GLOBAL_INCOME_FLOOR_PPP, 1, 100000),
        // Bounds mirror FUNDING_SLIDERS in views/calculator.ts — keep in sync
        fIncomeTax: toNumber(q.f_income, 0, 0, 15),
        fVat: toNumber(q.f_vat, 0, 0, 10),
        fCarbon: toNumber(q.f_carbon, 0, 0, 200),
        fWealth: toNumber(q.f_wealth, 0, 0, 5),
        fFtt: toNumber(q.f_ftt, 0, 0, 1),
        fAutomation: toNumber(q.f_automation, 0, 0, 15),
        fRedirect: toNumber(q.f_redirect, 0, 0, 80),
      };

      let result: CalculatorResult | undefined;
      const country = form.country ? getCountryByCode(form.country) : undefined;
      if (country) {
        const floorOverride =
          form.monthlyAmount === GLOBAL_INCOME_FLOOR_PPP ? null : form.monthlyAmount;
        const simulation = calculateSimulation(
          country,
          simulationParams(
            country.code,
            form.coveragePercent / 100,
            form.targetGroup,
            form.durationMonths,
            floorOverride,
          ),
          dataVersion,
        );
        const fiscal = calculateFiscalContext(country, simulation.simulation.cost.annualPppUsd);
        const impact = calculateImpactAnalysis(
          country,
          simulation,
          {
            country: country.code,
            coverage: form.coveragePercent / 100,
            targetGroup: form.targetGroup,
            durationMonths: form.durationMonths,
            floorOverride,
            simulationId: null,
          },
          dataVersion,
        );

        const mechanisms: FundingMechanismInput[] = [];
        if (form.fIncomeTax > 0) mechanisms.push({ type: 'income_tax_surcharge', rate: form.fIncomeTax / 100 });
        if (form.fVat > 0) mechanisms.push({ type: 'vat_increase', points: form.fVat });
        if (form.fCarbon > 0) mechanisms.push({ type: 'carbon_tax', dollarPerTon: form.fCarbon });
        if (form.fWealth > 0) mechanisms.push({ type: 'wealth_tax', rate: form.fWealth / 100 });
        if (form.fFtt > 0) mechanisms.push({ type: 'financial_transaction_tax', rate: form.fFtt / 100 });
        if (form.fAutomation > 0) mechanisms.push({ type: 'automation_tax', rate: form.fAutomation / 100 });
        if (form.fRedirect > 0) mechanisms.push({ type: 'redirect_social_spending', percent: form.fRedirect / 100 });

        const funding = mechanisms.length > 0
          ? calculateFundingScenario(country, simulation, mechanisms, dataVersion)
          : null;

        result = {
          countryName: country.name,
          simulation,
          fiscal,
          impact,
          funding,
          monthlyLocalFormatted: formatMonthlyLocal(
            country,
            simulation.simulation.entitlementPerPerson.localCurrencyPerMonth,
          ),
        };
      }

      const data: CalculatorData = {
        countries: countryOptions(),
        form,
        result,
        dataVersion,
      };
      return reply.type('text/html').send(renderCalculator(data));
    },
  );

  // ── Country comparison ────────────────────────────────────────────────
  app.get<{ Querystring: { c?: string | string[] } }>('/compare', async (request, reply) => {
    const dataVersion = getDataVersion();
    const raw = request.query.c;
    const requested = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .map((c) => c.toUpperCase())
      .filter((c, i, arr) => c !== '' && arr.indexOf(c) === i);

    const columns: CompareColumn[] = [];
    const selected: string[] = [];
    for (const code of requested) {
      if (selected.length >= 4) break;
      const country = getCountryByCode(code);
      if (!country) continue;
      selected.push(code);
      const entitlement = calculateEntitlement(country, dataVersion);
      const universal = universalSimulation(country, dataVersion);
      const fiscal = calculateFiscalContext(country, universal.simulation.cost.annualPppUsd);
      const povertyLine = resolveCountryPovertyLine(country);
      const impact = calculateImpactAnalysis(
        country,
        universal,
        {
          country: code,
          coverage: 1,
          targetGroup: 'all',
          durationMonths: 12,
          floorOverride: null,
          simulationId: null,
        },
        dataVersion,
      );
      columns.push({
        code,
        name: country.name,
        incomeGroup: country.stats.incomeGroup,
        population: country.stats.population,
        gdpPerCapitaPppUsd: country.stats.gdpPerCapitaPppUsd,
        povertyRatePercent:
          povertyLine.headcountRatioPercent ?? country.stats.povertyHeadcountRatio ?? null,
        povertyLineLabel: povertyLine.label,
        monthlyLocalFormatted: formatMonthlyLocal(country, entitlement.localCurrencyPerMonth),
        universalAnnualPppUsd: universal.simulation.cost.annualPppUsd,
        universalPercentGdp: universal.simulation.cost.asPercentOfGdp,
        percentOfTaxRevenue: fiscal.ubiAsPercentOfTaxRevenue,
        estimatedLifted:
          impact.povertyReduction.extremePoorBaseline > 0
            ? impact.povertyReduction.estimatedLifted
            : null,
        score: entitlement.score,
      });
    }

    const data: CompareData = {
      countries: countryOptions(),
      selected,
      columns,
      dataVersion,
    };
    return reply.type('text/html').send(renderCompare(data));
  });

  // ── Methodology & data pages ──────────────────────────────────────────
  app.get('/methodology', async (_request, reply) => {
    return reply.type('text/html').send(
      renderMethodology({
        dataVersion: getDataVersion(),
        countryCount: getAllCountries().length,
      }),
    );
  });

  app.get('/data', async (_request, reply) => {
    return reply.type('text/html').send(
      renderDataPage({
        dataVersion: getDataVersion(),
        countryCount: getAllCountries().length,
        regionCount: getAllRegions().length,
      }),
    );
  });

  // ── Dataset downloads ─────────────────────────────────────────────────
  app.get('/data/countries.csv', async (_request, reply) => {
    const dataVersion = getDataVersion();
    const rows = getAllCountries().map((c) => datasetRow(c, dataVersion));
    const header = Object.keys(rows[0]);
    const lines = [
      header.join(','),
      ...rows.map((r) => header.map((h) => csvEscape((r as Record<string, string | number | null>)[h])).join(',')),
    ];
    return reply
      .type('text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="ogi-countries-${dataVersion}.csv"`)
      .send(lines.join('\n'));
  });

  app.get('/data/countries.json', async (_request, reply) => {
    const dataVersion = getDataVersion();
    return reply
      .type('application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="ogi-countries-${dataVersion}.json"`)
      .send(JSON.stringify(
        {
          source: 'Open Global Income',
          version: packageVersion,
          dataVersion,
          generatedAt: new Date().toISOString(),
          countries: getAllCountries().map((c) => datasetRow(c, dataVersion)),
        },
        null,
        2,
      ));
  });
};
