/**
 * Server-rendered HTML layout for the PUBLIC site.
 *
 * Unlike the admin layout (sidebar, sessions, htmx) this is a plain
 * top-nav document aimed at journalists, researchers and policy makers:
 * no login, no JavaScript required to read anything, shareable URLs,
 * and print-friendly output. Chart.js is included only when a page
 * actually renders charts.
 */
import { escapeHtml } from '../../admin/views/helpers.js';
import { packageVersion } from '../../config.js';

const REPO_URL = 'https://github.com/richardkfm/open-global-income';

export type PublicNavKey =
  | 'home'
  | 'countries'
  | 'calculator'
  | 'compare'
  | 'methodology'
  | 'data';

export interface PublicLayoutOptions {
  /** Which top-nav item to highlight */
  active?: PublicNavKey;
  /** Meta description for the page */
  description?: string;
  /** Include Chart.js + charts.js (only pages that render charts) */
  includeCharts?: boolean;
  /** Data snapshot identifier shown in the footer */
  dataVersion?: string;
}

const NAV_ITEMS: Array<{ key: PublicNavKey; href: string; label: string }> = [
  { key: 'countries', href: '/countries', label: 'Countries' },
  { key: 'calculator', href: '/calculator', label: 'Cost calculator' },
  { key: 'compare', href: '/compare', label: 'Compare' },
  { key: 'methodology', href: '/methodology', label: 'Methodology' },
  { key: 'data', href: '/data', label: 'Data & API' },
];

export function publicLayout(
  title: string,
  content: string,
  opts: PublicLayoutOptions = {},
): string {
  const description =
    opts.description ??
    'Open, auditable answers to what a universal basic income would cost, how it could be funded, and what it would change — for 49 countries, built on World Bank data.';

  const navHtml = NAV_ITEMS.map((item) => {
    const active = opts.active === item.key ? ' active' : '';
    return `<a href="${item.href}" class="site-nav-link${active}">${escapeHtml(item.label)}</a>`;
  }).join('\n      ');

  const chartScripts = opts.includeCharts
    ? `
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="/js/charts.js" defer></script>`
    : '';

  const dataVersionHtml = opts.dataVersion
    ? `<span>Data snapshot: ${escapeHtml(opts.dataVersion)}</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)} — Open Global Income</title>
  <link href="/css/ogi.css" rel="stylesheet">
  <link href="/css/site.css" rel="stylesheet">${chartScripts}
</head>
<body class="site">
  <header class="site-header">
    <div class="site-header-inner">
      <a href="/" class="site-brand">
        <span class="site-brand-name">Open Global Income</span>
        <span class="site-brand-tagline">Open infrastructure for basic income</span>
      </a>
      <nav class="site-nav" aria-label="Main">
        ${navHtml}
        <a href="${REPO_URL}" class="site-nav-link" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </nav>
    </div>
  </header>
  <main class="site-main">
    ${content}
  </main>
  <footer class="site-footer">
    <div class="site-footer-inner">
      <div>
        <h4>Open Global Income</h4>
        <p>
          The shared, auditable infrastructure layer for universal basic income.
          Every number on this site is produced by open-source code from published
          World Bank, ILO and IMF data — so any journalist, researcher or ministry
          can verify, reproduce, or challenge it.
        </p>
      </div>
      <div>
        <h4>Explore</h4>
        <ul>
          <li><a href="/countries">Country fact sheets</a></li>
          <li><a href="/calculator">Cost calculator</a></li>
          <li><a href="/compare">Compare countries</a></li>
          <li><a href="/methodology">Methodology</a></li>
        </ul>
      </div>
      <div>
        <h4>For developers</h4>
        <ul>
          <li><a href="/data">Data downloads</a></li>
          <li><a href="/docs" target="_blank" rel="noopener">API reference ↗</a></li>
          <li><a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">Source code ↗</a></li>
          <li><a href="/admin">Operator sign-in</a></li>
        </ul>
      </div>
    </div>
    <div class="site-footer-legal">
      <span>v${escapeHtml(packageVersion)}</span>
      ${dataVersionHtml}
      <span>Code and data are open source — reuse with attribution.</span>
    </div>
  </footer>
  <script>
  // Copy-to-clipboard for [data-copy] buttons (citations, share links, pull quotes)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var text = btn.getAttribute('data-copy').split('__URL__').join(location.href);
    navigator.clipboard.writeText(text).then(function () {
      var original = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(function () { btn.textContent = original; }, 1600);
    });
  });
  </script>
</body>
</html>`;
}
