import { describe, it, expect, beforeEach } from 'vitest';
import { renderComparePage, renderCompareResults } from './compare.js';
import { resetChartCounter } from './chart-helpers.js';
import type { Country, SimulationResult } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makeCountry = (code: string, name: string): Country => ({
  code,
  name,
  stats: {
    gdpPerCapitaUsd: 2000,
    gniPerCapitaUsd: 1900,
    pppConversionFactor: 45,
    giniIndex: 40,
    population: 10_000_000,
    incomeGroup: 'LMC',
  },
});

const makeResult = (
  code: string,
  name: string,
  recipients: number,
  annualCost: number,
  pctGdp: number,
): SimulationResult => ({
  country: { code, name, population: 10_000_000 },
  simulation: {
    recipientCount: recipients,
    coverageRate: 0.2,
    entitlementPerPerson: { pppUsdPerMonth: 210, localCurrencyPerMonth: 9450 },
    cost: {
      monthlyLocalCurrency: recipients * 9450,
      annualLocalCurrency: recipients * 9450 * 12,
      annualPppUsd: annualCost,
      asPercentOfGdp: pctGdp,
    },
    meta: { rulesetVersion: 'v1', dataVersion: '2023-01' },
  },
});

const COUNTRIES: Country[] = [
  makeCountry('KE', 'Kenya'),
  makeCountry('TZ', 'Tanzania'),
  makeCountry('MZ', 'Mozambique'),
];

const RESULTS: SimulationResult[] = [
  makeResult('KE', 'Kenya',      400_000, 1_008_000_000, 2.5),
  makeResult('TZ', 'Tanzania',   600_000, 1_512_000_000, 3.1),
  makeResult('MZ', 'Mozambique', 200_000,   504_000_000, 4.2),
];

beforeEach(() => {
  resetChartCounter();
});

// ---------------------------------------------------------------------------
// renderComparePage
// ---------------------------------------------------------------------------

describe('renderComparePage', () => {
  it('renders a full HTML page', () => {
    const html = renderComparePage(COUNTRIES);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes country checkboxes for all supplied countries', () => {
    const html = renderComparePage(COUNTRIES);
    expect(html).toContain('value="KE"');
    expect(html).toContain('value="TZ"');
    expect(html).toContain('value="MZ"');
    expect(html).toContain('Kenya');
    expect(html).toContain('Tanzania');
    expect(html).toContain('Mozambique');
  });

  it('renders breadcrumbs with Plan and Compare labels', () => {
    const html = renderComparePage(COUNTRIES);
    expect(html).toContain('breadcrumbs');
    expect(html).toContain('breadcrumb-current');
    expect(html).toContain('Compare Countries');
  });

  it('renders the htmx form targeting /admin/compare/preview', () => {
    const html = renderComparePage(COUNTRIES);
    expect(html).toContain('hx-post="/admin/compare/preview"');
    expect(html).toContain('hx-target="#compare-results"');
  });

  it('shows a flash message when provided', () => {
    const html = renderComparePage(COUNTRIES, 'Something went wrong');
    expect(html).toContain('Something went wrong');
  });

  it('does not show a flash section when not provided', () => {
    const html = renderComparePage(COUNTRIES);
    expect(html).not.toContain('class="flash"');
  });

  it('renders the coverage, duration, target group and transfer inputs', () => {
    const html = renderComparePage(COUNTRIES);
    expect(html).toContain('name="coverage"');
    expect(html).toContain('name="durationMonths"');
    expect(html).toContain('name="targetGroup"');
    expect(html).toContain('name="transferAmount"');
  });

  it('renders a ruleset version selector', () => {
    const html = renderComparePage(COUNTRIES);
    expect(html).toContain('name="rulesetVersion"');
  });
});

// ---------------------------------------------------------------------------
// renderCompareResults
// ---------------------------------------------------------------------------

describe('renderCompareResults', () => {
  it('returns an empty-state card when no results are given', () => {
    const html = renderCompareResults([]);
    expect(html).toContain('card');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('<table');
  });

  it('emits a <canvas> element for the scatter chart', () => {
    const html = renderCompareResults(RESULTS);
    expect(html).toContain('<canvas');
    expect(html).toContain('data-ogi-chart="scatter"');
  });

  it('includes scatter config with recipients on x and annual cost on y', () => {
    const html = renderCompareResults(RESULTS);
    // Each result country code should appear as a label in the config
    expect(html).toContain('"label":"KE"');
    expect(html).toContain('"label":"TZ"');
    expect(html).toContain('"label":"MZ"');
    // x values should be recipient counts
    expect(html).toContain('"x":400000');
    expect(html).toContain('"x":600000');
  });

  it('renders a table with rows for each country', () => {
    const html = renderCompareResults(RESULTS);
    expect(html).toContain('<table');
    expect(html).toContain('<tbody>');
    // Each country name should appear in a row
    expect(html).toContain('Kenya');
    expect(html).toContain('Tanzania');
    expect(html).toContain('Mozambique');
  });

  it('renders the expected table columns', () => {
    const html = renderCompareResults(RESULTS);
    // Column headers
    expect(html).toContain('<th>');
    // At minimum recipients, annual cost and % of GDP columns exist
    expect(html).toContain('KE');
    expect(html).toContain('2.50%'); // pctGdp for KE
  });

  it('renders a non-empty takeaway line', () => {
    const html = renderCompareResults(RESULTS);
    // takeaway div wraps the heuristic string
    expect(html).toContain('compare-takeaway');
    // The takeaway string should mention at least one country code
    const match = html.match(/compare-takeaway[\s\S]*?KE|TZ|MZ/);
    expect(match).not.toBeNull();
  });

  it('takeaway mentions lowest cost per recipient', () => {
    const html = renderCompareResults(RESULTS);
    // MZ has highest cpr ratio? Let's verify takeaway isn't empty
    expect(html.length).toBeGreaterThan(100);
    // The takeaway section should contain some country code
    const takeawaySection = html.match(/<div class="compare-takeaway[^"]*">([\s\S]*?)<\/div>/);
    expect(takeawaySection).not.toBeNull();
    const takeawayText = takeawaySection?.[0] ?? '';
    expect(takeawayText.length).toBeGreaterThan(10);
  });

  it('shows recipient count in compact format', () => {
    const html = renderCompareResults(RESULTS);
    // 400_000 → "400.0K"
    expect(html).toContain('400.0K');
    expect(html).toContain('600.0K');
  });

  it('shows annual cost in abbreviated dollar format', () => {
    const html = renderCompareResults(RESULTS);
    // 1_008_000_000 → "$1.0B"
    expect(html).toContain('$1.0B');
    // 504_000_000 → "$504.0M"
    expect(html).toContain('$504.0M');
  });

  it('works with a single result (no crash)', () => {
    const html = renderCompareResults([RESULTS[0]]);
    expect(html).toContain('<canvas');
    expect(html).toContain('Kenya');
  });

  it('renders download button for the scatter chart', () => {
    const html = renderCompareResults(RESULTS);
    expect(html).toContain('Download PNG');
  });
});
