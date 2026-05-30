import type { ProviderCode, ProviderType, ProviderCredentials } from '../types';

/**
 * Base contract for all travel provider integrations.
 * All providers must implement this interface.
 */
export interface BookingProvider {
  readonly providerCode: ProviderCode;
  readonly providerType: ProviderType;
  /** Returns true only when all required credential fields are present and non-empty. */
  isConfigured(credentials: ProviderCredentials): boolean;
}
