/**
 * Pure CSV/JSON serialisation for the recipient registry.
 *
 * Zero I/O, zero database knowledge — turns a list of recipient profiles into
 * an exportable string. The CSV column order is import-compatible: the
 * `countryCode,paymentMethod,accountHash,routingRef,identityProvider` columns
 * read back cleanly through `parseRecipientImportCsv`, with audit-only columns
 * (`id`, `status`, `verifiedAt`, `createdAt`) appended after them.
 */
import type { RecipientProfile } from './types.js';

/** Export columns, in order. The first five round-trip through the importer. */
export const RECIPIENT_EXPORT_COLUMNS = [
  'countryCode',
  'paymentMethod',
  'accountHash',
  'routingRef',
  'identityProvider',
  'id',
  'status',
  'pilotId',
  'verifiedAt',
  'createdAt',
] as const;

type ExportColumn = (typeof RECIPIENT_EXPORT_COLUMNS)[number];

function cellFor(recipient: RecipientProfile, column: ExportColumn): string {
  const value = recipient[column as keyof RecipientProfile];
  return value == null ? '' : String(value);
}

/**
 * Quote a CSV field only when it contains a comma, double-quote, or newline,
 * doubling any embedded quotes (RFC 4180).
 */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialise recipients to an RFC 4180 CSV string with a header row.
 * Rows are emitted in the order given. Lines are CRLF-terminated.
 */
export function recipientsToCsv(recipients: RecipientProfile[]): string {
  const header = RECIPIENT_EXPORT_COLUMNS.join(',');
  const lines = recipients.map((r) =>
    RECIPIENT_EXPORT_COLUMNS.map((col) => escapeCsvField(cellFor(r, col))).join(','),
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}
