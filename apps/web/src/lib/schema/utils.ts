import { pgTable, text, integer, bigint, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

// ── Atomic counters (INSERT ... ON CONFLICT DO UPDATE RETURNING) ───────────

export const agencyCounters = pgTable('agency_counters', {
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  counterType:  text('counter_type').notNull(),
  // bigint so invoice/voucher/journal sequences can never overflow (~2.1B int limit),
  // consistent with the bigint money columns.
  currentValue: bigint('current_value', { mode: 'number' }).notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.agencyId, t.counterType] }),
}));

// ── Idempotency (prevents double-submits) ─────────────────────────────────

export const idempotencyKeys = pgTable('idempotency_keys', {
  id:        text('id').primaryKey(),                        // the key (hash of request)
  agencyId:  text('agency_id'),
  status:    text('status').notNull().default('pending'),    // pending|complete|failed
  result:    jsonb('result'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
