import { eq, and } from 'drizzle-orm';
import { db } from './db';
import { providerCredentials } from './schema/provider-credentials';
import { getProvider } from './providers/registry';
import { decryptJson } from './crypto';
import type { FlightProvider } from './providers/types';

export interface ResolvedProvider {
  provider:     FlightProvider;
  credentials:  unknown;
  providerCode: string;
  label:        string;
  credentialId: string;
}

/**
 * Resolve a provider by credential ID.
 * Validates agency ownership and active status before returning.
 */
export async function resolveFlightProvider(
  credentialId: string,
  agencyId:     string,
): Promise<ResolvedProvider> {
  const [cred] = await db
    .select()
    .from(providerCredentials)
    .where(and(
      eq(providerCredentials.id, credentialId),
      eq(providerCredentials.agencyId, agencyId),
    ));

  if (!cred)           throw new Error(`Provider credential not found: ${credentialId}`);
  if (!cred.isActive)  throw new Error(`Provider credential is inactive: ${credentialId}`);

  return {
    provider:     getProvider(cred.providerCode),
    credentials:  await decryptJson(cred.credentials),
    providerCode: cred.providerCode,
    label:        cred.label ?? cred.providerCode,
    credentialId: cred.id,
  };
}

/**
 * Resolve a provider by providerCode (used by cron jobs that only know the GDS name).
 * Picks the single active credential for the agency+provider pair.
 */
export async function resolveFlightProviderByCode(
  providerCode: string,
  agencyId:     string,
): Promise<ResolvedProvider> {
  const [cred] = await db
    .select()
    .from(providerCredentials)
    .where(and(
      eq(providerCredentials.agencyId, agencyId),
      eq(providerCredentials.providerCode, providerCode),
      eq(providerCredentials.isActive, true),
    ))
    .limit(1);

  if (!cred) throw new Error(`No active credential for provider ${providerCode} in agency ${agencyId}`);

  return {
    provider:     getProvider(cred.providerCode),
    credentials:  await decryptJson(cred.credentials),
    providerCode: cred.providerCode,
    label:        cred.label ?? cred.providerCode,
    credentialId: cred.id,
  };
}
