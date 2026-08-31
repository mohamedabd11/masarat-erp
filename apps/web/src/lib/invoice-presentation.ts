export interface InvoicePresentationInput {
  type: string;
  status: string;
  totalHalalas: number;
  paidHalalas: number;
}

export function vatCategoryLabel(category: string | null | undefined, isAr: boolean): string {
  switch (category) {
    case 'O': return isAr ? 'خارج النطاق' : 'Outside scope';
    case 'Z': return isAr ? 'صفرية' : 'Zero-rated';
    case 'E': return isAr ? 'معفى' : 'Exempt';
    case 'S': return isAr ? 'خاضع' : 'Standard-rated';
    default:  return isAr ? 'معفى' : 'Exempt';
  }
}

const NON_RECEIVABLE_STATUSES = new Set([
  'cancelled',
  'refunded',
  'credit_noted',
]);

export function isCreditNote(invoice: Pick<InvoicePresentationInput, 'type'>): boolean {
  return invoice.type === '381' || invoice.type === 'credit_note';
}

export function signedInvoiceTotal(invoice: Pick<InvoicePresentationInput, 'type' | 'status' | 'totalHalalas'>): number {
  if (invoice.status === 'cancelled') return 0;
  return isCreditNote(invoice) ? -invoice.totalHalalas : invoice.totalHalalas;
}

export function invoiceOutstanding(invoice: InvoicePresentationInput): number {
  if (isCreditNote(invoice) || NON_RECEIVABLE_STATUSES.has(invoice.status)) return 0;
  if (!['issued', 'partial', 'overdue'].includes(invoice.status)) return 0;
  return Math.max(0, invoice.totalHalalas - invoice.paidHalalas);
}

export function isReceivableInvoice(invoice: InvoicePresentationInput): boolean {
  return invoiceOutstanding(invoice) > 0;
}

export function summarizeInvoiceDocuments(invoices: InvoicePresentationInput[]) {
  return {
    totalInvoiced: invoices.reduce((sum, invoice) => sum + signedInvoiceTotal(invoice), 0),
    totalOutstanding: invoices.reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0),
  };
}
