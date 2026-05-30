import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const auditLog = pgTable('audit_log', {
  id:         text('id').primaryKey(),
  agencyId:   text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  userId:     text('user_id').notNull(),
  userEmail:  text('user_email'),
  action:     text('action').notNull(),      // create|update|delete|login|export|approve|reject|reverse
  resource:   text('resource').notNull(),    // booking|invoice|payment|employee|supplier|...
  resourceId: text('resource_id'),
  before:     jsonb('before'),               // snapshot before change
  after:      jsonb('after'),                // snapshot after change
  metadata:   jsonb('metadata'),             // IP, user-agent, etc.
  createdAt:  timestamp('created_at').notNull().defaultNow(),
});

export type AuditEntry    = typeof auditLog.$inferSelect;
export type NewAuditEntry = typeof auditLog.$inferInsert;
