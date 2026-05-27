import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

// ── Atomic counters (replaces Firestore FieldValue.increment) ─────────────
// One row per (agencyId, counterType). Use SQL UPDATE + RETURNING for atomicity.

export const agencyCounters = pgTable('agency_counters', {
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  counterType:  text('counter_type').notNull(),              // invoice|booking|quote|receipt|payment|journal|employee
  currentValue: integer('current_value').notNull().default(0),
});

// ── Idempotency (prevents double-submits) ─────────────────────────────────

export const idempotencyKeys = pgTable('idempotency_keys', {
  id:        text('id').primaryKey(),                        // the key (hash of request)
  agencyId:  text('agency_id'),
  status:    text('status').notNull().default('pending'),    // pending|complete|failed
  result:    jsonb('result'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
