/**
 * ASCII logo for Open Global Income.
 *
 * Printed on:
 * - `npm install` (see scripts/postinstall.js — plain JS copy)
 * - server start (see src/index.ts)
 * - top of README.md, as the vector rendering docs/assets/logo.svg
 *
 * If you edit the art, update scripts/postinstall.js to match and regenerate
 * the SVG (scripts/generate-readme-assets.mjs, which carries its own copy).
 */

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
} as const;

export const ASCII_LOGO = `
     ╔═══════════════════════════════════════════════════════╗
     ║                                                       ║
     ║        ██████╗  ██████╗ ██╗                           ║
     ║       ██╔═══██╗██╔════╝ ██║                           ║
     ║       ██║   ██║██║  ███╗██║                           ║
     ║       ██║   ██║██║   ██║██║                           ║
     ║       ╚██████╔╝╚██████╔╝██║                           ║
     ║        ╚═════╝  ╚═════╝ ╚═╝                           ║
     ║                                                       ║
     ║   O P E N   G L O B A L   I N C O M E                 ║
     ║                                                       ║
     ║   Shared infrastructure for universal basic income    ║
     ║   ─────────────────────────────────────────────────   ║
     ║   DATA → CALCULATION → SIMULATION → DISTRIBUTION      ║
     ║                                                       ║
     ╚═══════════════════════════════════════════════════════╝
`;

export const COLORED_LOGO = `
${C.cyan}     ╔═══════════════════════════════════════════════════════╗
     ║                                                       ║
     ║${C.yellow}        ██████╗  ██████╗ ██╗${C.cyan}                           ║
     ║${C.yellow}       ██╔═══██╗██╔════╝ ██║${C.cyan}                           ║
     ║${C.yellow}       ██║   ██║██║  ███╗██║${C.cyan}                           ║
     ║${C.yellow}       ██║   ██║██║   ██║██║${C.cyan}                           ║
     ║${C.yellow}       ╚██████╔╝╚██████╔╝██║${C.cyan}                           ║
     ║${C.yellow}        ╚═════╝  ╚═════╝ ╚═╝${C.cyan}                           ║
     ║                                                       ║
     ║${C.reset}${C.bold}   O P E N   G L O B A L   I N C O M E${C.reset}${C.cyan}                 ║
     ║                                                       ║
     ║${C.reset}   Shared infrastructure for universal basic income${C.cyan}    ║
     ║${C.reset}${C.dim}   ─────────────────────────────────────────────────${C.reset}${C.cyan}   ║
     ║${C.reset}${C.dim}   DATA → CALCULATION → SIMULATION → DISTRIBUTION${C.reset}${C.cyan}      ║
     ║                                                       ║
     ╚═══════════════════════════════════════════════════════╝${C.reset}
`;

/**
 * Print the logo followed by an optional "ready" line.
 * Uses colored output when stdout is a TTY, plain otherwise
 * (so docker logs, CI output, and log aggregators stay clean).
 */
export function printLogo(readyLine?: string): void {
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  process.stdout.write(useColor ? COLORED_LOGO : ASCII_LOGO);
  if (readyLine) {
    const prefix = useColor ? `  ${C.bold}→${C.reset} ` : '  → ';
    process.stdout.write(`${prefix}${readyLine}\n\n`);
  }
}
