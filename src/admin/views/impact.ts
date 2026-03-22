import { layout } from './layout.js';
import { escapeHtml, formatNumber, formatCompact, formatPercent } from './helpers.js';
import { t } from '../../i18n/index.js';
import type {
  Country,
  SavedSimulation,
  ImpactAnalysisResult,
  SavedImpactAnalysis,
  PovertyReductionEstimate,
  PurchasingPowerEstimate,
  SocialCoverageEstimate,
  FiscalMultiplierEstimate,
} from '../../core/types.js';

function fmtLarge(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return formatNumber(Math.round(n));
}

function fmtCurrency(n: number): string {
  return `$${fmtLarge(n)}`;
}

function dataQualityBadge(q: 'high' | 'medium' | 'low'): string {
  const cls: Record<string, string> = {
    high: 'badge-success',
    medium: 'badge-warning',
    low: 'badge-danger',
  };
  return `<span class="badge ${cls[q] ?? 'badge-neutral'}">${q}</span>`;
}

function countryOptions(countries: Country[], selected?: string): string {
  return countries
    .map(
      (c) =>
        `<option value="${escapeHtml(c.code)}"${c.code === selected ? ' selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`,
    )
    .join('');
}

function simulationOptions(sims: SavedSimulation[], selected?: string): string {
  const rows = sims.map(
    (s) =>
      `<option value="${escapeHtml(s.id)}"${s.id === selected ? ' selected' : ''}>${s.name ? escapeHtml(s.name) : escapeHtml(s.id.slice(0, 8))} — ${escapeHtml(s.countryCode)} (${(s.results.simulation.coverageRate * 100).toFixed(0)}% cov.)</option>`,
  );
  return `<option value="">${t('impact.inlineSimRunNew')}</option>` + rows.join('');
}

// ── Saved analyses table ────────────────────────────────────────────────

function savedAnalysesTable(analyses: SavedImpactAnalysis[]): string {
  if (analyses.length === 0) {
    return `<tr><td colspan="7" class="text-muted">${t('impact.noSavedAnalyses')}</td></tr>`;
  }
  return analyses
    .map(
      (a) => `
    <tr>
      <td class="mono">${escapeHtml(a.id.slice(0, 8))}${t('common.ellipsis')}</td>
      <td>${a.name ? escapeHtml(a.name) : t('common.none')}</td>
      <td>${escapeHtml(a.countryCode)}</td>
      <td>${fmtLarge(a.results.povertyReduction.estimatedLifted)}</td>
      <td>${a.results.purchasingPower.incomeIncreasePercent.toFixed(0)}%</td>
      <td>${fmtLarge(a.results.socialCoverage.estimatedNewlyCovered)}</td>
      <td>
        <form method="post" action="/admin/impact/delete" class="form-inline">
          <input type="hidden" name="id" value="${escapeHtml(a.id)}">
          <button type="submit" class="btn btn-danger btn-sm">${t('impact.deleteButton')}</button>
        </form>
      </td>
    </tr>`,
    )
    .join('');
}

// ── Main page ──────────────────────────────────────────────────────────

export function renderImpactPage(
  countries: Country[],
  savedSims: SavedSimulation[],
  savedAnalyses: SavedImpactAnalysis[],
  flash?: string,
): string {
  const opts = countryOptions(countries);
  const simOpts = simulationOptions(savedSims);
  const rows = savedAnalysesTable(savedAnalyses);

  return layout(
    t('impact.title'),
    `
    <div class="page-header">
      <h1>${t('impact.title')}</h1>
      <p class="text-muted">${t('impact.subtitle')}</p>
    </div>

    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}

    <div class="two-col">
      <!-- Config panel -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${t('impact.configureAnalysis')}</h2>
        </div>

        <div class="form-group mb-2">
          <label>${t('impact.linkSimulation')}</label>
          <select name="simulationId" id="sim-select"
            hx-on:change="document.getElementById('inline-params').style.display = this.value ? 'none' : 'block'">
            ${simOpts}
          </select>
        </div>

        <div id="inline-params">
          <div class="form-group mb-2">
            <label>${t('impact.country')}</label>
            <select name="country" id="country-select">${opts}</select>
          </div>

          <div class="grid grid-2 mb-2">
            <div class="form-group">
              <label>${t('impact.coveragePct')}</label>
              <input type="range" name="coverage" id="cov-range" min="1" max="100" value="20"
                oninput="document.getElementById('cov-val').textContent=this.value+'%'">
              <div class="form-help">${t('common.value')} <span id="cov-val">20%</span></div>
            </div>
            <div class="form-group">
              <label>${t('impact.durationMonths')}</label>
              <input type="range" name="durationMonths" id="dur-range" min="1" max="60" value="12"
                oninput="document.getElementById('dur-val').textContent=this.value+' mo'">
              <div class="form-help">${t('common.value')} <span id="dur-val">12 mo</span></div>
            </div>
          </div>

          <div class="form-group mb-2">
            <label>${t('impact.targetGroup')}</label>
            <select name="targetGroup">
              <option value="all">${t('impact.targetGroupAll')}</option>
              <option value="bottom_decile">${t('impact.targetGroupBottomDecile')}</option>
              <option value="bottom_quintile" selected>${t('impact.targetGroupBottomQuintile')}</option>
              <option value="bottom_third">${t('impact.targetGroupBottomThird')}</option>
              <option value="bottom_half">${t('impact.targetGroupBottomHalf')}</option>
            </select>
          </div>
        </div>

        <div class="form-group mb-2">
          <label>${t('impact.analysisName')}</label>
          <input type="text" name="name" id="analysis-name" placeholder="${t('impact.analysisNamePlaceholder')}">
        </div>

        <div class="flex gap-1 mt-2">
          <button class="btn btn-primary" onclick="runPreview()">${t('impact.analyzeButton')}</button>
          <button class="btn btn-secondary" onclick="runPreview(true)">${t('impact.analyzeAndSaveButton')}</button>
        </div>
      </div>

      <!-- Preview panel -->
      <div>
        <div id="impact-preview">
          <div class="card empty-state">
            <p class="empty-state-title">${t('impact.configurePrompt')}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Saved analyses -->
    <div class="card mt-2">
      <div class="card-header">
        <h2 class="card-title">${t('impact.savedAnalyses')}</h2>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('impact.colId')}</th>
              <th>${t('impact.colName')}</th>
              <th>${t('impact.colCountry')}</th>
              <th>${t('impact.colPovertyLifted')}</th>
              <th>${t('impact.colIncomeIncrease')}</th>
              <th>${t('impact.colNewCoverage')}</th>
              <th>${t('impact.colActions')}</th>
            </tr>
          </thead>
          <tbody id="analyses-table">${rows}</tbody>
        </table>
      </div>
    </div>

    <script>
    function buildFormData() {
      var simId = document.getElementById('sim-select')?.value || '';
      var country = document.getElementById('country-select')?.value || '';
      var coverage = parseInt(document.getElementById('cov-range')?.value || '20') / 100;
      var duration = parseInt(document.getElementById('dur-range')?.value || '12');
      var targetGroup = document.querySelector('select[name=targetGroup]')?.value || 'bottom_quintile';
      var name = document.getElementById('analysis-name')?.value || '';
      return { simulationId: simId || undefined, country: simId ? undefined : country,
               coverage: coverage, durationMonths: duration, targetGroup: targetGroup, name: name };
    }

    function runPreview(save) {
      var data = buildFormData();
      var url = save ? '/admin/impact/preview?save=1' : '/admin/impact/preview';
      document.getElementById('impact-preview').innerHTML =
        '<div class="card empty-state"><p>${t('impact.calculating')}</p></div>';
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        document.getElementById('impact-preview').innerHTML = html;
        if (window.OGI) { window.OGI.initCharts(); window.OGI.initTabs(); }
        if (save) {
          fetch('/admin/impact/table')
            .then(function(r) { return r.text(); })
            .then(function(tbl) { document.getElementById('analyses-table').innerHTML = tbl; });
        }
      })
      .catch(function() {
        document.getElementById('impact-preview').innerHTML =
          '<div class="card"><div class="alert alert-danger">${t('impact.analysisFailed')}</div></div>';
      });
    }
    </script>
  `,
    { activePage: 'impact' },
  );
}

// ── Preview panel (htmx target) ────────────────────────────────────────

export function renderImpactPreview(result: ImpactAnalysisResult, saved?: boolean): string {
  const { povertyReduction: pov, purchasingPower: pp, socialCoverage: sc, fiscalMultiplier: fm } = result;
  const brief = result.policyBrief;

  // Per-metric progress bars — each on its own honest scale, no mixing
  const socialCoveragePct = sc.populationCurrentlyUncovered > 0
    ? (sc.estimatedNewlyCovered / sc.populationCurrentlyUncovered) * 100 : 0;
  const impactBars = renderImpactBars([
    { label: t('impact.povertyReduction'), value: pov.liftedAsPercentOfPoor, max: 100, unit: '%', color: '#4f46e5', quality: pov.dataQuality,
      detail: `${fmtLarge(pov.estimatedLifted)} people lifted from extreme poverty` },
    { label: t('impact.purchasingPower'), value: pp.incomeIncreasePercent, max: Math.max(pp.incomeIncreasePercent * 1.3, 100), unit: '%', color: '#059669', quality: pp.dataQuality,
      detail: `Bottom quintile income increase (+$${pp.ubiMonthlyPppUsd}/mo PPP)` },
    { label: t('impact.socialCoverage'), value: socialCoveragePct, max: 100, unit: '%', color: '#7c3aed', quality: sc.dataQuality,
      detail: `${fmtLarge(sc.estimatedNewlyCovered)} newly covered of ${fmtLarge(sc.populationCurrentlyUncovered)} uncovered` },
    { label: t('impact.gdpStimulus'), value: fm.stimulusAsPercentOfGdp, max: Math.max(fm.stimulusAsPercentOfGdp * 2, 5), unit: '% GDP', color: '#ea580c', quality: 'high' as const,
      detail: `${fmtCurrency(fm.estimatedGdpStimulusPppUsd)} estimated GDP stimulus (${fm.multiplier.toFixed(1)}× multiplier)` },
  ]);

  return `
    <div class="card">
      <div class="flex-between mb-2">
        <h2 class="card-title">${t('impact.impactAnalysis')} — ${escapeHtml(result.country.name)}</h2>
        <div class="flex gap-1">
          ${saved ? `<span class="badge badge-success">${t('impact.saved')}</span>` : ''}
          <form method="post" action="/admin/impact/export">
            <input type="hidden" name="resultJson" value="${escapeHtml(JSON.stringify({ brief, country: result.country, program: result.program, meta: result.meta }))}">
            <button type="submit" class="btn btn-secondary btn-sm">${t('impact.exportBrief')}</button>
          </form>
        </div>
      </div>

      <p class="text-muted text-sm mb-2">${escapeHtml(brief.subtitle)}</p>

      <!-- Headline cards -->
      <div class="grid grid-2 mb-2">
        ${headlineCard(t('impact.povertyReduction'), brief.headline.povertyReduction.formatted, brief.headline.povertyReduction.label, pov.dataQuality)}
        ${headlineCard(t('impact.purchasingPower'), brief.headline.purchasingPower.formatted, brief.headline.purchasingPower.label, pp.dataQuality)}
        ${headlineCard(t('impact.socialCoverage'), brief.headline.socialCoverage.formatted, brief.headline.socialCoverage.label, sc.dataQuality)}
        ${headlineCard(t('impact.gdpStimulus'), brief.headline.gdpStimulus.formatted, brief.headline.gdpStimulus.label, 'high')}
      </div>

      ${impactBars}

      <!-- Tabs -->
      <div data-ogi-tab-container>
        <div class="tabs mt-2" data-ogi-tab-group>
          ${tabBtn('tab-poverty', t('impact.tabPoverty'), true)}
          ${tabBtn('tab-power', t('impact.tabPurchasingPower'), false)}
          ${tabBtn('tab-social', t('impact.tabSocialCoverage'), false)}
          ${tabBtn('tab-fiscal', t('impact.tabGdpStimulus'), false)}
          ${tabBtn('tab-brief', t('impact.tabPolicyBrief'), false)}
        </div>

        ${povertyTab(pov, result.program.monthlyAmountPppUsd)}
        ${purchasingPowerTab(pp)}
        ${socialCoverageTab(sc)}
        ${fiscalTab(fm)}
        ${briefTab(brief)}
      </div>
    </div>
  `;
}

interface ImpactBarDef {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
  quality: 'high' | 'medium' | 'low';
  detail: string;
}

function renderImpactBars(bars: ImpactBarDef[]): string {
  return `<div class="impact-bars">${bars.map((b) => {
    const pct = b.max > 0 ? Math.min((b.value / b.max) * 100, 100) : 0;
    const insufficientData = b.quality === 'low' && b.value === 0;
    if (insufficientData) {
      return `
        <div class="impact-bar-row">
          <div class="flex-between mb-half">
            <span class="text-sm text-bold">${escapeHtml(b.label)}</span>
            <span class="badge badge-danger">Insufficient data</span>
          </div>
          <div class="text-xs text-muted" style="font-style:italic">Not enough data to estimate this metric reliably</div>
        </div>`;
    }
    return `
      <div class="impact-bar-row">
        <div class="flex-between mb-half">
          <span class="text-sm text-bold">${escapeHtml(b.label)}</span>
          <span class="text-sm text-bold" style="color:${b.color}">${b.value < 0.01 ? '<0.01' : b.value < 10 ? b.value.toFixed(2) : b.value.toFixed(1)}${b.unit}</span>
        </div>
        <div class="progress-bar" style="height:10px;border-radius:5px">
          <div class="progress-bar-fill" style="width:${pct.toFixed(1)}%;background:${b.color};border-radius:5px;transition:width 0.6s ease"></div>
        </div>
        <div class="text-xs text-muted mt-half">${escapeHtml(b.detail)} ${b.quality !== 'high' ? dataQualityBadge(b.quality) : ''}</div>
      </div>`;
  }).join('')}</div>`;
}

function headlineCard(
  title: string,
  value: string,
  label: string,
  quality: 'high' | 'medium' | 'low',
): string {
  return `
    <div class="card">
      <div class="flex-between text-sm text-muted mb-1">
        <span>${escapeHtml(title)}</span>${dataQualityBadge(quality)}
      </div>
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="text-sm text-muted mt-1">${escapeHtml(label)}</div>
    </div>`;
}

function tabBtn(id: string, label: string, active: boolean): string {
  return `<button id="btn-${id}" class="tab${active ? ' active' : ''}" type="button" data-ogi-tab="${id}">${escapeHtml(label)}</button>`;
}

function assumptionList(assumptions: string[]): string {
  return `<ol class="text-sm text-muted" style="padding-left:1.2rem;margin:0">` +
    assumptions.map((a) => `<li style="margin-bottom:0.4rem">${escapeHtml(a)}</li>`).join('') +
    `</ol>`;
}

function miniStat(label: string, value: string, sub: string): string {
  return `
    <div class="card">
      <div class="metric-tile-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="text-xs text-muted">${escapeHtml(sub)}</div>
    </div>`;
}

function povertyTab(pov: PovertyReductionEstimate, floorPpp: number): string {
  return `
    <div id="tab-poverty" data-ogi-tab-panel="tab-poverty">
      <div class="grid grid-3 mb-2">
        ${miniStat(t('impact.extremePoorBaseline'), fmtLarge(pov.extremePoorBaseline), t('impact.extremePoorBaselineSub'))}
        ${miniStat(t('impact.estimatedLifted'), fmtLarge(pov.estimatedLifted), t('impact.estimatedLiftedSub'))}
        ${miniStat(t('impact.percentOfPoorLifted'), formatPercent(pov.liftedAsPercentOfPoor), t('impact.percentOfPoorLiftedSub'))}
      </div>
      <div class="text-sm mb-2">
        <strong>${t('impact.povertyLine')}</strong> $${pov.povertyLineMonthlyPppUsd.toFixed(2)}${t('impact.povertyLineUnit')} &nbsp;|&nbsp;
        <strong>${t('impact.transfer')}</strong> $${floorPpp}${t('impact.transferUnit')} &nbsp;|&nbsp;
        <strong>${t('impact.transferExceedsLine')}</strong> ${pov.transferExceedsPovertyLine ? t('impact.transferExceedsYes') : t('impact.transferExceedsNo')} &nbsp;|&nbsp;
        ${t('common.data')} ${dataQualityBadge(pov.dataQuality)}
      </div>
      <details class="text-sm">
        <summary class="text-bold" style="cursor:pointer">${t('impact.assumptions')}</summary>
        ${assumptionList(pov.assumptions)}
      </details>
    </div>`;
}

function purchasingPowerTab(pp: PurchasingPowerEstimate): string {
  return `
    <div id="tab-power" class="hidden" data-ogi-tab-panel="tab-power">
      <div class="grid grid-3 mb-2">
        ${miniStat(t('impact.bottomQuintile'), fmtLarge(pp.bottomQuintilePopulation), t('impact.bottomQuintileSub'))}
        ${miniStat(t('impact.avgMonthlyIncome'), `$${formatNumber(Math.round(pp.estimatedMonthlyIncomeUsd))}`, t('impact.avgMonthlyIncomeSub'))}
        ${miniStat(t('impact.incomeIncrease'), `+${pp.incomeIncreasePercent.toFixed(0)}%`, `UBI = $${pp.ubiMonthlyPppUsd} PPP/month`)}
      </div>
      <div class="text-sm mb-2">
        <strong>${t('impact.lorenzEstimate')}</strong> ${t('impact.bottomQuintileIncomeShare')} ${(pp.incomeShareQ1 * 100).toFixed(1)}${t('impact.ofIncome')} &nbsp;|&nbsp;
        ${t('common.data')} ${dataQualityBadge(pp.dataQuality)}
      </div>
      <details class="text-sm">
        <summary class="text-bold" style="cursor:pointer">${t('impact.assumptions')}</summary>
        ${assumptionList(pp.assumptions)}
      </details>
    </div>`;
}

function socialCoverageTab(sc: SocialCoverageEstimate): string {
  return `
    <div id="tab-social" class="hidden" data-ogi-tab-panel="tab-social">
      <div class="grid grid-3 mb-2">
        ${miniStat(t('impact.currentlyUncovered'), fmtLarge(sc.populationCurrentlyUncovered), t('impact.currentlyUncoveredSub'))}
        ${miniStat(t('impact.uncoverageRate'), formatPercent(sc.uncoverageRatePercent), t('impact.uncoverageRateSub'))}
        ${miniStat(t('impact.newlyCovered'), fmtLarge(sc.estimatedNewlyCovered), t('impact.newlyCoveredSub'))}
      </div>
      <div class="text-sm mb-2">
        <strong>${t('impact.recipientUncoverageRate')}</strong> ${formatPercent(sc.recipientUncoverageRatePercent)} &nbsp;|&nbsp;
        ${t('common.data')} ${dataQualityBadge(sc.dataQuality)}
      </div>
      <details class="text-sm">
        <summary class="text-bold" style="cursor:pointer">${t('impact.assumptions')}</summary>
        ${assumptionList(sc.assumptions)}
      </details>
    </div>`;
}

function fiscalTab(fm: FiscalMultiplierEstimate): string {
  return `
    <div id="tab-fiscal" class="hidden" data-ogi-tab-panel="tab-fiscal">
      <div class="grid grid-3 mb-2">
        ${miniStat(t('impact.fiscalMultiplier'), fm.multiplier.toFixed(1) + '\u00d7', `${t('impact.calibratedFor')} ${fm.incomeGroup}`)}
        ${miniStat(t('impact.annualTransfer'), fmtCurrency(fm.annualTransferPppUsd), t('impact.annualTransferSub'))}
        ${miniStat(t('impact.gdpStimulusLabel'), fmtCurrency(fm.estimatedGdpStimulusPppUsd), `${fm.stimulusAsPercentOfGdp.toFixed(2)}% ${t('impact.ofGdp')}`)}
      </div>
      <details class="text-sm">
        <summary class="text-bold" style="cursor:pointer">${t('impact.assumptions')}</summary>
        ${assumptionList(fm.assumptions)}
      </details>
    </div>`;
}

function briefTab(brief: import('../../core/types.js').PolicyBrief): string {
  return `
    <div id="tab-brief" class="hidden" data-ogi-tab-panel="tab-brief">
      <div class="card mb-2">
        <p class="text-sm">${escapeHtml(brief.programDescription)}</p>
      </div>

      <details open class="mb-2">
        <summary class="text-bold" style="cursor:pointer">${t('impact.methodology')}</summary>
        <div class="grid grid-2 mt-1">
          ${methodBlock(t('impact.povertyModel'), brief.methodology.povertyModel)}
          ${methodBlock(t('impact.incomeDistributionModel'), brief.methodology.incomeDistributionModel)}
          ${methodBlock(t('impact.socialCoverageModel'), brief.methodology.socialCoverageModel)}
          ${methodBlock(t('impact.fiscalMultiplierModel'), brief.methodology.fiscalMultiplierModel)}
        </div>
      </details>

      <details class="mb-2">
        <summary class="text-bold" style="cursor:pointer">${t('impact.allAssumptions')} (${brief.assumptions.length})</summary>
        <ol class="text-sm text-muted mt-1" style="padding-left:1.2rem">
          ${brief.assumptions.map((a, i) => `<li style="margin-bottom:0.35rem"><strong>${i + 1}.</strong> ${escapeHtml(a)}</li>`).join('')}
        </ol>
      </details>

      <details class="mb-2">
        <summary class="text-bold" style="cursor:pointer">${t('impact.caveats')} (${brief.caveats.length})</summary>
        <ul class="text-sm text-muted mt-1" style="padding-left:1.2rem">
          ${brief.caveats.map((c) => `<li style="margin-bottom:0.35rem">${escapeHtml(c)}</li>`).join('')}
        </ul>
      </details>

      <details>
        <summary class="text-bold" style="cursor:pointer">${t('impact.dataSources')}</summary>
        <ul class="text-sm text-muted mt-1" style="padding-left:1.2rem">
          ${brief.dataSources.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </details>
    </div>`;
}

function methodBlock(title: string, text: string): string {
  return `
    <div class="card">
      <strong class="text-sm">${escapeHtml(title)}:</strong>
      <p class="text-sm text-muted mt-1">${escapeHtml(text)}</p>
    </div>`;
}

// ── Saved-analyses partial (htmx refresh) ─────────────────────────────

export function renderAnalysesTable(analyses: SavedImpactAnalysis[]): string {
  return savedAnalysesTable(analyses);
}
