'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import { X, CheckCircle2, AlertCircle, Printer, Banknote } from 'lucide-react';

const schema = z.object({
  payeeName:       z.string().min(1, 'مطلوب'),
  expenseCategory: z.enum(['supplier', 'operational', 'salaries', 'office', 'other']),
  amountSAR:       z.coerce.number().min(0.01),
  paymentMethod:   z.enum(['cash', 'bank_transfer', 'card', 'online', 'check']),
  reference:       z.string().optional(),
  notes:           z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface SupplierPaymentModalProps {
  bookingId?: string;
  agencyId:   string;
  onClose:    () => void;
  onSuccess?: () => void;
}

export function SupplierPaymentModal({
  bookingId,
  agencyId,
  onClose,
  onSuccess,
}: SupplierPaymentModalProps) {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  const [defaultPayeeName,  setDefaultPayeeName]  = useState('');
  const [defaultAmountSAR,  setDefaultAmountSAR]  = useState(0);
  const [bookingNumber,     setBookingNumber]      = useState('');
  const [loadingBooking,    setLoadingBooking]     = useState(!!bookingId);
  const [saving,            setSaving]             = useState(false);
  const [saveError,         setSaveError]          = useState('');
  const [recordId,          setRecordId]           = useState<string | null>(null);
  const [voucherNumber,     setVoucherNumber]      = useState('');

  // Load booking data to pre-fill payee name + amount (only when bookingId provided)
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    async function load() {
      try {
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());
        const snap = await getDoc(doc(db, 'bookings', bookingId));
        if (cancelled || !snap.exists()) return;
        const b = snap.data() as Record<string, unknown>;
        if (!cancelled) {
          setDefaultPayeeName((b['supplierName'] as string) ?? '');
          setDefaultAmountSAR(((b['pricing'] as Record<string, number> | undefined)?.['totalCost'] ?? 0) / 100);
          setBookingNumber((b['bookingNumber'] as string) ?? '');
        }
      } finally {
        if (!cancelled) setLoadingBooking(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [bookingId]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      payeeName:       defaultPayeeName,
      expenseCategory: 'supplier',
      paymentMethod:   'bank_transfer',
      amountSAR:       defaultAmountSAR || undefined,
    },
  });

  const amountSAR     = watch('amountSAR') || 0;
  const amountHalalas = Math.round(amountSAR * 100);

  async function onSubmit(data: FormData) {
    setSaving(true);
    setSaveError('');
    try {
      const { getAuth } = await import('firebase/auth');
      const { getApp } = await import('@masarat/firebase');
      const token = await getAuth(getApp()).currentUser?.getIdToken();

      const res = await fetch('/api/supplier-payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          payeeName:       data.payeeName,
          expenseCategory: data.expenseCategory,
          amountHalalas:   Math.round(data.amountSAR * 100),
          paymentMethod:   data.paymentMethod,
          reference:       data.reference,
          notes:           data.notes,
          bookingId:       bookingId,
          bookingNumber:   bookingNumber || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? (isAr ? 'حدث خطأ أثناء الحفظ' : 'Save error'));
      }

      const result = await res.json() as { id: string; voucherNumber: string };
      setRecordId(result.id);
      setVoucherNumber(result.voucherNumber);
      onSuccess?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ أثناء الحفظ' : 'Save error'));
    } finally {
      setSaving(false);
    }
  }

  const categoryOptions = [
    { value: 'supplier',    label: isAr ? 'مورد خدمة'          : 'Service Supplier'   },
    { value: 'operational', label: isAr ? 'مصاريف تشغيلية'     : 'Operating Expenses'  },
    { value: 'salaries',    label: isAr ? 'رواتب وأجور'         : 'Salaries & Wages'   },
    { value: 'office',      label: isAr ? 'مصاريف مكتبية'       : 'Office Expenses'     },
    { value: 'other',       label: isAr ? 'أخرى'                : 'Other'               },
  ];

  const paymentMethodOptions = [
    { value: 'cash',          label: isAr ? 'نقداً'          : 'Cash'          },
    { value: 'bank_transfer', label: isAr ? 'تحويل بنكي'    : 'Bank Transfer'  },
    { value: 'card',          label: isAr ? 'بطاقة ائتمان'  : 'Credit Card'   },
    { value: 'online',        label: isAr ? 'دفع إلكتروني'  : 'Online'        },
    { value: 'check',         label: isAr ? 'شيك'            : 'Cheque'        },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Banknote size={20} className="text-red-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {isAr ? 'تسجيل سند صرف' : 'Record Payment Voucher'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {recordId ? (
          /* ── Success state ─────────────────────────────────────────────── */
          <div className="flex flex-col items-center py-6 text-center gap-4">
            <CheckCircle2 size={48} className="text-emerald-500" />
            <div>
              <p className="text-base font-semibold text-slate-900">
                {isAr ? 'تم تسجيل سند الصرف بنجاح' : 'Payment Voucher Recorded Successfully'}
              </p>
              {voucherNumber && (
                <p className="text-sm font-mono text-slate-500 mt-0.5">{voucherNumber}</p>
              )}
              <p className="text-2xl font-black text-red-700 tabular-nums mt-1">
                {formatCurrency(amountHalalas, isAr ? 'ar-SA' : 'en-SA')}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full pt-2">
              <Link
                href={`/${locale}/supplier-payments/${recordId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
                >
                  <Printer size={15} />
                  {isAr ? 'طباعة سند الصرف' : 'Print Payment Voucher'}
                </button>
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Form ──────────────────────────────────────────────────────── */
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label={isAr ? 'صُرف لـ (الجهة المستفيدة)' : 'Paid To (Payee)'}
              placeholder={
                loadingBooking
                  ? (isAr ? 'جارٍ التحميل...' : 'Loading...')
                  : (isAr ? 'اسم المورد أو الجهة' : 'Supplier or payee name')
              }
              required
              defaultValue={defaultPayeeName || undefined}
              error={errors.payeeName?.message}
              disabled={loadingBooking}
              {...register('payeeName')}
            />

            <Select
              label={isAr ? 'نوع المصروف' : 'Expense Category'}
              required
              options={categoryOptions}
              error={errors.expenseCategory?.message}
              {...register('expenseCategory')}
            />

            <Input
              label={`${isAr ? 'المبلغ المدفوع (ريال)' : 'Amount Paid (SAR)'}`}
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={defaultAmountSAR || undefined}
              error={errors.amountSAR?.message}
              {...register('amountSAR')}
            />

            <Select
              label={isAr ? 'طريقة الدفع' : 'Payment Method'}
              required
              options={paymentMethodOptions}
              error={errors.paymentMethod?.message}
              {...register('paymentMethod')}
            />

            <Input
              label={isAr ? 'رقم المرجع / الإيصال' : 'Reference / Receipt #'}
              placeholder={isAr ? 'اختياري' : 'Optional'}
              {...register('reference')}
            />

            <Input
              label={isAr ? 'ملاحظات' : 'Notes'}
              placeholder={isAr ? 'اختياري' : 'Optional'}
              {...register('notes')}
            />

            {saveError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                {saveError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" fullWidth onClick={onClose}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" fullWidth loading={saving}>
                {saving
                  ? (isAr ? 'جارٍ التسجيل...' : 'Processing...')
                  : (isAr ? 'تسجيل السند' : 'Record Voucher')}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
