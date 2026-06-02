import { db } from './db';
import type { Tx } from './db';
import { agencyCounters } from './schema';
import { sql } from 'drizzle-orm';

export type InvoiceType = 'taxInvoice' | 'commercialInvoice' | 'creditNote' | 'debitNote';

const PREFIX: Record<string, string> = {
  taxInvoice:        'INV',
  commercialInvoice: 'CINV',
  creditNote:        'CN',
  debitNote:         'DN',
  receipt:        'RCT',
  paymentVoucher: 'PV',
  booking:        'BK',
  journal:        'JE',
};

async function nextCounter(
  agencyId: string,
  counterType: string,
  year: number,
  tx?: Tx,
): Promise<number> {
  const executor = tx ?? db;
  const yearlyType = `${counterType}-${year}`;
  const result = await executor
    .insert(agencyCounters)
    .values({ agencyId, counterType: yearlyType, currentValue: 1 })
    .onConflictDoUpdate({
      target: [agencyCounters.agencyId, agencyCounters.counterType],
      set: { currentValue: sql`${agencyCounters.currentValue} + 1` },
    })
    .returning({ currentValue: agencyCounters.currentValue });
  return result[0]!.currentValue;
}

export async function getNextInvoiceNumber(
  agencyId: string,
  invoiceType: InvoiceType,
  year: number,
  tx?: Tx,
): Promise<string> {
  const n = await nextCounter(agencyId, invoiceType, year, tx);
  return `${PREFIX[invoiceType]}-${year}-${String(n).padStart(6, '0')}`;
}

export async function getNextReceiptNumber(
  agencyId: string,
  year: number,
  tx?: Tx,
): Promise<string> {
  const n = await nextCounter(agencyId, 'receipt', year, tx);
  return `RCT-${year}-${String(n).padStart(6, '0')}`;
}

export async function getNextPaymentVoucherNumber(
  agencyId: string,
  year: number,
  tx?: Tx,
): Promise<string> {
  const n = await nextCounter(agencyId, 'paymentVoucher', year, tx);
  return `PV-${year}-${String(n).padStart(6, '0')}`;
}

export async function getNextJournalNumber(
  agencyId: string,
  year: number,
  tx?: Tx,
): Promise<string> {
  const n = await nextCounter(agencyId, 'journal', year, tx);
  return `JE-${year}-${String(n).padStart(6, '0')}`;
}

export async function getNextBookingNumber(
  agencyId: string,
  year: number,
  tx?: Tx,
): Promise<string> {
  const n = await nextCounter(agencyId, 'booking', year, tx);
  const yy = String(year).slice(-2);
  return `BK-${yy}-${String(n).padStart(6, '0')}`;
}
