import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetChartCounter,
  scatterChart,
  overlayLineChart,
} from './chart-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the data-ogi-config JSON from an HTML string returned by a helper.
 * Returns the parsed object.
 */
function parseConfig(html: string): Record<string, unknown> {
  const match = html.match(/data-ogi-config='([^']+)'/);
  if (!match) throw new Error('No data-ogi-config attribute found in:\n' + html);
  return JSON.parse(match[1]);
}

/**
 * Extract the data-ogi-chart attribute value from an HTML string.
 */
function getChartType(html: string): string {
  const match = html.match(/data-ogi-chart="([^"]+)"/);
  if (!match) throw new Error('No data-ogi-chart attribute found in:\n' + html);
  return match[1];
}

/**
 * Extract the canvas id from an HTML string.
 */
function getCanvasId(html: string): string {
  const match = html.match(/<canvas id="([^"]+)"/);
  if (!match) throw new Error('No canvas id found in:\n' + html);
  return match[1];
}

// ---------------------------------------------------------------------------
// scatterChart
// ---------------------------------------------------------------------------

describe('scatterChart', () => {
  beforeEach(() => resetChartCounter());

  it('emits a canvas with data-ogi-chart="scatter"', () => {
    const html = scatterChart({
      datasets: [{ label: 'Group A', points: [{ x: 1, y: 2 }] }],
    });
    expect(getChartType(html)).toBe('scatter');
  });

  it('config JSON round-trips: datasets, labels and points', () => {
    const html = scatterChart({
      datasets: [
        {
          label: 'Kenya',
          points: [
            { x: 100_000, y: 5_000_000, r: 8, label: 'KE' },
            { x: 200_000, y: 7_500_000 },
          ],
          colour: '#4f46e5',
        },
      ],
      xLabel: 'Recipients',
      yLabel: 'Annual Cost (USD)',
      title: 'Cost vs Recipients',
    });

    const config = parseConfig(html);

    const datasets = config.datasets as Array<{
      label: string;
      points: Array<{ x: number; y: number; r?: number; label?: string }>;
      colour: string | null;
    }>;

    expect(datasets).toHaveLength(1);
    expect(datasets[0].label).toBe('Kenya');
    expect(datasets[0].colour).toBe('#4f46e5');
    expect(datasets[0].points[0]).toEqual({ x: 100_000, y: 5_000_000, r: 8, label: 'KE' });
    expect(datasets[0].points[1]).toEqual({ x: 200_000, y: 7_500_000 });

    expect(config.xLabel).toBe('Recipients');
    expect(config.yLabel).toBe('Annual Cost (USD)');
    expect(config.title).toBe('Cost vs Recipients');
  });

  it('uses the supplied id when provided', () => {
    const html = scatterChart({ id: 'my-custom-id', datasets: [] });
    expect(getCanvasId(html)).toBe('my-custom-id');
  });

  it('auto-generates a canvas id when none provided', () => {
    const html = scatterChart({ datasets: [] });
    const id = getCanvasId(html);
    expect(id).toMatch(/^ogi-chart-\d+$/);
  });

  it('renders a Download PNG button', () => {
    const html = scatterChart({ datasets: [], downloadFilename: 'my-scatter' });
    expect(html).toContain('Download PNG');
    expect(html).toContain('my-scatter.png');
  });

  it('edge: empty datasets array produces valid JSON', () => {
    const html = scatterChart({ datasets: [] });
    expect(() => parseConfig(html)).not.toThrow();
    const config = parseConfig(html);
    expect(config.datasets).toEqual([]);
  });

  it('edge: empty points array in a dataset', () => {
    const html = scatterChart({
      datasets: [{ label: 'Empty', points: [] }],
    });
    const config = parseConfig(html);
    const datasets = config.datasets as Array<{ label: string; points: unknown[] }>;
    expect(datasets[0].points).toEqual([]);
  });

  it('XSS: dataset label with <script> is safely encoded in config JSON', () => {
    const maliciousLabel = '<script>alert("xss")</script>';
    const html = scatterChart({
      datasets: [{ label: maliciousLabel, points: [] }],
    });
    // The raw HTML must not contain the unescaped tag
    expect(html).not.toContain('<script>');
    // But round-tripping through JSON.parse must restore the original string
    const config = parseConfig(html);
    const datasets = config.datasets as Array<{ label: string }>;
    expect(datasets[0].label).toBe(maliciousLabel);
  });

  it('XSS: xLabel with </script> is safely encoded', () => {
    const malicious = '</script><img onerror=alert(1)>';
    const html = scatterChart({ datasets: [], xLabel: malicious });
    expect(html).not.toContain('</script>');
    const config = parseConfig(html);
    expect(config.xLabel).toBe(malicious);
  });
});

// ---------------------------------------------------------------------------
// overlayLineChart
// ---------------------------------------------------------------------------

describe('overlayLineChart', () => {
  beforeEach(() => resetChartCounter());

  it('emits a canvas with data-ogi-chart="overlay-line"', () => {
    const html = overlayLineChart({
      labels: ['Jan', 'Feb'],
      recipientSeries: [{ label: 'Recipient', values: [10, 20] }],
    });
    expect(getChartType(html)).toBe('overlay-line');
  });

  it('config JSON round-trips: labels, recipientSeries, controlSeries', () => {
    const html = overlayLineChart({
      labels: ['2024-01', '2024-02', '2024-03'],
      recipientSeries: [
        { label: 'Income', values: [100, 120, 115] },
        { label: 'Expenditure', values: [90, 95, 100] },
      ],
      controlSeries: [
        { label: 'Control Income', values: [80, 82, 85] },
      ],
      yLabel: 'USD per month',
      title: 'Recipient vs Control',
    });

    const config = parseConfig(html);

    expect(config.labels).toEqual(['2024-01', '2024-02', '2024-03']);

    const rec = config.recipientSeries as Array<{ label: string; values: unknown[] }>;
    expect(rec).toHaveLength(2);
    expect(rec[0].label).toBe('Income');
    expect(rec[0].values).toEqual([100, 120, 115]);

    const ctrl = config.controlSeries as Array<{ label: string; values: unknown[] }>;
    expect(ctrl).toHaveLength(1);
    expect(ctrl[0].label).toBe('Control Income');

    expect(config.yLabel).toBe('USD per month');
    expect(config.title).toBe('Recipient vs Control');
  });

  it('uses the supplied id when provided', () => {
    const html = overlayLineChart({ id: 'overlay-1', labels: [], recipientSeries: [] });
    expect(getCanvasId(html)).toBe('overlay-1');
  });

  it('auto-generates a canvas id when none provided', () => {
    const html = overlayLineChart({ labels: [], recipientSeries: [] });
    expect(getCanvasId(html)).toMatch(/^ogi-chart-\d+$/);
  });

  it('renders a Download PNG button', () => {
    const html = overlayLineChart({
      labels: [],
      recipientSeries: [],
      downloadFilename: 'cohort-comparison',
    });
    expect(html).toContain('Download PNG');
    expect(html).toContain('cohort-comparison.png');
  });

  it('omits controlSeries key defaults to empty array in config', () => {
    const html = overlayLineChart({
      labels: ['Q1'],
      recipientSeries: [{ label: 'R', values: [42] }],
    });
    const config = parseConfig(html);
    expect(config.controlSeries).toEqual([]);
  });

  it('edge: empty labels and empty series arrays', () => {
    const html = overlayLineChart({ labels: [], recipientSeries: [] });
    expect(() => parseConfig(html)).not.toThrow();
    const config = parseConfig(html);
    expect(config.labels).toEqual([]);
    expect(config.recipientSeries).toEqual([]);
    expect(config.controlSeries).toEqual([]);
  });

  it('edge: null values in series produce valid JSON', () => {
    const html = overlayLineChart({
      labels: ['Jan', 'Feb', 'Mar'],
      recipientSeries: [{ label: 'Series A', values: [10, null, 30] }],
      controlSeries: [{ label: 'Control', values: [null, 15, null] }],
    });
    expect(() => parseConfig(html)).not.toThrow();
    const config = parseConfig(html);
    const rec = config.recipientSeries as Array<{ values: unknown[] }>;
    expect(rec[0].values).toEqual([10, null, 30]);
    const ctrl = config.controlSeries as Array<{ values: unknown[] }>;
    expect(ctrl[0].values).toEqual([null, 15, null]);
  });

  it('XSS: series label with <script> is safely encoded in config JSON', () => {
    const maliciousLabel = '<script>alert("xss")</script>';
    const html = overlayLineChart({
      labels: [],
      recipientSeries: [{ label: maliciousLabel, values: [] }],
      controlSeries: [{ label: maliciousLabel, values: [] }],
    });
    expect(html).not.toContain('<script>');
    const config = parseConfig(html);
    const rec = config.recipientSeries as Array<{ label: string }>;
    expect(rec[0].label).toBe(maliciousLabel);
    const ctrl = config.controlSeries as Array<{ label: string }>;
    expect(ctrl[0].label).toBe(maliciousLabel);
  });

  it('XSS: title with </script> is safely encoded', () => {
    const malicious = '</script><svg/onload=alert(1)>';
    const html = overlayLineChart({
      labels: [],
      recipientSeries: [],
      title: malicious,
    });
    expect(html).not.toContain('</script>');
    const config = parseConfig(html);
    expect(config.title).toBe(malicious);
  });
});
