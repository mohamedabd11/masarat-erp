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
 * A dedicated provider_sync_log table can be added in Phase 10 for analytics.
 * For now writes to stdout — Vercel captures and indexes these as structured logs.
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
}
