interface SyncLogParams {
  agencyId:      string;
  provider:      string;
  operation:     string;    // retrieve_pnr | issue_ticket | reconcile_ticket
  status:        'success' | 'failed';
  referenceId?:  string;    // ticket ID or PNR ID
  errorMessage?: string;
  durationMs?:   number;
}

/**
 * Structured log for provider sync operations.
 * Writes to stdout (Vercel captures/indexes these) AND persists a row to the
 * queryable provider_sync_log table for financial reconciliation (A6). The DB
 * write is best-effort and fire-and-forget so logging never blocks or fails the
 * caller; failures are surfaced on stdout.
 */
export function logProviderSync(p: SyncLogParams): void {
  const level = p.status === 'success' ? 'info' : 'error';
  console[level](JSON.stringify({
    event:       `provider_sync_${p.status}`,
    provider:    p.provider,
    operation:   p.operation,
    referenceId: p.referenceId  ?? null,
    durationMs:  p.durationMs   ?? null,
    error:       p.errorMessage ?? null,
    agencyId:    p.agencyId,
  }));
  void persistProviderSync(p);
}

async function persistProviderSync(p: SyncLogParams): Promise<void> {
  try {
    const { db } = await import('./db');
    const { providerSyncLog } = await import('./schema');
    await db.insert(providerSyncLog).values({
      id:           crypto.randomUUID(),
      agencyId:     p.agencyId,
      provider:     p.provider,
      operation:    p.operation,
      status:       p.status,
      referenceId:  p.referenceId  ?? null,
      errorMessage: p.errorMessage ?? null,
      durationMs:   p.durationMs   ?? null,
    });
  } catch (err) {
    console.error(JSON.stringify({ event: 'provider_sync_log_persist_failed', error: String(err) }));
  }
}
