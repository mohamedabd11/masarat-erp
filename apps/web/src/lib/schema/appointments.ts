import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { customers } from './customers';
import { employees } from './hr';

export const appointments = pgTable('appointments', {
  id:           text('id').primaryKey(),
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  customerId:   text('customer_id').references(() => customers.id),
  customerName: text('customer_name'),
  assignedTo:   text('assigned_to').references(() => employees.id),
  title:        text('title').notNull(),
  description:  text('description'),
  type:         text('type').notNull().default('meeting'),      // meeting|call|followup|booking|other
  status:       text('status').notNull().default('scheduled'), // scheduled|completed|cancelled|noshow
  scheduledAt:  timestamp('scheduled_at').notNull(),
  durationMin:  text('duration_min').notNull().default('30'),
  location:     text('location'),
  notes:        text('notes'),
  outcome:      text('outcome'),                                // filled after completion
  createdBy:    text('created_by'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});

export type Appointment    = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
