import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

export const customerMessages = pgTable('customer_messages', {
  id:             text('id').primaryKey(),
  agencyId:       text('agency_id').notNull(),
  bookingId:      text('booking_id'),
  recipientName:  text('recipient_name').notNull(),
  recipientPhone: text('recipient_phone'),
  channel:        text('channel').notNull(),     // 'whatsapp' | 'copy'
  templateKey:    text('template_key'),
  messageAr:      text('message_ar').notNull(),
  messageEn:      text('message_en'),
  sentAt:         timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  sentBy:         text('sent_by'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  agencyBookingIdx: index('idx_cm_agency_booking').on(t.agencyId, t.bookingId),
  agencyTimeIdx:    index('idx_cm_agency_time').on(t.agencyId, t.sentAt),
}));

export type CustomerMessage = typeof customerMessages.$inferSelect;
export type NewCustomerMessage = typeof customerMessages.$inferInsert;
