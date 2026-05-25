'use client';

import { useState, useCallback } from 'react';
import {
  postJournalEntry,
  buildInvoiceLines,
  buildPaymentReceivedLines,
  buildRefundLines,
} from '@/lib/postJournalEntry';

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

const BOOKING_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  flight:    { ar: 'حجز طيران',         en: 'Flight Booking' },
  hotel:     { ar: 'حجز فندق',          en: 'Hotel Booking' },
  package:   { ar: 'باقة سياحية',       en: 'Tour Package' },
  umrah:     { ar: 'برنامج عمرة وحج',   en: 'Umrah & Hajj Program' },
  hajj:      { ar: 'برنامج حج',         en: 'Hajj Program' },
  visa:      { ar: 'خدمة تأشيرة',       en: 'Visa Service' },
  insurance: { ar: 'تأمين سفر',         en: 'Travel Insurance' },
  transport: { ar: 'خدمة نقل',          en: 'Transport Service' },
};

async function createInvoiceFirestore(req: CreateInvoiceRequest): Promise<CreateInvoiceResponse> {
  const { getFirestore, collection, addDoc, doc, getDoc, updateDoc, arrayUnion, Timestamp } =
    await import('firebase/firestore');
  const { getApp } = await import('@masarat/firebase');
  const db = getFirestore(getApp());

  // ── 1. قراءة بيانات الحجز ───────────────────────────────────────────────
  let grandTotal = req.grandTotalHalalas ?? 0;
  let customerName: { ar: string; en: string } = { ar: '', en: '' };
  let customerPhone = '';
  let customerId = '';
  let bookingTypeLabel = { ar: 'خدمة سفر', en: 'Travel Service' };
  let revenueModel = 'principal';
  let storedVatAmount = 0;
  let storedServiceFee = 0;
  let storedTotalCost = 0;

  try {
    const bookingSnap = await getDoc(doc(db, 'bookings', req.bookingId));
    if (bookingSnap.exists()) {
      const b = bookingSnap.data() as Record<string, unknown>;
      const pricing = b.pricing as Record<string, number & { revenueModel?: string }> | undefined;
      if (pricing) {
        grandTotal = pricing.totalAmount ?? pricing.grandTotal ?? grandTotal;
        revenueModel = (pricing as unknown as Record<string, string>).revenueModel ?? 'principal';
        storedVatAmount  = pricing.vatAmount  ?? 0;
        storedServiceFee = pricing.serviceFee ?? 0;
        storedTotalCost  = pricing.totalCost  ?? 0;
      }
      const cn = b.customerName as { ar?: string; en?: string } | undefined;
      if (cn) customerName = { ar: cn.ar ?? '', en: cn.en ?? '' };
      customerPhone = (b.customerPhone as string) ?? '';
      customerId = (b.customerId as string) ?? '';
      const bType = (b.type as string) ?? '';
      bookingTypeLabel = BOOKING_TYPE_LABELS[bType] ?? bookingTypeLabel;
    }
  } catch { /* use provided fallback values */ }

  // ── 2. قراءة بيانات الوكالة (البائع) ────────────────────────────────────
  let seller: Record<string, unknown> = {};
  try {
    const agencySnap = await getDoc(doc(db, 'agencies', req.agencyId));
    if (agencySnap.exists()) {
      const a = agencySnap.data() as Record<string, unknown>;
      seller = {
        isVatRegistered: (a.isVatRegistered as boolean) === true,
        name: { ar: (a.nameAr as string) ?? '', en: (a.nameEn as string) ?? '' },
        vatNumber: (a.vatNumber as string) ?? '',
        crNumber: (a.crNumber as string) ?? '',
        address: {
          streetName: (a.streetName as string) ?? '',
          buildingNumber: (a.buildingNumber as string) ?? '',
          district: (a.district as string) ?? '',
          city: (a.city as string) ?? '',
          postalCode: (a.postalCode as string) ?? '',
        },
        phone: (a.contactPhone as string) ?? '',
        email: (a.contactEmail as string) ?? '',
      };
    }
  } catch { /* seller remains empty — invoice still valid */ }

  // ── 3. حساب الأرقام بناءً على تسجيل الضريبة ─────────────────────────────
  const isVatRegistered = (seller as Record<string, unknown>).isVatRegistered === true;

  let subtotalExclVat: number;
  let totalVat: number;
  let finalGrandTotal: number;

  if (!isVatRegistered) {
    // وكالة غير مسجّلة ضريبياً — إيصال خدمة بدون ضريبة
    subtotalExclVat = storedTotalCost + storedServiceFee || Math.round(grandTotal / 1.15);
    totalVat = 0;
    finalGrandTotal = subtotalExclVat;
  } else if (revenueModel === 'agent') {
    // نموذج وكيل: الضريبة على رسوم الوكالة فقط
    subtotalExclVat = storedTotalCost + storedServiceFee;
    totalVat = storedVatAmount;
    finalGrandTotal = grandTotal;
  } else {
    // نموذج أصيل: الضريبة على كامل سعر البيع
    subtotalExclVat = Math.round(grandTotal / 1.15);
    totalVat = grandTotal - subtotalExclVat;
    finalGrandTotal = grandTotal;
  }

  // ── 4. بنود الفاتورة ──────────────────────────────────────────────────────
  const lines = [
    {
      id: '1',
      nameAr: bookingTypeLabel.ar,
      nameEn: bookingTypeLabel.en,
      quantity: 1,
      unitCode: 'PCE',
      unitPriceExclVatHalalas: subtotalExclVat,
      totalExclVatHalalas: subtotalExclVat,
      vatRate: totalVat > 0 ? 0.15 : 0,
      vatAmountHalalas: totalVat,
      totalInclVatHalalas: finalGrandTotal,
    },
  ];

  // ── 5. رقم الوثيقة ────────────────────────────────────────────────────────
  const year = new Date().getFullYear();
  const seq = String(Date.now()).slice(-6);
  const invoiceNumber = `INV-${year}-${seq}`;
  const docType = isVatRegistered ? 'tax_invoice' : 'commercial_invoice';

  // ── 6. حفظ الوثيقة ───────────────────────────────────────────────────────
  const invoiceRef = await addDoc(collection(db, 'invoices'), {
    agencyId: req.agencyId,
    bookingId: req.bookingId,
    type: docType,
    isVatRegistered,
    invoiceNumber,
    status: 'issued',
    paymentStatus: 'unpaid',
    amountPaid: 0,
    amountDue: finalGrandTotal,
    seller,
    buyer: { id: customerId, name: customerName, phone: customerPhone },
    lines,
    totals: { subtotalExclVat, totalVat, grandTotal: finalGrandTotal, currency: 'SAR' },
    zatca: {
      invoiceUUID: crypto.randomUUID(),
      invoiceTypeCode: '388',
      submissionStatus: isVatRegistered ? 'not_submitted' : 'not_applicable',
    },
    issueDate: Timestamp.now(),
    createdAt: Timestamp.now(),
    createdBy: req.agencyId,
  });

  // ── 7. ربط الفاتورة بالحجز ───────────────────────────────────────────────
  try {
    await updateDoc(doc(db, 'bookings', req.bookingId), {
      invoiceIds: arrayUnion(invoiceRef.id),
    });
  } catch { /* invoice still valid if booking update fails */ }

  // ── 8. قيد محاسبي تلقائي ─────────────────────────────────────────────────
  try {
    await postJournalEntry({
      agencyId:     req.agencyId,
      description:  `فاتورة رقم ${invoiceNumber} - ${bookingTypeLabel.ar}`,
      referenceId:  invoiceRef.id,
      referenceType: 'invoice',
      lines: buildInvoiceLines({
        revenueModel,
        isVatRegistered,
        grandTotal:      finalGrandTotal,
        totalCost:       storedTotalCost,
        serviceFee:      storedServiceFee,
        vatAmount:       totalVat,
        subtotalExclVat,
      }),
    });
  } catch (err) {
    console.warn('[Accounting] Invoice JE failed:', err);
  }

  return { success: true, invoiceId: invoiceRef.id, invoiceNumber, qrCodeData: '' };
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

  // ── قيد محاسبي: استلام دفعة من العميل ───────────────────────────────────
  try {
    const methodLabel: Record<string, string> = {
      cash: 'نقداً', bank_transfer: 'تحويل بنكي', card: 'بطاقة', online: 'إلكتروني',
    };
    await postJournalEntry({
      agencyId:      req.agencyId,
      description:   `استلام دفعة - ${methodLabel[req.paymentMethod] ?? req.paymentMethod}`,
      referenceId:   paymentRef.id,
      referenceType: 'payment',
      lines:         buildPaymentReceivedLines(req.amountHalalas, req.paymentMethod),
    });
  } catch (err) {
    console.warn('[Accounting] Payment JE failed:', err);
  }

  return {
    success: true,
    paymentId: paymentRef.id,
    remainingDueHalalas: remainingDue,
    invoiceStatus: paymentStatus,
  };
}

async function processRefundFirestore(req: ProcessRefundRequest): Promise<ProcessRefundResponse> {
  const { getFirestore, collection, addDoc, doc, getDoc, updateDoc, Timestamp } =
    await import('firebase/firestore');
  const { getApp } = await import('@masarat/firebase');
  const db = getFirestore(getApp());

  // قراءة الفاتورة الأصلية لمعرفة حالة تسجيل الضريبة ونموذج الإيراد
  let origIsVatRegistered = false;
  let origRevenueModel    = 'agent';
  try {
    const invSnap = await getDoc(doc(db, 'invoices', req.invoiceId));
    if (invSnap.exists()) {
      const inv = invSnap.data() as Record<string, unknown>;
      origIsVatRegistered = (inv.isVatRegistered as boolean) ?? false;
    }
    const bkSnap = await getDoc(doc(db, 'bookings', req.bookingId));
    if (bkSnap.exists()) {
      const bk = bkSnap.data() as Record<string, unknown>;
      origRevenueModel = ((bk.pricing as Record<string, string>)?.revenueModel) ?? 'agent';
    }
  } catch { /* use defaults */ }

  // Create credit note invoice
  const year = new Date().getFullYear();
  const seq = String(Date.now()).slice(-6);
  const creditNoteNumber = `CN-${year}-${seq}`;

  const refundSubtotal = origIsVatRegistered
    ? Math.round(req.refundAmountHalalas / 1.15)
    : req.refundAmountHalalas;
  const refundVat = origIsVatRegistered
    ? req.refundAmountHalalas - refundSubtotal
    : 0;

  const creditNoteRef = await addDoc(collection(db, 'invoices'), {
    agencyId: req.agencyId,
    bookingId: req.bookingId,
    originalInvoiceId: req.invoiceId,
    type: 'credit_note',
    isVatRegistered: origIsVatRegistered,
    invoiceNumber: creditNoteNumber,
    status: 'issued',
    paymentStatus: 'refunded',
    amountPaid: req.refundAmountHalalas,
    amountDue: 0,
    totals: {
      subtotalExclVat: refundSubtotal,
      totalVat: refundVat,
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

  // ── قيد محاسبي: استرداد مبلغ للعميل ─────────────────────────────────────
  try {
    await postJournalEntry({
      agencyId:      req.agencyId,
      description:   `مذكرة دائنة ${creditNoteNumber} - استرداد`,
      referenceId:   creditNoteRef.id,
      referenceType: 'refund',
      lines:         buildRefundLines(req.refundAmountHalalas, origIsVatRegistered, origRevenueModel),
    });
  } catch (err) {
    console.warn('[Accounting] Refund JE failed:', err);
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
