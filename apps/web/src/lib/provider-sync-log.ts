import { db } from '@/lib/db';
import { providerSyncLogs } from '@/lib/schema';
import { randomUUID } from 'crypto';

interface LogParams {
  agencyId:      string;
  provider:      string;
  operation:     string;
  status:        'success' | 'failed' | 'retry';
  requestId?:    string;
  referenceId?:  string;
  durationMs?:   number;
  errorMessage?: string;
}

export async function logProviderSync(params: LogParams): Promise<void> {
  try {
    await db.insert(providerSyncLogs).values({
      id:           randomUUID(),
      agencyId:     params.agencyId,
      provider:     params.provider,
      operation:    params.operation,
      status:       params.status,
      requestId:    params.requestId  ?? null,
      referenceId:  params.referenceId ?? null,
      durationMs:   params.durationMs  ?? null,
      errorMessage: params.errorMessage ?? null,
    });
  } catch {
    // log failure should never crash the caller
    console.error(JSON.stringify({ event: 'provider_sync_log_failed', ...params }));
  }
}
