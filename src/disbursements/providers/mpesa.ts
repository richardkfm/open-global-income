import { randomUUID } from 'node:crypto';
import type { Disbursement } from '../../core/types.js';
import type {
  DisbursementProvider,
  DisbursementResult,
  DisbursementProviderStatus,
} from '../types.js';

/**
 * M-Pesa B2C connector.
 *
 * Non-custodial, "connect — don't build" design: this provider does NOT run a
 * payment service and does NOT call Safaricom directly. It produces a
 * **Daraja B2C-ready instruction batch** — the exact request shape Safaricom's
 * Daraja `B2C PaymentRequest v3` API consumes — which the program operator
 * submits to Safaricom from their own authenticated environment.
 *
 * Why this shape:
 * - The platform stores no recipient PII. Per-recipient MSISDNs are filled in
 *   by the operator at execution time (the `PartyB` placeholder below), never
 *   by OGI, and are never persisted here.
 * - Identity / KYC is delegated entirely to Safaricom (M-Pesa registration) —
 *   OGI has no identity provider of its own.
 * - Secrets (appSecret, the cert-derived SecurityCredential) never leave the
 *   operator. We echo only the non-secret originator fields (shortcode, etc.).
 *
 * Required config: appKey, appSecret, shortcode, environment
 * Optional config: initiatorName, commandID, resultUrl, queueTimeOutUrl, remarks
 *
 * Daraja reference:
 *   - OAuth:   GET  /oauth/v1/generate?grant_type=client_credentials
 *   - B2C:     POST /mpesa/b2c/v3/paymentrequest
 *   - Status:  POST /mpesa/transactionstatus/v1/query
 */

type MpesaEnv = 'sandbox' | 'production';

/** Daraja host per environment. */
function darajaHost(env: MpesaEnv): string {
  return env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
}

const VALID_COMMAND_IDS = ['BusinessPayment', 'SalaryPayment', 'PromotionPayment'] as const;

export const mpesaProvider: DisbursementProvider = {
  providerId: 'safaricom',
  providerName: 'M-Pesa B2C',
  supportedCurrencies: ['KES'],

  async validateConfig(config: Record<string, unknown>) {
    const required = ['appKey', 'appSecret', 'shortcode', 'environment'] as const;
    for (const field of required) {
      if (typeof config[field] !== 'string' || !(config[field] as string).trim()) {
        return { valid: false, error: `'${field}' must be a non-empty string` };
      }
    }
    const env = config.environment as string;
    if (env !== 'sandbox' && env !== 'production') {
      return { valid: false, error: "'environment' must be 'sandbox' or 'production'" };
    }
    if (
      config.commandID !== undefined &&
      !VALID_COMMAND_IDS.includes(config.commandID as (typeof VALID_COMMAND_IDS)[number])
    ) {
      return {
        valid: false,
        error: `'commandID' must be one of: ${VALID_COMMAND_IDS.join(', ')}`,
      };
    }
    return { valid: true };
  },

  async submit(
    disbursement: Disbursement,
    config: Record<string, unknown> = {},
  ): Promise<DisbursementResult> {
    const env = (config.environment as MpesaEnv) ?? 'sandbox';
    const host = darajaHost(env);
    const shortcode = (config.shortcode as string) ?? '<YOUR_SHORTCODE>';
    const initiatorName = (config.initiatorName as string) ?? '<INITIATOR_NAME>';
    const commandID =
      (config.commandID as (typeof VALID_COMMAND_IDS)[number] | undefined) ?? 'BusinessPayment';
    const remarks = (config.remarks as string) ?? `OGI disbursement ${disbursement.id}`;

    const originatorConversationId = `OGI-${disbursement.id}-${randomUUID()}`;
    const externalId = `mpesa-b2c-${originatorConversationId}`;

    // A single Daraja B2C PaymentRequest template, sized by the batch. The
    // operator fans this out to one request per recipient, filling PartyB
    // (the recipient MSISDN) and SecurityCredential (the cert-encrypted
    // initiator password) at execution time. OGI never sees either.
    const requestTemplate = {
      OriginatorConversationID: originatorConversationId,
      InitiatorName: initiatorName,
      SecurityCredential: '<CERT_ENCRYPTED_INITIATOR_PASSWORD>',
      CommandID: commandID,
      Amount: Number(disbursement.amountPerRecipient),
      PartyA: shortcode,
      PartyB: '<RECIPIENT_MSISDN>',
      Remarks: remarks,
      QueueTimeOutURL: (config.queueTimeOutUrl as string) ?? '<YOUR_QUEUE_TIMEOUT_URL>',
      ResultURL: (config.resultUrl as string) ?? '<YOUR_RESULT_URL>',
      Occasion: (config.occasion as string) ?? '',
    };

    return {
      externalId,
      // 'submitted' = a ready-to-execute instruction has been prepared. As with
      // the non-custodial crypto providers, the platform considers its job done
      // once the operator-executable instruction exists.
      status: 'submitted',
      payload: {
        provider: 'mpesa_b2c',
        environment: env,
        currency: 'KES',
        endpoints: {
          oauth: `${host}/oauth/v1/generate?grant_type=client_credentials`,
          b2cPaymentRequest: `${host}/mpesa/b2c/v3/paymentrequest`,
          transactionStatus: `${host}/mpesa/transactionstatus/v1/query`,
        },
        batch: {
          recipientCount: disbursement.recipientCount,
          amountPerRecipient: disbursement.amountPerRecipient,
          totalAmount: disbursement.totalAmount,
          currency: disbursement.currency,
          countryCode: disbursement.countryCode,
          disbursementId: disbursement.id,
        },
        requestTemplate,
        execution: {
          steps: [
            'Obtain an OAuth token from the oauth endpoint using your appKey/appSecret (operator side).',
            'For each verified recipient, clone requestTemplate and set PartyB to the recipient MSISDN.',
            'Set SecurityCredential to your cert-encrypted initiator password.',
            'POST each request to b2cPaymentRequest; record the returned ConversationID.',
            'Settlement is confirmed asynchronously via your ResultURL or the transactionStatus endpoint.',
          ],
          note: 'Non-custodial: OGI prepares the Daraja B2C instruction only. No funds move and no recipient phone numbers are stored by OGI.',
        },
      },
    };
  },

  async checkStatus(externalId: string): Promise<DisbursementProviderStatus> {
    // Non-custodial flow: the instruction is prepared by OGI; actual settlement
    // happens when the operator submits it to Daraja. Live per-transaction
    // status is queried by the operator via the Daraja Transaction Status API.
    return {
      externalId,
      status: 'confirmed',
      details: {
        note: 'Instruction prepared (non-custodial). Query live B2C settlement via the Daraja Transaction Status API (POST /mpesa/transactionstatus/v1/query) using the ConversationID returned at execution.',
      },
    };
  },
};
