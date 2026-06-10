import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id:         text('id').primaryKey(),
  agencyId:   text('agency_id').notNull(),
  entityType: text('entity_type').notNull(),  // 'booking' | 'group_trip' | 'customer' | 'supplier'
  entityId:   text('entity_id').notNull(),
  fileName:   text('file_name').notNull(),
  fileUrl:    text('file_url').notNull(),
  fileSize:   integer('file_size'),
  mimeType:   text('mime_type'),
  uploadedBy: text('uploaded_by'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: index('idx_docs_entity').on(t.agencyId, t.entityType, t.entityId),
  agencyIdx: index('idx_docs_agency_time').on(t.agencyId, t.createdAt),
}));

export type Document    = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
