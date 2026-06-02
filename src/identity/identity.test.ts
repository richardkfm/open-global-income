import { describe, it, expect } from 'vitest';
import { nationalIdProvider } from './providers/national-id.js';
import { mobileKycProvider } from './providers/mobile-kyc.js';
import { walletProvider } from './providers/wallet.js';
import { communityProvider } from './providers/community.js';
import { getIdentityProvider, listIdentityProviders } from './providers/registry.js';
import { isValidVerhoeff, sha256Hex, maskSuffix } from './util.js';
import type { IdentityClaim } from '../core/types.js';

/** Append a Verhoeff check digit to a numeric base so the result validates. */
function withVerhoeffCheck(base: string): string {
  for (let d = 0; d < 10; d++) {
    const candidate = base + d;
    if (isValidVerhoeff(candidate)) return candidate;
  }
  throw new Error('unreachable: a valid check digit always exists');
}

function claim(partial: Partial<IdentityClaim> & Pick<IdentityClaim, 'claimType' | 'claimReference'>): IdentityClaim {
  return {
    recipientId: 'r-1',
    countryCode: 'KE',
    ...partial,
  };
}

describe('identity util', () => {
  it('sha256Hex is deterministic and 64 hex chars', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
    expect(sha256Hex('hello')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maskSuffix only reveals the tail', () => {
    expect(maskSuffix('123456789', 4)).toBe('••••6789');
    expect(maskSuffix('ab', 4)).toBe('••••ab');
  });

  it('isValidVerhoeff validates and rejects', () => {
    const valid = withVerhoeffCheck('236');
    expect(isValidVerhoeff(valid)).toBe(true);
    // Flipping the last digit breaks the checksum.
    const broken = valid.slice(0, -1) + ((Number(valid.slice(-1)) + 1) % 10);
    expect(isValidVerhoeff(broken)).toBe(false);
    expect(isValidVerhoeff('12a4')).toBe(false);
  });
});

describe('nationalIdProvider', () => {
  it('has government context metadata', () => {
    expect(nationalIdProvider.providerId).toBe('national-id');
    expect(nationalIdProvider.context).toBe('government');
    expect(nationalIdProvider.supportedClaimTypes).toEqual(['national_id']);
  });

  it('verifies a well-formed UIN with a valid check digit', async () => {
    const uin = withVerhoeffCheck('123456789012');
    const res = await nationalIdProvider.verify(claim({ claimType: 'national_id', claimReference: uin }));
    expect(res.verified).toBe(true);
    expect(res.accountHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.routingRef).toBe(maskSuffix(uin, 4));
  });

  it('strips spaces and dashes before validating', async () => {
    const uin = withVerhoeffCheck('123456789012');
    const spaced = uin.replace(/(\d{4})(\d{4})/, '$1-$2 ');
    const res = await nationalIdProvider.verify(claim({ claimType: 'national_id', claimReference: spaced }));
    expect(res.verified).toBe(true);
  });

  it('rejects a number that fails the Verhoeff check', async () => {
    const uin = withVerhoeffCheck('123456789012');
    const broken = uin.slice(0, -1) + ((Number(uin.slice(-1)) + 1) % 10);
    const res = await nationalIdProvider.verify(claim({ claimType: 'national_id', claimReference: broken }));
    expect(res.verified).toBe(false);
    expect(res.accountHash).toBeNull();
    expect(res.error).toMatch(/Verhoeff/);
  });

  it('rejects too-short input', async () => {
    const res = await nationalIdProvider.verify(claim({ claimType: 'national_id', claimReference: '12345' }));
    expect(res.verified).toBe(false);
  });

  it('rejects the wrong claim type', async () => {
    const res = await nationalIdProvider.verify(claim({ claimType: 'phone', claimReference: '123' }));
    expect(res.verified).toBe(false);
    expect(res.error).toMatch(/cannot verify/);
  });
});

describe('mobileKycProvider', () => {
  it('verifies an E.164 number and masks all but the last 3 digits', async () => {
    const res = await mobileKycProvider.verify(claim({ claimType: 'phone', claimReference: '+254 712 345 678' }));
    expect(res.verified).toBe(true);
    expect(res.routingRef).toBe('••••678');
  });

  it('normalises a 00 international prefix', async () => {
    const a = await mobileKycProvider.verify(claim({ claimType: 'phone', claimReference: '00254712345678' }));
    const b = await mobileKycProvider.verify(claim({ claimType: 'phone', claimReference: '+254712345678' }));
    expect(a.verified).toBe(true);
    expect(a.accountHash).toBe(b.accountHash);
  });

  it('rejects malformed numbers', async () => {
    const res = await mobileKycProvider.verify(claim({ claimType: 'phone', claimReference: '12' }));
    expect(res.verified).toBe(false);
  });
});

describe('walletProvider', () => {
  it('verifies an EVM address case-insensitively', async () => {
    const lower = await walletProvider.verify(
      claim({ claimType: 'wallet', claimReference: '0xabcdef0123456789abcdef0123456789abcdef01' }),
    );
    const upper = await walletProvider.verify(
      claim({ claimType: 'wallet', claimReference: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01' }),
    );
    expect(lower.verified).toBe(true);
    expect(upper.verified).toBe(true);
    expect(lower.accountHash).toBe(upper.accountHash);
  });

  it('verifies a Solana base58 address', async () => {
    const res = await walletProvider.verify(
      claim({ claimType: 'wallet', claimReference: '4Nd1mYpZ8aN2dRsq2Q7xHGs7sQ8t9mF3kP1rUvWxYz12' }),
    );
    expect(res.verified).toBe(true);
  });

  it('rejects an invalid EVM address', async () => {
    const res = await walletProvider.verify(claim({ claimType: 'wallet', claimReference: '0x1234' }));
    expect(res.verified).toBe(false);
  });
});

describe('communityProvider', () => {
  it('verifies an attestation with the witness quorum', async () => {
    const res = await communityProvider.verify(
      claim({ claimType: 'community', claimReference: 'givedirectly:elder-amina:chief-otieno' }),
    );
    expect(res.verified).toBe(true);
    expect(res.routingRef).toBe('givedirectly');
  });

  it('is witness-order independent', async () => {
    const a = await communityProvider.verify(
      claim({ claimType: 'community', claimReference: 'org:a:b' }),
    );
    const b = await communityProvider.verify(
      claim({ claimType: 'community', claimReference: 'org:b:a' }),
    );
    expect(a.accountHash).toBe(b.accountHash);
  });

  it('rejects fewer than two witnesses', async () => {
    const res = await communityProvider.verify(
      claim({ claimType: 'community', claimReference: 'org:only-one' }),
    );
    expect(res.verified).toBe(false);
    expect(res.error).toMatch(/witness/);
  });
});

describe('identity registry', () => {
  it('lists all four connectors with public metadata only', () => {
    const list = listIdentityProviders();
    expect(list.map((p) => p.providerId).sort()).toEqual(
      ['community-attestation', 'mobile-kyc', 'national-id', 'wallet'],
    );
    for (const p of list) {
      expect(p).not.toHaveProperty('verify');
      expect(p.context).toBeTruthy();
      expect(p.supportedClaimTypes.length).toBeGreaterThan(0);
    }
  });

  it('covers all four deployment contexts', () => {
    const contexts = new Set(listIdentityProviders().map((p) => p.context));
    expect(contexts).toEqual(new Set(['government', 'ngo', 'dao', 'mobile']));
  });

  it('looks connectors up by id', () => {
    expect(getIdentityProvider('national-id')).toBe(nationalIdProvider);
    expect(getIdentityProvider('nope')).toBeUndefined();
  });
});
