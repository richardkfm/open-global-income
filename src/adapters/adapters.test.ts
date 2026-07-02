import { describe, it, expect } from 'vitest';
import { solanaAdapter } from './solana/index.js';
import { evmAdapter, evmChains } from './evm/index.js';
import type { GlobalIncomeEntitlement } from '../core/types.js';

const mockEntitlement: GlobalIncomeEntitlement = {
  countryCode: 'DE',
  pppUsdPerMonth: 210,
  localCurrencyPerMonth: 178.5,
  score: 0.0528,
  adequacyEstimate: {
    monthlyPppUsd: 1200,
    dailyPppUsd: 40,
    basis: 'relative_median',
    label: '60% of estimated median income — ≈ $1200 PPP-USD/month',
    source: 'OECD / Eurostat at-risk-of-poverty standard',
    caveat: 'Informational only.',
  },
  meta: { rulesetVersion: 'v1', dataVersion: 'worldbank-2023' },
};

describe('Solana adapter', () => {
  it('converts entitlement to USDC token amount', () => {
    const result = solanaAdapter.toTokenAmount(mockEntitlement, {
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      exchangeRate: 1,
    });
    expect(result.rawAmount).toBe(210000000n);
    expect(result.displayAmount).toBe('210.000000');
    expect(result.symbol).toBe('USDC');
    expect(result.decimals).toBe(6);
  });

  it('applies custom exchange rate', () => {
    const result = solanaAdapter.toTokenAmount(mockEntitlement, {
      tokenSymbol: 'SOL',
      tokenDecimals: 9,
      exchangeRate: 0.01,
    });
    expect(result.rawAmount).toBe(2100000000n);
    expect(result.symbol).toBe('SOL');
  });

  it('returns metadata', () => {
    const meta = solanaAdapter.getMetadata();
    expect(meta.chainId).toBe('solana');
    expect(meta.supportedTokens).toContain('USDC');
  });
});

describe('EVM adapter', () => {
  it('converts entitlement to USDC token amount', () => {
    const result = evmAdapter.toTokenAmount(mockEntitlement, {
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      exchangeRate: 1,
      chainId: 1,
    });
    expect(result.rawAmount).toBe(210000000n);
    expect(result.symbol).toBe('USDC');
  });

  it('works with DAI (18 decimals)', () => {
    const result = evmAdapter.toTokenAmount(mockEntitlement, {
      tokenSymbol: 'DAI',
      tokenDecimals: 18,
      exchangeRate: 1,
      chainId: 1,
    });
    expect(result.rawAmount).toBe(210000000000000000000n);
    expect(result.symbol).toBe('DAI');
    expect(result.decimals).toBe(18);
  });

  it('returns metadata', () => {
    const meta = evmAdapter.getMetadata();
    expect(meta.chainId).toBe('evm');
    expect(meta.supportedTokens).toContain('DAI');
  });

  it('provides pre-configured chain configs', () => {
    expect(evmChains.ethereum.chainId).toBe(1);
    expect(evmChains.polygon.chainId).toBe(137);
    expect(evmChains.arbitrum.chainId).toBe(42161);
    expect(evmChains.base.chainId).toBe(8453);
  });
});
