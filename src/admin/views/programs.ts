/**
 * Program Brief views — Phase 1 UX overhaul.
 *
 * A "Program Brief" stitches an existing simulation + optional funding
 * scenario + optional impact analysis + optional pilot into a single
 * stakeholder-facing document ready to print or hand to a donor.
 */
import { layout } from './layout.js';
import {
  escapeHtml,
  formatNumber,
  formatCompact,
  formatPercent,
  formatDate,
  renderCitations,
  renderCitationSup,
  renderDrawer,
} from './helpers.js';
import { stackedBarChart } from './chart-helpers.js';
import { t } from '../../i18n/index.js';
import { packageVersion } from '../../config.js';
import type { ProgramRecord } from '../../db/programs-db.js';
import type {
  Country,
  Region,
  SavedSimulation,
  SavedFundingScenario,
  SavedImpactAnalysis,
  Pilot,
  FiscalContext,
} from '../../core/types.js';

// ---------------------------------------------------------------------------
// Types shared with route handlers
// ---------------------------------------------------------------------------

export interface ProgramDetailContext {
  program: ProgramRecord;
  country: Country;
  region: Region | null;
  simulation: SavedSimulation | null;
  fundingScenario: SavedFundingScenario | null;
  impactAnalysis: SavedImpactAnalysis | null;
  pilot: Pilot | null;
  fiscalContext: FiscalContext | null;
}

export interface ProgramNewChoices {
  countries: Country[];
  simulations: SavedSimulation[];
  fundingScenarios: SavedFundingScenario[];
  impactAnalyses: SavedImpactAnalysis[];
  pilots: Pilot[];
  regions: Region[];
  preselect?: {
    countryCode?: string;
    simulationId?: string;
    fundingScenarioId?: string;
    impactAnalysisId?: string;
    pilotId?: string;
  };
}

export interface ProgramListItem {
  program: ProgramRecord;
  countryName: string;
  hasSimulation: boolean;
  hasFunding: boolean;
  hasImpact: boolean;
  hasPilot: boolean;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function countryOptions(countries: Country[], selected?: string): string {
  return countries
    .map(
      (c) =>
        `<option value="${escapeHtml(c.code)}"${c.code === selected ? ' selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`,
    )
    .join('');
}

function simulationOptions(sims: SavedSimulation[], countryCode?: string, selected?: string): string {
  const filtered = countryCode ? sims.filter(s => s.countryCode === countryCode) : sims;
  const rows = filtered.map(
    (s) =>
      `<option value="${escapeHtml(s.id)}"${s.id === selected ? ' selected' : ''}>${s.name ? escapeHtml(s.name) : escapeHtml(s.id.slice(0, 8))} — ${escapeHtml(s.countryCode)}</option>`,
  );
  return `<option value="">${t('common.none')}</option>${rows.join('')}`;
}

function fundingOptions(scenarios: SavedFundingScenario[], countryCode?: string, selected?: string): string {
  const filtered = countryCode ? scenarios.filter(s => s.countryCode === countryCode) : scenarios;
  const rows = filtered.map(
    (s) =>
      `<option value="${escapeHtml(s.id)}"${s.id === selected ? ' selected' : ''}>${s.name ? escapeHtml(s.name) : escapeHtml(s.id.slice(0, 8))}</option>`,
  );
  return `<option value="">${t('common.none')}</option>${rows.join('')}`;
}

function impactOptions(analyses: SavedImpactAnalysis[], countryCode?: string, selected?: string): string {
  const filtered = countryCode ? analyses.filter(a => a.countryCode === countryCode) : analyses;
  const rows = filtered.map(
    (a) =>
      `<option value="${escapeHtml(a.id)}"${a.id === selected ? ' selected' : ''}>${a.name ? escapeHtml(a.name) : escapeHtml(a.id.slice(0, 8))}</option>`,
  );
  return `<option value="">${t('common.none')}</option>${rows.join('')}`;
}

function pilotOptions(pilots: Pilot[], countryCode?: string, selected?: string): string {
  const filtered = countryCode ? pilots.filter(p => p.countryCode === countryCode) : pilots;
  const rows = filtered.map(
    (p) =>
      `<option value="${escapeHtml(p.id)}"${p.id === selected ? ' selected' : ''}>${escapeHtml(p.name)} (${escapeHtml(p.status)})</option>`,
  );
  return `<option value="">${t('common.none')}</option>${rows.join('')}`;
}

function regionOptions(regions: Region[], countryCode?: string, selected?: string): string {
  const filtered = countryCode ? regions.filter(r => r.countryCode === countryCode) : regions;
  if (filtered.length === 0) return '';
  const rows = filtered.map(
    (r) =>
      `<option value="${escapeHtml(r.id)}"${r.id === selected ? ' selected' : ''}>${escapeHtml(r.name)}</option>`,
  );
  return `<option value="">${t('common.none')}</option>${rows.join('')}`;
}

function linkBadge(active: boolean, label: string): string {
  return active
    ? `<span class="badge badge-success">${escapeHtml(label)}</span>`
    : `<span class="badge badge-neutral">${escapeHtml(label)} —</span>`;
}

function fmtCurrencyCompact(n: number, currency = 'USD'): string {
  const sym = currency === 'USD' ? '$' : `${currency} `;
  return `${sym}${formatCompact(n)}`;
}

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

export function renderProgramsList(items: ProgramListItem[], flash?: string): string {
  const title = t('programs.title');

  const rows = items.length === 0
    ? `<tr><td colspan="6" class="text-muted">
         ${t('programs.empty')} —
         <a href="/admin/programs/new">${t('programs.emptyCta')}</a>
       </td></tr>`
    : items.map(({ program, countryName, hasSimulation, hasFunding, hasImpact, hasPilot }) => `
        <tr>
          <td><a href="/admin/programs/${escapeHtml(program.id)}">${escapeHtml(program.name)}</a></td>
          <td>${escapeHtml(countryName)} (${escapeHtml(program.countryCode)})</td>
          <td>
            ${linkBadge(hasSimulation, 'sim')}
            ${linkBadge(hasFunding, 'fund')}
            ${linkBadge(hasImpact, 'impact')}
            ${linkBadge(hasPilot, 'pilot')}
          </td>
          <td>${formatDate(program.updatedAt)}</td>
          <td>
            <form method="post" action="/admin/programs/${escapeHtml(program.id)}/delete" class="form-inline" onsubmit="return confirm('Delete this brief?')">
              <button type="submit" class="btn btn-danger btn-sm">${t('common.ellipsis') ? t('impact.deleteButton') : 'Delete'}</button>
            </form>
          </td>
        </tr>`).join('');

  const flashHtml = flash ? `<div class="alert alert-success">${escapeHtml(flash)}</div>` : '';

  const content = `
    <div class="page-header">
      <h1>${escapeHtml(title)}</h1>
      <div class="page-header-actions">
        <a href="/admin/programs/new" class="btn btn-primary">${escapeHtml(t('programs.new'))}</a>
      </div>
    </div>
    ${flashHtml}
    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>${escapeHtml(t('programs.colName') || 'Name')}</th>
            <th>${escapeHtml(t('programs.colCountry') || 'Country')}</th>
            <th>${escapeHtml(t('programs.colLinks') || 'Linked')}</th>
            <th>${escapeHtml(t('programs.colUpdated') || 'Updated')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  return layout(title, content, {
    activePage: 'programs',
    breadcrumbs: [{ label: t('programs.title') }],
  });
}

// ---------------------------------------------------------------------------
// New brief form
// ---------------------------------------------------------------------------

export function renderProgramNew(choices: ProgramNewChoices): string {
  const title = t('programs.new');
  const preselect = choices.preselect ?? {};
  const country = preselect.countryCode ?? (choices.countries[0]?.code);

  const content = `
    <div class="page-header">
      <h1>${escapeHtml(title)}</h1>
    </div>
    <div class="card">
      <form method="post" action="/admin/programs" class="form-stacked">
        <div class="form-group">
          <label for="name">${escapeHtml(t('programs.fieldName') || 'Brief name')}</label>
          <input type="text" name="name" id="name" class="input" required
                 placeholder="Kenya UBI pilot — 2026 plan">
        </div>
        <div class="form-group">
          <label for="country">${escapeHtml(t('nav.countries'))}</label>
          <select name="country" id="country" class="input" required>
            ${countryOptions(choices.countries, country)}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="simulationId">${escapeHtml(t('nav.simulate'))}</label>
            <select name="simulationId" id="simulationId" class="input">
              ${simulationOptions(choices.simulations, country, preselect.simulationId)}
            </select>
          </div>
          <div class="form-group">
            <label for="fundingScenarioId">${escapeHtml(t('nav.funding'))}</label>
            <select name="fundingScenarioId" id="fundingScenarioId" class="input">
              ${fundingOptions(choices.fundingScenarios, country, preselect.fundingScenarioId)}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="impactAnalysisId">${escapeHtml(t('nav.impact'))}</label>
            <select name="impactAnalysisId" id="impactAnalysisId" class="input">
              ${impactOptions(choices.impactAnalyses, country, preselect.impactAnalysisId)}
            </select>
          </div>
          <div class="form-group">
            <label for="pilotId">${escapeHtml(t('nav.pilots'))}</label>
            <select name="pilotId" id="pilotId" class="input">
              ${pilotOptions(choices.pilots, country, preselect.pilotId)}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="regionId">${escapeHtml(t('nav.regions'))}</label>
          <select name="regionId" id="regionId" class="input">
            ${regionOptions(choices.regions, country)}
          </select>
        </div>
        <div class="form-group">
          <label for="notes">${escapeHtml(t('common.notes') || 'Notes (optional)')}</label>
          <textarea name="notes" id="notes" class="input" rows="3"></textarea>
        </div>
        <div class="form-actions">
          <a href="/admin/programs" class="btn btn-secondary">${escapeHtml(t('common.back'))}</a>
          <button type="submit" class="btn btn-primary">${escapeHtml(t('programs.new'))}</button>
        </div>
      </form>
    </div>`;

  return layout(title, content, {
    activePage: 'programs',
    breadcrumbs: [
      { label: t('programs.title'), href: '/admin/programs' },
      { label: t('programs.new') },
    ],
  });
}

// ---------------------------------------------------------------------------
// Detail page sections (shared with print variant)
// ---------------------------------------------------------------------------

function heroSection(ctx: ProgramDetailContext): string {
  const sim = ctx.simulation;
  const impact = ctx.impactAnalysis;
  const country = ctx.country;

  // Pull headline numbers from the first available source. SimulationResult
  // and ImpactAnalysisResult use different shapes, so read each explicitly.
  const monthlyPppUsd = sim?.results.simulation.entitlementPerPerson.pppUsdPerMonth
    ?? impact?.results.program.monthlyAmountPppUsd
    ?? 0;
  const annualCost = sim?.results.simulation.cost.annualPppUsd
    ?? impact?.results.program.annualCostPppUsd
    ?? 0;
  const recipients = sim?.results.simulation.recipientCount
    ?? impact?.results.program.recipientCount
    ?? 0;
  const coverage = sim?.results.simulation.coverageRate
    ?? impact?.results.program.coverageRate
    ?? 0;

  const regionLabel = ctx.region ? ` · ${escapeHtml(ctx.region.name)}` : '';

  return `
    <section class="program-hero">
      <div class="program-hero-country">${escapeHtml(country.name)} (${escapeHtml(country.code)})${regionLabel}</div>
      <h1 class="program-hero-title">${escapeHtml(ctx.program.name)}</h1>
      <div class="program-hero-subtitle">
        ${formatPercent(coverage * 100, 0)} coverage · ${formatNumber(recipients)} recipients
      </div>
      <div class="program-hero-tiles">
        <div class="impact-tile">
          <div class="impact-tile-label">Monthly transfer</div>
          <div class="impact-tile-value">$${monthlyPppUsd.toFixed(0)}</div>
          <div class="impact-tile-note">PPP-USD per person</div>
        </div>
        <div class="impact-tile">
          <div class="impact-tile-label">Annual cost</div>
          <div class="impact-tile-value">${fmtCurrencyCompact(annualCost)}</div>
          <div class="impact-tile-note">PPP-USD total</div>
        </div>
        <div class="impact-tile">
          <div class="impact-tile-label">Recipients</div>
          <div class="impact-tile-value">${formatCompact(recipients)}</div>
          <div class="impact-tile-note">people reached</div>
        </div>
      </div>
    </section>`;
}

function fiscalSection(ctx: ProgramDetailContext): string {
  if (!ctx.fiscalContext) return '';
  const f = ctx.fiscalContext;
  const annualCost = ctx.simulation?.results.simulation.cost.annualPppUsd
    ?? ctx.impactAnalysis?.results.program.annualCostPppUsd
    ?? 0;
  const taxRev = f.totalTaxRevenue.absolutePppUsd;
  const social = f.currentSocialSpending.absolutePppUsd;
  const ubiPctTax = f.ubiAsPercentOfTaxRevenue;

  return `
    <section class="program-section fiscal-card">
      <h2 class="program-section-title">${escapeHtml(t('programs.section.fiscal'))}</h2>
      <div class="grid grid-3">
        <div class="impact-tile">
          <div class="impact-tile-label">Total tax revenue</div>
          <div class="impact-tile-value">${taxRev != null ? fmtCurrencyCompact(taxRev) : '—'}</div>
          <div class="impact-tile-note">${f.totalTaxRevenue.percentGdp != null ? `${formatPercent(f.totalTaxRevenue.percentGdp, 1)} of GDP` : 'no data'}</div>
        </div>
        <div class="impact-tile">
          <div class="impact-tile-label">Current social spending</div>
          <div class="impact-tile-value">${social != null ? fmtCurrencyCompact(social) : '—'}</div>
          <div class="impact-tile-note">${f.currentSocialSpending.percentGdp != null ? `${formatPercent(f.currentSocialSpending.percentGdp, 1)} of GDP` : 'no data'}</div>
        </div>
        <div class="impact-tile">
          <div class="impact-tile-label">UBI vs tax revenue</div>
          <div class="impact-tile-value">${ubiPctTax != null ? formatPercent(ubiPctTax * 100, 0) : '—'}</div>
          <div class="impact-tile-note">${fmtCurrencyCompact(annualCost)} annual cost</div>
        </div>
      </div>
    </section>`;
}

function fundingSection(ctx: ProgramDetailContext): string {
  if (!ctx.fundingScenario) return '';
  const r = ctx.fundingScenario.results;

  const chart = stackedBarChart(
    [ctx.country.name],
    r.mechanisms.map((m) => ({
      label: m.label,
      data: [m.annualRevenuePppUsd],
      stack: 'funding',
    })),
    {
      height: 280,
      exportFilename: `funding-${ctx.country.code.toLowerCase()}`,
      chartOptions: {
        plugins: { legend: { position: 'right' } },
        scales: { x: { stacked: true }, y: { stacked: true } },
      },
    },
  );

  const mechanismRows = r.mechanisms.map(m => `
    <tr>
      <td>${escapeHtml(m.label)}</td>
      <td>${fmtCurrencyCompact(m.annualRevenuePppUsd)}</td>
      <td>${formatPercent(m.coversPercentOfUbiCost * 100, 0)}</td>
    </tr>`).join('');

  return `
    <section class="program-section">
      <h2 class="program-section-title">${escapeHtml(t('programs.section.funding'))}</h2>
      <div class="grid grid-2">
        <div>${chart}</div>
        <table class="table">
          <thead>
            <tr>
              <th>Mechanism</th>
              <th>Revenue</th>
              <th>Covers % UBI</th>
            </tr>
          </thead>
          <tbody>${mechanismRows}</tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td><strong>${fmtCurrencyCompact(r.totalRevenuePppUsd)}</strong></td>
              <td><strong>${formatPercent(r.coverageOfUbiCost * 100, 0)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="text-muted">
        Gap: <strong>${fmtCurrencyCompact(Math.max(0, r.gapPppUsd))}</strong> unfunded annually.
      </p>
    </section>`;
}

function impactSection(ctx: ProgramDetailContext): string {
  if (!ctx.impactAnalysis) return '';
  const r = ctx.impactAnalysis.results;
  const citations = r.policyBrief.citations;

  const firstCiteId = citations[0]?.id;
  const sup = firstCiteId ? renderCitationSup(firstCiteId) : '';

  return `
    <section class="program-section">
      <h2 class="program-section-title">${escapeHtml(t('programs.section.impact'))}</h2>
      <div class="grid grid-4">
        <div class="impact-tile">
          <div class="impact-tile-label">Poverty reduction${sup}</div>
          <div class="impact-tile-value">${formatCompact(r.povertyReduction.estimatedLifted)}</div>
          <div class="impact-tile-note">people lifted above poverty line</div>
        </div>
        <div class="impact-tile">
          <div class="impact-tile-label">Purchasing power</div>
          <div class="impact-tile-value">+${r.purchasingPower.incomeIncreasePercent.toFixed(0)}%</div>
          <div class="impact-tile-note">income increase, bottom quintile</div>
        </div>
        <div class="impact-tile">
          <div class="impact-tile-label">Social coverage</div>
          <div class="impact-tile-value">${formatCompact(r.socialCoverage.estimatedNewlyCovered)}</div>
          <div class="impact-tile-note">newly reached</div>
        </div>
        <div class="impact-tile">
          <div class="impact-tile-label">GDP stimulus</div>
          <div class="impact-tile-value">${r.fiscalMultiplier.multiplier.toFixed(1)}×</div>
          <div class="impact-tile-note">fiscal multiplier</div>
        </div>
      </div>
    </section>`;
}

function regionalSection(ctx: ProgramDetailContext): string {
  if (!ctx.region) return '';
  const r = ctx.region;
  return `
    <section class="program-section">
      <h2 class="program-section-title">${escapeHtml(t('programs.section.regional'))}</h2>
      <div class="grid grid-3">
        <div class="impact-tile">
          <div class="impact-tile-label">Region</div>
          <div class="impact-tile-value" style="font-size:1.25rem">${escapeHtml(r.name)}</div>
          <div class="impact-tile-note">${escapeHtml(r.stats.urbanRural)}</div>
        </div>
        <div class="impact-tile">
          <div class="impact-tile-label">Cost-of-living index</div>
          <div class="impact-tile-value">${r.stats.costOfLivingIndex.toFixed(2)}</div>
          <div class="impact-tile-note">relative to national avg (1.00)</div>
        </div>
        <div class="impact-tile">
          <div class="impact-tile-label">Population</div>
          <div class="impact-tile-value">${formatCompact(r.stats.population)}</div>
          <div class="impact-tile-note">residents</div>
        </div>
      </div>
      <p class="text-muted">
        A choropleth map is planned for Phase 4. Until then, this section summarises
        the regional data that drove the cost-of-living adjustment.
      </p>
    </section>`;
}

function evidenceSection(ctx: ProgramDetailContext): string {
  if (!ctx.pilot) return '';
  return `
    <section class="program-section">
      <h2 class="program-section-title">${escapeHtml(t('programs.section.evidence'))}</h2>
      <p>
        Linked pilot: <strong>${escapeHtml(ctx.pilot.name)}</strong>
        (${escapeHtml(ctx.pilot.status)}).
        <a href="/admin/pilots/${escapeHtml(ctx.pilot.id)}">View pilot detail →</a>
      </p>
      <p class="text-muted">
        Recipient-vs-control outcome overlays render here once measurements are
        recorded for this pilot. See the pilot's Evidence tab to enter data.
      </p>
    </section>`;
}

function methodologySection(ctx: ProgramDetailContext): string {
  const brief = ctx.impactAnalysis?.results.policyBrief;
  if (!brief) {
    return `
      <section class="program-section">
        <h2 class="program-section-title">${escapeHtml(t('programs.section.methodology'))}</h2>
        <p class="text-muted">
          Link an impact analysis to this brief to surface full methodology,
          assumptions, caveats, and citations.
        </p>
      </section>`;
  }

  const methodologyList = Object.values(brief.methodology)
    .map(p => `<li>${escapeHtml(p)}</li>`)
    .join('');

  const drawerBody = `
    <h4>Assumptions</h4>
    <ul>${brief.assumptions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
    <h4>Caveats</h4>
    <ul>${brief.caveats.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`;

  return `
    <section class="program-section">
      <h2 class="program-section-title">${escapeHtml(t('programs.section.methodology'))}</h2>
      <ul>${methodologyList}</ul>
      ${renderDrawer('methodology-drawer', t('common.calculations'), 'Assumptions & caveats', drawerBody)}
      <h3>${escapeHtml(t('common.citations'))}</h3>
      ${renderCitations(brief.citations)}
    </section>`;
}

function exportRow(ctx: ProgramDetailContext): string {
  return `
    <section class="program-export-row no-print">
      <button type="button" class="btn btn-primary" onclick="window.print()">
        ${escapeHtml(t('programs.export.print'))}
      </button>
      ${ctx.impactAnalysis ? `
        <form method="post" action="/admin/impact/export" class="form-inline">
          <input type="hidden" name="resultJson" value="${escapeHtml(JSON.stringify(ctx.impactAnalysis.results))}">
          <button type="submit" class="btn btn-secondary">${escapeHtml(t('programs.export.brief'))}</button>
        </form>` : ''}
    </section>`;
}

function programBody(ctx: ProgramDetailContext): string {
  return `
    ${heroSection(ctx)}
    ${fiscalSection(ctx)}
    ${fundingSection(ctx)}
    ${impactSection(ctx)}
    ${regionalSection(ctx)}
    ${evidenceSection(ctx)}
    ${methodologySection(ctx)}
  `;
}

// ---------------------------------------------------------------------------
// Detail page
// ---------------------------------------------------------------------------

export function renderProgramDetail(ctx: ProgramDetailContext): string {
  const title = ctx.program.name;
  const content = `
    ${programBody(ctx)}
    ${exportRow(ctx)}
  `;
  return layout(title, content, {
    activePage: 'programs',
    breadcrumbs: [
      { label: t('programs.title'), href: '/admin/programs' },
      { label: ctx.program.name },
    ],
  });
}

// ---------------------------------------------------------------------------
// Print variant
// ---------------------------------------------------------------------------

export function renderProgramPrint(ctx: ProgramDetailContext): string {
  const title = `${ctx.program.name} — Program Brief`;
  const generatedAt = formatDate(new Date().toISOString());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <link href="/css/ogi.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="/js/charts.js" defer></script>
  <style>
    body { background: white; margin: 0; padding: 20mm; }
    .print-header { display: flex; justify-content: space-between; border-bottom: 1px solid #ccc; padding-bottom: 8px; margin-bottom: 16px; font-size: 0.875rem; color: #555; }
    .print-footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 0.75rem; color: #888; }
  </style>
</head>
<body>
  <div class="print-header">
    <span>${escapeHtml(ctx.country.name)} · ${escapeHtml(ctx.program.name)}</span>
    <span>${escapeHtml(generatedAt)}</span>
  </div>
  ${programBody(ctx)}
  <div class="print-footer">
    Open Global Income v${escapeHtml(packageVersion)} · Ruleset ${escapeHtml(ctx.impactAnalysis?.results.meta.rulesetVersion ?? 'n/a')}
  </div>
</body>
</html>`;
}
