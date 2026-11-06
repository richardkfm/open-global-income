#!/usr/bin/env node
/**
 * Generates the SVG images embedded in README.md:
 *
 *   docs/assets/logo.svg      — the block-letter "OGI" banner (vector version of
 *                               the old ASCII logo, which mis-aligned on GitHub)
 *   docs/assets/pipeline.svg  — animated walk-through of one research scenario
 *                               (Kenya) through Data → Calculation → Simulation →
 *                               Distribution → Evidence
 *
 * Both images sit on their own dark panel so they read the same in GitHub's
 * light and dark themes. Animation is pure CSS inside the SVG (GitHub renders
 * it via <img>, no scripts allowed) and is disabled under
 * prefers-reduced-motion, which leaves the finished frame visible.
 *
 * The Kenya figures in the pipeline come from the committed seeded snapshot
 * (worldbank-2023) run through calculateEntitlement / calculateSimulation;
 * re-check them if the snapshot changes. The evidence bars are illustrative.
 *
 * Usage: node scripts/generate-readme-assets.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'assets');
mkdirSync(outDir, { recursive: true });

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const C = {
  panel: '#0f172a',
  panelEdge: '#1e293b',
  border: '#334155',
  block: '#818cf8',
  shadow: '#475569',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#a5b4fc',
  good: '#34d399',
  control: '#64748b',
};

// ── Logo ────────────────────────────────────────────────────────────────────

const LETTERS = [
  ' ██████╗  ██████╗ ██╗',
  '██╔═══██╗██╔════╝ ██║',
  '██║   ██║██║  ███╗██║',
  '██║   ██║██║   ██║██║',
  '╚██████╔╝╚██████╔╝██║',
  ' ╚═════╝  ╚═════╝ ╚═╝',
];

/** Draw one box-drawing character as a double line inside a cell. */
function boxChar(ch, x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const d = 2.6; // half-gap between the two strokes
  const L = x;
  const R = x + w;
  const T = y;
  const B = y + h;
  const paths = {
    '═': [`M${L} ${cy - d}H${R}`, `M${L} ${cy + d}H${R}`],
    '║': [`M${cx - d} ${T}V${B}`, `M${cx + d} ${T}V${B}`],
    '╗': [`M${L} ${cy - d}H${cx + d}V${B}`, `M${L} ${cy + d}H${cx - d}V${B}`],
    '╔': [`M${R} ${cy - d}H${cx - d}V${B}`, `M${R} ${cy + d}H${cx + d}V${B}`],
    '╝': [`M${L} ${cy + d}H${cx + d}V${T}`, `M${L} ${cy - d}H${cx - d}V${T}`],
    '╚': [`M${R} ${cy + d}H${cx - d}V${T}`, `M${R} ${cy - d}H${cx + d}V${T}`],
  };
  return (paths[ch] ?? []).map((p) => `<path d="${p}"/>`).join('');
}

function logoSvg() {
  const cw = 15;
  const ch = 26;
  const ox = 56;
  const oy = 44;
  const W = 760;
  const H = 380;
  const blocks = [];
  const shadows = [];
  LETTERS.forEach((row, r) => {
    [...row].forEach((c, i) => {
      const x = ox + i * cw;
      const y = oy + r * ch;
      if (c === '█') blocks.push(`<rect x="${x}" y="${y}" width="${cw + 0.4}" height="${ch + 0.4}"/>`);
      else if (c !== ' ') shadows.push(boxChar(c, x, y, cw, ch));
    });
  });
  const ty = oy + LETTERS.length * ch;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
<title id="t">Open Global Income</title>
<desc id="d">Block-letter OGI logo. Open Global Income: shared infrastructure for universal basic income. Data, calculation, simulation, distribution, evidence.</desc>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${C.panel}" stroke="${C.panelEdge}" stroke-width="2"/>
<g fill="none" stroke="${C.border}" stroke-width="1.6">
  <rect x="18" y="16" width="${W - 36}" height="${H - 32}" rx="6"/>
  <rect x="24" y="22" width="${W - 48}" height="${H - 44}" rx="4"/>
</g>
<g fill="none" stroke="${C.shadow}" stroke-width="1.6" stroke-linecap="square">${shadows.join('')}</g>
<g fill="${C.block}">${blocks.join('')}</g>
<g font-family="${MONO}">
  <text x="${ox}" y="${ty + 48}" fill="${C.text}" font-size="26" font-weight="700" letter-spacing="9">OPEN GLOBAL INCOME</text>
  <text x="${ox}" y="${ty + 84}" fill="${C.muted}" font-size="18">Shared infrastructure for universal basic income</text>
  <path d="M${ox} ${ty + 104}H${W - ox}" stroke="${C.border}" stroke-width="1.6"/>
  <text x="${ox}" y="${ty + 136}" fill="${C.accent}" font-size="16" letter-spacing="1">DATA → CALCULATION → SIMULATION → DISTRIBUTION → EVIDENCE</text>
</g>
</svg>
`;
}

// ── Pipeline animation ──────────────────────────────────────────────────────

const T = 15; // loop length, seconds
const pct = (s) => `${((s / T) * 100).toFixed(2)}%`;
const keyframes = [];
let kfId = 0;

/** Opacity keyframes: hidden until `at`, visible until the loop resets. */
function fadeIn(at, from = 0) {
  const name = `f${kfId++}`;
  keyframes.push(
    `@keyframes ${name}{0%,${pct(at)}{opacity:${from}}${pct(at + 0.45)},${pct(T - 0.9)}{opacity:1}${pct(T - 0.3)},100%{opacity:${from}}}`,
  );
  return `style="animation:${name} ${T}s linear infinite both"`;
}

/** Draw a line from nothing to full length. */
function draw(at, len) {
  const name = `f${kfId++}`;
  keyframes.push(
    `@keyframes ${name}{0%,${pct(at)}{stroke-dashoffset:${len}}${pct(at + 0.6)},${pct(T - 0.9)}{stroke-dashoffset:0}${pct(T - 0.3)},100%{stroke-dashoffset:${len}}}`,
  );
  return `stroke-dasharray="${len}" style="animation:${name} ${T}s ease-out infinite both"`;
}

/** Grow a bar upward from its baseline. */
function grow(at) {
  const name = `f${kfId++}`;
  keyframes.push(
    `@keyframes ${name}{0%,${pct(at)}{transform:scaleY(0)}${pct(at + 0.8)},${pct(T - 0.9)}{transform:scaleY(1)}${pct(T - 0.3)},100%{transform:scaleY(0)}}`,
  );
  return `class="bar" style="animation:${name} ${T}s ease-out infinite both"`;
}

const STAGES = [
  {
    title: 'DATA',
    q: 'What are the facts?',
    lines: ['54.0 M people', 'GNI/cap $2,010', 'PPP factor 49.37', 'Gini 38.7 · LMC'],
    call: 'GET /v1/income/countries/KE',
  },
  {
    title: 'CALCULATION',
    q: 'How much per person?',
    lines: ['$210 PPP / month', '= KES 10,368', 'need score 1.00', 'ruleset v1'],
    call: 'GET /v1/income/calc?country=KE',
  },
  {
    title: 'SIMULATION',
    q: 'What does it cost?',
    lines: ['20% · 12 months', '10.8 M recipients', '$27.2 B PPP / yr', '7.7% of GDP'],
    call: 'POST /v1/simulate',
  },
  {
    title: 'DISTRIBUTION',
    q: 'How does money move?',
    lines: ['M-Pesa B2C batch', 'or SEPA / USDC', 'draft → approved', 'non-custodial'],
    call: 'POST /v1/disbursements',
  },
  {
    title: 'EVIDENCE',
    q: 'Is it working?',
    lines: [],
    call: 'GET /v1/evidence/export',
  },
];

function pipelineSvg() {
  const W = 960;
  const H = 412;
  const cardW = 168;
  const gap = 20;
  const x0 = (W - (STAGES.length * cardW + (STAGES.length - 1) * gap)) / 2;
  const cardY = 92;
  const cardH = 220;
  const step = 2.3;
  const start = 0.8;
  const parts = [];

  STAGES.forEach((s, i) => {
    const x = x0 + i * (cardW + gap);
    const at = start + i * step;
    const cx = x + cardW / 2;
    // dim base card + highlighted frame
    parts.push(`<rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="${C.panelEdge}" stroke="${C.border}"/>`);
    parts.push(`<rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="none" stroke="${C.block}" stroke-width="2" ${fadeIn(at)}/>`);
    parts.push(`<text x="${cx}" y="${cardY + 30}" text-anchor="middle" font-family="${MONO}" font-size="13" font-weight="700" letter-spacing="2" fill="${C.accent}" ${fadeIn(at, 0.45)}>${i + 1} · ${s.title}</text>`);
    parts.push(`<text x="${cx}" y="${cardY + 52}" text-anchor="middle" font-family="${SANS}" font-size="12" fill="${C.muted}" ${fadeIn(at, 0.45)}>${s.q}</text>`);
    s.lines.forEach((line, j) => {
      parts.push(`<text x="${cx}" y="${cardY + 88 + j * 28}" text-anchor="middle" font-family="${MONO}" font-size="13" fill="${C.text}" ${fadeIn(at + 0.3 + j * 0.25)}>${line}</text>`);
    });
    // API call under the card
    const [verb, path] = s.call.split(' ');
    parts.push(`<text text-anchor="middle" font-family="${MONO}" font-size="11" fill="${C.good}" ${fadeIn(at + 0.2)}><tspan x="${cx}" y="${cardY + cardH + 24}" font-weight="700">${verb}</tspan><tspan x="${cx}" y="${cardY + cardH + 40}">${path}</tspan></text>`);
    // connector to next card
    if (i < STAGES.length - 1) {
      const lx = x + cardW + 2;
      const ly = cardY + cardH / 2;
      parts.push(`<path d="M${lx} ${ly}H${lx + gap - 4}" stroke="${C.block}" stroke-width="2.5" fill="none" ${draw(at + step - 0.7, gap)}/>`);
      parts.push(`<path d="M${lx + gap - 9} ${ly - 5}L${lx + gap - 3} ${ly}L${lx + gap - 9} ${ly + 5}" stroke="${C.block}" stroke-width="2.5" fill="none" ${fadeIn(at + step - 0.2)}/>`);
    }
    // evidence mini chart
    if (s.title === 'EVIDENCE') {
      const base = cardY + 184;
      const bw = 22;
      const groups = [
        { label: 'baseline', ctrl: 40, treat: 41 },
        { label: 'endline', ctrl: 44, treat: 76 },
      ];
      groups.forEach((g, k) => {
        const gx = x + 26 + k * 66;
        parts.push(`<rect x="${gx}" y="${base - g.ctrl}" width="${bw}" height="${g.ctrl}" rx="2" fill="${C.control}" ${grow(at + 0.4 + k * 0.5)}/>`);
        parts.push(`<rect x="${gx + bw + 4}" y="${base - g.treat}" width="${bw}" height="${g.treat}" rx="2" fill="${C.good}" ${grow(at + 0.6 + k * 0.5)}/>`);
        parts.push(`<text x="${gx + bw + 2}" y="${base + 16}" text-anchor="middle" font-family="${SANS}" font-size="10.5" fill="${C.muted}" ${fadeIn(at + 0.3)}>${g.label}</text>`);
      });
      parts.push(`<path d="M${x + 16} ${base}H${x + cardW - 16}" stroke="${C.border}"/>`);
      parts.push(`<g font-family="${SANS}" font-size="10.5" ${fadeIn(at + 1.6)}><rect x="${x + 22}" y="${cardY + 66}" width="9" height="9" fill="${C.control}"/><text x="${x + 35}" y="${cardY + 74}" fill="${C.muted}">control</text><rect x="${x + 88}" y="${cardY + 66}" width="9" height="9" fill="${C.good}"/><text x="${x + 101}" y="${cardY + 74}" fill="${C.muted}">recipients</text></g>`);
      parts.push(`<text x="${cx}" y="${base - 92}" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${C.text}" ${fadeIn(at + 1.6)}>food security +32 pp</text>`);
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
<title id="t">How a basic income study runs on Open Global Income</title>
<desc id="d">Animated walk-through of one Kenya scenario: country data, a $210 PPP monthly entitlement (KES 10,368), a 20 percent coverage simulation costing 27.2 billion PPP dollars or 7.7 percent of GDP, a non-custodial M-Pesa disbursement batch, and recipient versus control outcomes exported for research. Outcome values are illustrative.</desc>
<style>
.bar{transform-box:fill-box;transform-origin:bottom}
${keyframes.join('\n')}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${C.panel}" stroke="${C.panelEdge}" stroke-width="2"/>
<text x="${x0}" y="44" font-family="${MONO}" font-size="16" font-weight="700" fill="${C.text}">One study, end to end — Kenya</text>
<text x="${x0}" y="68" font-family="${SANS}" font-size="12.5" fill="${C.muted}">Every step is a plain API call, so the same scenario can be scripted, re-run and checked in a test.</text>
${parts.join('\n')}
<text x="${W / 2}" y="${H - 22}" text-anchor="middle" font-family="${SANS}" font-size="11" fill="${C.muted}">Kenya figures: committed seeded snapshot (worldbank-2023), ruleset v1. Evidence values are illustrative, not pilot results.</text>
</svg>
`;
}

writeFileSync(join(outDir, 'logo.svg'), logoSvg());
writeFileSync(join(outDir, 'pipeline.svg'), pipelineSvg());
console.log('wrote docs/assets/logo.svg, docs/assets/pipeline.svg');
