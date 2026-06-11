import { pgTable, text, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

/**
 * Queryable audit trail of GDS / provider sync operations (A6).
 *
 * Previously these events only went to stdout, so financial reconciliation
 * (matching ERP ticket/void/refund state against what actually happened at the
 * provider/BSP) had nothing to query. This table mirrors the stdout log and is
 * indexed by (agency, time) and (agency, provider, operation).
 */
export const providerSyncLog = pgTable('provider_sync_log', {
  id:           text('id').primaryKey(),
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  provider:     text('provider').notNull(),
  operation:    text('operation').notNull(),   // issue_ticket | void_ticket | reconcile_* | …
  status:       text('status').notNull(),      // success | failed
  referenceId:  text('reference_id'),          // ticket / PNR id
  errorMessage: text('error_message'),
  durationMs:   bigint('duration_ms', { mode: 'number' }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  agencyTimeIdx:     index('idx_psl_agency_time').on(t.agencyId, t.createdAt),
  agencyProviderIdx: index('idx_psl_agency_provider').on(t.agencyId, t.provider, t.operation),
}));

export type ProviderSyncLogRow = typeof providerSyncLog.$inferSelect;
export type NewProviderSyncLog  = typeof providerSyncLog.$inferInsert;
