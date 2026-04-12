import type { DisbursementProvider } from '../types.js';
import { solanaUsdcProvider } from './solana.js';
import { evmUsdcProvider } from './evm.js';
import { mpesaStubProvider } from './mpesa.js';
import { sepaProvider } from './sepa.js';

const providers: DisbursementProvider[] = [
  solanaUsdcProvider,
  evmUsdcProvider,
  mpesaStubProvider,
  sepaProvider,
];

/** Look up a provider by its ID. Returns undefined if not found. */
export function getProvider(providerId: string): DisbursementProvider | undefined {
  return providers.find((p) => p.providerId === providerId);
}

/** List all registered providers with their metadata. */
export function listProviders(): Array<{
  providerId: string;
  providerName: string;
  supportedCurrencies: string[];
}> {
  return providers.map(({ providerId, providerName, supportedCurrencies }) => ({
    providerId,
    providerName,
    supportedCurrencies,
  }));
}
