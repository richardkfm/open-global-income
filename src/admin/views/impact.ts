import { layout } from './layout.js';
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatLarge(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return formatNumber(Math.round(n));
}

function formatCurrency(n: number): string {
  return `$${formatLarge(n)}`;
}

function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

function dataQualityBadge(q: 'high' | 'medium' | 'low'): string {
  const colors: Record<string, string> = {
    high: 'background:#d1e7dd;color:#0f5132',
    medium: 'background:#fff3cd;color:#664d03',
    low: 'background:#f8d7da;color:#842029',
  };
  return `<span style="${colors[q]};padding:0.1rem 0.4rem;border-radius:0.25rem;font-size:0.75rem;font-weight:600">${q}</span>`;
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
  return `<option value="">Run new simulation inline</option>` + rows.join('');
}

// ── Saved analyses table ────────────────────────────────────────────────

function savedAnalysesTable(analyses: SavedImpactAnalysis[]): string {
  if (analyses.length === 0) {
    return '<tr><td colspan="7" style="color:var(--muted)">No saved analyses yet</td></tr>';
  }
  return analyses
    .map(
      (a) => `
    <tr>
      <td>${escapeHtml(a.id.slice(0, 8))}&hellip;</td>
      <td>${a.name ? escapeHtml(a.name) : '&mdash;'}</td>
      <td>${escapeHtml(a.countryCode)}</td>
      <td>${formatLarge(a.results.povertyReduction.estimatedLifted)}</td>
      <td>${a.results.purchasingPower.incomeIncreasePercent.toFixed(0)}%</td>
      <td>${formatLarge(a.results.socialCoverage.estimatedNewlyCovered)}</td>
      <td>
        <form method="post" action="/admin/impact/delete" style="display:inline">
          <input type="hidden" name="id" value="${escapeHtml(a.id)}">
          <button type="submit" class="btn btn-danger btn-sm">Delete</button>
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

  const content = `
    <h1 style="margin:1.5rem 0 0.5rem">Economic Impact Modeling</h1>
    <p style="color:var(--muted);margin-bottom:1.5rem">
      Model the real-world impact of a basic income program: poverty reduction,
      purchasing power increase, social coverage gap, and GDP stimulus.
      Every assumption is listed explicitly. Export as a policy brief.
    </p>

    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <!-- Config panel -->
      <div class="card">
        <h2>Configure Analysis</h2>

        <div style="margin-bottom:1rem">
          <label style="display:block;font-weight:600;margin-bottom:0.25rem">Link to saved simulation (optional)</label>
          <select name="simulationId" id="sim-select" style="width:100%"
            hx-on:change="document.getElementById('inline-params').style.display = this.value ? 'none' : 'block'">
            ${simOpts}
          </select>
        </div>

        <div id="inline-params">
          <div style="margin-bottom:0.75rem">
            <label style="display:block;font-weight:600;margin-bottom:0.25rem">Country</label>
            <select name="country" id="country-select" style="width:100%">
              ${opts}
            </select>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.75rem">
            <div>
              <label style="display:block;font-weight:600;margin-bottom:0.25rem">Coverage (%)</label>
              <input type="range" name="coverage" id="cov-range" min="1" max="100" value="20"
                style="width:100%"
                oninput="document.getElementById('cov-val').textContent=this.value+'%'">
              <div style="font-size:0.85rem;color:var(--muted)">Value: <span id="cov-val">20%</span></div>
            </div>
            <div>
              <label style="display:block;font-weight:600;margin-bottom:0.25rem">Duration (months)</label>
              <input type="range" name="durationMonths" id="dur-range" min="1" max="60" value="12"
                style="width:100%"
                oninput="document.getElementById('dur-val').textContent=this.value+' mo'">
              <div style="font-size:0.85rem;color:var(--muted)">Value: <span id="dur-val">12 mo</span></div>
            </div>
          </div>

          <div style="margin-bottom:0.75rem">
            <label style="display:block;font-weight:600;margin-bottom:0.25rem">Target group</label>
            <select name="targetGroup" style="width:100%">
              <option value="all">All population</option>
              <option value="bottom_quintile" selected>Bottom quintile (poorest 20%)</option>
            </select>
          </div>
        </div>

        <div style="margin-top:1rem">
          <label style="display:block;font-weight:600;margin-bottom:0.25rem">Analysis name (optional)</label>
          <input type="text" name="name" id="analysis-name" placeholder="e.g. Kenya pilot 2026"
            style="width:100%">
        </div>

        <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="runPreview()">Analyze</button>
          <button class="btn" style="background:var(--bg);border:1px solid var(--border)"
            onclick="runPreview(true)">Analyze &amp; Save</button>
        </div>
      </div>

      <!-- Preview panel -->
      <div>
        <div id="impact-preview">
          <div class="card" style="background:var(--bg);color:var(--muted);text-align:center;padding:2rem">
            Configure parameters and click "Analyze" to see results
          </div>
        </div>
      </div>
    </div>

    <!-- Saved analyses -->
    <div class="card" style="margin-top:1rem">
      <h2>Saved Analyses</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Country</th>
            <th>Poverty lifted</th>
            <th>Income +</th>
            <th>New coverage</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="analyses-table">${rows}</tbody>
      </table>
    </div>

    <script>
    function buildFormData() {
      const simId = document.getElementById('sim-select')?.value || '';
      const country = document.getElementById('country-select')?.value || '';
      const coverage = parseInt(document.getElementById('cov-range')?.value || '20') / 100;
      const duration = parseInt(document.getElementById('dur-range')?.value || '12');
      const targetGroup = document.querySelector('select[name=targetGroup]')?.value || 'bottom_quintile';
      const name = document.getElementById('analysis-name')?.value || '';
      return { simulationId: simId || undefined, country: simId ? undefined : country,
               coverage, durationMonths: duration, targetGroup, name };
    }

    function runPreview(save = false) {
      const data = buildFormData();
      const url = save ? '/admin/impact/preview?save=1' : '/admin/impact/preview';
      document.getElementById('impact-preview').innerHTML =
        '<div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Calculating&hellip;</div>';
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(r => r.text())
      .then(html => {
        document.getElementById('impact-preview').innerHTML = html;
        if (save) {
          // refresh saved table
          fetch('/admin/impact/table')
            .then(r => r.text())
            .then(t => { document.getElementById('analyses-table').innerHTML = t; });
        }
      })
      .catch(() => {
        document.getElementById('impact-preview').innerHTML =
          '<div class="card" style="color:var(--danger)">Analysis failed. Check parameters.</div>';
      });
    }
    </script>
  `;

  return layout('Economic Impact', content);
}

// ── Preview panel (htmx target) ────────────────────────────────────────

export function renderImpactPreview(result: ImpactAnalysisResult, saved?: boolean): string {
  const { povertyReduction: pov, purchasingPower: pp, socialCoverage: sc, fiscalMultiplier: fm } = result;
  const brief = result.policyBrief;

  const briefJson = escapeHtml(JSON.stringify({ brief, country: result.country, program: result.program, meta: result.meta }, null, 2));

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h2 style="margin:0">Impact Analysis — ${escapeHtml(result.country.name)}</h2>
        <div style="display:flex;gap:0.5rem">
          ${saved ? '<span style="background:#d1e7dd;color:#0f5132;padding:0.2rem 0.6rem;border-radius:0.25rem;font-size:0.8rem">Saved</span>' : ''}
          <form method="post" action="/admin/impact/export">
            <input type="hidden" name="resultJson" value="${escapeHtml(JSON.stringify({ brief, country: result.country, program: result.program, meta: result.meta }))}">
            <button type="submit" class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)">Export brief</button>
          </form>
        </div>
      </div>

      <p style="color:var(--muted);font-size:0.9rem;margin-bottom:1rem">${escapeHtml(brief.subtitle)}</p>

      <!-- Headline cards -->
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem;margin-bottom:1.25rem">
        ${headlineCard('Poverty Reduction', brief.headline.povertyReduction.formatted, brief.headline.povertyReduction.label, '#0d6efd', pov.dataQuality)}
        ${headlineCard('Purchasing Power', brief.headline.purchasingPower.formatted, brief.headline.purchasingPower.label, '#198754', pp.dataQuality)}
        ${headlineCard('Social Coverage', brief.headline.socialCoverage.formatted, brief.headline.socialCoverage.label, '#6f42c1', sc.dataQuality)}
        ${headlineCard('GDP Stimulus', brief.headline.gdpStimulus.formatted, brief.headline.gdpStimulus.label, '#fd7e14', 'high')}
      </div>

      <!-- Detailed breakdown tabs -->
      <div style="border-bottom:2px solid var(--border);margin-bottom:1rem;display:flex;gap:1rem">
        ${tabBtn('tab-poverty', 'Poverty', true)}
        ${tabBtn('tab-power', 'Purchasing Power', false)}
        ${tabBtn('tab-social', 'Social Coverage', false)}
        ${tabBtn('tab-fiscal', 'GDP Stimulus', false)}
        ${tabBtn('tab-brief', 'Policy Brief', false)}
      </div>

      ${povertyTab(pov, result.program.monthlyAmountPppUsd)}
      ${purchasingPowerTab(pp)}
      ${socialCoverageTab(sc)}
      ${fiscalTab(fm)}
      ${briefTab(brief)}
    </div>

    <script>
    (function() {
      var tabs = ['tab-poverty','tab-power','tab-social','tab-fiscal','tab-brief'];
      tabs.forEach(function(id) {
        var btn = document.getElementById('btn-'+id);
        if (btn) btn.addEventListener('click', function() {
          tabs.forEach(function(tid) {
            var el = document.getElementById(tid);
            var b = document.getElementById('btn-'+tid);
            if (el) el.style.display = 'none';
            if (b) { b.style.borderBottom='2px solid transparent'; b.style.color='var(--muted)'; }
          });
          var active = document.getElementById(id);
          if (active) active.style.display = 'block';
          btn.style.borderBottom = '2px solid var(--primary)';
          btn.style.color = 'var(--primary)';
        });
      });
    })();
    </script>
  `;
}

function headlineCard(
  title: string,
  value: string,
  label: string,
  color: string,
  quality: 'high' | 'medium' | 'low',
): string {
  return `
    <div style="border:1px solid var(--border);border-radius:0.5rem;padding:0.75rem">
      <div style="font-size:0.8rem;color:var(--muted);margin-bottom:0.25rem;display:flex;justify-content:space-between">
        <span>${escapeHtml(title)}</span>${dataQualityBadge(quality)}
      </div>
      <div style="font-size:1.6rem;font-weight:700;color:${color};line-height:1.2">${escapeHtml(value)}</div>
      <div style="font-size:0.8rem;color:var(--muted);margin-top:0.25rem">${escapeHtml(label)}</div>
    </div>`;
}

function tabBtn(id: string, label: string, active: boolean): string {
  const style = active
    ? 'border:none;background:none;cursor:pointer;padding:0.5rem 0;font-weight:600;border-bottom:2px solid var(--primary);color:var(--primary)'
    : 'border:none;background:none;cursor:pointer;padding:0.5rem 0;border-bottom:2px solid transparent;color:var(--muted)';
  return `<button id="btn-${id}" style="${style}" type="button">${escapeHtml(label)}</button>`;
}

function assumptionList(assumptions: string[]): string {
  return `<ol style="padding-left:1.2rem;margin:0">` +
    assumptions.map((a) => `<li style="font-size:0.82rem;color:var(--muted);margin-bottom:0.4rem">${escapeHtml(a)}</li>`).join('') +
    `</ol>`;
}

function povertyTab(pov: PovertyReductionEstimate, floorPpp: number): string {
  return `
    <div id="tab-poverty">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">
        ${miniStat('Extreme poor (baseline)', formatLarge(pov.extremePoorBaseline), 'people below $2.15/day')}
        ${miniStat('Estimated lifted', formatLarge(pov.estimatedLifted), 'people above poverty line')}
        ${miniStat('% of poor lifted', formatPercent(pov.liftedAsPercentOfPoor), 'share of extreme poor reached')}
      </div>
      <div style="font-size:0.85rem;margin-bottom:0.75rem">
        <strong>Poverty line:</strong> $${pov.povertyLineMonthlyPppUsd.toFixed(2)}/month (PPP-USD) &nbsp;|&nbsp;
        <strong>Transfer:</strong> $${floorPpp}/month &nbsp;|&nbsp;
        <strong>Transfer &gt; line:</strong> ${pov.transferExceedsPovertyLine ? '✓ Yes' : '✗ No'} &nbsp;|&nbsp;
        Data: ${dataQualityBadge(pov.dataQuality)}
      </div>
      <details style="font-size:0.85rem">
        <summary style="cursor:pointer;font-weight:600;margin-bottom:0.5rem">Assumptions</summary>
        ${assumptionList(pov.assumptions)}
      </details>
    </div>`;
}

function purchasingPowerTab(pp: PurchasingPowerEstimate): string {
  return `
    <div id="tab-power" style="display:none">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">
        ${miniStat('Bottom quintile', formatLarge(pp.bottomQuintilePopulation), 'people in poorest 20%')}
        ${miniStat('Their avg monthly income', `$${formatNumber(Math.round(pp.estimatedMonthlyIncomeUsd))}`, 'USD (GNI-based estimate)')}
        ${miniStat('Income increase', `+${pp.incomeIncreasePercent.toFixed(0)}%`, `UBI = $${pp.ubiMonthlyPppUsd} PPP/month`)}
      </div>
      <div style="font-size:0.85rem;margin-bottom:0.75rem">
        <strong>Lorenz estimate:</strong> bottom quintile holds ${(pp.incomeShareQ1 * 100).toFixed(1)}% of income &nbsp;|&nbsp;
        Data: ${dataQualityBadge(pp.dataQuality)}
      </div>
      <details style="font-size:0.85rem">
        <summary style="cursor:pointer;font-weight:600;margin-bottom:0.5rem">Assumptions</summary>
        ${assumptionList(pp.assumptions)}
      </details>
    </div>`;
}

function socialCoverageTab(sc: SocialCoverageEstimate): string {
  return `
    <div id="tab-social" style="display:none">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">
        ${miniStat('Currently uncovered', formatLarge(sc.populationCurrentlyUncovered), 'no social protection benefit')}
        ${miniStat('Uncoverage rate', formatPercent(sc.uncoverageRatePercent), '% of population')}
        ${miniStat('Newly covered', formatLarge(sc.estimatedNewlyCovered), 'program recipients without prior coverage')}
      </div>
      <div style="font-size:0.85rem;margin-bottom:0.75rem">
        <strong>Recipient uncoverage rate:</strong> ${formatPercent(sc.recipientUncoverageRatePercent)} &nbsp;|&nbsp;
        Data: ${dataQualityBadge(sc.dataQuality)}
      </div>
      <details style="font-size:0.85rem">
        <summary style="cursor:pointer;font-weight:600;margin-bottom:0.5rem">Assumptions</summary>
        ${assumptionList(sc.assumptions)}
      </details>
    </div>`;
}

function fiscalTab(fm: FiscalMultiplierEstimate): string {
  return `
    <div id="tab-fiscal" style="display:none">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">
        ${miniStat('Fiscal multiplier', fm.multiplier.toFixed(1) + '×', `calibrated for ${fm.incomeGroup}`)}
        ${miniStat('Annual transfer', formatCurrency(fm.annualTransferPppUsd), 'PPP-USD injected')}
        ${miniStat('GDP stimulus', formatCurrency(fm.estimatedGdpStimulusPppUsd), `${fm.stimulusAsPercentOfGdp.toFixed(2)}% of GDP`)}
      </div>
      <details style="font-size:0.85rem">
        <summary style="cursor:pointer;font-weight:600;margin-bottom:0.5rem">Assumptions</summary>
        ${assumptionList(fm.assumptions)}
      </details>
    </div>`;
}

function briefTab(brief: import('../../core/types.js').PolicyBrief): string {
  const assumptions = brief.assumptions
    .map((a, i) => `<li style="font-size:0.82rem;margin-bottom:0.35rem"><strong>${i + 1}.</strong> ${escapeHtml(a)}</li>`)
    .join('');
  const caveats = brief.caveats
    .map((c) => `<li style="font-size:0.82rem;margin-bottom:0.35rem">${escapeHtml(c)}</li>`)
    .join('');
  const sources = brief.dataSources
    .map((s) => `<li style="font-size:0.82rem">${escapeHtml(s)}</li>`)
    .join('');

  return `
    <div id="tab-brief" style="display:none">
      <div style="background:var(--bg);border-radius:0.4rem;padding:1rem;margin-bottom:0.75rem">
        <p style="font-size:0.95rem">${escapeHtml(brief.programDescription)}</p>
      </div>

      <details open style="margin-bottom:0.75rem">
        <summary style="cursor:pointer;font-weight:600;font-size:0.9rem">Methodology</summary>
        <div style="margin-top:0.5rem;display:grid;gap:0.5rem">
          ${methodBlock('Poverty Model', brief.methodology.povertyModel)}
          ${methodBlock('Income Distribution', brief.methodology.incomeDistributionModel)}
          ${methodBlock('Social Coverage', brief.methodology.socialCoverageModel)}
          ${methodBlock('Fiscal Multiplier', brief.methodology.fiscalMultiplierModel)}
        </div>
      </details>

      <details style="margin-bottom:0.75rem">
        <summary style="cursor:pointer;font-weight:600;font-size:0.9rem">All Assumptions (${brief.assumptions.length})</summary>
        <ol style="padding-left:1.2rem;margin-top:0.5rem">${assumptions}</ol>
      </details>

      <details style="margin-bottom:0.75rem">
        <summary style="cursor:pointer;font-weight:600;font-size:0.9rem">Caveats (${brief.caveats.length})</summary>
        <ul style="padding-left:1.2rem;margin-top:0.5rem">${caveats}</ul>
      </details>

      <details>
        <summary style="cursor:pointer;font-weight:600;font-size:0.9rem">Data Sources</summary>
        <ul style="padding-left:1.2rem;margin-top:0.5rem">${sources}</ul>
      </details>
    </div>`;
}

function miniStat(label: string, value: string, sub: string): string {
  return `
    <div style="border:1px solid var(--border);border-radius:0.4rem;padding:0.6rem">
      <div style="font-size:0.78rem;color:var(--muted)">${escapeHtml(label)}</div>
      <div style="font-size:1.25rem;font-weight:700;color:var(--primary)">${escapeHtml(value)}</div>
      <div style="font-size:0.75rem;color:var(--muted)">${escapeHtml(sub)}</div>
    </div>`;
}

function methodBlock(title: string, text: string): string {
  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:0.4rem;padding:0.6rem">
      <strong style="font-size:0.85rem">${escapeHtml(title)}:</strong>
      <p style="font-size:0.82rem;color:var(--muted);margin:0.25rem 0 0">${escapeHtml(text)}</p>
    </div>`;
}

function formatCurrencyLocal(n: number): string {
  return `$${formatLarge(n)}`;
}

// ── Saved-analyses partial (htmx refresh) ─────────────────────────────

export function renderAnalysesTable(analyses: SavedImpactAnalysis[]): string {
  return savedAnalysesTable(analyses);
}
