import type { IdentityConnector, IdentityConnectorInfo } from '../types.js';
import { nationalIdProvider } from './national-id.js';
import { mobileKycProvider } from './mobile-kyc.js';
import { walletProvider } from './wallet.js';
import { communityProvider } from './community.js';

const connectors: IdentityConnector[] = [
  nationalIdProvider,
  mobileKycProvider,
  walletProvider,
  communityProvider,
];

/** Look up an identity connector by its id. Returns undefined if not found. */
export function getIdentityProvider(providerId: string): IdentityConnector | undefined {
  return connectors.find((c) => c.providerId === providerId);
}

/** List all registered identity connectors with their public metadata. */
export function listIdentityProviders(): IdentityConnectorInfo[] {
  return connectors.map(({ providerId, providerName, context, supportedClaimTypes, description }) => ({
    providerId,
    providerName,
    context,
    supportedClaimTypes,
    description,
  }));
}
