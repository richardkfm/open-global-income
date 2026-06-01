import { describe, it, expect } from 'vitest';
import { sepaProvider } from './sepa.js';
import type { Disbursement } from '../../core/types.js';

const mockDisbursement: Disbursement = {
  id: 'test-sepa-001',
  simulationId: null,
  channelId: 'channel-sepa-de',
  countryCode: 'DE',
  recipientCount: 500,
  amountPerRecipient: '210.00',
  totalAmount: '105000.00',
  currency: 'EUR',
  status: 'approved',
  createdAt: '2026-04-01T00:00:00.000Z',
  approvedAt: '2026-04-01T08:00:00.000Z',
  completedAt: null,
  apiKeyId: null,
};

const validConfig = {
  apiKey: 'wise-api-key-abc123',
  payoutAccountId: 'profile-12345',
  environment: 'sandbox',
  debtorName: 'Ministry of Social Protection',
  debtorIban: 'DE89370400440532013000',
  debtorBic: 'COBADEFFXXX',
};

describe('sepaProvider', () => {
  it('has correct metadata', () => {
    expect(sepaProvider.providerId).toBe('sepa');
    expect(sepaProvider.providerName).toBe('SEPA Credit Transfer');
    expect(sepaProvider.supportedCurrencies).toContain('EUR');
    expect(sepaProvider.signatureHeader).toBe('x-wise-signature-sha256');
  });

  describe('validateConfig', () => {
    it('accepts valid sandbox config', async () => {
      const result = await sepaProvider.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts production environment', async () => {
      const result = await sepaProvider.validateConfig({ ...validConfig, environment: 'production' });
      expect(result.valid).toBe(true);
    });

    it('rejects missing apiKey', async () => {
      const { apiKey: _, ...rest } = validConfig;
      const result = await sepaProvider.validateConfig(rest);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/apiKey/);
    });

    it('rejects missing payoutAccountId', async () => {
      const { payoutAccountId: _, ...rest } = validConfig;
      const result = await sepaProvider.validateConfig(rest);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/payoutAccountId/);
    });

    it('rejects invalid environment value', async () => {
      const result = await sepaProvider.validateConfig({ ...validConfig, environment: 'staging' });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/environment/);
    });

    it('rejects non-string apiKey', async () => {
      const result = await sepaProvider.validateConfig({ ...validConfig, apiKey: 42 });
      expect(result.valid).toBe(false);
    });
  });

  describe('submit', () => {
    it('returns a submitted result with a pain001 externalId', async () => {
      const result = await sepaProvider.submit(mockDisbursement, validConfig);
      expect(result.status).toBe('submitted');
      expect(result.externalId).toMatch(/^sepa-pain001-/);
      expect(result.payload.provider).toBe('sepa_pain001');
    });

    it('converts PPP-USD to EUR via the FX snapshot (210 → 193.20)', async () => {
      const result = await sepaProvider.submit(mockDisbursement, validConfig);
      const batch = result.payload.batch as Record<string, unknown>;
      const perRecipient = batch.amountPerRecipient as Record<string, unknown>;
      expect(perRecipient.pppUsd).toBe('210.00');
      expect(perRecipient.eur).toBe('193.20');
    });

    it('computes the EUR control sum (105000 → 96600.00)', async () => {
      const result = await sepaProvider.submit(mockDisbursement, validConfig);
      const batch = result.payload.batch as Record<string, unknown>;
      const total = batch.totalAmount as Record<string, unknown>;
      expect(total.eur).toBe('96600.00');
    });

    it('returns the applied FX rate and provenance for audit', async () => {
      const result = await sepaProvider.submit(mockDisbursement, validConfig);
      const fx = result.payload.fx as Record<string, unknown>;
      expect(fx.target).toBe('EUR');
      expect(typeof fx.rate).toBe('number');
      expect(typeof fx.rateAsOf).toBe('string');
      expect(typeof fx.source).toBe('string');
    });

    it('produces a valid ISO 20022 pain.001 document populated from config', async () => {
      const result = await sepaProvider.submit(mockDisbursement, validConfig);
      const xml = result.payload.iso20022Xml as string;
      expect(xml).toContain('pain.001.001.09');
      expect(xml).toContain('<NbOfTxs>500</NbOfTxs>');
      expect(xml).toContain('<CtrlSum>96600.00</CtrlSum>');
      expect(xml).toContain('<InstdAmt Ccy="EUR">193.20</InstdAmt>');
      expect(xml).toContain('DE89370400440532013000'); // debtor IBAN from config
      expect(xml).toContain('Ministry of Social Protection'); // debtor name from config
    });

    it('includes a Wise bulk-payment skeleton referencing the profile', async () => {
      const result = await sepaProvider.submit(mockDisbursement, validConfig);
      const wise = result.payload.wiseBulkPayment as Record<string, unknown>;
      expect(wise.profileId).toBe('profile-12345');
      expect(wise.targetCurrency).toBe('EUR');
    });

    it('never echoes the apiKey in the payload', async () => {
      const result = await sepaProvider.submit(mockDisbursement, validConfig);
      expect(JSON.stringify(result.payload)).not.toContain('wise-api-key-abc123');
    });

    it('each call produces a unique externalId', async () => {
      const r1 = await sepaProvider.submit(mockDisbursement, validConfig);
      const r2 = await sepaProvider.submit(mockDisbursement, validConfig);
      expect(r1.externalId).not.toBe(r2.externalId);
    });
  });

  describe('parseCallback (Wise webhook)', () => {
    it('maps outgoing_payment_sent to confirmed', async () => {
      const event = await sepaProvider.parseCallback!(
        {},
        {
          data: { resource: { type: 'transfer', id: 998877 }, current_state: 'outgoing_payment_sent' },
          event_type: 'transfers#state-change',
          sent_at: '2026-04-02T10:00:00.000Z',
        },
      );
      expect(event).not.toBeNull();
      expect(event!.externalId).toBe('998877');
      expect(event!.status).toBe('confirmed');
    });

    it('maps funds_refunded to failed', async () => {
      const event = await sepaProvider.parseCallback!(
        {},
        {
          data: { resource: { type: 'transfer', id: 1 }, current_state: 'funds_refunded' },
          sent_at: '2026-04-02T10:00:00.000Z',
        },
      );
      expect(event!.status).toBe('failed');
    });

    it('ignores non-transfer / non-terminal events', async () => {
      const event = await sepaProvider.parseCallback!(
        {},
        { data: { resource: { type: 'balance', id: 2 }, current_state: 'created' }, sent_at: '2026-04-02T10:00:00.000Z' },
      );
      expect(event).toBeNull();
    });
  });

  describe('checkStatus', () => {
    it('returns confirmed (non-custodial) status', async () => {
      const status = await sepaProvider.checkStatus('sepa-pain001-some-id');
      expect(status.externalId).toBe('sepa-pain001-some-id');
      expect(status.status).toBe('confirmed');
      expect(typeof status.details.note).toBe('string');
    });
  });
});
