export interface InvoicePresentationInput {
  type: string;
  status: string;
  totalHalalas: number;
  paidHalalas: number;
  creditedHalalas?: number;
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

export interface InvoiceDocumentLabel {
  ar: string;
  en: string;
}

export function invoiceDocumentLabel(
  type: string,
  isVatRegistered: boolean,
  isBuyerBusiness: boolean,
): InvoiceDocumentLabel {
  const isCredit = type === '381' || type === 'credit_note';
  const isDebit = type === '383' || type === 'debit_note';

  if (!isVatRegistered) {
    if (isCredit) return { ar: 'إشعار دائن تجاري', en: 'Commercial Credit Note' };
    if (isDebit) return { ar: 'إشعار مدين تجاري', en: 'Commercial Debit Note' };
    return { ar: 'فاتورة تجارية', en: 'Commercial Invoice' };
  }

  const simplifiedAr = isBuyerBusiness ? '' : ' مبسط';
  const simplifiedEn = isBuyerBusiness ? '' : 'Simplified ';

  if (isCredit) {
    return {
      ar: `إشعار دائن ضريبي${simplifiedAr}`,
      en: `${simplifiedEn}Tax Credit Note`,
    };
  }

  if (isDebit) {
    return {
      ar: `إشعار مدين ضريبي${simplifiedAr}`,
      en: `${simplifiedEn}Tax Debit Note`,
    };
  }

  return isBuyerBusiness
    ? { ar: 'فاتورة ضريبية', en: 'Tax Invoice' }
    : { ar: 'فاتورة ضريبية مبسطة', en: 'Simplified Tax Invoice' };
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

export function collectibleBalance(
  invoice: Pick<InvoicePresentationInput, 'totalHalalas' | 'paidHalalas' | 'creditedHalalas'>,
): number {
  return Math.max(0, invoice.totalHalalas - invoice.paidHalalas - (invoice.creditedHalalas ?? 0));
}

export type SettlementStatus = 'unpaid' | 'partial' | 'fully_paid' | 'settled' | 'refunded';

export function invoiceSettlementStatus(
  invoice: Pick<InvoicePresentationInput, 'status' | 'totalHalalas' | 'paidHalalas' | 'creditedHalalas'>,
  forceRefunded = false,
): SettlementStatus {
  if (forceRefunded || invoice.status === 'refunded' || invoice.status === 'cancelled') return 'refunded';

  const credited = invoice.creditedHalalas ?? 0;
  const settled = invoice.paidHalalas + credited;
  if (settled <= 0 || invoice.totalHalalas <= 0) return 'unpaid';
  if (collectibleBalance(invoice) > 0) return 'partial';
  return credited > 0 ? 'settled' : 'fully_paid';
}

export function invoiceOutstanding(invoice: InvoicePresentationInput): number {
  if (isCreditNote(invoice) || NON_RECEIVABLE_STATUSES.has(invoice.status)) return 0;
  if (!['issued', 'partial', 'overdue'].includes(invoice.status)) return 0;
  return collectibleBalance(invoice);
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
