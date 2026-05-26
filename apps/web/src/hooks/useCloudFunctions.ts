'use client';

import { useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateInvoiceResponse {
  success: boolean;
  invoiceId: string;
  invoiceNumber: string;
  qrCodeData: string;
}

export interface ProcessPaymentResponse {
  success: boolean;
  paymentId: string;
  remainingDueHalalas: number;
  invoiceStatus: string;
}

export interface ProcessRefundResponse {
  success: boolean;
  creditNoteId: string;
  refundAmountHalalas: number;
}

export interface ProcessPaymentRequest {
  bookingId: string;
  invoiceId: string;
  agencyId: string;
  amountHalalas: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'online';
  reference?: string;
  notes?: string;
}

export interface ProcessRefundRequest {
  bookingId: string;
  invoiceId: string;
  agencyId: string;
  refundAmountHalalas: number;
  cancellationFeeHalalas: number;
  reason: string;
}

// ─── Auth token helper ────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string> {
  const { getAuth } = await import('firebase/auth');
  const { getApp } = await import('@masarat/firebase');
  const user = getAuth(getApp()).currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول أولاً');
  return user.getIdToken();
}

// ─── API call helpers ─────────────────────────────────────────────────────────

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json['error'] as string) ?? 'حدث خطأ غير متوقع');
  }
  return json as T;
}

function mapError(err: unknown): string {
  if (!(err instanceof Error)) return 'حدث خطأ غير متوقع';
  const msg = err.message;
  if (msg.includes('permission-denied') || msg.includes('Missing or insufficient')) {
    return 'ليس لديك صلاحية لهذا الإجراء';
  }
  if (msg.includes('not-found')) return 'العنصر المطلوب غير موجود';
  if (msg.includes('network') || msg.includes('unavailable') || msg.includes('fetch')) {
    return 'تعذّر الاتصال بالخادم، تحقق من الإنترنت';
  }
  return msg;
}

// ─── State type ───────────────────────────────────────────────────────────────

interface CallState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCreateInvoice() {
  const [state, setState] = useState<CallState<CreateInvoiceResponse>>({
    loading: false,
    error: null,
    data: null,
  });

  const createInvoice = useCallback(
    async (bookingId: string, _agencyId: string, _grandTotalHalalas?: number) => {
      setState({ loading: true, error: null, data: null });
      try {
        const result = await apiPost<CreateInvoiceResponse>('/api/invoices/create', {
          bookingId,
          idempotencyKey: crypto.randomUUID(),
        });
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
        const result = await apiPost<ProcessPaymentResponse>('/api/payments/record', {
          bookingId: req.bookingId,
          invoiceId: req.invoiceId,
          amountHalalas: req.amountHalalas,
          paymentMethod: req.paymentMethod,
          reference: req.reference,
          notes: req.notes,
          idempotencyKey: crypto.randomUUID(),
        });
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
        const result = await apiPost<ProcessRefundResponse>('/api/refunds/process', {
          bookingId: req.bookingId,
          originalInvoiceId: req.invoiceId,
          refundAmountHalalas: req.refundAmountHalalas,
          cancellationFeeHalalas: req.cancellationFeeHalalas,
          reason: req.reason,
          idempotencyKey: crypto.randomUUID(),
        });
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
