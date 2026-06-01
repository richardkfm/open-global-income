import type { IdentityClaim, VerificationResult } from '../../core/types.js';
import type { IdentityConnector } from '../types.js';
import { sha256Hex, maskSuffix } from '../util.js';

/**
 * Mobile-money KYC connector (E.164 MSISDN).
 *
 * Used where enrolment rides on a mobile-money account (e.g. M-Pesa). Validates
 * that the claim is a well-formed international MSISDN. The authoritative
 * subscriber-KYC assertion (the SIM is registered to a verified person) is
 * performed by the mobile-money operator / MNO at deployment time — OGI stores
 * only the hash of the number and a 3-digit display suffix.
 *
 * Reference (operator side):
 *   - Safaricom Daraja KYC / SIM-registration status, or an OTP round-trip via
 *     the same channel used for payment.
 */
export const mobileKycProvider: IdentityConnector = {
  providerId: 'mobile-kyc',
  providerName: 'Mobile-Money KYC (MSISDN)',
  context: 'mobile',
  supportedClaimTypes: ['phone'],
  description:
    'Validates an E.164 mobile number (MSISDN). Authoritative subscriber KYC is delegated to the mobile-money operator / MNO.',

  async verify(claim: IdentityClaim): Promise<VerificationResult> {
    if (claim.claimType !== 'phone') {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: `mobile-kyc connector cannot verify claim type '${claim.claimType}'`,
      };
    }

    // Normalise: strip spaces, dashes, parentheses; tolerate a leading '00'.
    let normalized = claim.claimReference.replace(/[\s()-]/g, '');
    if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;

    // E.164: optional '+', leading non-zero country digit, 7–14 more digits.
    if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: 'Phone must be a valid E.164 number (e.g. +254712345678)',
      };
    }

    const e164 = normalized.startsWith('+') ? normalized : `+${normalized}`;

    return {
      verified: true,
      accountHash: sha256Hex(`${claim.countryCode}:phone:${e164}`),
      routingRef: maskSuffix(e164, 3),
    };
  },
};
