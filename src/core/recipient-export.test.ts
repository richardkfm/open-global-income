import { describe, it, expect } from 'vitest';
import { recipientsToCsv, RECIPIENT_EXPORT_COLUMNS } from './recipient-export.js';
import { parseRecipientImportCsv } from './recipient-import.js';
import type { RecipientProfile } from './types.js';

function recipient(overrides: Partial<RecipientProfile> = {}): RecipientProfile {
  return {
    id: 'r-1',
    countryCode: 'KE',
    accountHash: null,
    identityProvider: null,
    verifiedAt: null,
    paymentMethod: null,
    routingRef: null,
    status: 'pending',
    pilotId: null,
    apiKeyId: null,
    createdAt: '2026-06-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('recipientsToCsv', () => {
  it('emits a header row even with no recipients', () => {
    const csv = recipientsToCsv([]);
    expect(csv).toBe(RECIPIENT_EXPORT_COLUMNS.join(',') + '\r\n');
  });

  it('serialises fields with empty cells for nulls', () => {
    const csv = recipientsToCsv([recipient({ paymentMethod: 'sepa' })]);
    const [, row] = csv.trimEnd().split('\r\n');
    // countryCode,paymentMethod,accountHash,routingRef,identityProvider,id,status,pilotId,verifiedAt,createdAt
    expect(row).toBe('KE,sepa,,,,r-1,pending,,,2026-06-02T00:00:00.000Z');
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    const csv = recipientsToCsv([
      recipient({ routingRef: 'a,b', identityProvider: 'say "hi"' }),
    ]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
  });

  it('round-trips back through the importer', () => {
    const csv = recipientsToCsv([
      recipient({ id: 'r-1', countryCode: 'KE', paymentMethod: 'mobile_money' }),
      recipient({
        id: 'r-2',
        countryCode: 'TZ',
        paymentMethod: 'sepa',
        accountHash: 'hash-xyz',
        routingRef: '••••1234',
        identityProvider: 'national-id',
        status: 'verified',
      }),
    ]);

    const { rows, errors } = parseRecipientImportCsv(csv, {
      validPaymentMethods: ['sepa', 'mobile_money', 'crypto'],
    });
    // Unknown columns (id, status, …) produce a header warning but don't block.
    expect(errors.every((e) => /unknown column/i.test(e.message))).toBe(true);
    expect(rows.map((r) => [r.countryCode, r.paymentMethod, r.accountHash])).toEqual([
      ['KE', 'mobile_money', null],
      ['TZ', 'sepa', 'hash-xyz'],
    ]);
  });
});
