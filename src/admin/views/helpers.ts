/**
 * Shared template helpers for admin views.
 *
 * These functions were previously duplicated across every view module.
 * Import from here instead of redefining locally.
 */

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
