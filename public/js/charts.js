/**
 * OGI Chart Helpers — client-side Chart.js initialization and export.
 *
 * Charts are rendered server-side as <canvas data-ogi-chart="..."> elements.
 * This script picks them up on DOMContentLoaded and after htmx swaps.
 */

/* global Chart */

// Professional color palette (Stripe/Linear inspired)
const OGI_COLORS = {
  indigo:  '#4f46e5',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#ef4444',
  sky:     '#0ea5e9',
  violet:  '#8b5cf6',
  teal:    '#14b8a6',
  pink:    '#ec4899',
};

const OGI_PALETTE = Object.values(OGI_COLORS);

const OGI_PALETTE_LIGHT = [
  '#eef2ff', '#ecfdf5', '#fffbeb', '#fef2f2',
  '#f0f9ff', '#f5f3ff', '#f0fdfa', '#fdf2f8',
];

// Default Chart.js configuration
const DEFAULT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        padding: 16,
        usePointStyle: true,
        pointStyleWidth: 8,
        font: { family: "'Inter', system-ui, sans-serif", size: 12 },
      },
    },
    tooltip: {
      backgroundColor: '#1f2937',
      titleFont: { family: "'Inter', system-ui, sans-serif", size: 13 },
      bodyFont: { family: "'Inter', system-ui, sans-serif", size: 12 },
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        font: { family: "'Inter', system-ui, sans-serif", size: 11 },
        color: '#6b7280',
      },
      border: { display: false },
    },
    y: {
      grid: { color: '#f3f4f6' },
      ticks: {
        font: { family: "'Inter', system-ui, sans-serif", size: 11 },
        color: '#6b7280',
      },
      border: { display: false },
    },
  },
};

/**
 * Initialize all un-rendered OGI charts on the page.
 */
function initOgiCharts() {
  document.querySelectorAll('canvas[data-ogi-chart]').forEach((canvas) => {
    if (canvas._ogiChart) return; // Already initialized

    try {
      const config = JSON.parse(canvas.getAttribute('data-ogi-chart'));
      if (!config || !config.type) return;

      // Merge default options with chart-specific options
      const options = mergeDeep({}, DEFAULT_OPTIONS, config.options || {});

      // Apply palette to datasets that don't have explicit colors
      if (config.data && config.data.datasets) {
        config.data.datasets.forEach((ds, i) => {
          const color = OGI_PALETTE[i % OGI_PALETTE.length];
          const lightColor = OGI_PALETTE_LIGHT[i % OGI_PALETTE_LIGHT.length];

          if (config.type === 'bar' || config.type === 'doughnut' || config.type === 'pie') {
            if (!ds.backgroundColor) {
              ds.backgroundColor = config.data.datasets.length === 1
                ? config.data.labels.map((_, j) => OGI_PALETTE[j % OGI_PALETTE.length])
                : color;
            }
            if (!ds.borderColor && config.type !== 'bar') {
              ds.borderColor = '#ffffff';
              ds.borderWidth = 2;
            }
          } else if (config.type === 'line') {
            if (!ds.borderColor) ds.borderColor = color;
            if (!ds.backgroundColor) ds.backgroundColor = lightColor;
            if (ds.fill === undefined) ds.fill = false;
            if (!ds.tension) ds.tension = 0.3;
            if (!ds.pointRadius && ds.pointRadius !== 0) ds.pointRadius = 3;
            if (!ds.pointHoverRadius) ds.pointHoverRadius = 5;
          }
        });
      }

      // White background for PNG export
      const whiteBackground = {
        id: 'whiteBackground',
        beforeDraw(chart) {
          const ctx = chart.canvas.getContext('2d');
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, chart.width, chart.height);
          ctx.restore();
        },
      };

      const chart = new Chart(canvas, {
        type: config.type,
        data: config.data,
        options,
        plugins: [whiteBackground],
      });

      canvas._ogiChart = chart;
    } catch (err) {
      console.error('Failed to initialize OGI chart:', err);
    }
  });
}

/**
 * Download a chart as PNG image.
 */
function downloadChartPng(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas._ogiChart) return;

  const link = document.createElement('a');
  link.download = filename || 'chart.png';
  link.href = canvas.toDataURL('image/png', 1.0);
  link.click();
}

/**
 * Deep merge utility for options objects.
 */
function mergeDeep(target, ...sources) {
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        mergeDeep(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  return target;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initOgiCharts);

// Re-initialize after htmx content swaps
document.addEventListener('htmx:afterSwap', initOgiCharts);
document.addEventListener('htmx:afterSettle', initOgiCharts);

// Expose globally for download buttons
window.OGI = window.OGI || {};
window.OGI.downloadChartPng = downloadChartPng;
window.OGI.initCharts = initOgiCharts;
window.OGI.COLORS = OGI_COLORS;
window.OGI.PALETTE = OGI_PALETTE;
