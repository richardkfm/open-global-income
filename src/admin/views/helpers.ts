/**
 * Shared template helpers for admin views.
 *
 * These functions were previously duplicated across every view module.
 * Import from here instead of redefining locally.
 */
import type { Citation } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

/**
 * HTML-escape a string so it is safe to interpolate into template literals
 * that produce HTML. Escapes &, <, >, and ".
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * Format a number with locale-aware thousands separators.
 *
 * @param n - The number to format.
 * @param locale - BCP-47 locale tag (default: en-US).
 * @param maximumFractionDigits - Maximum decimal places (default: 0).
 */
export function formatNumber(
  n: number,
  locale = 'en-US',
  maximumFractionDigits = 0,
): string {
  return n.toLocaleString(locale, { maximumFractionDigits });
}

/**
 * Format a currency amount with the proper symbol and locale separators.
 *
 * Uses the browser/Node Intl.NumberFormat so the symbol placement and
 * grouping follow CLDR rules for the given locale.
 *
 * @param amount - Numeric amount.
 * @param currencyCode - ISO 4217 code (e.g. 'USD', 'KES').
 * @param locale - BCP-47 locale tag (default: en-US).
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a ratio or rate as a percentage string.
 *
 * @param n - Value to display as a percentage (e.g. 0.42 or 42 — the raw
 *            number is used directly; callers must scale if needed).
 * @param decimals - Decimal places (default: 1).
 */
export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

/**
 * Format large numbers compactly, e.g. 1_200_000 → "1.2M".
 *
 * Thresholds: T (≥ 1e12), B (≥ 1e9), M (≥ 1e6), K (≥ 1e3),
 * otherwise locale-formatted integer.
 */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return formatNumber(Math.round(n));
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Format an ISO 8601 date string for human-readable display.
 *
 * @param iso - ISO date string (e.g. "2024-03-15T12:00:00Z").
 * @param locale - BCP-47 locale tag (default: en-US).
 */
export function formatDate(iso: string, locale = 'en-US'): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// UI Component helpers
// ---------------------------------------------------------------------------

/**
 * Render a horizontal breadcrumb trail.
 * Items with an `href` are rendered as links; the last item is always rendered
 * as a plain span (current page). Items are separated by a `›` glyph.
 */
export function renderBreadcrumbs(crumbs: Array<{ label: string; href?: string }>): string {
  if (!crumbs.length) return '';
  const items = crumbs.map((crumb, i) => {
    const isLast = i === crumbs.length - 1;
    const sep = i > 0 ? '<span class="breadcrumb-sep" aria-hidden="true">›</span>' : '';
    const item = isLast || !crumb.href
      ? `<span class="breadcrumb-item breadcrumb-current">${escapeHtml(crumb.label)}</span>`
      : `<a class="breadcrumb-item" href="${crumb.href}">${escapeHtml(crumb.label)}</a>`;
    return sep + item;
  });
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.join('\n')}</nav>`;
}

/**
 * Render a CSS-only collapsible drawer using the <details>/<summary> pattern.
 * No JavaScript required. The drawer opens/closes natively.
 *
 * @param id           Unique id applied to the <details> element.
 * @param triggerLabel Text shown in the summary (e.g. "How this is calculated").
 * @param title        Heading rendered inside the open drawer.
 * @param contentHtml  Pre-built HTML for the drawer body.
 */
export function renderDrawer(id: string, triggerLabel: string, title: string, contentHtml: string): string {
  return `<details class="drawer" id="${escapeHtml(id)}">
  <summary class="drawer-summary">${escapeHtml(triggerLabel)}</summary>
  <div class="drawer-body">
    <div class="drawer-title">${escapeHtml(title)}</div>
    ${contentHtml}
  </div>
</details>`;
}

/**
 * Render an inline dismissible toast notification.
 * Use CSS `:target` or htmx `hx-swap-oob` to show/hide it.
 * The `variant` controls the colour scheme.
 */
export function renderToast(message: string, variant: 'success' | 'error' | 'info' | 'warning' = 'info'): string {
  return `<div class="toast toast-${escapeHtml(variant)}" role="alert" aria-live="polite">
  ${escapeHtml(message)}
</div>`;
}

/**
 * Render a numbered citation footnote list from a Citation[].
 * Each item is anchored at `#cite-{id}` so inline superscripts can link to it.
 */
export function renderCitations(citations: Citation[]): string {
  if (!citations.length) return '';
  const items = citations.map(c => {
    const parts: string[] = [];
    parts.push(`<strong>${escapeHtml(c.source)}</strong>`);
    if (c.year) parts.push(escapeHtml(String(c.year)));
    if (c.indicatorCode) parts.push(`<code>${escapeHtml(c.indicatorCode)}</code>`);
    if (c.note) parts.push(escapeHtml(c.note));
    const link = c.url
      ? ` <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" class="citation-link">↗</a>`
      : '';
    return `<li class="citation-item" id="cite-${escapeHtml(c.id)}">${parts.join(' · ')}${link}</li>`;
  });
  return `<ol class="citation-list">${items.join('\n')}</ol>`;
}

/**
 * Render an inline superscript link to a citation footnote.
 * Typically placed immediately after a statistic in body copy.
 *
 * @param citationId The `id` from the Citation object (e.g. "c1").
 */
export function renderCitationSup(citationId: string): string {
  return `<sup class="citation-sup"><a href="#cite-${escapeHtml(citationId)}">[${escapeHtml(citationId)}]</a></sup>`;
}
