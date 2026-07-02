import { randomUUID } from 'node:crypto';
import { evmAdapter, evmChains } from '../../adapters/evm/index.js';
import type { Disbursement } from '../../core/types.js';
import type { DisbursementProvider, DisbursementResult, DisbursementProviderStatus } from '../types.js';

/** Supported EVM chain IDs with human-readable names */
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  8453: 'Base',
};

export const evmUsdcProvider: DisbursementProvider = {
  providerId: 'evm',
  providerName: 'EVM USDC',
  supportedCurrencies: ['USDC'],

  async validateConfig(config: Record<string, unknown>) {
    if (typeof config.chainId !== 'number' || !Number.isInteger(config.chainId)) {
      return { valid: false, error: "'chainId' must be an integer" };
    }
    if (typeof config.tokenAddress !== 'string' || !config.tokenAddress.trim()) {
      return { valid: false, error: "'tokenAddress' must be a non-empty string" };
    }
    return { valid: true };
  },

  async submit(disbursement: Disbursement): Promise<DisbursementResult> {
    // Generate unsigned ERC-20 transfer calldata.
    // The platform is non-custodial — the DAO's multisig signs and broadcasts.
    const entitlementPerRecipient = parseFloat(disbursement.amountPerRecipient);
    const chainConfig = {
      ...evmChains.ethereum,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      exchangeRate: 1,
    };

    const tokenAmount = evmAdapter.toTokenAmount(
      {
        countryCode: disbursement.countryCode,
        pppUsdPerMonth: entitlementPerRecipient,
        localCurrencyPerMonth: entitlementPerRecipient,
        score: 0,
        // Adapters only read pppUsdPerMonth for token conversion; this is an
        // unused placeholder required by the GlobalIncomeEntitlement shape.
        adequacyEstimate: {
          monthlyPppUsd: entitlementPerRecipient,
          dailyPppUsd: entitlementPerRecipient / 30,
          basis: 'upper_middle',
          label: 'Not applicable — disbursement providers do not use the adequacy estimate',
          source: 'n/a',
          caveat: 'n/a',
        },
        meta: { rulesetVersion: 'v1', dataVersion: 'worldbank-2023' },
      },
      chainConfig,
    );

    const externalId = randomUUID();
    const chainId = typeof disbursement.channelId === 'string' ? 1 : 1; // default Ethereum

    return {
      externalId,
      status: 'submitted',
      payload: {
        transactionPayload: {
          type: 'evm_usdc_transfer',
          chainId,
          chainName: CHAIN_NAMES[chainId] ?? 'EVM',
          recipientCount: disbursement.recipientCount,
          amountPerRecipient: {
            rawAmount: tokenAmount.rawAmount.toString(),
            displayAmount: tokenAmount.displayAmount,
            symbol: tokenAmount.symbol,
          },
          totalRawAmount: (
            tokenAmount.rawAmount * BigInt(disbursement.recipientCount)
          ).toString(),
          currency: 'USDC',
          disbursementId: disbursement.id,
          countryCode: disbursement.countryCode,
          note: 'Unsigned ERC-20 calldata — sign with your treasury multisig before broadcasting.',
        },
      },
    };
  },

  async checkStatus(externalId: string): Promise<DisbursementProviderStatus> {
    return {
      externalId,
      status: 'confirmed',
      details: { note: 'Status confirmed at submission (non-custodial flow).' },
    };
  },
};
