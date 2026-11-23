import { randomUUID } from 'node:crypto';
import type { Disbursement } from '../../core/types.js';
import type {
  DisbursementProvider,
  DisbursementResult,
  DisbursementProviderStatus,
  CallbackEvent,
} from '../types.js';
import { convert } from '../../core/fx.js';
import { getFxSnapshot } from '../../data/loader.js';

/**
 * SEPA Credit Transfer connector.
 *
 * Non-custodial, "connect — don't build" design: this provider does NOT run a
 * payment service and does NOT move money. It produces two operator-executable
 * artifacts against existing SEPA rails:
 *
 *  1. An **ISO 20022 pain.001** (Customer Credit Transfer Initiation) XML
 *     document — the standard file every SEPA bank and most PSPs ingest.
 *  2. A **Wise Payouts bulk-payment skeleton** — for operators using Wise.
 *
 * Per-creditor account details (IBAN / name) are placeholders filled by the
 * operator at execution time; OGI stores no recipient PII. Identity / KYC is
 * delegated entirely to the executing PSP (e.g. Wise) — OGI has no identity
 * provider of its own.
 *
 * Amounts are converted from the platform's PPP-USD base unit to EUR using the
 * maintained FX snapshot (`src/data/fx-rates.json`) rather than a hardcoded
 * rate, and the applied rate + provenance are returned for audit.
 *
 * Required config: apiKey, payoutAccountId, environment
 * Optional config: debtorName, debtorIban, debtorBic, requestedExecutionDate, remittanceInfo
 *
 * Wise reference (operator side):
 *   - validate: GET /v1/profiles
 *   - submit:   POST /v2/quotes (USD→EUR) then POST /v1/transfers per recipient
 *   - status:   GET /v2/transfers/{transferId}
 */

/** Escape a string for safe inclusion in XML element text. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Restrict free text to the SEPA basic Latin character set (EPC guidance:
 * a-z A-Z 0-9 / - ? : ( ) . , ' + space). German umlauts and ß are
 * transliterated (ä → ae, ß → ss); dashes become "-"; any other character
 * becomes a space. Banks reject or mangle files outside this set, so
 * "OGI basic income — …" or a debtor name like "Bundesamt für …" would
 * otherwise fail at the bank.
 */
export function toSepaCharset(value: string, maxLength: number): string {
  const map: Record<string, string> = {
    ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss',
    '–': '-', '—': '-', '‘': "'", '’': "'", '&': '+',
  };
  const out = value
    .replace(/[äöüÄÖÜß–—‘’&]/g, (c) => map[c] ?? ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return out.slice(0, maxLength);
}

/** ISO 13616 IBAN check: country code, check digits, mod-97 = 1. */
export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** ISO 9362 BIC: 4-letter bank, 2-letter country, 2-char location, optional 3-char branch. */
export function isValidBic(value: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value.trim().toUpperCase());
}

/** Generate a SEPA end-to-end / message reference. */
function sepaReference(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

/** Build an ISO 20022 pain.001.001.09 Customer Credit Transfer Initiation document. */
function buildPain001(opts: {
  msgId: string;
  createdAt: string;
  nbOfTxs: number;
  ctrlSum: string;
  initiatingParty: string;
  debtorName: string;
  debtorIban: string;
  debtorBic: string;
  requestedExecutionDate: string;
  amountPerRecipientEur: string;
  remittanceInfo: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xmlEscape(opts.msgId)}</MsgId>
      <CreDtTm>${opts.createdAt}</CreDtTm>
      <NbOfTxs>${opts.nbOfTxs}</NbOfTxs>
      <CtrlSum>${opts.ctrlSum}</CtrlSum>
      <InitgPty><Nm>${xmlEscape(opts.initiatingParty)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xmlEscape(opts.msgId)}-PMT</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${opts.nbOfTxs}</NbOfTxs>
      <CtrlSum>${opts.ctrlSum}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt><Dt>${opts.requestedExecutionDate}</Dt></ReqdExctnDt>
      <Dbtr><Nm>${xmlEscape(opts.debtorName)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${xmlEscape(opts.debtorIban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>${xmlEscape(opts.debtorBic)}</BICFI></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <!-- One CdtTrfTxInf per recipient. Clone this template and fill the
           creditor account/name per verified recipient at execution time. -->
      <CdtTrfTxInf>
        <PmtId><EndToEndId>&lt;END_TO_END_ID&gt;</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${opts.amountPerRecipientEur}</InstdAmt></Amt>
        <Cdtr><Nm>&lt;RECIPIENT_NAME&gt;</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>&lt;RECIPIENT_IBAN&gt;</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xmlEscape(opts.remittanceInfo)}</Ustrd></RmtInf>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

export const sepaProvider: DisbursementProvider = {
  providerId: 'sepa',
  providerName: 'SEPA Credit Transfer',
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
      return { valid: false, error: "'environment' must be 'sandbox' or 'production'" };
    }
    if (config.debtorIban !== undefined && (typeof config.debtorIban !== 'string' || !isValidIban(config.debtorIban))) {
      return { valid: false, error: "'debtorIban' is not a valid IBAN (ISO 13616 mod-97 check failed)" };
    }
    if (config.debtorBic !== undefined && (typeof config.debtorBic !== 'string' || !isValidBic(config.debtorBic))) {
      return { valid: false, error: "'debtorBic' is not a valid BIC (ISO 9362: 8 or 11 characters)" };
    }
    if (
      config.requestedExecutionDate !== undefined &&
      (typeof config.requestedExecutionDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(config.requestedExecutionDate) ||
        Number.isNaN(Date.parse(config.requestedExecutionDate)))
    ) {
      return { valid: false, error: "'requestedExecutionDate' must be a YYYY-MM-DD date" };
    }
    return { valid: true };
  },

  async submit(
    disbursement: Disbursement,
    config: Record<string, unknown> = {},
  ): Promise<DisbursementResult> {
    const msgId = sepaReference('OGI-SEPA');
    const externalId = `sepa-pain001-${msgId}`;
    const createdAt = new Date().toISOString();

    // Convert the PPP-USD base amounts to EUR via the maintained FX snapshot.
    const snapshot = getFxSnapshot();
    const perRecipient = convert(parseFloat(disbursement.amountPerRecipient), 'USD', 'EUR', snapshot);
    const total = convert(parseFloat(disbursement.totalAmount), 'USD', 'EUR', snapshot);
    const amountPerRecipientEur = perRecipient.amount.toFixed(2);
    const totalEur = total.amount.toFixed(2);

    const debtorName =
      typeof config.debtorName === 'string' ? toSepaCharset(config.debtorName, 70) : '<PROGRAM_DEBTOR_NAME>';
    const debtorIban =
      typeof config.debtorIban === 'string' ? config.debtorIban.replace(/\s+/g, '').toUpperCase() : '<PROGRAM_DEBTOR_IBAN>';
    const debtorBic =
      typeof config.debtorBic === 'string' ? config.debtorBic.trim().toUpperCase() : '<PROGRAM_DEBTOR_BIC>';
    const requestedExecutionDate =
      (config.requestedExecutionDate as string) ?? createdAt.slice(0, 10);
    const remittanceInfo = toSepaCharset(
      typeof config.remittanceInfo === 'string' ? config.remittanceInfo : `OGI basic income - ${disbursement.id}`,
      140,
    );

    const iso20022Xml = buildPain001({
      msgId,
      createdAt,
      nbOfTxs: disbursement.recipientCount,
      ctrlSum: totalEur,
      initiatingParty: debtorName,
      debtorName,
      debtorIban,
      debtorBic,
      requestedExecutionDate,
      amountPerRecipientEur,
      remittanceInfo,
    });

    // Wise Payouts bulk-payment skeleton (for operators routing via Wise).
    const wiseBulkPayment = {
      profileId: (config.payoutAccountId as string) ?? '<WISE_PROFILE_ID>',
      sourceCurrency: 'USD',
      targetCurrency: 'EUR',
      note: 'Create a quote (POST /v2/quotes), then one transfer per recipient (POST /v1/transfers) referencing a Wise recipient account. Wise performs recipient verification (KYC).',
      transferTemplate: {
        targetAccount: '<WISE_RECIPIENT_ACCOUNT_ID>',
        amount: { value: Number(amountPerRecipientEur), currency: 'EUR' },
        reference: '<END_TO_END_ID>',
      },
    };

    return {
      externalId,
      // 'submitted' = an operator-executable instruction has been prepared,
      // mirroring the non-custodial crypto providers.
      status: 'submitted',
      payload: {
        provider: 'sepa_pain001',
        environment: (config.environment as string) ?? 'sandbox',
        currency: 'EUR',
        messageId: msgId,
        fx: {
          base: 'PPP-USD',
          target: 'EUR',
          rate: perRecipient.rate,
          rateAsOf: perRecipient.rateAsOf,
          source: perRecipient.source,
        },
        batch: {
          recipientCount: disbursement.recipientCount,
          amountPerRecipient: { pppUsd: disbursement.amountPerRecipient, eur: amountPerRecipientEur },
          totalAmount: { pppUsd: disbursement.totalAmount, eur: totalEur },
          currency: 'EUR',
          countryCode: disbursement.countryCode,
          disbursementId: disbursement.id,
        },
        iso20022Xml,
        wiseBulkPayment,
        execution: {
          note: 'Non-custodial: OGI prepares the SEPA pain.001 (and Wise skeleton) only. No funds move and no recipient IBANs are stored by OGI. Fill creditor lines per verified recipient and submit to your bank/PSP.',
        },
      },
    };
  },

  async checkStatus(externalId: string): Promise<DisbursementProviderStatus> {
    // Non-custodial flow: settlement happens when the operator submits the
    // pain.001 / Wise transfers. Live status is queried by the operator.
    return {
      externalId,
      status: 'confirmed',
      details: {
        note: 'Instruction prepared (non-custodial). Track live settlement via your bank/PSP, or Wise GET /v2/transfers/{transferId}. Wise webhooks (current_state=outgoing_payment_sent) are also accepted at POST /v1/webhooks/inbound/sepa.',
      },
    };
  },

  async parseCallback(_headers: Record<string, string>, body: unknown): Promise<CallbackEvent | null> {
    // Wise webhook payload shape:
    // { data: { resource: { type, id }, current_state }, event_type, sent_at }
    if (typeof body !== 'object' || body === null) return null;

    const payload = body as Record<string, unknown>;
    const data = payload.data as Record<string, unknown> | undefined;
    const sentAt = payload.sent_at as string | undefined;
    if (!data || !sentAt) return null;

    const resource = data.resource as Record<string, unknown> | undefined;
    const currentState = data.current_state as string | undefined;
    if (!resource || resource.type !== 'transfer') return null;
    if (currentState !== 'outgoing_payment_sent' && currentState !== 'funds_refunded') return null;

    return {
      externalId: String(resource.id),
      status: currentState === 'outgoing_payment_sent' ? 'confirmed' : 'failed',
      timestamp: sentAt,
      details: { resource_type: 'transfer', current_state: currentState, raw: body },
    };
  },
};
