import { randomUUID } from 'node:crypto';
import type { Disbursement } from '../../core/types.js';
import type { DisbursementProvider, DisbursementResult, DisbursementProviderStatus } from '../types.js';

/**
 * SEPA Credit Transfer stub provider.
 *
 * Real integration requires a payment processor with SEPA access — Wise Payouts
 * API is the recommended integration point. This stub:
 * - Documents and validates the required config fields
 * - Converts PPP-USD amounts to EUR using an ECB reference rate
 * - Logs the SEPA Credit Transfer instruction that would be submitted
 * - Returns a mock transfer reference so the full pipeline can be tested
 *
 * Required config: apiKey, payoutAccountId, environment
 *
 * When integrating with Wise Payouts API:
 *   - validateConfig: POST /v1/profiles to verify credentials
 *   - submit: POST /v2/quotes (USD→EUR), then POST /v1/transfers per recipient
 *   - checkStatus: GET /v2/transfers/{transferId}
 *
 * ECB reference rate (EUR/USD) is hardcoded here at a representative 2024 level.
 * Replace with a live rate feed (ECB Data Portal or Wise quote endpoint) before
 * going to production.
 */

/** ECB reference rate: how many EUR per 1 PPP-USD (representative 2024 value) */
const ECB_EUR_PER_PPP_USD = 0.92;

/** Generate a SEPA-style end-to-end transaction reference */
function sepaReference(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `OGI-${ts}-${rand}`;
}

export const sepaProvider: DisbursementProvider = {
  providerId: 'sepa',
  providerName: 'SEPA Credit Transfer (Stub)',
  supportedCurrencies: ['EUR'],
  signatureHeader: 'x-wise-signature-sha256',

  async validateConfig(config: Record<string, unknown>) {
    const required = ['apiKey', 'payoutAccountId', 'environment'] as const;
    for (const field of required) {
      if (typeof config[field] !== 'string' || !(config[field] as string).trim()) {
        return { valid: false, error: `'${field}' must be a non-empty string` };
      }
    }
    const env = config.environment as string;
    if (env !== 'sandbox' && env !== 'production') {
      return {
        valid: false,
        error: "'environment' must be 'sandbox' or 'production'",
      };
    }
    return { valid: true };
  },

  async submit(disbursement: Disbursement): Promise<DisbursementResult> {
    const externalId = `sepa-stub-${randomUUID()}`;
    const reference = sepaReference();

    // Convert PPP-USD amount to EUR using the ECB reference rate.
    // In production: replace with a live Wise quote (POST /v2/quotes).
    const amountPppUsd = parseFloat(disbursement.amountPerRecipient);
    const amountEur = (amountPppUsd * ECB_EUR_PER_PPP_USD).toFixed(2);
    const totalEur = (parseFloat(disbursement.totalAmount) * ECB_EUR_PER_PPP_USD).toFixed(2);

    const instruction = {
      type: 'sepa_credit_transfer',
      reference,
      recipientCount: disbursement.recipientCount,
      amountPerRecipient: {
        pppUsd: disbursement.amountPerRecipient,
        eur: amountEur,
        fxRate: ECB_EUR_PER_PPP_USD,
        fxSource: 'ECB reference rate (stub — replace with live feed in production)',
      },
      totalAmount: {
        pppUsd: disbursement.totalAmount,
        eur: totalEur,
      },
      currency: 'EUR',
      disbursementId: disbursement.id,
      countryCode: disbursement.countryCode,
      note: 'SEPA Credit Transfer instruction — submit via Wise Payouts API or equivalent processor.',
    };

    // Log what would be sent to the payment processor
    console.log('[SEPA stub] Would submit SEPA Credit Transfer:', instruction);

    return {
      externalId,
      status: 'pending',
      payload: {
        mock: true,
        note: 'SEPA stub — no real transfer submitted. Replace with live Wise Payouts API integration.',
        transferReference: reference,
        instruction,
      },
    };
  },

  async checkStatus(externalId: string): Promise<DisbursementProviderStatus> {
    return {
      externalId,
      status: 'pending',
      details: {
        mock: true,
        note: 'SEPA stub — status always returns pending. Real status checks require Wise Payouts API (GET /v2/transfers/{transferId}).',
      },
    };
  },

  async parseCallback(
    _headers: Record<string, string>,
    body: unknown,
  ): Promise<import('../types.js').CallbackEvent | null> {
    // Wise webhook payload shape:
    // {
    //   data: { resource: { type: string, id: number }, current_state: string },
    //   event_type: string,
    //   sent_at: string   // ISO 8601
    // }
    if (typeof body !== 'object' || body === null) return null;

    const payload = body as Record<string, unknown>;
    const data = payload.data as Record<string, unknown> | undefined;
    const sentAt = payload.sent_at as string | undefined;

    if (!data || !sentAt) return null;

    const resource = data.resource as Record<string, unknown> | undefined;
    const currentState = data.current_state as string | undefined;

    if (!resource || resource.type !== 'transfer') return null;
    if (currentState !== 'outgoing_payment_sent' && currentState !== 'funds_refunded') return null;

    const externalId = String(resource.id);
    const status = currentState === 'outgoing_payment_sent' ? 'confirmed' : 'failed';

    return {
      externalId,
      status,
      timestamp: sentAt,
      details: { resource_type: 'transfer', current_state: currentState, raw: body },
    };
  },
};
