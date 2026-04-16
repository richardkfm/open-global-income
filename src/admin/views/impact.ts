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
  CostSavingsEstimate,
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
  const { povertyReduction: pov, purchasingPower: pp, socialCoverage: sc, fiscalMultiplier: fm, costSavings: cs } = result;
  const brief = result.policyBrief;

  // Determine which dimensions have usable data
  const hasPoverty = pov.dataQuality !== 'low';
  const hasPurchasing = pp.dataQuality !== 'low';
  const hasSocial = sc.dataQuality !== 'low';
  const hasSavings = cs.dataQuality !== 'low' && cs.totalAnnualSavingsPppUsdCentral > 0;

  // Per-metric progress bars — only for dimensions with data
  const socialCoveragePct = sc.populationCurrentlyUncovered > 0
    ? (sc.estimatedNewlyCovered / sc.populationCurrentlyUncovered) * 100 : 0;
  const barDefs: ImpactBarDef[] = [];
  if (hasPoverty) {
    barDefs.push({ label: t('impact.povertyReduction'), value: pov.liftedAsPercentOfPoor, max: 100, unit: '%', color: '#4f46e5', quality: pov.dataQuality,
      detail: `${fmtLarge(pov.estimatedLifted)} people lifted from extreme poverty` });
  }
  if (hasPurchasing) {
    barDefs.push({ label: t('impact.purchasingPower'), value: pp.incomeIncreasePercent, max: Math.max(pp.incomeIncreasePercent * 1.3, 100), unit: '%', color: '#059669', quality: pp.dataQuality,
      detail: `Bottom quintile income increase (+$${pp.ubiMonthlyPppUsd}/mo PPP)` });
  }
  if (hasSocial) {
    barDefs.push({ label: t('impact.socialCoverage'), value: socialCoveragePct, max: 100, unit: '%', color: '#7c3aed', quality: sc.dataQuality,
      detail: `${fmtLarge(sc.estimatedNewlyCovered)} newly covered of ${fmtLarge(sc.populationCurrentlyUncovered)} uncovered` });
  }
  barDefs.push({ label: t('impact.gdpStimulus'), value: fm.stimulusAsPercentOfGdp, max: Math.max(fm.stimulusAsPercentOfGdp * 2, 5), unit: '% GDP', color: '#ea580c', quality: 'high' as const,
    detail: `${fmtCurrency(fm.estimatedGdpStimulusPppUsd)} estimated GDP stimulus (${fm.multiplier.toFixed(1)}× multiplier)` });
  if (hasSavings) {
    barDefs.push({ label: t('impact.costSavings'), value: cs.savingsAsPercentOfUbiCostCentral, max: Math.max(cs.savingsAsPercentOfUbiCostCentral * 1.5, 25), unit: '% of UBI cost', color: '#0891b2', quality: cs.dataQuality,
      detail: `${fmtCurrency(cs.totalAnnualSavingsPppUsdCentral)} ${t('impact.savingsBarDetail')}` });
  }
  const impactBars = renderImpactBars(barDefs);

  // Missing data guidance
  const missingIndicators: { dimension: string; indicator: string; source: string; wbCode: string }[] = [];
  if (!hasPoverty) {
    missingIndicators.push({ dimension: 'Poverty Reduction', indicator: 'Poverty headcount ratio at $2.15/day', source: 'World Bank PovcalNet', wbCode: 'SI.POV.DDAY' });
  }
  if (!hasPurchasing) {
    missingIndicators.push({ dimension: 'Purchasing Power', indicator: 'Gini index', source: 'World Bank', wbCode: 'SI.POV.GINI' });
  }
  if (!hasSocial) {
    missingIndicators.push({ dimension: 'Social Coverage', indicator: 'Social protection coverage (%)', source: 'ILO World Social Protection Report', wbCode: 'per_allsp.cov_pop_tot' });
  }

  const missingDataCard = missingIndicators.length > 0 ? `
    <div class="card mb-2" style="background:#fffbeb;border:1px solid #f59e0b">
      <h3 class="card-title" style="color:#92400e;font-size:0.85rem">Missing data for ${missingIndicators.length} impact dimension${missingIndicators.length > 1 ? 's' : ''}</h3>
      <p class="text-sm" style="color:#78350f;margin:0.5rem 0">The following dimensions are hidden because ${escapeHtml(result.country.name)} is missing required indicators. To enable them:</p>
      <table style="width:100%;font-size:0.8rem;border-collapse:collapse;margin-top:0.5rem">
        <thead><tr style="border-bottom:1px solid #fbbf24">
          <th style="text-align:left;padding:0.3rem 0.5rem;color:#92400e">Dimension</th>
          <th style="text-align:left;padding:0.3rem 0.5rem;color:#92400e">Missing Indicator</th>
          <th style="text-align:left;padding:0.3rem 0.5rem;color:#92400e">Source</th>
        </tr></thead>
        <tbody>${missingIndicators.map((m) => `
          <tr style="border-bottom:1px solid #fde68a">
            <td style="padding:0.3rem 0.5rem;color:#78350f;font-weight:600">${escapeHtml(m.dimension)}</td>
            <td style="padding:0.3rem 0.5rem;color:#78350f"><code style="background:#fef3c7;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.75rem">${escapeHtml(m.wbCode)}</code> ${escapeHtml(m.indicator)}</td>
            <td style="padding:0.3rem 0.5rem;color:#78350f">${escapeHtml(m.source)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="text-xs" style="color:#92400e;margin-top:0.5rem">Run <code style="background:#fef3c7;padding:0.1rem 0.3rem;border-radius:3px">npm run data:update</code> to fetch the latest data from World Bank and ILO, or add the values manually to <code style="background:#fef3c7;padding:0.1rem 0.3rem;border-radius:3px">countries.json</code>.</p>
    </div>` : '';

  // Headline cards — only show dimensions with data
  const headlineCards: string[] = [];
  if (hasPoverty) headlineCards.push(headlineCard(t('impact.povertyReduction'), brief.headline.povertyReduction.formatted, brief.headline.povertyReduction.label, pov.dataQuality));
  if (hasPurchasing) headlineCards.push(headlineCard(t('impact.purchasingPower'), brief.headline.purchasingPower.formatted, brief.headline.purchasingPower.label, pp.dataQuality));
  if (hasSocial) headlineCards.push(headlineCard(t('impact.socialCoverage'), brief.headline.socialCoverage.formatted, brief.headline.socialCoverage.label, sc.dataQuality));
  headlineCards.push(headlineCard(t('impact.gdpStimulus'), brief.headline.gdpStimulus.formatted, brief.headline.gdpStimulus.label, 'high'));
  if (hasSavings) headlineCards.push(headlineCard(t('impact.costSavings'), brief.headline.costSavings.formatted, brief.headline.costSavings.label, cs.dataQuality));

  // Tabs — only show dimensions with data; first tab is visible, rest hidden
  const tabDefs: { id: string; label: string; genContent: (hidden: boolean) => string }[] = [];
  if (hasPoverty) tabDefs.push({ id: 'tab-poverty', label: t('impact.tabPoverty'), genContent: (h) => povertyTab(pov, result.program.monthlyAmountPppUsd, h) });
  if (hasPurchasing) tabDefs.push({ id: 'tab-power', label: t('impact.tabPurchasingPower'), genContent: (h) => purchasingPowerTab(pp, h) });
  if (hasSocial) tabDefs.push({ id: 'tab-social', label: t('impact.tabSocialCoverage'), genContent: (h) => socialCoverageTab(sc, h) });
  tabDefs.push({ id: 'tab-fiscal', label: t('impact.tabGdpStimulus'), genContent: (h) => fiscalTab(fm, h) });
  if (hasSavings) tabDefs.push({ id: 'tab-savings', label: t('impact.tabCostSavings'), genContent: (h) => costSavingsTab(cs, h) });
  tabDefs.push({ id: 'tab-brief', label: t('impact.tabPolicyBrief'), genContent: (h) => briefTab(brief, h) });
  const tabs = tabDefs.map((tab, i) => ({ id: tab.id, label: tab.label, content: tab.genContent(i !== 0) }));

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

      ${missingDataCard}

      <!-- Headline cards -->
      <div class="grid grid-2 mb-2">
        ${headlineCards.join('')}
      </div>

      ${impactBars}

      <!-- Tabs -->
      <div data-ogi-tab-container>
        <div class="tabs mt-2" data-ogi-tab-group>
          ${tabs.map((tab, i) => tabBtn(tab.id, tab.label, i === 0)).join('')}
        </div>

        ${tabs.map((tab) => tab.content).join('')}
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
  if (bars.length === 0) return '';
  return `<div class="impact-bars">${bars.map((b) => {
    const pct = b.max > 0 ? Math.min((b.value / b.max) * 100, 100) : 0;
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

function povertyTab(pov: PovertyReductionEstimate, floorPpp: number, hidden = false): string {
  return `
    <div id="tab-poverty"${hidden ? ' class="hidden"' : ''} data-ogi-tab-panel="tab-poverty">
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

function purchasingPowerTab(pp: PurchasingPowerEstimate, hidden = true): string {
  return `
    <div id="tab-power"${hidden ? ' class="hidden"' : ''} data-ogi-tab-panel="tab-power">
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

function socialCoverageTab(sc: SocialCoverageEstimate, hidden = true): string {
  return `
    <div id="tab-social"${hidden ? ' class="hidden"' : ''} data-ogi-tab-panel="tab-social">
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

function fiscalTab(fm: FiscalMultiplierEstimate, hidden = true): string {
  return `
    <div id="tab-fiscal"${hidden ? ' class="hidden"' : ''} data-ogi-tab-panel="tab-fiscal">
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

function costSavingsTab(cs: CostSavingsEstimate, hidden = true): string {
  const headerRow = `
    <div class="grid grid-3 mb-2">
      ${miniStat(t('impact.savingsTotal'), fmtCurrency(cs.totalAnnualSavingsPppUsdCentral), `${t('impact.savingsRange')} ${fmtCurrency(cs.totalAnnualSavingsPppUsdLow)} – ${fmtCurrency(cs.totalAnnualSavingsPppUsdHigh)}`)}
      ${miniStat(t('impact.savingsAsPctUbi'), `${cs.savingsAsPercentOfUbiCostCentral.toFixed(1)}%`, t('impact.savingsAsPctUbiSub'))}
      ${miniStat(t('impact.savingsCoverageFactor'), `${(cs.coverageFactor * 100).toFixed(0)}%`, cs.transferAdequateForSavings ? t('impact.savingsTransferAdequate') : t('impact.savingsTransferBelow'))}
    </div>`;

  const categoryCards = cs.categories.map((cat) => {
    const pct = cat.centralElasticity != null ? `${(cat.centralElasticity * 100).toFixed(1)}%` : t('common.na');
    const hasSavings = cat.annualSavingsPppUsdCentral > 0;
    const valueClass = hasSavings ? '' : 'text-muted';
    const idLabel: Record<typeof cat.id, string> = {
      healthcare: t('impact.savingsCatHealthcare'),
      administrative: t('impact.savingsCatAdministrative'),
      crime_justice: t('impact.savingsCatCrimeJustice'),
    };
    return `
      <div class="card mb-2">
        <div class="flex-between">
          <strong class="text-sm">${escapeHtml(idLabel[cat.id])}</strong>
          ${dataQualityBadge(cat.dataQuality)}
        </div>
        <div class="stat-value ${valueClass}" style="margin-top:0.4rem">${fmtCurrency(cat.annualSavingsPppUsdCentral)}</div>
        <div class="text-xs text-muted">
          ${t('impact.savingsRange')} ${fmtCurrency(cat.annualSavingsPppUsdLow)} – ${fmtCurrency(cat.annualSavingsPppUsdHigh)} ·
          ${t('impact.savingsElasticity')} ${pct} ${t('impact.savingsOf')} ${escapeHtml(cat.baselineBasis)}
        </div>
        <details class="text-sm mt-1">
          <summary class="text-bold" style="cursor:pointer">${t('impact.assumptions')} (${cat.assumptions.length})</summary>
          ${assumptionList(cat.assumptions)}
        </details>
        <details class="text-sm mt-1">
          <summary class="text-bold" style="cursor:pointer">${t('impact.sources')} (${cat.sources.length})</summary>
          <ul class="text-xs text-muted mt-1" style="padding-left:1.2rem">
            ${cat.sources.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
        </details>
      </div>`;
  }).join('');

  const gateNote = !cs.transferAdequateForSavings
    ? `<div class="alert alert-warning text-sm mb-2">${t('impact.savingsGateWarning')}</div>`
    : '';

  return `
    <div id="tab-savings"${hidden ? ' class="hidden"' : ''} data-ogi-tab-panel="tab-savings">
      ${gateNote}
      ${headerRow}
      ${categoryCards}
      <p class="text-xs text-muted mt-1">${t('impact.savingsRedirectableNote')}</p>
    </div>`;
}

function briefTab(brief: import('../../core/types.js').PolicyBrief, hidden = true): string {
  return `
    <div id="tab-brief"${hidden ? ' class="hidden"' : ''} data-ogi-tab-panel="tab-brief">
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
          ${methodBlock(t('impact.costSavingsModel'), brief.methodology.costSavingsModel)}
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
