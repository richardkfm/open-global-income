import type { IdentityClaim, VerificationResult } from '../../core/types.js';
import type { IdentityConnector } from '../types.js';
import { sha256Hex, maskSuffix } from '../util.js';

/** Validate an EVM address: 0x followed by 40 hex characters. */
function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Validate a Solana (base58, 32–44 char) address. */
function isValidSolanaAddress(addr: string): boolean {
  return addr.length >= 32 && addr.length <= 44 && BASE58.test(addr);
}

/**
 * Wallet-based identity connector (DAO / proof-of-personhood).
 *
 * For DAO and ReFi programmes where identity is a self-custodied wallet, often
 * bound to a proof-of-personhood credential (World ID, a soulbound token, a
 * Gitcoin Passport score). Validates that the claim is a well-formed EVM or
 * Solana address. The authoritative uniqueness / personhood assertion — and any
 * EIP-55 checksum confirmation — is delegated to the on-chain credential at
 * deployment time. OGI stores only the hash of the address.
 *
 * Reference (operator side):
 *   - World ID: verify a proof against the recipient's wallet, or
 *   - read a soulbound-token / attestation balance for the address on-chain.
 */
export const walletProvider: IdentityConnector = {
  providerId: 'wallet',
  providerName: 'Wallet Identity (proof-of-personhood)',
  context: 'dao',
  supportedClaimTypes: ['wallet'],
  description:
    'Validates an EVM (0x…) or Solana wallet address. Uniqueness / personhood is delegated to an on-chain credential (World ID, soulbound token).',

  async verify(claim: IdentityClaim): Promise<VerificationResult> {
    if (claim.claimType !== 'wallet') {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: `wallet connector cannot verify claim type '${claim.claimType}'`,
      };
    }

    const addr = claim.claimReference.trim();
    const isEvm = addr.startsWith('0x');
    const valid = isEvm ? isValidEvmAddress(addr) : isValidSolanaAddress(addr);

    if (!valid) {
      return {
        verified: false,
        accountHash: null,
        routingRef: null,
        error: isEvm
          ? 'Invalid EVM address (expected 0x + 40 hex characters)'
          : 'Invalid wallet address (expected EVM 0x… or Solana base58)',
      };
    }

    // Normalise EVM to lowercase so the hash is checksum-case independent.
    const normalized = isEvm ? addr.toLowerCase() : addr;

    return {
      verified: true,
      accountHash: sha256Hex(`${claim.countryCode}:wallet:${normalized}`),
      routingRef: maskSuffix(addr, 4),
    };
  },
};
