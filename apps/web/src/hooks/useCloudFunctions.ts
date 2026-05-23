'use client';

import { useState, useCallback } from 'react';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { getApp } from 'firebase/app';

// ─── Types matching Cloud Function signatures ─────────────────────────────────

export interface CreateInvoiceRequest {
  bookingId: string;
  agencyId: string;
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

// ─── Helper: get functions instance (region me-central1) ──────────────────────

function getFunctionsInstance() {
  const app = getApp();
  return getFunctions(app, 'me-central1');
}

// ─── Hook factory ─────────────────────────────────────────────────────────────

interface CallableState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

function useCallable<TReq, TRes>(functionName: string) {
  const [state, setState] = useState<CallableState<TRes>>({
    loading: false,
    error: null,
    data: null,
  });

  const call = useCallback(async (request: TReq): Promise<TRes> => {
    setState({ loading: true, error: null, data: null });
    try {
      const fn = httpsCallable<TReq, TRes>(getFunctionsInstance(), functionName);
      const result: HttpsCallableResult<TRes> = await fn(request);
      setState({ loading: false, error: null, data: result.data });
      return result.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const code = (err as { code?: string }).code;

      // Map Firebase Functions error codes to user-friendly Arabic/English messages
      const errorMessage = mapFunctionError(code ?? '', message);
      setState({ loading: false, error: errorMessage, data: null });
      throw new Error(errorMessage);
    }
  }, [functionName]);

  const reset = useCallback(() => {
    setState({ loading: false, error: null, data: null });
  }, []);

  return { ...state, call, reset };
}

// ─── Error mapping ────────────────────────────────────────────────────────────

function mapFunctionError(code: string, fallback: string): string {
  const errors: Record<string, string> = {
    'functions/unauthenticated':    'يجب تسجيل الدخول أولاً',
    'functions/permission-denied':  'ليس لديك صلاحية لهذا الإجراء',
    'functions/not-found':          'العنصر المطلوب غير موجود',
    'functions/already-exists':     'هذا الإجراء تم تنفيذه مسبقاً',
    'functions/invalid-argument':   'البيانات المُرسَلة غير صحيحة',
    'functions/resource-exhausted': 'تم تجاوز الحد المسموح، حاول لاحقاً',
    'functions/internal':           'خطأ داخلي في الخادم، حاول مرة أخرى',
    'functions/unavailable':        'الخدمة غير متاحة حالياً، حاول لاحقاً',
    'functions/deadline-exceeded':  'انتهت مهلة الطلب، حاول مرة أخرى',
  };
  return errors[code] ?? fallback;
}

// ─── Public hooks ─────────────────────────────────────────────────────────────

/** إنشاء فاتورة لحجز مؤكد — يجب أن يكون الحجز بحالة confirmed */
export function useCreateInvoice() {
  const { call, loading, error, data, reset } = useCallable<CreateInvoiceRequest, CreateInvoiceResponse>('createInvoice');

  const createInvoice = useCallback(async (bookingId: string, agencyId: string) => {
    const idempotencyKey = crypto.randomUUID();
    return call({ bookingId, agencyId, idempotencyKey });
  }, [call]);

  return { createInvoice, loading, error, data, reset };
}

/** تسجيل دفعة على فاتورة */
export function useProcessPayment() {
  const { call, loading, error, data, reset } = useCallable<ProcessPaymentRequest, ProcessPaymentResponse>('processPayment');

  const processPayment = useCallback(async (request: Omit<ProcessPaymentRequest, 'idempotencyKey'>) => {
    const idempotencyKey = crypto.randomUUID();
    return call({ ...request, idempotencyKey });
  }, [call]);

  return { processPayment, loading, error, data, reset };
}

/** إصدار استرداد / إشعار دائن */
export function useProcessRefund() {
  const { call, loading, error, data, reset } = useCallable<ProcessRefundRequest, ProcessRefundResponse>('processRefund');

  const processRefund = useCallback(async (request: Omit<ProcessRefundRequest, 'idempotencyKey'>) => {
    const idempotencyKey = crypto.randomUUID();
    return call({ ...request, idempotencyKey });
  }, [call]);

  return { processRefund, loading, error, data, reset };
}
