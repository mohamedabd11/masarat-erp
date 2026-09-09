import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { invoices } from './schema/invoices';

/** Credit-note amounts are stored positive but reduce invoice-based reports. */
export function signedInvoiceAmount(amount: AnyPgColumn) {
  return sql<number>`CASE WHEN ${invoices.type} = '381' THEN -${amount} ELSE ${amount} END`;
}
