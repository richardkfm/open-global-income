/** Public landing page — pitched at journalists, researchers and policy makers. */
import { publicLayout } from './layout.js';
import { escapeHtml, formatCompact, formatNumber } from '../../admin/views/helpers.js';
import { GLOBAL_INCOME_FLOOR_PPP } from '../../core/constants.js';

export interface HomeData {
  countryCount: number;
  regionCount: number;
  dataVersion: string;
  /** Sum of population across all countries in the dataset */
  totalPopulation: number;
  /** Estimated people below their country-appropriate poverty line, where data exists */
  peopleInPoverty: number;
  /** Country options for the quick jump selector */
  countries: Array<{ code: string; name: string }>;
}

export function renderHome(data: HomeData): string {
  const countryOptions = data.countries
    .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.name)}</option>`)
    .join('\n          ');

  const content = `
  <section class="hero">
    <canvas id="hero-globe" class="hero-globe no-print" width="280" height="280" aria-hidden="true"></canvas>
    <h1>What would a basic income cost —<br><span class="hero-accent">and what would it change?</span></h1>
    <p class="hero-lede">
      Open Global Income answers the two questions every basic income debate gets stuck on,
      with numbers anyone can audit: a transparent entitlement formula, budget and funding
      models, and poverty-impact estimates for ${data.countryCount} countries — built entirely
      on published World Bank, ILO and IMF data and open-source code.
    </p>
    <div class="hero-actions">
      <a href="/calculator" class="btn btn-primary">Run the cost calculator</a>
      <a href="/countries" class="btn btn-secondary">Browse country fact sheets</a>
    </div>
  </section>

  <div class="stat-strip no-print">
    <div class="card stat-card">
      <div class="stat-value">$${GLOBAL_INCOME_FLOOR_PPP}</div>
      <div class="stat-label">Global income floor / month (PPP)</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value">${data.countryCount}</div>
      <div class="stat-label">Countries modeled</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value">${formatCompact(data.totalPopulation)}</div>
      <div class="stat-label">People covered by the dataset</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value">${formatCompact(data.peopleInPoverty)}</div>
      <div class="stat-label">Living below a measured poverty line</div>
    </div>
  </div>

  <section class="site-section">
    <h2>Start with a country</h2>
    <p class="section-lede">
      Every country gets a fact sheet: the monthly entitlement, the annual cost of universal
      coverage, how it compares to the tax base, seven ways to fund it, and the estimated
      effect on poverty — each figure with its formula, assumptions and sources attached.
    </p>
    <div class="card" style="max-width:480px">
      <form action="/go" method="get" class="form-inline">
        <div class="form-group" style="flex:1">
          <label for="country-select">Country</label>
          <select id="country-select" name="country">
          ${countryOptions}
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Open fact sheet</button>
      </form>
    </div>
  </section>

  <section class="site-section">
    <h2>Built for the people making the case</h2>
    <div class="audience-grid">
      <div class="card audience-card">
        <div class="audience-kicker">For journalists</div>
        <h3>Numbers you can quote — and check</h3>
        <p>
          Every fact sheet has a copy-ready summary paragraph, a citation block, downloadable
          charts, and a shareable URL that reproduces the exact figures. No black box: the
          formula behind each number is shown on the page.
        </p>
        <div class="audience-links">
          <a href="/countries">Country fact sheets →</a>
          <a href="/methodology#citing">How to cite these figures →</a>
        </div>
      </div>
      <div class="card audience-card">
        <div class="audience-kicker">For researchers</div>
        <h3>Reproducible data and models</h3>
        <p>
          Download the full dataset with computed entitlements as CSV or JSON, read the
          documented methodology with every assumption listed, and drive the same
          calculations programmatically through the open API.
        </p>
        <div class="audience-links">
          <a href="/data">Dataset downloads →</a>
          <a href="/methodology">Full methodology →</a>
        </div>
      </div>
      <div class="card audience-card">
        <div class="audience-kicker">For policy makers</div>
        <h3>From "it's unaffordable" to a budget line</h3>
        <p>
          Model cost by coverage rate and target group, put it next to current tax revenue
          and social spending, and see what combination of funding mechanisms closes the gap
          — then print the result as a briefing page.
        </p>
        <div class="audience-links">
          <a href="/calculator">Cost &amp; funding calculator →</a>
          <a href="/compare">Compare candidate countries →</a>
        </div>
      </div>
    </div>
  </section>

  <section class="site-section">
    <h2>How the numbers are made</h2>
    <p class="section-lede">
      The entitlement is anchored to the World Bank upper-middle-income poverty line:
      $6.85/day (2017 PPP) ≈ <strong>$${GLOBAL_INCOME_FLOOR_PPP} per person per month</strong>, converted to each
      country's currency with its PPP conversion factor. Costs are computed from population
      and coverage, compared against PPP GDP so units always match, and impact estimates use
      country-appropriate poverty lines — not one global line for everyone. Every model is a
      pure function in an open repository.
    </p>
    <a href="/methodology" class="btn btn-secondary">Read the methodology</a>
  </section>

  <section class="site-section">
    <h2>Open infrastructure, not a black box</h2>
    <p class="section-lede">
      This platform is the neutral rails layer for basic income programs — the same code that
      renders these pages powers budget simulation, non-custodial disbursement and outcome
      tracking for real pilots. ${formatNumber(data.regionCount)} sub-national regions are already modeled for
      regional cost-of-living precision. Everything is open source and reusable.
    </p>
  </section>`;

  return publicLayout('What would basic income cost?', content, {
    active: 'home',
    dataVersion: data.dataVersion,
    includeGlobe: true,
  });
}
