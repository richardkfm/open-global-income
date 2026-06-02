import { describe, it, expect } from 'vitest';
import { parseRecipientImportCsv } from './recipient-import.js';

describe('parseRecipientImportCsv', () => {
  it('parses a minimal valid file with only countryCode', () => {
    const { rows, errors } = parseRecipientImportCsv('countryCode\nKE\nTZ\n');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ countryCode: 'KE', paymentMethod: null, accountHash: null });
    expect(rows[1].countryCode).toBe('TZ');
  });

  it('parses all supported columns regardless of order', () => {
    const csv = [
      'paymentMethod,countryCode,routingRef,accountHash,identityProvider',
      'sepa,de,••••1234,hash-abc,national-id',
    ].join('\n');
    const { rows, errors } = parseRecipientImportCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toEqual({
      line: 2,
      countryCode: 'DE',
      paymentMethod: 'sepa',
      routingRef: '••••1234',
      accountHash: 'hash-abc',
      identityProvider: 'national-id',
    });
  });

  it('uppercases country codes and reports physical line numbers', () => {
    const csv = 'countryCode\n\nke\n\n  ng  \n';
    const { rows } = parseRecipientImportCsv(csv);
    expect(rows.map((r) => [r.line, r.countryCode])).toEqual([
      [3, 'KE'],
      [5, 'NG'],
    ]);
  });

  it('rejects a header without countryCode', () => {
    const { rows, errors } = parseRecipientImportCsv('paymentMethod\nsepa\n');
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/must include a 'countryCode'/);
  });

  it('flags rows with a missing countryCode but keeps the valid ones', () => {
    const csv = 'countryCode,paymentMethod\nKE,sepa\n,crypto\nTZ,mobile_money\n';
    const { rows, errors } = parseRecipientImportCsv(csv);
    expect(rows.map((r) => r.countryCode)).toEqual(['KE', 'TZ']);
    expect(errors).toEqual([{ line: 3, message: 'Missing countryCode' }]);
  });

  it('rejects an invalid payment method', () => {
    const { rows, errors } = parseRecipientImportCsv('countryCode,paymentMethod\nKE,paypal\n');
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/Invalid paymentMethod 'paypal'/);
  });

  it('rejects unknown country codes when a known set is supplied', () => {
    const { rows, errors } = parseRecipientImportCsv('countryCode\nKE\nXX\n', {
      knownCountryCodes: ['KE', 'TZ'],
    });
    expect(rows.map((r) => r.countryCode)).toEqual(['KE']);
    expect(errors[0].message).toMatch(/Unknown country code 'XX'/);
  });

  it('flags duplicate account hashes within the same country', () => {
    const csv = 'countryCode,accountHash\nKE,h1\nKE,h1\nTZ,h1\n';
    const { rows, errors } = parseRecipientImportCsv(csv);
    // KE+h1 once, the duplicate skipped, TZ+h1 allowed (different country)
    expect(rows.map((r) => [r.countryCode, r.accountHash])).toEqual([
      ['KE', 'h1'],
      ['TZ', 'h1'],
    ]);
    expect(errors[0].message).toMatch(/Duplicate accountHash within this file/);
  });

  it('handles quoted fields containing commas', () => {
    const csv = 'countryCode,routingRef\nKE,"last, four: 1234"\n';
    const { rows, errors } = parseRecipientImportCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].routingRef).toBe('last, four: 1234');
  });

  it('warns about unknown columns but still imports', () => {
    const { rows, errors } = parseRecipientImportCsv('countryCode,foo\nKE,bar\n');
    expect(rows).toHaveLength(1);
    expect(errors.some((e) => /unknown column/i.test(e.message))).toBe(true);
  });

  it('reports an error for an empty file', () => {
    const { rows, errors } = parseRecipientImportCsv('   \n\n');
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/empty/i);
  });

  it('reports an error for a header with no data rows', () => {
    const { rows, errors } = parseRecipientImportCsv('countryCode\n');
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/No data rows/);
  });
});
