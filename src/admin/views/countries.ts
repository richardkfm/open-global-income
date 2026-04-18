import { layout } from './layout.js';
import { escapeHtml, formatCompact, formatNumber, renderDrawer } from './helpers.js';
import { t } from '../../i18n/index.js';
import { getCurrencyForCountry, formatLocalCurrency, CURRENCIES, COUNTRY_CURRENCY_MAP } from '../../data/currencies.js';
import type { Country, CountryStats } from '../../core/types.js';
import type { DataCompleteness } from '../../data/loader.js';
import { calculateEntitlement } from '../../core/rules.js';
import { GLOBAL_INCOME_FLOOR_PPP } from '../../core/constants.js';
import { resolveCountryPovertyLine } from '../../core/poverty.js';
import { convert, pickDisplayCurrency, type FxSnapshot } from '../../core/fx.js';

function fmt(val: number | null | undefined, decimals = 1, suffix = ''): string {
  if (val === null || val === undefined) return t('common.none');
  return `${val.toFixed(decimals)}${suffix}`;
}

/** Income group badge CSS class */
function incomeGroupClass(group: string): string {
  const map: Record<string, string> = {
    HIC: 'badge-hic',
    UMC: 'badge-umc',
    LMC: 'badge-lmc',
    LIC: 'badge-lic',
  };
  return map[group] ?? 'badge-neutral';
}

function incomeGroupLabel(group: string): string {
  const map: Record<string, string> = {
    HIC: t('countries.incomeGroupHic'),
    UMC: t('countries.incomeGroupUmc'),
    LMC: t('countries.incomeGroupLmc'),
    LIC: t('countries.incomeGroupLic'),
  };
  return map[group] ?? group;
}

/** Color level: good=green, warn=amber, bad=red, neutral=grey */
type Level = 'good' | 'warn' | 'bad' | 'neutral';

function getLevel(
  val: number | null | undefined,
  thresholds: { good?: number; warn?: number; invert?: boolean },
): Level {
  if (val === null || val === undefined) return 'neutral';
  const { good, warn, invert = false } = thresholds;
  const isGood = good !== undefined && (invert ? val <= good : val >= good);
  const isWarn = !isGood && warn !== undefined && (invert ? val <= warn : val >= warn);
  if (isGood) return 'good';
  if (isWarn) return 'warn';
  return 'bad';
}

const LEVEL_CSS: Record<Level, string> = {
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-danger',
  neutral: 'text-muted',
};

/** Comparison arrow vs group average */
function deltaArrow(val: number | null | undefined, avg: number | undefined, invert = false): string {
  if (val === null || val === undefined || avg === undefined) return '';
  const diff = val - avg;
  const absDiff = Math.abs(diff).toFixed(1);
  const better = invert ? diff < 0 : diff > 0;
  const arrow = diff > 0 ? '&#9650;' : '&#9660;';
  const cls = better ? 'text-success' : 'text-danger';
  if (Math.abs(diff) < 0.05) return `<span class="text-muted text-xs"> = ${t('countries.vsAvg')}</span>`;
  return `<span class="${cls} text-xs">${arrow}${absDiff} ${t('countries.vsAvg')}</span>`;
}

/** Source badge */
function sourceBadge(source: 'wb' | 'ilo' | 'imf'): string {
  const map: Record<string, { label: string; cls: string }> = {
    wb: { label: t('countries.worldBank'), cls: 'badge-info' },
    ilo: { label: t('countries.ilo'), cls: 'badge-success' },
    imf: { label: t('countries.imf'), cls: 'badge-danger' },
  };
  const { label, cls } = map[source] ?? { label: source, cls: 'badge-neutral' };
  return `<span class="badge ${cls}" style="font-size:0.65rem">${label}</span>`;
}

/** Compute averages per income group */
function computeGroupAverages(
  countries: Country[],
  fields: (keyof CountryStats)[],
): Record<string, Partial<Record<keyof CountryStats, number>>> {
  const result: Record<string, Partial<Record<keyof CountryStats, number>>> = {};
  for (const group of ['HIC', 'UMC', 'LMC', 'LIC']) {
    const gc = countries.filter((c) => c.stats.incomeGroup === group);
    const avgs: Partial<Record<keyof CountryStats, number>> = {};
    for (const field of fields) {
      const vals = gc
        .map((c) => c.stats[field])
        .filter((v): v is number => typeof v === 'number');
      if (vals.length > 0)
        avgs[field] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    }
    result[group] = avgs;
  }
  return result;
}

/** Score ring — SVG circle showing 0–1 score */
function scoreRing(score: number): string {
  const pct = Math.min(1, Math.max(0, score));
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct * circ).toFixed(1);
  const gap = (circ - pct * circ).toFixed(1);
  const color = pct >= 0.7 ? 'var(--color-danger)' : pct >= 0.4 ? 'var(--color-warning)' : 'var(--color-success)';
  const label = pct >= 0.7 ? t('countries.needHigh') : pct >= 0.4 ? t('countries.needModerate') : t('countries.needLower');
  return `
    <div class="flex-col" style="align-items:center;gap:0.3rem">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--color-border-light)" stroke-width="6"/>
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="6"
          stroke-dasharray="${dash} ${gap}" stroke-linecap="round"
          transform="rotate(-90 36 36)"/>
        <text x="36" y="40" text-anchor="middle" font-size="13" font-weight="700" fill="${color}">${(pct * 100).toFixed(0)}</text>
      </svg>
      <span class="text-xs text-bold" style="color:${color}">${label}</span>
    </div>`;
}

/** Metric tile for detail page */
function tile(
  label: string,
  rawVal: number | null | undefined,
  displayVal: string,
  level: Level,
  avg: number | undefined,
  note?: string,
  barMax?: number,
  showBar = true,
  invert = false,
): string {
  const isNA = rawVal === null || rawVal === undefined;
  const levelCls = LEVEL_CSS[level];
  const delta = !isNA ? deltaArrow(rawVal, avg, invert) : '';
  const barHtml = showBar && !isNA && barMax ? (() => {
    const pctVal = Math.min(100, Math.max(0, ((rawVal as number) / barMax) * 100));
    const barCls = level === 'good' ? 'progress-bar-fill-success' : level === 'warn' ? 'progress-bar-fill-warning' : level === 'bad' ? 'progress-bar-fill-danger' : 'progress-bar-fill-primary';
    return `<div class="progress-bar mt-1"><div class="${barCls}" style="width:${pctVal.toFixed(1)}%"></div></div>`;
  })() : '';

  return `
    <div class="card" style="padding:0.85rem">
      <div class="metric-tile-label">${escapeHtml(label)}</div>
      <div class="metric-tile-value ${isNA ? 'text-muted' : levelCls}">${isNA ? t('common.none') : displayVal}</div>
      ${barHtml}
      ${avg !== undefined || note ? `<div class="text-xs text-muted mt-1">${note ?? ''}${delta}</div>` : ''}
    </div>`;
}

// ── Public exports ────────────────────────────────────────────────────────────

export interface CountryListItem {
  country: Country;
  completeness: DataCompleteness;
}

export function renderCountryList(
  items: CountryListItem[],
  dataVersion: string,
  username?: string,
): string {
  const total = items.length;
  const groupCounts = { HIC: 0, UMC: 0, LMC: 0, LIC: 0 };
  for (const { country: c } of items) groupCounts[c.stats.incomeGroup]++;
  const avgCoverage = total > 0
    ? Math.round((items.reduce((s, i) => s + i.completeness.available / i.completeness.total, 0) / total) * 100)
    : 0;

  const summaryCards = (['HIC', 'UMC', 'LMC', 'LIC'] as const).map((g) => `
    <div class="card stat-card">
      <div class="stat-value">${groupCounts[g]}</div>
      <div class="stat-label"><span class="badge ${incomeGroupClass(g)}">${incomeGroupLabel(g)}</span></div>
    </div>`).join('');

  const rows = items.map(({ country: c, completeness: comp }) => {
    const pct = comp.total > 0 ? Math.round((comp.available / comp.total) * 100) : 0;
    const barCls = pct >= 70 ? 'progress-bar-fill-success' : pct >= 40 ? 'progress-bar-fill-warning' : 'progress-bar-fill-danger';
    return `
      <tr>
        <td class="mono">${escapeHtml(c.code)}</td>
        <td><a href="/admin/countries/${escapeHtml(c.code)}">${escapeHtml(c.name)}</a></td>
        <td><span class="badge ${incomeGroupClass(c.stats.incomeGroup)}">${escapeHtml(c.stats.incomeGroup)}</span></td>
        <td class="text-right">${formatCompact(c.stats.population)}</td>
        <td class="text-right">$${c.stats.gdpPerCapitaUsd.toLocaleString('en-US')}</td>
        <td>
          <div class="flex flex-center gap-1">
            <div class="progress-bar" style="width:80px"><div class="${barCls}" style="width:${pct}%"></div></div>
            <span class="text-xs text-muted">${pct}%</span>
          </div>
        </td>
        <td><a href="/admin/countries/${escapeHtml(c.code)}" class="btn btn-primary btn-xs">${t('countries.viewButton')}</a></td>
      </tr>`;
  }).join('');

  return layout(
    t('countries.title'),
    `
    <div class="page-header">
      <h1>${t('countries.title')}</h1>
      <p class="text-muted">${total} ${t('countries.countries')} &middot; ${avgCoverage}% ${t('countries.heroSubtitle')}</p>
    </div>

    <div class="grid grid-4 mb-2">${summaryCards}</div>

    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>${t('countries.colCode')}</th>
            <th>${t('countries.colCountry')}</th>
            <th>${t('countries.colIncomeGroup')}</th>
            <th class="text-right">${t('countries.colPopulation')}</th>
            <th class="text-right">${t('countries.colGdpPerCapita')}</th>
            <th>${t('countries.colMacroCoverage')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`,
    { activePage: 'countries', username },
  );
}

/**
 * Options for the country detail view. `fxSnapshot` + `displayCurrency`
 * together drive the currency toggle. When omitted, amounts render in USD
 * as before — so the function stays backwards-compatible.
 */
export interface CountryDetailOptions {
  fxSnapshot?: FxSnapshot;
  /** User-selected display currency (ISO 4217). Defaults to the country's local currency. */
  displayCurrency?: string;
}

/** Render a compact dropdown that reloads the page with ?currency=<code>. */
function renderCurrencyToggle(
  countryCode: string,
  snapshot: FxSnapshot,
  active: string,
): string {
  const localCode = COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()];
  // Offer: the country's local, the base, and a short curated list of reserves.
  // Using a Set de-dupes when local === base.
  const curated = new Set<string>([snapshot.baseCurrency]);
  if (localCode) curated.add(localCode);
  for (const code of ['EUR', 'GBP', 'JPY', 'CNY', 'SDR']) {
    if (snapshot.rates[code]) curated.add(code);
  }
  const options = Array.from(curated)
    .map((code) => {
      const label = CURRENCIES[code]?.name ?? code;
      const selected = code === active ? ' selected' : '';
      return `<option value="${escapeHtml(code)}"${selected}>${escapeHtml(code)} — ${escapeHtml(label)}</option>`;
    })
    .join('');
  return `
    <form method="get" action="" class="flex flex-center gap-1" style="margin:0">
      <label class="text-xs text-muted" for="currency-toggle">${t('countries.currencyToggleLabel')}</label>
      <select id="currency-toggle" name="currency" class="form-select" onchange="this.form.submit()" style="width:auto;min-width:200px;padding:0.25rem 0.5rem;font-size:0.85rem">
        ${options}
      </select>
      <noscript><button type="submit" class="btn btn-xs">Apply</button></noscript>
    </form>`;
}

export function renderCountryDetail(
  country: Country,
  completeness: DataCompleteness,
  allCountries: Country[],
  dataVersion: string,
  username?: string,
  options: CountryDetailOptions = {},
): string {
  const s = country.stats;
  const group = s.incomeGroup;
  const entitlement = calculateEntitlement(country, dataVersion);
  const currency = getCurrencyForCountry(country.code);
  const currencyCode = currency?.code ?? 'USD';

  // ── Display-currency resolution ──────────────────────────────────────────
  // The USD figures from World Bank (gdpPerCapitaUsd, gniPerCapitaUsd) are
  // converted via the injected FX snapshot. If no snapshot is provided, fall
  // back to the prior USD-only rendering so callers that don't opt in are
  // unaffected.
  const fx = options.fxSnapshot;
  const displayCode = fx
    ? pickDisplayCurrency(fx, options.displayCurrency ?? currencyCode)
    : 'USD';
  const displaySymbol = CURRENCIES[displayCode]?.symbol ?? displayCode;
  const fmtMoney = (usdAmount: number): string => {
    if (!fx || displayCode === 'USD') {
      return `$${Math.round(usdAmount).toLocaleString('en-US')}`;
    }
    const c = convert(usdAmount, fx.baseCurrency, displayCode, fx);
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: displayCode,
        maximumFractionDigits: 0,
      }).format(c.amount);
    } catch {
      return `${displaySymbol}${Math.round(c.amount).toLocaleString('en-US')}`;
    }
  };
  const toggleHtml = fx ? renderCurrencyToggle(country.code, fx, displayCode) : '';
  const rateAsOfLine = fx && displayCode !== fx.baseCurrency
    ? `<div class="text-xs text-muted mt-1">${t('countries.currencyRateAsOf')} ${escapeHtml(fx.asOf)} · ${t('countries.currencyBaseNote')} ${escapeHtml(fx.baseCurrency)}</div>`
    : '';

  // Group averages
  const macroFields: (keyof CountryStats)[] = [
    'taxRevenuePercentGdp','socialProtectionSpendingPercentGdp','inflationRate',
    'laborForceParticipation','unemploymentRate','governmentDebtPercentGdp',
    'povertyHeadcountRatio','gdpGrowthRate','healthExpenditurePercentGdp',
    'educationExpenditurePercentGdp','urbanizationRate','socialProtectionCoveragePercent',
    'pensionCoveragePercent','childBenefitCoveragePercent',
  ];
  const groupAvgs = computeGroupAverages(allCountries, macroFields);
  const avgs = groupAvgs[group] ?? {};
  const avg = (f: keyof CountryStats) => avgs[f as keyof typeof avgs];

  const localFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  // ── Hero ──────────────────────────────────────────────────────────────────
  const hero = `
    <div class="page-header">
      <a href="/admin/countries" class="text-sm">${t('countries.backToAll')}</a>
      <div class="page-header-row mt-1">
        <div>
          <div class="flex flex-center gap-1">
            <h1>${escapeHtml(country.name)}</h1>
            <span class="mono text-muted">${escapeHtml(country.code)}</span>
          </div>
          <span class="badge ${incomeGroupClass(group)}">${incomeGroupLabel(group)}</span>
          ${toggleHtml ? `<div class="mt-1">${toggleHtml}${rateAsOfLine}</div>` : ''}
        </div>
        <div class="text-center">
          <div class="text-xs text-muted mb-1">${t('countries.needScore')}</div>
          ${scoreRing(entitlement.score)}
          <div class="text-xs text-muted mt-1">${(entitlement.score * 100).toFixed(1)} / 100</div>
        </div>
      </div>
    </div>

    <div class="grid grid-3 mb-2">
      <div class="card stat-card">
        <div class="stat-label">${t('countries.ubiFloorMonth')}</div>
        <div class="stat-value">$${entitlement.pppUsdPerMonth} <span class="text-sm text-muted">${t('countries.pppUsdUnit')}</span></div>
        <div class="text-sm text-muted">${localFmt.format(entitlement.localCurrencyPerMonth)} ${t('countries.localUnit')} (${escapeHtml(currencyCode)})</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t('countries.gdpPerCapita')}</div>
        <div class="stat-value">${fmtMoney(s.gdpPerCapitaUsd)}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t('countries.population')}</div>
        <div class="stat-value">${formatCompact(s.population)}</div>
      </div>
    </div>`;

  // ── Income Calculation card ───────────────────────────────────────────────
  const entitlementDrawer = renderDrawer(
    'country-entitlement-formula',
    t('common.calculations'),
    t('countries.drawerEntitlementTitle'),
    `<p class="text-sm text-muted">${t('countries.drawerEntitlementFormula')}</p>
    <ul class="text-sm text-muted" style="padding-left:1.2rem;margin:0.5rem 0">
      <li><strong>${t('countries.drawerInputFloor')}</strong> $${GLOBAL_INCOME_FLOOR_PPP} PPP-USD/month — ${t('countries.drawerInputFloorNote')}</li>
      <li><strong>${t('countries.drawerInputPpp')}</strong> ${s.pppConversionFactor.toFixed(2)} — ${t('countries.worldBank')} 2023 (PA.NUS.PPP)</li>
      <li><strong>${t('countries.drawerInputGni')}</strong> $${s.gniPerCapitaUsd.toLocaleString('en-US')}/yr — ${t('countries.worldBank')} 2023 (NY.GNP.PCAP.CD)</li>
      <li><strong>${t('countries.drawerInputGini')}</strong> ${s.giniIndex != null ? s.giniIndex : t('common.none')} — ${t('countries.worldBank')} 2023 (SI.POV.GINI)</li>
      <li><strong>${t('countries.drawerRuleset')}</strong> ${escapeHtml(entitlement.meta.rulesetVersion)}</li>
    </ul>
    <p class="text-xs text-muted" style="font-style:italic">${t('countries.drawerEntitlementNote')}</p>`,
  );

  const incomeCalcCard = `
    <div class="card mb-2">
      <div class="card-header">
        <h2 class="card-title">${t('countries.incomeCalculation')}</h2>
        ${sourceBadge('wb')}
      </div>
      <div class="grid grid-3">
        <div class="card stat-card">
          <div class="stat-label">${t('countries.ubiFloorMonth')}</div>
          <div class="stat-value">$${entitlement.pppUsdPerMonth} <span class="text-sm text-muted">${t('countries.pppUsdUnit')}</span></div>
          <div class="text-sm text-muted">${localFmt.format(entitlement.localCurrencyPerMonth)} ${t('countries.localUnit')} (${escapeHtml(currencyCode)})</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">${t('countries.needScore')}</div>
          <div class="stat-value">${(entitlement.score * 100).toFixed(1)} / 100</div>
          <div class="text-sm text-muted">${scoreRing(entitlement.score)}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">${t('countries.rulesetVersion')}</div>
          <div class="stat-value mono">${escapeHtml(entitlement.meta.rulesetVersion)}</div>
        </div>
      </div>
      ${entitlementDrawer}
    </div>`;

  // ── Section helper ────────────────────────────────────────────────────────
  function section(title: string, badge: string, tiles: string): string {
    return `
      <div class="card mb-2">
        <div class="card-header">
          <h2 class="card-title">${escapeHtml(title)}</h2>
          ${badge}
        </div>
        <div class="grid grid-auto">${tiles}</div>
      </div>`;
  }

  // ── Core Economics ────────────────────────────────────────────────────────
  const coreSection = section(t('countries.coreEconomics'), sourceBadge('wb'), [
    tile(t('countries.gdpCapita'), s.gdpPerCapitaUsd, fmtMoney(s.gdpPerCapitaUsd), 'neutral', undefined, undefined, undefined, false),
    tile(t('countries.gniCapita'), s.gniPerCapitaUsd, fmtMoney(s.gniPerCapitaUsd), 'neutral', undefined, undefined, undefined, false),
    tile(t('countries.pppFactor'), s.pppConversionFactor, `${s.pppConversionFactor.toFixed(2)}`, 'neutral', undefined, t('countries.noteLocalPerIntlDollar'), undefined, false),
    tile(t('countries.giniIndex'), s.giniIndex, s.giniIndex != null ? `${s.giniIndex}` : t('common.none'),
      s.giniIndex != null ? getLevel(s.giniIndex, { good: 35, warn: 45, invert: true }) : 'neutral', undefined, t('countries.noteInequality'), 100),
    tile(t('countries.population'), s.population, formatCompact(s.population), 'neutral', undefined, undefined, undefined, false),
  ].join(''));

  // ── Fiscal ────────────────────────────────────────────────────────────────
  const fiscalSection = section(t('countries.fiscalCapacity'), sourceBadge('wb'), [
    tile(t('countries.taxRevenue'), s.taxRevenuePercentGdp, fmt(s.taxRevenuePercentGdp, 1, '% GDP'), getLevel(s.taxRevenuePercentGdp, { good: 20, warn: 10 }), avg('taxRevenuePercentGdp'), undefined, 50),
    tile(t('countries.govtDebt'), s.governmentDebtPercentGdp, fmt(s.governmentDebtPercentGdp, 1, '% GDP'), getLevel(s.governmentDebtPercentGdp, { good: 60, warn: 90, invert: true }), avg('governmentDebtPercentGdp'), undefined, 150, true, true),
    tile(t('countries.gdpGrowth'), s.gdpGrowthRate, fmt(s.gdpGrowthRate, 1, '%'), getLevel(s.gdpGrowthRate, { good: 3, warn: 0 }), avg('gdpGrowthRate'), undefined, undefined, false),
    tile(t('countries.socialSpending'), s.socialProtectionSpendingPercentGdp, fmt(s.socialProtectionSpendingPercentGdp, 1, '% GDP'), 'neutral', avg('socialProtectionSpendingPercentGdp'), undefined, 30),
    tile(t('countries.socialContributions'), s.socialContributionsPercentRevenue, fmt(s.socialContributionsPercentRevenue, 1, t('common.percentRev')), 'neutral', avg('socialContributionsPercentRevenue'), undefined, 50),
  ].join(''));

  // ── Social Protection ─────────────────────────────────────────────────────
  const socialSection = section(t('countries.socialProtection'), sourceBadge('ilo'), [
    tile(t('countries.populationCoverage'), s.socialProtectionCoveragePercent, fmt(s.socialProtectionCoveragePercent, 1, '%'), getLevel(s.socialProtectionCoveragePercent, { good: 70, warn: 40 }), avg('socialProtectionCoveragePercent'), undefined, 100),
    tile(t('countries.iloExpenditure'), s.socialProtectionExpenditureIloPercentGdp, fmt(s.socialProtectionExpenditureIloPercentGdp, 1, '% GDP'), 'neutral', undefined, undefined, 30),
    tile(t('countries.pensionCoverage'), s.pensionCoveragePercent, fmt(s.pensionCoveragePercent, 1, '%'), getLevel(s.pensionCoveragePercent, { good: 60, warn: 30 }), avg('pensionCoveragePercent'), undefined, 100),
    tile(t('countries.childBenefitCoverage'), s.childBenefitCoveragePercent, fmt(s.childBenefitCoveragePercent, 1, '%'), getLevel(s.childBenefitCoveragePercent, { good: 60, warn: 20 }), avg('childBenefitCoveragePercent'), undefined, 100),
  ].join(''));

  // ── Labor & Poverty ───────────────────────────────────────────────────────
  const laborSection = section(t('countries.laborPoverty'), sourceBadge('wb'), [
    tile(t('countries.laborParticipation'), s.laborForceParticipation, fmt(s.laborForceParticipation, 1, '%'), getLevel(s.laborForceParticipation, { good: 60, warn: 50 }), avg('laborForceParticipation'), undefined, 100),
    tile(t('countries.unemployment'), s.unemploymentRate, fmt(s.unemploymentRate, 1, '%'), getLevel(s.unemploymentRate, { good: 5, warn: 10, invert: true }), avg('unemploymentRate'), undefined, 30, true, true),
    (() => {
      const line = resolveCountryPovertyLine(country);
      const rate = line.headcountRatioPercent;
      const basisLabel: Record<typeof line.basis, string> = {
        extreme: t('countries.povertyBasisExtreme'),
        lower_middle: t('countries.povertyBasisLowerMiddle'),
        upper_middle: t('countries.povertyBasisUpperMiddle'),
        relative_median: t('countries.povertyBasisRelativeMedian'),
        national: t('countries.povertyBasisNational'),
      };
      const note = `$${line.dailyPppUsd.toFixed(2)}/day · ${basisLabel[line.basis]} `;
      return tile(t('countries.povertyCountryLine'), rate, fmt(rate, 1, '%'), getLevel(rate, { good: 3, warn: 15, invert: true }), undefined, note, 80, true, true);
    })(),
    tile(t('countries.inflation'), s.inflationRate, fmt(s.inflationRate, 1, '%'), getLevel(s.inflationRate, { good: 3, warn: 8, invert: true }), avg('inflationRate'), undefined, undefined, false, true),
    tile(t('countries.urbanization'), s.urbanizationRate, fmt(s.urbanizationRate, 1, '%'), 'neutral', avg('urbanizationRate'), undefined, 100),
  ].join(''));

  // ── Public Expenditure ────────────────────────────────────────────────────
  const expendSection = section(t('countries.publicExpenditure'), sourceBadge('wb'), [
    tile(t('countries.healthSpending'), s.healthExpenditurePercentGdp, fmt(s.healthExpenditurePercentGdp, 1, '% GDP'), getLevel(s.healthExpenditurePercentGdp, { good: 5, warn: 3 }), avg('healthExpenditurePercentGdp'), undefined, 20),
    tile(t('countries.educationSpending'), s.educationExpenditurePercentGdp, fmt(s.educationExpenditurePercentGdp, 1, '% GDP'), getLevel(s.educationExpenditurePercentGdp, { good: 4, warn: 2 }), avg('educationExpenditurePercentGdp'), undefined, 15),
    tile(t('countries.giniIndex'), s.giniIndex, fmt(s.giniIndex, 1), getLevel(s.giniIndex, { good: 30, warn: 45, invert: true }), undefined, t('countries.noteInequality'), 100, true, true),
    tile(t('countries.pppFactor'), s.pppConversionFactor, fmt(s.pppConversionFactor, 2), 'neutral', undefined, t('countries.noteLocalPerIntlDollar'), undefined, false),
  ].join(''));

  // ── IMF Tax Breakdown ─────────────────────────────────────────────────────
  const taxBreakdown = s.taxBreakdown ? section(t('countries.taxBreakdown'), sourceBadge('imf'), [
    tile(t('countries.incomeTax'), s.taxBreakdown.incomeTaxPercentGdp, fmt(s.taxBreakdown.incomeTaxPercentGdp, 1, '% GDP'), 'neutral', undefined, undefined, 20),
    tile(t('countries.vatSalesTax'), s.taxBreakdown.vatPercentGdp, fmt(s.taxBreakdown.vatPercentGdp, 1, '% GDP'), 'neutral', undefined, undefined, 20),
    tile(t('countries.tradeTaxes'), s.taxBreakdown.tradeTaxPercentGdp, fmt(s.taxBreakdown.tradeTaxPercentGdp, 1, '% GDP'), 'neutral', undefined, undefined, 10),
    tile(t('countries.otherTaxes'), s.taxBreakdown.otherTaxPercentGdp, fmt(s.taxBreakdown.otherTaxPercentGdp, 1, '% GDP'), 'neutral', undefined, undefined, 10),
  ].join('')) : '';

  // ── Data Completeness ─────────────────────────────────────────────────────
  const pct = Math.round((completeness.available / completeness.total) * 100);
  const barCls = pct >= 70 ? 'progress-bar-fill-success' : pct >= 40 ? 'progress-bar-fill-warning' : 'progress-bar-fill-danger';

  // Build sub-sections for "not reported" (null) vs "not yet fetched" (undefined)
  const unavailableSection = completeness.unavailableFields.length > 0
    ? `<details class="mt-1">
        <summary class="text-muted text-sm" style="cursor:pointer">${completeness.unavailableFields.length} not reported for this country</summary>
        <div class="flex gap-1 mt-1" style="flex-wrap:wrap">
          ${completeness.unavailableFields.map((f) => `<span class="badge badge-neutral">${escapeHtml(f)}</span>`).join('')}
        </div>
      </details>`
    : '';

  const notFetchedSection = completeness.notFetchedFields.length > 0
    ? `<details class="mt-1">
        <summary class="text-warning text-sm" style="cursor:pointer">${completeness.notFetchedFields.length} not yet fetched (run <code>npm run data:update</code>)</summary>
        <div class="flex gap-1 mt-1" style="flex-wrap:wrap">
          ${completeness.notFetchedFields.map((f) => `<span class="badge badge-warning">${escapeHtml(f)}</span>`).join('')}
        </div>
      </details>`
    : '';

  const allPresent = completeness.missingFields.length === 0;

  const completenessSection = `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('countries.dataCompleteness')}</h2>
      </div>
      <div class="flex flex-center gap-2">
        <div style="flex-shrink:0">
          <div class="progress-bar" style="width:80px;height:80px;border-radius:50%">
            <div class="${barCls}" style="width:${pct}%;height:100%;border-radius:50%"></div>
          </div>
        </div>
        <div style="flex:1">
          <div class="text-bold">${completeness.available} of ${completeness.total} ${t('countries.indicatorsAvailable')} (${pct}%)</div>
          <div class="text-xs text-muted mt-1">${t('countries.dataSources')} <code>${escapeHtml(dataVersion)}</code></div>
          ${allPresent
            ? `<div class="text-success text-sm mt-1">${t('countries.allIndicatorsAvailable')}</div>`
            : `${notFetchedSection}${unavailableSection}`
          }
        </div>
      </div>
    </div>`;

  return layout(
    `${country.name} — ${t('countries.title')}`,
    `
    ${hero}
    ${incomeCalcCard}
    ${coreSection}
    ${fiscalSection}
    ${socialSection}
    ${laborSection}
    ${expendSection}
    ${taxBreakdown}
    ${completenessSection}
    `,
    { activePage: 'countries', username },
  );
}
