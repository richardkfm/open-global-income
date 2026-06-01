import type { IdentityClaim, VerificationResult } from '../../core/types.js';
import type { IdentityConnector } from '../types.js';
import { sha256Hex } from '../util.js';

/**
 * Community-attestation connector (NGO / community verification).
 *
 * For NGO programmes that enrol people without formal documentation, identity is
 * established by community witnesses (a registering organisation plus two or more
 * vouching attestors). The claim reference encodes that attestation as
 * `orgId:witnessA:witnessB[:witnessC…]`. This connector validates the structure
 * and that the quorum of witnesses is met; the trust model is the registering
 * NGO's, recorded here as a hashed, auditable claim. OGI stores only the hash
 * and the organisation id as the (non-sensitive) display reference.
 */
const MIN_WITNESSES = 2;

export const communityProvider: IdentityConnector = {
  providerId: 'community-attestation',
  providerName: 'Community Attestation (NGO)',
  context: 'ngo',
  supportedClaimTypes: ['community'],
  description:
    'Validates a community attestation of the form orgId:witnessA:witnessB (≥2 witnesses). Trust is the registering NGO’s; OGI records a hashed, auditable claim.',

  async verify(claim: IdentityClaim): Promise<VerificationResult> {
    if (claim.claimType !== 'community') {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: `community-attestation connector cannot verify claim type '${claim.claimType}'`,
      };
    }

    const parts = claim.claimReference
      .split(':')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const [orgId, ...witnesses] = parts;

    if (!orgId) {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: 'Attestation must start with an organisation id',
      };
    }

    if (witnesses.length < MIN_WITNESSES) {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: `Attestation requires at least ${MIN_WITNESSES} witnesses (got ${witnesses.length})`,
      };
    }

    return {
      verified: true,
      accountHash: sha256Hex(
        `${claim.countryCode}:community:${orgId}:${witnesses.sort().join(':')}`,
      ),
      // The organisation id is a non-sensitive routing reference, safe to display.
      routingRef: orgId,
    };
  },
};
