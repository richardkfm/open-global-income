/**
 * Pure CSV parsing + validation for bulk recipient enrolment.
 *
 * This module has zero I/O and zero knowledge of the database. It turns a raw
 * CSV string into validated rows ready for enrolment, plus a per-line list of
 * errors. The caller (admin route) is responsible for cross-program duplicate
 * detection and persistence.
 *
 * Expected header (case-insensitive, order-independent):
 *   countryCode      — required, ISO country code
 *   paymentMethod    — optional, one of the valid payment methods
 *   accountHash      — optional, pre-computed non-reversible account hash
 *   routingRef       — optional, non-reversible display suffix
 *   identityProvider — optional, provider id the hash was derived from
 *
 * Only `countryCode` is required. Raw identity data must never appear in the
 * file — bulk import takes already-hashed account references, mirroring the
 * non-custodial enrolment API.
 */
import type { PaymentMethod } from './types.js';

export interface RecipientImportRow {
  /** 1-based line number in the source CSV (header counts as line 1). */
  line: number;
  countryCode: string;
  paymentMethod: PaymentMethod | null;
  accountHash: string | null;
  routingRef: string | null;
  identityProvider: string | null;
}

export interface RecipientImportError {
  /** 1-based line number in the source CSV, or 0 for file-level errors. */
  line: number;
  message: string;
}

export interface RecipientImportParseResult {
  rows: RecipientImportRow[];
  errors: RecipientImportError[];
}

export interface RecipientImportOptions {
  /** Payment methods accepted by the platform (case-sensitive match). */
  validPaymentMethods?: readonly string[];
  /** If provided, country codes outside this set are rejected. */
  knownCountryCodes?: readonly string[];
}

const KNOWN_COLUMNS = [
  'countrycode',
  'paymentmethod',
  'accounthash',
  'routingref',
  'identityprovider',
] as const;

/**
 * Parse a single CSV line into fields, honouring double-quoted values with
 * `""` as an escaped quote. Whitespace around unquoted fields is trimmed.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/**
 * Parse and validate a CSV string of recipients to enrol.
 *
 * Returns the rows that passed validation plus a list of per-line errors.
 * In-file duplicate account hashes (same country + hash) are flagged so a
 * single upload cannot enrol the same identity twice.
 */
export function parseRecipientImportCsv(
  csv: string,
  opts: RecipientImportOptions = {},
): RecipientImportParseResult {
  const validPaymentMethods = opts.validPaymentMethods ?? ['sepa', 'mobile_money', 'crypto'];
  const knownCountryCodes = opts.knownCountryCodes
    ? new Set(opts.knownCountryCodes.map((c) => c.toUpperCase()))
    : null;

  const errors: RecipientImportError[] = [];
  const rows: RecipientImportRow[] = [];

  // Track physical line numbers so error messages point at the source row,
  // even when blank lines are skipped.
  const rawLines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let headerCols: string[] | null = null;
  let headerLine = 0;
  const seenHashes = new Set<string>();

  for (let i = 0; i < rawLines.length; i++) {
    const lineNo = i + 1;
    const raw = rawLines[i];
    if (raw.trim() === '') continue;

    if (headerCols === null) {
      headerLine = lineNo;
      headerCols = parseCsvLine(raw).map((c) => c.toLowerCase());
      if (!headerCols.includes('countrycode')) {
        errors.push({
          line: lineNo,
          message: `Header must include a 'countryCode' column. Found: ${headerCols.join(', ') || '(empty)'}`,
        });
        return { rows: [], errors };
      }
      const unknown = headerCols.filter(
        (c) => c !== '' && !KNOWN_COLUMNS.includes(c as (typeof KNOWN_COLUMNS)[number]),
      );
      if (unknown.length > 0) {
        errors.push({
          line: lineNo,
          message: `Ignoring unknown column(s): ${unknown.join(', ')}`,
        });
      }
      continue;
    }

    const fields = parseCsvLine(raw);
    const get = (col: string): string => {
      const idx = headerCols!.indexOf(col);
      return idx >= 0 && idx < fields.length ? fields[idx] : '';
    };

    const countryCode = get('countrycode').toUpperCase();
    if (!countryCode) {
      errors.push({ line: lineNo, message: 'Missing countryCode' });
      continue;
    }
    if (knownCountryCodes && !knownCountryCodes.has(countryCode)) {
      errors.push({ line: lineNo, message: `Unknown country code '${countryCode}'` });
      continue;
    }

    const paymentMethodRaw = get('paymentmethod');
    let paymentMethod: PaymentMethod | null = null;
    if (paymentMethodRaw) {
      if (!validPaymentMethods.includes(paymentMethodRaw)) {
        errors.push({
          line: lineNo,
          message: `Invalid paymentMethod '${paymentMethodRaw}'. Must be one of: ${validPaymentMethods.join(', ')}`,
        });
        continue;
      }
      paymentMethod = paymentMethodRaw as PaymentMethod;
    }

    const accountHash = get('accounthash') || null;
    if (accountHash) {
      const key = `${countryCode}:${accountHash}`;
      if (seenHashes.has(key)) {
        errors.push({
          line: lineNo,
          message: `Duplicate accountHash within this file for ${countryCode}`,
        });
        continue;
      }
      seenHashes.add(key);
    }

    rows.push({
      line: lineNo,
      countryCode,
      paymentMethod,
      accountHash,
      routingRef: get('routingref') || null,
      identityProvider: get('identityprovider') || null,
    });
  }

  if (headerCols === null) {
    errors.push({ line: 0, message: 'CSV is empty — a header row is required' });
  } else if (rows.length === 0 && errors.length === 0) {
    errors.push({ line: headerLine, message: 'No data rows found after the header' });
  }

  return { rows, errors };
}
