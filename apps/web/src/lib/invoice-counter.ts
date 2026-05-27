import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export type InvoiceType = 'taxInvoice' | 'creditNote' | 'debitNote';

const PREFIX: Record<InvoiceType, string> = {
  taxInvoice: 'INV',
  creditNote: 'CN',
  debitNote: 'DN',
};

export async function getNextInvoiceNumber(
  agencyId: string,
  invoiceType: InvoiceType,
  year: number,
  transaction: FirebaseFirestore.Transaction,
): Promise<string> {
  const db = getFirestore();
  const counterRef = db
    .collection('agencies')
    .doc(agencyId)
    .collection('config')
    .doc('invoice_counters');

  const counterDoc = await transaction.get(counterRef);
  let currentCounter = 0;

  if (!counterDoc.exists) {
    transaction.set(counterRef, {
      taxInvoice: 0,
      creditNote: 0,
      debitNote: 0,
      receipt: 0,
      createdAt: new Date(),
    });
  } else {
    currentCounter = (counterDoc.data()?.[invoiceType] as number) ?? 0;
  }

  const nextNumber = currentCounter + 1;
  transaction.update(counterRef, {
    [invoiceType]: FieldValue.increment(1),
    lastUpdatedAt: new Date(),
  });

  return `${PREFIX[invoiceType]}-${year}-${String(nextNumber).padStart(6, '0')}`;
}

export async function getNextReceiptNumber(
  agencyId: string,
  year: number,
  transaction: FirebaseFirestore.Transaction,
): Promise<string> {
  const db = getFirestore();
  const counterRef = db
    .collection('agencies')
    .doc(agencyId)
    .collection('config')
    .doc('invoice_counters');

  const doc = await transaction.get(counterRef);
  const current = (doc.data()?.['receipt'] as number) ?? 0;
  const next = current + 1;

  transaction.update(counterRef, { receipt: FieldValue.increment(1) });
  return `RCT-${year}-${String(next).padStart(6, '0')}`;
}

export async function getNextPaymentVoucherNumber(
  agencyId: string,
  year: number,
  transaction: FirebaseFirestore.Transaction,
): Promise<string> {
  const db = getFirestore();
  const counterRef = db
    .collection('agencies')
    .doc(agencyId)
    .collection('config')
    .doc('invoice_counters');

  const doc = await transaction.get(counterRef);
  const current = (doc.data()?.['paymentVoucher'] as number) ?? 0;
  const next = current + 1;

  transaction.update(counterRef, { paymentVoucher: FieldValue.increment(1) });
  return `PV-${year}-${String(next).padStart(6, '0')}`;
}

export async function getNextBookingNumber(
  agencyId: string,
  year: number,
): Promise<string> {
  const db = getFirestore();
  const counterRef = db
    .collection('agencies')
    .doc(agencyId)
    .collection('config')
    .doc('invoice_counters');

  const newDoc = await db.runTransaction(async tx => {
    const snap = await tx.get(counterRef);
    const current = (snap.data()?.['booking'] as number) ?? 0;
    const next = current + 1;
    tx.update(counterRef, { booking: FieldValue.increment(1) });
    return next;
  });

  return `BK-${year}-${String(newDoc).padStart(6, '0')}`;
}
