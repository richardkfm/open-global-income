import type { IdentityClaim, VerificationResult } from '../../core/types.js';
import type { IdentityConnector } from '../types.js';
import { sha256Hex, maskSuffix, isValidVerhoeff } from '../util.js';

/**
 * National ID / Civil Registry connector (MOSIP-compatible).
 *
 * Validates a national identity number (UIN/VID) the way MOSIP and similar
 * government registries do: 10–16 digits guarded by a Verhoeff check digit.
 * This is a real, offline structural check. The authoritative "this UIN belongs
 * to a real, living person" assertion is delegated to the registry's live API
 * at deployment time (e.g. a MOSIP IDA `identity/auth` demographic/OTP call) —
 * OGI stores only the hash of the number, never the number itself.
 *
 * Reference (operator side):
 *   - MOSIP ID Authentication (IDA): POST /idauthentication/v1/auth/{...}
 *   - Returns an authentication token; OGI records provider + hash + timestamp.
 */
export const nationalIdProvider: IdentityConnector = {
  providerId: 'national-id',
  providerName: 'National ID / Civil Registry (MOSIP-compatible)',
  context: 'government',
  supportedClaimTypes: ['national_id'],
  description:
    'Validates a national identity number (UIN/VID) with a Verhoeff check digit. Authoritative lookup is delegated to the registry IDA API.',

  async verify(claim: IdentityClaim): Promise<VerificationResult> {
    if (claim.claimType !== 'national_id') {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: `national-id connector cannot verify claim type '${claim.claimType}'`,
      };
    }

    // Normalise: strip spaces and dashes operators commonly include.
    const normalized = claim.claimReference.replace(/[\s-]/g, '');

    if (!/^\d{10,16}$/.test(normalized)) {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: 'National ID must be 10–16 digits',
      };
    }

    if (!isValidVerhoeff(normalized)) {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: 'National ID failed Verhoeff check-digit validation',
      };
    }

    return {
      verified: true,
      accountHash: sha256Hex(`${claim.countryCode}:national_id:${normalized}`),
      routingRef: maskSuffix(normalized, 4),
    };
  },
};
