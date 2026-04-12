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

describe('sepaProvider', () => {
  it('has correct metadata', () => {
    expect(sepaProvider.providerId).toBe('sepa');
    expect(sepaProvider.providerName).toBe('SEPA Credit Transfer (Stub)');
    expect(sepaProvider.supportedCurrencies).toContain('EUR');
  });

  describe('validateConfig', () => {
    const validConfig = {
      apiKey: 'wise-api-key-abc123',
      payoutAccountId: 'profile-12345',
      environment: 'sandbox',
    };

    it('accepts valid sandbox config', async () => {
      const result = await sepaProvider.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts production environment', async () => {
      const result = await sepaProvider.validateConfig({
        ...validConfig,
        environment: 'production',
      });
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

    it('rejects missing environment', async () => {
      const { environment: _, ...rest } = validConfig;
      const result = await sepaProvider.validateConfig(rest);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/environment/);
    });

    it('rejects invalid environment value', async () => {
      const result = await sepaProvider.validateConfig({
        ...validConfig,
        environment: 'staging',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/environment/);
    });

    it('rejects empty string fields', async () => {
      const result = await sepaProvider.validateConfig({
        ...validConfig,
        apiKey: '',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects non-string apiKey', async () => {
      const result = await sepaProvider.validateConfig({
        ...validConfig,
        apiKey: 42,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('submit', () => {
    it('returns a pending result with sepa-stub externalId', async () => {
      const result = await sepaProvider.submit(mockDisbursement);
      expect(result.status).toBe('pending');
      expect(result.externalId).toMatch(/^sepa-stub-/);
    });

    it('marks payload as mock', async () => {
      const result = await sepaProvider.submit(mockDisbursement);
      expect(result.payload.mock).toBe(true);
    });

    it('each call produces a unique externalId', async () => {
      const r1 = await sepaProvider.submit(mockDisbursement);
      const r2 = await sepaProvider.submit(mockDisbursement);
      expect(r1.externalId).not.toBe(r2.externalId);
    });

    it('generates a SEPA transfer reference in payload', async () => {
      const result = await sepaProvider.submit(mockDisbursement);
      expect(typeof result.payload.transferReference).toBe('string');
      expect((result.payload.transferReference as string).length).toBeGreaterThan(0);
    });

    it('converts PPP-USD amount to EUR in instruction', async () => {
      const result = await sepaProvider.submit(mockDisbursement);
      const instruction = result.payload.instruction as Record<string, unknown>;
      const amountInfo = instruction.amountPerRecipient as Record<string, unknown>;
      expect(amountInfo.pppUsd).toBe('210.00');
      // 210 * 0.92 = 193.20
      expect(amountInfo.eur).toBe('193.20');
      expect(amountInfo.fxRate).toBe(0.92);
    });

    it('includes correct recipient count and currency', async () => {
      const result = await sepaProvider.submit(mockDisbursement);
      const instruction = result.payload.instruction as Record<string, unknown>;
      expect(instruction.recipientCount).toBe(500);
      expect(instruction.currency).toBe('EUR');
      expect(instruction.countryCode).toBe('DE');
      expect(instruction.disbursementId).toBe('test-sepa-001');
    });

    it('computes correct total EUR amount', async () => {
      const result = await sepaProvider.submit(mockDisbursement);
      const instruction = result.payload.instruction as Record<string, unknown>;
      const totalAmount = instruction.totalAmount as Record<string, unknown>;
      // 105000 * 0.92 = 96600.00
      expect(totalAmount.eur).toBe('96600.00');
    });

    it('transfer instruction type is sepa_credit_transfer', async () => {
      const result = await sepaProvider.submit(mockDisbursement);
      const instruction = result.payload.instruction as Record<string, unknown>;
      expect(instruction.type).toBe('sepa_credit_transfer');
    });
  });

  describe('checkStatus', () => {
    it('returns pending status for any externalId', async () => {
      const status = await sepaProvider.checkStatus('sepa-stub-some-id');
      expect(status.externalId).toBe('sepa-stub-some-id');
      expect(status.status).toBe('pending');
      expect(status.details.mock).toBe(true);
    });
  });
});
