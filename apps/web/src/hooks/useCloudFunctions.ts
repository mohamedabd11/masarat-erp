'use client';

import { useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateInvoiceRequest {
  bookingId: string;
  agencyId: string;
  grandTotalHalalas?: number;
  idempotencyKey?: string;
}

export interface CreateInvoiceResponse {
  success: boolean;
  invoiceId: string;
  invoiceNumber: string;
  qrCodeData: string;
}

export interface ProcessPaymentRequest {
  bookingId: string;
  invoiceId: string;
  agencyId: string;
  amountHalalas: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'online';
  reference?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface ProcessPaymentResponse {
  success: boolean;
  paymentId: string;
  remainingDueHalalas: number;
  invoiceStatus: string;
}

export interface ProcessRefundRequest {
  bookingId: string;
  invoiceId: string;
  agencyId: string;
  refundAmountHalalas: number;
  cancellationFeeHalalas: number;
  reason: string;
  idempotencyKey?: string;
}

export interface ProcessRefundResponse {
  success: boolean;
  creditNoteId: string;
  refundAmountHalalas: number;
}

// ─── Direct Firestore implementations ────────────────────────────────────────

async function createInvoiceFirestore(req: CreateInvoiceRequest): Promise<CreateInvoiceResponse> {
  const { getFirestore, collection, addDoc, doc, getDoc, updateDoc, arrayUnion, Timestamp } =
    await import('firebase/firestore');
  const { getApp } = await import('@masarat/firebase');
  const db = getFirestore(getApp());

  // Fetch booking to get pricing and customer info
  let grandTotal = req.grandTotalHalalas ?? 0;
  let customerName = { ar: '', en: '' };
  let customerPhone = '';
  let customerId = '';

  try {
    const bookingSnap = await getDoc(doc(db, 'bookings', req.bookingId));
    if (bookingSnap.exists()) {
      const b = bookingSnap.data() as Record<string, unknown>;
      const pricing = b.pricing as Record<string, number> | undefined;
      if (pricing) grandTotal = pricing.totalAmount ?? pricing.grandTotal ?? grandTotal;
      const cn = b.customerName as { ar?: string; en?: string } | undefined;
      if (cn) customerName = { ar: cn.ar ?? '', en: cn.en ?? '' };
      customerPhone = (b.customerPhone as string) ?? '';
      customerId = (b.customerId as string) ?? '';
    }
  } catch {
    // Booking fetch failed — use provided fallback
  }

  // Generate invoice number based on timestamp
  const year = new Date().getFullYear();
  const seq = String(Date.now()).slice(-6);
  const invoiceNumber = `INV-${year}-${seq}`;

  const invoiceRef = await addDoc(collection(db, 'invoices'), {
    agencyId: req.agencyId,
    bookingId: req.bookingId,
    type: 'tax_invoice',
    invoiceNumber,
    status: 'issued',
    paymentStatus: 'unpaid',
    amountPaid: 0,
    amountDue: grandTotal,
    buyer: {
      id: customerId,
      name: customerName,
      phone: customerPhone,
    },
    totals: {
      subtotalExclVat: Math.round(grandTotal / 1.15),
      totalVat: grandTotal - Math.round(grandTotal / 1.15),
      grandTotal,
      currency: 'SAR',
    },
    zatca: {
      invoiceUUID: crypto.randomUUID(),
      invoiceTypeCode: '388',
      submissionStatus: 'not_submitted',
    },
    issueDate: Timestamp.now(),
    createdAt: Timestamp.now(),
    createdBy: req.agencyId,
  });

  // Update booking with this invoiceId
  try {
    await updateDoc(doc(db, 'bookings', req.bookingId), {
      invoiceIds: arrayUnion(invoiceRef.id),
    });
  } catch {
    // Invoice still created even if booking update fails
  }

  return {
    success: true,
    invoiceId: invoiceRef.id,
    invoiceNumber,
    qrCodeData: '',
  };
}

async function processPaymentFirestore(req: ProcessPaymentRequest): Promise<ProcessPaymentResponse> {
  const { getFirestore, collection, addDoc, doc, getDoc, updateDoc, Timestamp } =
    await import('firebase/firestore');
  const { getApp } = await import('@masarat/firebase');
  const db = getFirestore(getApp());

  // Get current invoice state
  const invoiceSnap = await getDoc(doc(db, 'invoices', req.invoiceId));
  const invoice = invoiceSnap.exists() ? (invoiceSnap.data() as Record<string, unknown>) : null;

  const currentPaid = (invoice?.amountPaid as number) ?? 0;
  const grandTotal = invoice?.totals
    ? ((invoice.totals as Record<string, number>).grandTotal ?? 0)
    : 0;

  const newAmountPaid = currentPaid + req.amountHalalas;
  const remainingDue = Math.max(0, grandTotal - newAmountPaid);
  const paymentStatus = remainingDue <= 0 ? 'fully_paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';

  // Create payment record
  const paymentRef = await addDoc(collection(db, 'payments'), {
    agencyId: req.agencyId,
    bookingId: req.bookingId,
    invoiceId: req.invoiceId,
    amountHalalas: req.amountHalalas,
    paymentMethod: req.paymentMethod,
    reference: req.reference ?? '',
    notes: req.notes ?? '',
    status: 'completed',
    createdAt: Timestamp.now(),
  });

  // Update invoice paid/due amounts
  await updateDoc(doc(db, 'invoices', req.invoiceId), {
    amountPaid: newAmountPaid,
    amountDue: remainingDue,
    paymentStatus,
  });

  // Update booking payment state
  try {
    await updateDoc(doc(db, 'bookings', req.bookingId), {
      totalPaid: newAmountPaid,
      totalDue: remainingDue,
      paymentStatus,
    });
  } catch {
    // Invoice updated successfully even if booking update fails
  }

  return {
    success: true,
    paymentId: paymentRef.id,
    remainingDueHalalas: remainingDue,
    invoiceStatus: paymentStatus,
  };
}

async function processRefundFirestore(req: ProcessRefundRequest): Promise<ProcessRefundResponse> {
  const { getFirestore, collection, addDoc, doc, updateDoc, Timestamp } =
    await import('firebase/firestore');
  const { getApp } = await import('@masarat/firebase');
  const db = getFirestore(getApp());

  // Create credit note invoice
  const year = new Date().getFullYear();
  const seq = String(Date.now()).slice(-6);
  const creditNoteNumber = `CN-${year}-${seq}`;

  const creditNoteRef = await addDoc(collection(db, 'invoices'), {
    agencyId: req.agencyId,
    bookingId: req.bookingId,
    originalInvoiceId: req.invoiceId,
    type: 'credit_note',
    invoiceNumber: creditNoteNumber,
    status: 'issued',
    paymentStatus: 'refunded',
    amountPaid: req.refundAmountHalalas,
    amountDue: 0,
    totals: {
      subtotalExclVat: Math.round(req.refundAmountHalalas / 1.15),
      totalVat: req.refundAmountHalalas - Math.round(req.refundAmountHalalas / 1.15),
      grandTotal: req.refundAmountHalalas,
      currency: 'SAR',
    },
    zatca: {
      invoiceUUID: crypto.randomUUID(),
      invoiceTypeCode: '381',
      submissionStatus: 'not_submitted',
    },
    cancellationReason: req.reason,
    cancellationFeeHalalas: req.cancellationFeeHalalas,
    issueDate: Timestamp.now(),
    createdAt: Timestamp.now(),
    createdBy: req.agencyId,
  });

  // Mark original invoice as credited
  await updateDoc(doc(db, 'invoices', req.invoiceId), {
    status: 'credited',
    paymentStatus: 'refunded',
  });

  // Cancel the booking
  try {
    await updateDoc(doc(db, 'bookings', req.bookingId), {
      status: 'cancelled',
      paymentStatus: 'refunded',
    });
  } catch {
    // Booking update failed — credit note still created
  }

  return {
    success: true,
    creditNoteId: creditNoteRef.id,
    refundAmountHalalas: req.refundAmountHalalas,
  };
}

// ─── Error mapping ────────────────────────────────────────────────────────────

function mapError(err: unknown): string {
  if (!(err instanceof Error)) return 'حدث خطأ غير متوقع';
  const msg = err.message;
  if (msg.includes('permission-denied') || msg.includes('Missing or insufficient')) {
    return 'ليس لديك صلاحية لهذا الإجراء';
  }
  if (msg.includes('not-found')) return 'العنصر المطلوب غير موجود';
  if (msg.includes('network') || msg.includes('unavailable')) {
    return 'تعذّر الاتصال بالخادم، تحقق من الإنترنت';
  }
  return msg;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

interface CallState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

export function useCreateInvoice() {
  const [state, setState] = useState<CallState<CreateInvoiceResponse>>({
    loading: false,
    error: null,
    data: null,
  });

  const createInvoice = useCallback(
    async (bookingId: string, agencyId: string, grandTotalHalalas?: number) => {
      setState({ loading: true, error: null, data: null });
      try {
        const result = await createInvoiceFirestore({ bookingId, agencyId, grandTotalHalalas });
        setState({ loading: false, error: null, data: result });
        return result;
      } catch (err) {
        const message = mapError(err);
        setState({ loading: false, error: message, data: null });
        throw new Error(message);
      }
    },
    [],
  );

  const reset = useCallback(
    () => setState({ loading: false, error: null, data: null }),
    [],
  );

  return { ...state, createInvoice, reset };
}

export function useProcessPayment() {
  const [state, setState] = useState<CallState<ProcessPaymentResponse>>({
    loading: false,
    error: null,
    data: null,
  });

  const processPayment = useCallback(
    async (req: Omit<ProcessPaymentRequest, 'idempotencyKey'>) => {
      setState({ loading: true, error: null, data: null });
      try {
        const result = await processPaymentFirestore(req);
        setState({ loading: false, error: null, data: result });
        return result;
      } catch (err) {
        const message = mapError(err);
        setState({ loading: false, error: message, data: null });
        throw new Error(message);
      }
    },
    [],
  );

  const reset = useCallback(
    () => setState({ loading: false, error: null, data: null }),
    [],
  );

  return { ...state, processPayment, reset };
}

export function useProcessRefund() {
  const [state, setState] = useState<CallState<ProcessRefundResponse>>({
    loading: false,
    error: null,
    data: null,
  });

  const processRefund = useCallback(
    async (req: Omit<ProcessRefundRequest, 'idempotencyKey'>) => {
      setState({ loading: true, error: null, data: null });
      try {
        const result = await processRefundFirestore(req);
        setState({ loading: false, error: null, data: result });
        return result;
      } catch (err) {
        const message = mapError(err);
        setState({ loading: false, error: message, data: null });
        throw new Error(message);
      }
    },
    [],
  );

  const reset = useCallback(
    () => setState({ loading: false, error: null, data: null }),
    [],
  );

  return { ...state, processRefund, reset };
}
