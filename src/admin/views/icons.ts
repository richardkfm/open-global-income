/**
 * Inline SVG icon set for the OGI admin UI.
 *
 * All icons are hand-rolled — no external icon libraries.
 * Each function returns an SVG string with width="16" height="16" and
 * fill="currentColor" so they inherit the surrounding text colour.
 *
 * Usage:
 *   import { iconCountry } from './icons.js';
 *   `<span class="sidebar-section-icon">${iconCountry()}</span>`
 */

function svg(path: string, extraAttrs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"${extraAttrs}>${path}</svg>`;
}

/** Globe / country icon */
export function iconCountry(): string {
  return svg(
    `<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM2.05 8.5h2.02c.05.9.2 1.75.43 2.5H2.76A6.02 6.02 0 0 1 2.05 8.5zm0-1h.71A6.02 6.02 0 0 1 4.07 5H2.5a6.02 6.02 0 0 0-.45 2.5zm11.9 1h-2.02a11.3 11.3 0 0 1-.43 2.5h1.74A6.02 6.02 0 0 0 13.95 8.5zm0-1A6.02 6.02 0 0 0 13.5 5h-1.57a11.3 11.3 0 0 1 .45 2.5h2.57zm-8.9 0h5.9A10.3 10.3 0 0 0 10.5 5h-5a10.3 10.3 0 0 0-.45 2.5zm0 1A10.3 10.3 0 0 0 5.5 11h5a10.3 10.3 0 0 0 .45-2.5h-5.9zM5.5 5c.24-.87.58-1.65 1-2.26.18-.27.37-.5.57-.7A6.04 6.04 0 0 0 4.07 5H5.5zm3.93 0h1.43A6.04 6.04 0 0 0 8.93 2.04c.2.2.39.43.57.7.42.61.76 1.39 1 2.26zm-3.5 6h-1.5a6.04 6.04 0 0 0 3.43 2.96 4.86 4.86 0 0 1-.57-.7A8.48 8.48 0 0 1 5.93 11zm2.57 0c-.24.87-.58 1.65-1 2.26-.18.27-.37.5-.57.7A6.04 6.04 0 0 0 10.93 11H9.5z"/>`,
  );
}

/** Map pin / region icon */
export function iconRegion(): string {
  return svg(
    `<path d="M8 1a4.5 4.5 0 0 0-4.5 4.5c0 3 4.5 9 4.5 9s4.5-6 4.5-9A4.5 4.5 0 0 0 8 1zm0 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>`,
  );
}

/** Coins / money icon */
export function iconCoins(): string {
  return svg(
    `<path d="M6 2C3.24 2 1 3.12 1 4.5v2C1 7.88 3.24 9 6 9c.37 0 .73-.02 1.08-.06A5.5 5.5 0 0 0 6.5 10.5v.28C6.34 10.93 6.18 11 6 11c-2.76 0-5-1.12-5-2.5v2C1 11.88 3.24 13 6 13c.18 0 .36-.01.54-.03a5.5 5.5 0 0 0 1.23 1.87A9.93 9.93 0 0 1 6 15c-2.76 0-5-1.12-5-2.5v-8C1 3.12 3.24 2 6 2zm9 8.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zm-2.5-.75h-1.25V8.5a.75.75 0 0 0-1.5 0v1.25H8.5a.75.75 0 0 0 0 1.5h1.25V12.5a.75.75 0 0 0 1.5 0v-1.25H12.5a.75.75 0 0 0 0-1.5z"/>`,
  );
}

/** Bar chart icon */
export function iconChart(): string {
  return svg(
    `<path d="M2 11h2v2H2v-2zm3-3h2v5H5V8zm3-4h2v9H8V4zm3 2h2v7h-2V6z"/>`,
  );
}

/** Shield / security icon */
export function iconShield(): string {
  return svg(
    `<path d="M8 1 2 3.5v4C2 10.8 4.7 13.7 8 15c3.3-1.3 6-4.2 6-7.5v-4L8 1zm3.3 5.3-4 4-1.6-1.6 1-1 .6.6 3-3 1 1z"/>`,
  );
}

/** Check mark icon */
export function iconCheck(): string {
  return svg(
    `<path d="M13.5 3.5 6 11 2.5 7.5l-1 1L6 13l8.5-8.5-1-1z"/>`,
  );
}

/** Warning triangle icon */
export function iconWarn(): string {
  return svg(
    `<path d="M8 1.5 1 13.5h14L8 1.5zm0 2.8 5.2 8.7H2.8L8 4.3zM7.5 7v3h1V7h-1zm0 4v1h1v-1h-1z"/>`,
  );
}

/** Info circle icon */
export function iconInfo(): string {
  return svg(
    `<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm0 3.5c.28 0 .5.22.5.5v4a.5.5 0 0 1-1 0V8c0-.28.22-.5.5-.5z"/>`,
  );
}

/** External link icon */
export function iconLink(): string {
  return svg(
    `<path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9l-1-1v4H3V3h4l-1-1zm4-1h4v4l-1.5-1.5-4 4-1-1 4-4L10 1z"/>`,
  );
}

/** Download icon */
export function iconDownload(): string {
  return svg(
    `<path d="M8 1a.5.5 0 0 0-.5.5v8.3L5.35 7.65a.5.5 0 1 0-.7.7l3 3a.5.5 0 0 0 .7 0l3-3a.5.5 0 1 0-.7-.7L8.5 9.8V1.5A.5.5 0 0 0 8 1zM2 13.5A.5.5 0 0 1 2.5 13h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>`,
  );
}

/** Rocket / launch icon (used for pilots) */
export function iconRocket(): string {
  return svg(
    `<path d="M9.5 1C7 1 4 3.5 3 6L1.5 7.5l2.5 1L5 10l1 2.5L7.5 11c2.5-1 5-4 5-6.5 0-2-1.5-3.5-3-3.5zm1 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM3.5 9l-2 2 1 1 2-2-1-1z"/>`,
  );
}

/** Evidence / magnifier icon */
export function iconEvidence(): string {
  return svg(
    `<path d="M10.5 9.5 9.3 8.3A4.5 4.5 0 1 0 8.3 9.3l1.2 1.2 3 3 1-1-3-3zM6.5 9A3.5 3.5 0 1 1 6.5 2 3.5 3.5 0 0 1 6.5 9z"/>`,
  );
}

/** System / settings cog icon */
export function iconSystem(): string {
  return svg(
    `<path d="M8 5a3 3 0 1 0 0 6A3 3 0 0 0 8 5zm0 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM6.7 1l-.4 1.4a5.5 5.5 0 0 0-1.2.7L3.7 2.7 2 4.4l.6 1.4a5.5 5.5 0 0 0-.1 1.2l-1.4.4v2.4l1.4.4c.1.4.3.8.7 1.2L2.7 12 4.4 14l1.4-.6c.4.3.8.5 1.2.7l.4 1.4h2.4l.4-1.4c.4-.2.8-.4 1.2-.7l1.4.6L14 12l-.6-1.4c.3-.4.5-.8.7-1.2l1.4-.4V6.6l-1.4-.4a5.5 5.5 0 0 0-.7-1.2l.6-1.4L12 2 10.6 2.6A5.5 5.5 0 0 0 9.4 2L9 .6H6.7z"/>`,
  );
}
