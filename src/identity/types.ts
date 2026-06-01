import type { IdentityClaim, VerificationResult, IdentityProvider } from '../core/types.js';

/**
 * The deployment context an identity connector is designed for.
 * Mirrors the three programme archetypes in the project mission
 * (government / NGO / DAO), plus mobile-money KYC which spans all three.
 */
export type IdentityContext = 'government' | 'ngo' | 'dao' | 'mobile';

/**
 * A concrete, registry-listed identity connector.
 *
 * Extends the pure-core {@link IdentityProvider} contract with the metadata the
 * registry and admin UI need to present a connector (context, supported claim
 * types, human description).
 *
 * Design rule — "connect, don't build": like the disbursement providers, an
 * identity connector is **non-custodial**. It performs the deterministic,
 * offline checks it can (format / checksum validation), derives a non-reversible
 * `accountHash` + display `routingRef`, and delegates the authoritative
 * personhood/KYC assertion to the external provider's live API at deployment
 * time. OGI never stores biometric or raw identity data — only verified claims
 * (a hash + the provider reference + a timestamp).
 */
export interface IdentityConnector extends IdentityProvider {
  readonly context: IdentityContext;
  /** Claim types this connector knows how to validate. */
  readonly supportedClaimTypes: IdentityClaim['claimType'][];
  /** One-line description of what is validated locally and what is delegated. */
  readonly description: string;
  verify(claim: IdentityClaim): Promise<VerificationResult>;
}

/** Public metadata for a connector — safe to expose via API / UI (no secrets). */
export interface IdentityConnectorInfo {
  providerId: string;
  providerName: string;
  context: IdentityContext;
  supportedClaimTypes: IdentityClaim['claimType'][];
  description: string;
}
