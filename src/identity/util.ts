import { createHash } from 'node:crypto';

/** SHA-256 hex digest of a UTF-8 string. Used to derive the non-reversible accountHash. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Build a non-reversible display suffix that is safe to render in the UI.
 * Masks everything but the last `visible` characters (e.g. "••••4821").
 */
export function maskSuffix(value: string, visible = 4): string {
  const tail = value.length <= visible ? value : value.slice(-visible);
  return `••••${tail}`;
}

// ── Verhoeff checksum ──────────────────────────────────────────────────────────
// The Verhoeff algorithm is the check-digit scheme used by MOSIP (and India's
// Aadhaar) for national identity numbers. It detects all single-digit and most
// transposition errors — a real, deterministic validation a connector can run
// entirely offline before delegating the authoritative lookup to the provider.

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 9, 1, 6, 7, 4, 3, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Validate a numeric string against its trailing Verhoeff check digit. */
export function isValidVerhoeff(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = D[c][P[i % 8][reversed[i]]];
  }
  return c === 0;
}
