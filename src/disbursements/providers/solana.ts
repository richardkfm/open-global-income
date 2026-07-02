import { randomUUID } from 'node:crypto';
import { solanaAdapter } from '../../adapters/solana/index.js';
import type { Disbursement } from '../../core/types.js';
import type { DisbursementProvider, DisbursementResult, DisbursementProviderStatus } from '../types.js';

export const solanaUsdcProvider: DisbursementProvider = {
  providerId: 'solana',
  providerName: 'Solana USDC',
  supportedCurrencies: ['USDC'],

  async validateConfig(config: Record<string, unknown>) {
    if (typeof config.rpcUrl !== 'string' || !config.rpcUrl.trim()) {
      return { valid: false, error: "'rpcUrl' must be a non-empty string" };
    }
    return { valid: true };
  },

  async submit(disbursement: Disbursement): Promise<DisbursementResult> {
    // Compute USDC token amount using the existing Solana adapter.
    // The platform is non-custodial: we return an unsigned transaction payload
    // for signing by the DAO's multisig or treasury wallet.
    const entitlementPerRecipient = parseFloat(disbursement.amountPerRecipient);
    const tokenAmount = solanaAdapter.toTokenAmount(
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
      { tokenSymbol: 'USDC', tokenDecimals: 6, exchangeRate: 1 },
    );

    const externalId = randomUUID();

    return {
      externalId,
      status: 'submitted',
      payload: {
        transactionPayload: {
          type: 'solana_usdc_transfer',
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
          note: 'Unsigned — sign with your treasury multisig before broadcasting.',
        },
      },
    };
  },

  async checkStatus(externalId: string): Promise<DisbursementProviderStatus> {
    // No live RPC call in this implementation — status is confirmed once submit succeeds.
    return {
      externalId,
      status: 'confirmed',
      details: { note: 'Status confirmed at submission (non-custodial flow).' },
    };
  },
};
