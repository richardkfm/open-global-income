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
