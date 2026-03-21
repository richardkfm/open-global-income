import { layout } from './layout.js';
import type { Country, CountryStats } from '../../core/types.js';
import type { DataCompleteness } from '../../data/loader.js';
import { calculateEntitlement } from '../../core/rules.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(val: number | null | undefined, decimals = 1, suffix = ''): string {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(decimals)}${suffix}`;
}

function fmtLarge(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString('en-US');
}

/** Income group display config */
const GROUP_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  HIC: { label: 'High Income',         bg: '#d1e7dd', color: '#0f5132', border: '#198754' },
  UMC: { label: 'Upper Middle Income', bg: '#cfe2ff', color: '#084298', border: '#0d6efd' },
  LMC: { label: 'Lower Middle Income', bg: '#fff3cd', color: '#664d03', border: '#fd7e14' },
  LIC: { label: 'Low Income',          bg: '#f8d7da', color: '#842029', border: '#dc3545' },
};

function incomeGroupBadge(group: string): string {
  const m = GROUP_META[group] ?? { label: group, bg: '#e2e3e5', color: '#41464b', border: '#6c757d' };
  return `<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.6rem;border-radius:1rem;font-size:0.72rem;font-weight:700;letter-spacing:0.04em;background:${m.bg};color:${m.color};border:1px solid ${m.border}20">${escapeHtml(group)}</span>`;
}

function incomeGroupPill(group: string): string {
  const m = GROUP_META[group] ?? { label: group, bg: '#e2e3e5', color: '#41464b', border: '#6c757d' };
  return `<span style="padding:0.25rem 0.75rem;border-radius:1rem;font-size:0.8rem;font-weight:600;background:${m.bg};color:${m.color}">${escapeHtml(m.label)}</span>`;
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

const LEVEL_COLORS = {
  good:    { text: '#0f5132', bg: '#d1e7dd', dot: '#198754' },
  warn:    { text: '#664d03', bg: '#fff3cd', dot: '#fd7e14' },
  bad:     { text: '#842029', bg: '#f8d7da', dot: '#dc3545' },
  neutral: { text: '#6c757d', bg: '#f8f9fa', dot: '#adb5bd' },
};

/** A mini horizontal bar (0–100 scale) */
function miniBar(val: number | null | undefined, level: Level, maxVal = 100): string {
  if (val === null || val === undefined) return '';
  const pct = Math.min(100, Math.max(0, (val / maxVal) * 100));
  const color = LEVEL_COLORS[level].dot;
  return `<div style="margin-top:0.3rem;height:3px;background:#e9ecef;border-radius:2px">
    <div style="width:${pct.toFixed(1)}%;height:3px;background:${color};border-radius:2px"></div>
  </div>`;
}

/** Comparison arrow vs group average */
function deltaArrow(val: number | null | undefined, avg: number | undefined, invert = false): string {
  if (val === null || val === undefined || avg === undefined) return '';
  const diff = val - avg;
  const absDiff = Math.abs(diff).toFixed(1);
  const better = invert ? diff < 0 : diff > 0;
  const arrow = diff > 0 ? '▲' : '▼';
  const color = better ? '#198754' : '#dc3545';
  if (Math.abs(diff) < 0.05) return '<span style="color:#6c757d;font-size:0.7rem"> = avg</span>';
  return `<span style="color:${color};font-size:0.7rem;margin-left:0.25rem">${arrow}${absDiff} vs avg</span>`;
}

/** Source badge: wb / ilo / imf */
function sourceBadge(source: 'wb' | 'ilo' | 'imf'): string {
  const cfg = {
    wb:  { label: 'World Bank', color: '#084298', bg: '#cfe2ff' },
    ilo: { label: 'ILO',        color: '#0f5132', bg: '#d1e7dd' },
    imf: { label: 'IMF',        color: '#58151c', bg: '#f8d7da' },
  };
  const { label, color, bg } = cfg[source];
  return `<span style="font-size:0.65rem;font-weight:600;padding:0.1rem 0.4rem;border-radius:0.2rem;background:${bg};color:${color};letter-spacing:0.03em">${label}</span>`;
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
  const color = pct >= 0.7 ? '#dc3545' : pct >= 0.4 ? '#fd7e14' : '#198754';
  const label = pct >= 0.7 ? 'High Need' : pct >= 0.4 ? 'Moderate' : 'Lower Need';
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:0.3rem">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="#e9ecef" stroke-width="6"/>
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="6"
          stroke-dasharray="${dash} ${gap}" stroke-linecap="round"
          transform="rotate(-90 36 36)"/>
        <text x="36" y="40" text-anchor="middle" font-size="13" font-weight="700" fill="${color}">${(pct * 100).toFixed(0)}</text>
      </svg>
      <span style="font-size:0.7rem;font-weight:600;color:${color}">${label}</span>
    </div>`;
}

/** Completeness ring */
function completenessRing(available: number, total: number): string {
  const pct = total > 0 ? available / total : 0;
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = (pct * circ).toFixed(1);
  const gap = (circ - pct * circ).toFixed(1);
  const color = pct >= 0.7 ? '#198754' : pct >= 0.4 ? '#fd7e14' : '#dc3545';
  return `
    <svg width="56" height="56" viewBox="0 0 56 56" style="flex-shrink:0">
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="#e9ecef" stroke-width="5"/>
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="5"
        stroke-dasharray="${dash} ${gap}" stroke-linecap="round"
        transform="rotate(-90 28 28)"/>
      <text x="28" y="32" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${Math.round(pct * 100)}%</text>
    </svg>`;
}

/** A rich metric tile used in the detail cards */
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
  const { text, bg, dot } = LEVEL_COLORS[level];
  const isNA = rawVal === null || rawVal === undefined;
  const barHtml = showBar && !isNA && barMax ? miniBar(rawVal, level, barMax) : '';
  const delta = !isNA ? deltaArrow(rawVal, avg, invert) : '';
  return `
    <div style="background:${isNA ? '#f8f9fa' : bg}20;border:1px solid ${isNA ? '#e9ecef' : dot}30;border-radius:0.5rem;padding:0.85rem;position:relative">
      <div style="font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${isNA ? '#adb5bd' : text};margin-bottom:0.3rem">${escapeHtml(label)}</div>
      <div style="font-size:1.5rem;font-weight:800;color:${isNA ? '#adb5bd' : text};line-height:1">${isNA ? '—' : displayVal}</div>
      ${barHtml}
      ${avg !== undefined || note ? `<div style="font-size:0.7rem;color:#6c757d;margin-top:0.4rem">${note ?? ''}${delta}</div>` : ''}
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
  // Summary stats
  const total = items.length;
  const groupCounts = { HIC: 0, UMC: 0, LMC: 0, LIC: 0 };
  for (const { country: c } of items) groupCounts[c.stats.incomeGroup]++;
  const avgCoverage = total > 0
    ? Math.round((items.reduce((s, i) => s + i.completeness.available / i.completeness.total, 0) / total) * 100)
    : 0;

  const summaryCards = ['HIC', 'UMC', 'LMC', 'LIC'].map((g) => {
    const m = GROUP_META[g]!;
    return `
      <div style="background:${m.bg};border-radius:0.5rem;padding:0.85rem 1rem;border:1px solid ${m.border}30">
        <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${m.color}">${escapeHtml(m.label)}</div>
        <div style="font-size:2rem;font-weight:800;color:${m.color};line-height:1.1">${groupCounts[g as keyof typeof groupCounts]}</div>
        <div style="font-size:0.75rem;color:${m.color}99">countries</div>
      </div>`;
  }).join('');

  const rows = items.map(({ country: c, completeness: comp }) => {
    const m = GROUP_META[c.stats.incomeGroup] ?? GROUP_META.LIC!;
    const pct = comp.total > 0 ? Math.round((comp.available / comp.total) * 100) : 0;
    const barColor = pct >= 70 ? '#198754' : pct >= 40 ? '#fd7e14' : '#dc3545';
    return `
      <tr style="border-left:3px solid ${m.border}">
        <td style="padding-left:0.75rem"><span style="font-family:monospace;font-weight:700;font-size:0.9rem;color:#495057">${escapeHtml(c.code)}</span></td>
        <td><a href="/admin/countries/${escapeHtml(c.code)}" style="color:#0d6efd;font-weight:500;text-decoration:none">${escapeHtml(c.name)}</a></td>
        <td>${incomeGroupBadge(c.stats.incomeGroup)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:#495057">${fmtLarge(c.stats.population)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:#495057">$${c.stats.gdpPerCapitaUsd.toLocaleString('en-US')}</td>
        <td>
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div style="width:80px;background:#e9ecef;border-radius:3px;height:6px">
              <div style="width:${pct}%;background:${barColor};height:6px;border-radius:3px"></div>
            </div>
            <span style="font-size:0.75rem;color:#6c757d;min-width:2.5rem">${pct}%</span>
          </div>
        </td>
        <td><a href="/admin/countries/${escapeHtml(c.code)}" style="display:inline-block;padding:0.2rem 0.6rem;background:#0d6efd;color:#fff;border-radius:0.25rem;font-size:0.75rem;font-weight:600;text-decoration:none">View →</a></td>
      </tr>`;
  }).join('');

  return layout(
    'Countries — Economic Profiles',
    `
    <style>
      .countries-hero { background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);color:#fff;border-radius:0.75rem;padding:2rem;margin-top:1rem;margin-bottom:1.5rem }
      .countries-table tr:hover { background:#f8f9fa }
      .countries-table td { vertical-align:middle }
    </style>

    <div class="countries-hero">
      <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#7eb8f7;margin-bottom:0.4rem">Open Global Income · Phase 14</div>
      <h1 style="margin:0 0 0.25rem;font-size:1.75rem;font-weight:800">Country Economic Profiles</h1>
      <p style="margin:0 0 1.25rem;color:#a8c8f8;font-size:0.9rem">${total} countries · World Bank + ILO + IMF · ${avgCoverage}% avg macro-indicator coverage · <code style="background:#ffffff15;padding:0.1rem 0.35rem;border-radius:0.2rem;font-size:0.8rem">${escapeHtml(dataVersion)}</code></p>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem">${summaryCards}</div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <table class="countries-table" style="font-size:0.88rem">
        <thead>
          <tr style="background:#f8f9fa;border-bottom:2px solid #dee2e6">
            <th style="padding:0.65rem 0.75rem;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:#6c757d">Code</th>
            <th style="padding:0.65rem 0.75rem;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:#6c757d">Country</th>
            <th style="padding:0.65rem 0.75rem;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:#6c757d">Income Group</th>
            <th style="padding:0.65rem 0.75rem;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:#6c757d;text-align:right">Population</th>
            <th style="padding:0.65rem 0.75rem;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:#6c757d;text-align:right">GDP / Capita</th>
            <th style="padding:0.65rem 0.75rem;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:#6c757d">Macro Coverage</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`,
    username,
  );
}

export function renderCountryDetail(
  country: Country,
  completeness: DataCompleteness,
  allCountries: Country[],
  dataVersion: string,
  username?: string,
): string {
  const s = country.stats;
  const group = s.incomeGroup;
  const gm = GROUP_META[group] ?? GROUP_META.LIC!;

  // Entitlement calculation
  const entitlement = calculateEntitlement(country, dataVersion);

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

  // ── Hero ──────────────────────────────────────────────────────────────────
  const needColor = entitlement.score >= 0.7 ? '#ff6b6b' : entitlement.score >= 0.4 ? '#ffd43b' : '#69db7c';
  const localFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  const hero = `
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 55%,#0f3460 100%);color:#fff;border-radius:0.75rem;padding:2rem;margin-top:1rem;margin-bottom:1.5rem">
      <a href="/admin/countries" style="display:inline-flex;align-items:center;gap:0.3rem;color:#7eb8f7;font-size:0.8rem;text-decoration:none;margin-bottom:1rem">← All Countries</a>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem">
        <div>
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.3rem">
            <h1 style="margin:0;font-size:2rem;font-weight:800">${escapeHtml(country.name)}</h1>
            <code style="background:#ffffff15;padding:0.2rem 0.5rem;border-radius:0.3rem;font-size:1rem;color:#a8c8f8">${escapeHtml(country.code)}</code>
          </div>
          ${incomeGroupPill(group)}
          <div style="display:grid;grid-template-columns:repeat(3,auto);gap:1.5rem;margin-top:1.25rem">
            <div>
              <div style="font-size:0.7rem;color:#7eb8f7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.15rem">UBI Floor / month</div>
              <div style="font-size:1.5rem;font-weight:800">$${entitlement.pppUsdPerMonth} <span style="font-size:0.85rem;color:#a8c8f8;font-weight:400">PPP-USD</span></div>
              <div style="font-size:0.85rem;color:#a8c8f8;margin-top:0.15rem">${localFmt.format(entitlement.localCurrencyPerMonth)} local</div>
            </div>
            <div>
              <div style="font-size:0.7rem;color:#7eb8f7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.15rem">GDP / Capita</div>
              <div style="font-size:1.5rem;font-weight:800">$${s.gdpPerCapitaUsd.toLocaleString('en-US')}</div>
            </div>
            <div>
              <div style="font-size:0.7rem;color:#7eb8f7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.15rem">Population</div>
              <div style="font-size:1.5rem;font-weight:800">${fmtLarge(s.population)}</div>
            </div>
          </div>
        </div>
        <div style="text-align:center">
          <div style="font-size:0.7rem;color:#7eb8f7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.5rem">Need Score</div>
          ${scoreRing(entitlement.score)}
          <div style="font-size:0.75rem;color:#a8c8f8;margin-top:0.25rem">${(entitlement.score * 100).toFixed(1)} / 100</div>
        </div>
      </div>
    </div>`;

  // ── Section helper ────────────────────────────────────────────────────────
  function section(title: string, badge: string, icon: string, tiles: string): string {
    return `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.85rem 1.25rem;border-bottom:1px solid #f0f0f0;background:#fafafa">
          <span style="font-size:1rem">${icon}</span>
          <h2 style="margin:0;font-size:0.9rem;font-weight:700;color:#343a40">${escapeHtml(title)}</h2>
          ${badge}
        </div>
        <div style="padding:1rem 1.25rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0.75rem">${tiles}</div>
      </div>`;
  }

  // ── Core Economics ────────────────────────────────────────────────────────
  const coreSection = section('Core Economics', sourceBadge('wb'), '📈', [
    tile('GDP / Capita', s.gdpPerCapitaUsd, `$${s.gdpPerCapitaUsd.toLocaleString('en-US')}`, 'neutral', undefined, undefined, undefined, false),
    tile('GNI / Capita', s.gniPerCapitaUsd, `$${s.gniPerCapitaUsd.toLocaleString('en-US')}`, 'neutral', undefined, undefined, undefined, false),
    tile('PPP Factor', s.pppConversionFactor, `${s.pppConversionFactor.toFixed(2)}`, 'neutral', undefined, undefined, undefined, false),
    tile('Gini Index', s.giniIndex, s.giniIndex !== null && s.giniIndex !== undefined ? `${s.giniIndex}` : '—',
      s.giniIndex !== null && s.giniIndex !== undefined
        ? getLevel(s.giniIndex, { good: 35, warn: 45, invert: true })
        : 'neutral', undefined, undefined, 100),
    tile('Population', s.population, fmtLarge(s.population), 'neutral', undefined, undefined, undefined, false),
  ].join(''));

  // ── Fiscal ────────────────────────────────────────────────────────────────
  const fiscalSection = section('Fiscal Capacity', sourceBadge('wb'), '🏦', [
    tile('Tax Revenue', s.taxRevenuePercentGdp,
      fmt(s.taxRevenuePercentGdp, 1, '% GDP'),
      getLevel(s.taxRevenuePercentGdp, { good: 20, warn: 10 }),
      avg('taxRevenuePercentGdp'), undefined, 50),
    tile('Govt Debt', s.governmentDebtPercentGdp,
      fmt(s.governmentDebtPercentGdp, 1, '% GDP'),
      getLevel(s.governmentDebtPercentGdp, { good: 60, warn: 90, invert: true }),
      avg('governmentDebtPercentGdp'), undefined, 150, true, true),
    tile('GDP Growth', s.gdpGrowthRate,
      fmt(s.gdpGrowthRate, 1, '%'),
      getLevel(s.gdpGrowthRate, { good: 3, warn: 0 }),
      avg('gdpGrowthRate'), undefined, undefined, false),
    tile('Social Spending', s.socialProtectionSpendingPercentGdp,
      fmt(s.socialProtectionSpendingPercentGdp, 1, '% GDP'),
      'neutral',
      avg('socialProtectionSpendingPercentGdp'), undefined, 30),
    tile('Social Contributions', s.socialContributionsPercentRevenue,
      fmt(s.socialContributionsPercentRevenue, 1, '% rev.'),
      'neutral',
      avg('socialContributionsPercentRevenue'), undefined, 50),
  ].join(''));

  // ── Social Protection ─────────────────────────────────────────────────────
  const socialSection = section('Social Protection', sourceBadge('ilo'), '🛡️', [
    tile('Population Coverage', s.socialProtectionCoveragePercent,
      fmt(s.socialProtectionCoveragePercent, 1, '%'),
      getLevel(s.socialProtectionCoveragePercent, { good: 70, warn: 40 }),
      avg('socialProtectionCoveragePercent'), undefined, 100),
    tile('ILO Expenditure', s.socialProtectionExpenditureIloPercentGdp,
      fmt(s.socialProtectionExpenditureIloPercentGdp, 1, '% GDP'),
      'neutral', undefined, undefined, 30),
    tile('Pension Coverage', s.pensionCoveragePercent,
      fmt(s.pensionCoveragePercent, 1, '%'),
      getLevel(s.pensionCoveragePercent, { good: 60, warn: 30 }),
      avg('pensionCoveragePercent'), undefined, 100),
    tile('Child Benefit Coverage', s.childBenefitCoveragePercent,
      fmt(s.childBenefitCoveragePercent, 1, '%'),
      getLevel(s.childBenefitCoveragePercent, { good: 60, warn: 20 }),
      avg('childBenefitCoveragePercent'), undefined, 100),
  ].join(''));

  // ── Labor & Poverty ───────────────────────────────────────────────────────
  const laborSection = section('Labor & Poverty', sourceBadge('wb'), '👷', [
    tile('Labor Participation', s.laborForceParticipation,
      fmt(s.laborForceParticipation, 1, '%'),
      getLevel(s.laborForceParticipation, { good: 60, warn: 50 }),
      avg('laborForceParticipation'), undefined, 100),
    tile('Unemployment', s.unemploymentRate,
      fmt(s.unemploymentRate, 1, '%'),
      getLevel(s.unemploymentRate, { good: 5, warn: 10, invert: true }),
      avg('unemploymentRate'), undefined, 30, true, true),
    tile('Poverty <$2.15/day', s.povertyHeadcountRatio,
      fmt(s.povertyHeadcountRatio, 1, '%'),
      getLevel(s.povertyHeadcountRatio, { good: 3, warn: 15, invert: true }),
      avg('povertyHeadcountRatio'), undefined, 80, true, true),
    tile('Inflation', s.inflationRate,
      fmt(s.inflationRate, 1, '%'),
      getLevel(s.inflationRate, { good: 3, warn: 8, invert: true }),
      avg('inflationRate'), undefined, undefined, false, true),
    tile('Urbanization', s.urbanizationRate,
      fmt(s.urbanizationRate, 1, '%'),
      'neutral', avg('urbanizationRate'), undefined, 100),
  ].join(''));

  // ── Public Expenditure ────────────────────────────────────────────────────
  const expendSection = section('Public Expenditure', sourceBadge('wb'), '📊', [
    tile('Health Spending', s.healthExpenditurePercentGdp,
      fmt(s.healthExpenditurePercentGdp, 1, '% GDP'),
      getLevel(s.healthExpenditurePercentGdp, { good: 5, warn: 3 }),
      avg('healthExpenditurePercentGdp'), undefined, 20),
    tile('Education Spending', s.educationExpenditurePercentGdp,
      fmt(s.educationExpenditurePercentGdp, 1, '% GDP'),
      getLevel(s.educationExpenditurePercentGdp, { good: 4, warn: 2 }),
      avg('educationExpenditurePercentGdp'), undefined, 15),
    tile('Gini Index', s.giniIndex,
      fmt(s.giniIndex, 1),
      getLevel(s.giniIndex, { good: 30, warn: 45, invert: true }),
      undefined, 'inequality (0–100)', 100, true, true),
    tile('PPP Factor', s.pppConversionFactor,
      fmt(s.pppConversionFactor, 2),
      'neutral', undefined, 'local per intl $', undefined, false),
  ].join(''));

  // ── IMF Tax Breakdown ─────────────────────────────────────────────────────
  const taxBreakdown = s.taxBreakdown ? section('Tax Revenue Breakdown', sourceBadge('imf'), '📋', [
    tile('Income Tax', s.taxBreakdown.incomeTaxPercentGdp,
      fmt(s.taxBreakdown.incomeTaxPercentGdp, 1, '% GDP'),
      'neutral', undefined, undefined, 20),
    tile('VAT / Sales Tax', s.taxBreakdown.vatPercentGdp,
      fmt(s.taxBreakdown.vatPercentGdp, 1, '% GDP'),
      'neutral', undefined, undefined, 20),
    tile('Trade Taxes', s.taxBreakdown.tradeTaxPercentGdp,
      fmt(s.taxBreakdown.tradeTaxPercentGdp, 1, '% GDP'),
      'neutral', undefined, undefined, 10),
    tile('Other Taxes', s.taxBreakdown.otherTaxPercentGdp,
      fmt(s.taxBreakdown.otherTaxPercentGdp, 1, '% GDP'),
      'neutral', undefined, undefined, 10),
  ].join('')) : '';

  // ── Data Completeness ─────────────────────────────────────────────────────
  const pct = Math.round((completeness.available / completeness.total) * 100);
  const missingHtml = completeness.missingFields.length > 0
    ? `<details style="margin-top:0.5rem">
        <summary style="cursor:pointer;color:#6c757d;font-size:0.8rem;list-style:none">
          ▸ ${completeness.missingFields.length} indicators not yet available
        </summary>
        <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.5rem">
          ${completeness.missingFields.map((f) => `<span style="font-size:0.7rem;background:#f8f9fa;border:1px solid #dee2e6;border-radius:0.25rem;padding:0.1rem 0.4rem;color:#6c757d">${escapeHtml(f)}</span>`).join('')}
        </div>
      </details>`
    : `<div style="color:#198754;font-size:0.85rem;margin-top:0.4rem">✓ All optional macro indicators available</div>`;

  const completenessSection = `
    <div class="card">
      <div style="display:flex;align-items:center;gap:0.5rem;padding:0.85rem 1.25rem;border-bottom:1px solid #f0f0f0;background:#fafafa;border-radius:0.5rem 0.5rem 0 0">
        <span style="font-size:1rem">📋</span>
        <h2 style="margin:0;font-size:0.9rem;font-weight:700;color:#343a40">Data Completeness</h2>
      </div>
      <div style="padding:1rem 1.25rem;display:flex;align-items:center;gap:1rem">
        ${completenessRing(completeness.available, completeness.total)}
        <div style="flex:1">
          <div style="font-weight:700;font-size:0.95rem;color:#343a40">${completeness.available} of ${completeness.total} optional indicators available (${pct}%)</div>
          <div style="font-size:0.78rem;color:#6c757d;margin-top:0.1rem">Sources: World Bank · ILO · IMF · Data version: <code>${escapeHtml(dataVersion)}</code></div>
          ${missingHtml}
        </div>
      </div>
    </div>`;

  return layout(
    `${country.name} — Economic Profile`,
    `
    <style>
      .card { box-shadow:0 1px 4px rgba(0,0,0,0.06) }
    </style>
    ${hero}
    ${coreSection}
    ${fiscalSection}
    ${socialSection}
    ${laborSection}
    ${expendSection}
    ${taxBreakdown}
    ${completenessSection}
    `,
    username,
  );
}
