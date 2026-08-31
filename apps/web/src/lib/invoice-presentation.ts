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
      ar: `إشعار دائن ضريبي${simplifiedAr} (مرحلة أولى)`,
      en: `${simplifiedEn}Tax Credit Note (Phase 1)`,
    };
  }

  if (isDebit) {
    return {
      ar: `إشعار مدين ضريبي${simplifiedAr} (مرحلة أولى)`,
      en: `${simplifiedEn}Tax Debit Note (Phase 1)`,
    };
  }

  return isBuyerBusiness
    ? { ar: 'فاتورة ضريبية (مرحلة أولى)', en: 'Tax Invoice (Phase 1)' }
    : { ar: 'فاتورة ضريبية مبسطة (مرحلة أولى)', en: 'Simplified Tax Invoice (Phase 1)' };
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
