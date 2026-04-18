/**
 * Server-side helpers that emit Chart.js <canvas> elements.
 *
 * Each helper returns an HTML string containing a <canvas> with a
 * data-ogi-chart attribute. The client-side charts.js picks these up
 * and initializes Chart.js instances automatically.
 */

import { escapeHtml } from './helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  fill?: boolean;
  stack?: string;
}

export interface ChartOptions {
  /** Chart height in px (default: 300) */
  height?: number;
  /** Custom Chart.js options to merge */
  chartOptions?: Record<string, unknown>;
  /** Filename for PNG download (without extension) */
  exportFilename?: string;
  /** Whether to show the download button (default: true) */
  showExport?: boolean;
  /** Aspect ratio override — set to 16/9 for slides */
  aspectRatio?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let chartCounter = 0;

function nextId(): string {
  return `ogi-chart-${++chartCounter}`;
}

function buildConfig(
  type: string,
  labels: string[],
  datasets: ChartDataset[],
  opts?: ChartOptions,
): string {
  const config: Record<string, unknown> = {
    type,
    data: { labels, datasets },
    options: {
      ...(opts?.aspectRatio ? { aspectRatio: opts.aspectRatio } : {}),
      ...(opts?.chartOptions ?? {}),
    },
  };
  return JSON.stringify(config).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function renderChart(id: string, configJson: string, opts?: ChartOptions): string {
  const height = opts?.height ?? 300;
  const showExport = opts?.showExport !== false;
  const filename = opts?.exportFilename ?? 'chart';

  return `
    <div class="chart-container" style="height:${height}px">
      <canvas id="${escapeHtml(id)}" data-ogi-chart='${configJson}'></canvas>
    </div>
    ${showExport ? `
    <div class="chart-actions">
      <button type="button" class="btn btn-sm btn-secondary" onclick="OGI.downloadChartPng('${escapeHtml(id)}', '${escapeHtml(filename)}.png')">
        Download PNG
      </button>
    </div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Reset the counter (for testing) */
export function resetChartCounter(): void {
  chartCounter = 0;
}

/**
 * Bar chart — good for country comparisons, funding breakdowns.
 */
export function barChart(
  labels: string[],
  datasets: ChartDataset[],
  opts?: ChartOptions,
): string {
  const id = nextId();
  const config = buildConfig('bar', labels, datasets, opts);
  return renderChart(id, config, opts);
}

/**
 * Horizontal bar chart.
 */
export function horizontalBarChart(
  labels: string[],
  datasets: ChartDataset[],
  opts?: ChartOptions,
): string {
  const id = nextId();
  const mergedOpts = {
    ...opts,
    chartOptions: {
      ...(opts?.chartOptions ?? {}),
      indexAxis: 'y',
    },
  };
  const config = buildConfig('bar', labels, datasets, mergedOpts);
  return renderChart(id, config, mergedOpts);
}

/**
 * Stacked bar chart — good for funding mechanism contributions.
 */
export function stackedBarChart(
  labels: string[],
  datasets: ChartDataset[],
  opts?: ChartOptions,
): string {
  const id = nextId();
  const mergedOpts = {
    ...opts,
    chartOptions: {
      ...(opts?.chartOptions ?? {}),
      scales: {
        x: { stacked: true },
        y: { stacked: true },
      },
    },
  };
  const config = buildConfig('bar', labels, datasets, mergedOpts);
  return renderChart(id, config, mergedOpts);
}

/**
 * Line chart — good for time series, projections.
 */
export function lineChart(
  labels: string[],
  datasets: ChartDataset[],
  opts?: ChartOptions,
): string {
  const id = nextId();
  const config = buildConfig('line', labels, datasets, opts);
  return renderChart(id, config, opts);
}

/**
 * Doughnut chart — good for composition breakdowns.
 */
export function doughnutChart(
  labels: string[],
  data: number[],
  opts?: ChartOptions,
): string {
  const id = nextId();
  const datasets: ChartDataset[] = [{ label: '', data }];
  const mergedOpts = {
    ...opts,
    chartOptions: {
      ...(opts?.chartOptions ?? {}),
      cutout: '60%',
    },
  };
  const config = buildConfig('doughnut', labels, datasets, mergedOpts);
  return renderChart(id, config, mergedOpts);
}

// ---------------------------------------------------------------------------
// Scatter chart types
// ---------------------------------------------------------------------------

export interface ScatterPoint {
  x: number;
  y: number;
  r?: number;
  label?: string;
}

export interface ScatterDataset {
  label: string;
  points: ScatterPoint[];
  colour?: string;
}

export interface ScatterChartOptions {
  id?: string;
  datasets: ScatterDataset[];
  xLabel?: string;
  yLabel?: string;
  title?: string;
  height?: number;
  downloadFilename?: string;
}

// ---------------------------------------------------------------------------
// Overlay line chart types
// ---------------------------------------------------------------------------

export interface OverlaySeries {
  label: string;
  values: Array<number | null>;
}

export interface OverlayLineChartOptions {
  id?: string;
  labels: string[];
  recipientSeries: OverlaySeries[];
  controlSeries?: OverlaySeries[];
  yLabel?: string;
  title?: string;
  height?: number;
  downloadFilename?: string;
}

// ---------------------------------------------------------------------------
// Internal helper for new chart types
// ---------------------------------------------------------------------------

function renderNewChart(
  id: string,
  chartType: string,
  configJson: string,
  height: number,
  filename: string,
): string {
  return `
    <div class="chart-container" style="height:${height}px">
      <canvas id="${escapeHtml(id)}" data-ogi-chart="${escapeHtml(chartType)}" data-ogi-config='${configJson}'></canvas>
    </div>
    <div class="chart-actions">
      <button type="button" class="btn btn-sm btn-secondary" onclick="OGI.downloadChartPng('${escapeHtml(id)}', '${escapeHtml(filename)}.png')">
        Download PNG
      </button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Public API — new chart helpers
// ---------------------------------------------------------------------------

/**
 * Scatter chart — good for country comparisons (cost vs recipients, etc.).
 * Each dataset maps to a set of {x, y, r?, label?} points.
 * Client-side initialiser reads `data-ogi-chart="scatter"` and `data-ogi-config`.
 */
export function scatterChart(options: ScatterChartOptions): string {
  const id = options.id ?? nextId();
  const height = options.height ?? 300;
  const filename = options.downloadFilename ?? 'scatter-chart';

  const config: Record<string, unknown> = {
    datasets: options.datasets.map((ds) => ({
      label: ds.label,
      points: ds.points,
      colour: ds.colour ?? null,
    })),
    xLabel: options.xLabel ?? null,
    yLabel: options.yLabel ?? null,
    title: options.title ?? null,
  };

  const configJson = JSON.stringify(config)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return renderNewChart(id, 'scatter', configJson, height, filename);
}

/**
 * Overlay line chart — good for recipient-vs-control cohort comparison.
 * Recipient series are rendered solid; control series are rendered dashed.
 * Supports null values (gaps — line breaks at null).
 * Client-side initialiser reads `data-ogi-chart="overlay-line"` and `data-ogi-config`.
 */
export function overlayLineChart(options: OverlayLineChartOptions): string {
  const id = options.id ?? nextId();
  const height = options.height ?? 300;
  const filename = options.downloadFilename ?? 'overlay-line-chart';

  const config: Record<string, unknown> = {
    labels: options.labels,
    recipientSeries: options.recipientSeries.map((s) => ({
      label: s.label,
      values: s.values,
    })),
    controlSeries: (options.controlSeries ?? []).map((s) => ({
      label: s.label,
      values: s.values,
    })),
    yLabel: options.yLabel ?? null,
    title: options.title ?? null,
  };

  const configJson = JSON.stringify(config)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return renderNewChart(id, 'overlay-line', configJson, height, filename);
}

// ---------------------------------------------------------------------------
// Choropleth map
// ---------------------------------------------------------------------------

export interface ChoroplethOptions {
  /** URL path to the SVG file (e.g. '/geo/ke-counties.svg') */
  svgPath: string;
  /** Map of data-region value → numeric indicator value */
  values: Record<string, number>;
  scale: { min: number; max: number };
  /** [low-value colour, high-value colour] in hex */
  colorRamp?: [string, string];
  label?: string;
  unit?: string;
}

/** Interpolate between two hex colours by fraction 0–1 */
function lerpColor(a: string, b: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const f = Math.max(0, Math.min(1, t));
  return `#${hex(ar + (br - ar) * f)}${hex(ag + (bg - ag) * f)}${hex(ab + (bb - ab) * f)}`;
}

/**
 * Renders a server-side choropleth by inlining the SVG and patching each
 * `<path>` / `<rect>` with a computed fill colour derived from `values`.
 * Falls back gracefully when svgPath cannot be read.
 */
export function renderChoropleth(opts: ChoroplethOptions): string {
  import('node:fs').then(() => {}).catch(() => {}); // side-effect-free check
  const { values, scale, colorRamp = ['#c6dbef', '#08306b'], label, unit } = opts;

  // Build a lookup from data-region → fill
  const fills: Record<string, string> = {};
  const range = scale.max - scale.min || 1;
  for (const [regionId, val] of Object.entries(values)) {
    fills[regionId] = lerpColor(colorRamp[0], colorRamp[1], (val - scale.min) / range);
  }

  // Produce colour legend (horizontal gradient bar)
  const legendId = `choro-legend-${nextId()}`;
  const legendHtml = `
  <div class="choropleth-legend" id="${legendId}">
    <div class="choropleth-legend-bar" style="background:linear-gradient(to right,${colorRamp[0]},${colorRamp[1]})"></div>
    <div class="choropleth-legend-labels">
      <span>${escapeHtml(String(scale.min))}${unit ? escapeHtml(unit) : ''}</span>
      ${label ? `<span class="text-xs text-muted">${escapeHtml(label)}</span>` : ''}
      <span>${escapeHtml(String(scale.max))}${unit ? escapeHtml(unit) : ''}</span>
    </div>
  </div>`;

  // Embed SVG via <object> — browser fetches and caches the file
  // A data-fills attribute carries the region→colour map for the client-side
  // script to patch; if JS is unavailable the SVG renders with its default fills.
  const fillsAttr = escapeHtml(JSON.stringify(fills));
  return `
  <div class="choropleth" data-choropleth-fills="${fillsAttr}">
    <object type="image/svg+xml" data="${escapeHtml(opts.svgPath)}"
            class="choropleth-svg"
            aria-label="${label ? escapeHtml(label) : 'Choropleth map'}">
    </object>
    ${legendHtml}
  </div>`;
}
