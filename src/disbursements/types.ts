import type { Disbursement } from '../core/types.js';

/** Result returned by a provider after submitting a disbursement */
export interface DisbursementResult {
  /** Provider-assigned external ID for tracking (tx hash, request ID, etc.) */
  externalId: string;
  /** Immediate submission status */
  status: 'pending' | 'submitted';
  /** Provider-specific payload (unsigned tx data, mock receipt, calldata, etc.) */
  payload: Record<string, unknown>;
}

/** Status of a submitted disbursement as reported by the provider */
export interface DisbursementProviderStatus {
  externalId: string;
  status: 'pending' | 'confirmed' | 'failed';
  details: Record<string, unknown>;
}

/**
 * Event parsed from an inbound provider callback.
 * Returned by DisbursementProvider.parseCallback() after the platform has
 * already verified the HMAC signature.
 */
export interface CallbackEvent {
  /** Provider-assigned external ID — must match a stored disbursement */
  externalId: string;
  /** Outcome reported by the provider */
  status: 'confirmed' | 'failed';
  /**
   * ISO 8601 timestamp from the provider payload.
   * Used by the platform for replay-attack protection (±5 minute window).
   */
  timestamp: string;
  /** Provider-specific raw data for audit logging */
  details: Record<string, unknown>;
}

/**
 * Interface all disbursement providers must implement.
 * The platform is non-custodial — providers prepare and report, never hold funds.
 */
export interface DisbursementProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly supportedCurrencies: string[];

  /**
   * Name of the HTTP header this provider uses to deliver its HMAC-SHA256
   * signature of the callback request body.
   * Example: 'x-wise-signature-sha256' for the SEPA/Wise provider.
   * If omitted the platform uses the generic 'x-webhook-signature' header.
   */
  readonly signatureHeader?: string;

  /** Validate that the channel config is correct before registering */
  validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; error?: string }>;

  /** Submit a disbursement for processing */
  submit(disbursement: Disbursement): Promise<DisbursementResult>;

  /** Check the status of a previously submitted disbursement */
  checkStatus(externalId: string): Promise<DisbursementProviderStatus>;

  /**
   * Parse and validate an inbound callback payload from this provider.
   * Called only after the platform has already verified the HMAC signature.
   * Returns null if the event is not actionable (e.g. wrong event type,
   * irrelevant resource, non-terminal state).
   */
  parseCallback?(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<CallbackEvent | null>;
}
