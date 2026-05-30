/**
 * Provider Factory — resolves a stored credential to a live FlightProvider.
 *
 * Business rules:
 *  - Only active credentials are resolved (isActive = true).
 *  - Credentials are decrypted here; the returned ProviderCredentials.payload
 *    is plaintext and must never be logged or persisted.
 *  - The factory is the ONLY place that knows which class implements each code.
 *    API routes receive a FlightProvider interface and stay provider-agnostic.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { providerCredentials } from '@/lib/schema';
import { decryptCredential } from '@/lib/credential-crypto';
import { AmadeusProvider } from '@masarat/travel-providers';
import type { FlightProvider, ProviderCredentials, ProviderCode } from '@masarat/travel-providers';

export interface ResolvedProvider {
  provider:    FlightProvider;
  credentials: ProviderCredentials;
  providerCode: string;
  label:        string;
}

export async function resolveFlightProvider(
  credentialId: string,
  agencyId:     string,
): Promise<ResolvedProvider> {
  const rows = await db
    .select()
    .from(providerCredentials)
    .where(and(
      eq(providerCredentials.id,       credentialId),
      eq(providerCredentials.agencyId, agencyId),
      eq(providerCredentials.isActive, true),
    ))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error('بيانات الاعتماد غير موجودة أو معطّلة');
  }

  let payload: Record<string, string>;
  try {
    payload = JSON.parse(decryptCredential(row.encryptedPayload)) as Record<string, string>;
  } catch {
    throw new Error('فشل فك تشفير بيانات الاعتماد — تأكد من إعداد CREDENTIAL_ENCRYPTION_KEY');
  }

  const credentials: ProviderCredentials = {
    providerCode: row.providerCode as ProviderCode,
    payload,
  };

  let provider: FlightProvider;
  switch (row.providerCode) {
    case 'amadeus':
      provider = new AmadeusProvider();
      break;
    default:
      throw new Error(
        `مزود الرحلات "${row.providerCode}" غير مدعوم بعد — المدعوم حالياً: amadeus`,
      );
  }

  if (!provider.isConfigured(credentials)) {
    throw new Error('بيانات الاعتماد غير مكتملة — راجع الحقول المطلوبة لهذا المزود');
  }

  return {
    provider,
    credentials,
    providerCode: row.providerCode,
    label:        row.label,
  };
}
