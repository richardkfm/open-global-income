import { describe, it, expect } from 'vitest';
import { mpesaProvider } from './mpesa.js';
import type { Disbursement } from '../../core/types.js';

const mockDisbursement: Disbursement = {
  id: 'test-mpesa-789',
  simulationId: null,
  channelId: 'channel-mpesa',
  countryCode: 'KE',
  recipientCount: 200,
  amountPerRecipient: '5000',
  totalAmount: '1000000',
  currency: 'KES',
  status: 'approved',
  createdAt: '2026-03-18T00:00:00.000Z',
  approvedAt: '2026-03-18T01:00:00.000Z',
  completedAt: null,
  apiKeyId: null,
};

const validConfig = {
  appKey: 'myAppKey',
  appSecret: 'myAppSecret',
  shortcode: '600123',
  environment: 'sandbox',
  initiatorName: 'OGI_Initiator',
};

describe('mpesaProvider', () => {
  it('has correct metadata', () => {
    expect(mpesaProvider.providerId).toBe('safaricom');
    expect(mpesaProvider.providerName).toBe('M-Pesa B2C');
    expect(mpesaProvider.supportedCurrencies).toContain('KES');
  });

  describe('validateConfig', () => {
    it('accepts valid sandbox config', async () => {
      const result = await mpesaProvider.validateConfig(validConfig);
      expect(result.valid).toBe(true);
    });

    it('accepts production environment', async () => {
      const result = await mpesaProvider.validateConfig({ ...validConfig, environment: 'production' });
      expect(result.valid).toBe(true);
    });

    it('rejects missing appKey', async () => {
      const { appKey: _, ...rest } = validConfig;
      const result = await mpesaProvider.validateConfig(rest);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/appKey/);
    });

    it('rejects missing appSecret', async () => {
      const { appSecret: _, ...rest } = validConfig;
      const result = await mpesaProvider.validateConfig(rest);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/appSecret/);
    });

    it('rejects missing shortcode', async () => {
      const { shortcode: _, ...rest } = validConfig;
      const result = await mpesaProvider.validateConfig(rest);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/shortcode/);
    });

    it('rejects invalid environment', async () => {
      const result = await mpesaProvider.validateConfig({ ...validConfig, environment: 'staging' });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/environment/);
    });

    it('rejects empty string fields', async () => {
      const result = await mpesaProvider.validateConfig({ ...validConfig, appKey: '' });
      expect(result.valid).toBe(false);
    });

    it('rejects an invalid commandID', async () => {
      const result = await mpesaProvider.validateConfig({ ...validConfig, commandID: 'NotACommand' });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/commandID/);
    });
  });

  describe('submit', () => {
    it('returns a submitted result with a b2c externalId', async () => {
      const result = await mpesaProvider.submit(mockDisbursement, validConfig);
      expect(result.status).toBe('submitted');
      expect(result.externalId).toMatch(/^mpesa-b2c-/);
    });

    it('produces a Daraja B2C request template populated from config', async () => {
      const result = await mpesaProvider.submit(mockDisbursement, validConfig);
      const tmpl = result.payload.requestTemplate as Record<string, unknown>;
      expect(tmpl.CommandID).toBe('BusinessPayment');
      expect(tmpl.PartyA).toBe('600123');
      expect(tmpl.Amount).toBe(5000);
      expect(tmpl.PartyB).toBe('<RECIPIENT_MSISDN>'); // operator fills per recipient
      expect(tmpl.InitiatorName).toBe('OGI_Initiator');
    });

    it('points at the sandbox Daraja host for a sandbox channel', async () => {
      const result = await mpesaProvider.submit(mockDisbursement, validConfig);
      const endpoints = result.payload.endpoints as Record<string, string>;
      expect(endpoints.b2cPaymentRequest).toContain('sandbox.safaricom.co.ke');
    });

    it('points at the production Daraja host for a production channel', async () => {
      const result = await mpesaProvider.submit(mockDisbursement, { ...validConfig, environment: 'production' });
      const endpoints = result.payload.endpoints as Record<string, string>;
      expect(endpoints.b2cPaymentRequest).toContain('api.safaricom.co.ke');
    });

    it('includes batch summary with recipient count and currency', async () => {
      const result = await mpesaProvider.submit(mockDisbursement, validConfig);
      const batch = result.payload.batch as Record<string, unknown>;
      expect(batch.recipientCount).toBe(200);
      expect(batch.currency).toBe('KES');
      expect(batch.disbursementId).toBe('test-mpesa-789');
    });

    it('never echoes secrets in the payload', async () => {
      const result = await mpesaProvider.submit(mockDisbursement, validConfig);
      const serialized = JSON.stringify(result.payload);
      expect(serialized).not.toContain('myAppSecret');
      expect(serialized).not.toContain('myAppKey');
    });

    it('each call produces a unique externalId', async () => {
      const r1 = await mpesaProvider.submit(mockDisbursement, validConfig);
      const r2 = await mpesaProvider.submit(mockDisbursement, validConfig);
      expect(r1.externalId).not.toBe(r2.externalId);
    });
  });

  describe('checkStatus', () => {
    it('returns confirmed (non-custodial) status', async () => {
      const status = await mpesaProvider.checkStatus('mpesa-b2c-abc');
      expect(status.externalId).toBe('mpesa-b2c-abc');
      expect(status.status).toBe('confirmed');
      expect(typeof status.details.note).toBe('string');
    });
  });
});
