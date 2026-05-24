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
import { postJournalEntry, buildSupplierPaymentLines } from '@/lib/postJournalEntry';
import { X, CheckCircle2, AlertCircle, Printer, Banknote } from 'lucide-react';

const schema = z.object({
  amountSAR:     z.coerce.number().min(0.01),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'card', 'online', 'check']),
  reference:     z.string().optional(),
  notes:         z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface SupplierPaymentModalProps {
  bookingId: string;
  agencyId:  string;
  onClose:   () => void;
}

export function SupplierPaymentModal({
  bookingId,
  agencyId,
  onClose,
}: SupplierPaymentModalProps) {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  const [supplierName,    setSupplierName]    = useState('');
  const [supplierCostSAR, setSupplierCostSAR] = useState(0);
  const [bookingNumber,   setBookingNumber]   = useState('');
  const [loadingBooking,  setLoadingBooking]  = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [saveError,       setSaveError]       = useState('');
  const [recordId,        setRecordId]        = useState<string | null>(null);

  // Load booking to pre-fill supplier name + cost
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());
        const snap = await getDoc(doc(db, 'bookings', bookingId));
        if (cancelled || !snap.exists()) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = snap.data() as Record<string, any>;
        if (!cancelled) {
          setSupplierName(b.supplierName ?? '');
          setSupplierCostSAR((b.pricing?.totalCost ?? 0) / 100);
          setBookingNumber(b.bookingNumber ?? '');
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
    defaultValues: { paymentMethod: 'bank_transfer', amountSAR: supplierCostSAR },
  });

  // Sync default amount once booking data is loaded
  useEffect(() => {
    // react-hook-form doesn't re-read defaultValues after mount; handled via form reset below
  }, [supplierCostSAR]);

  const amountSAR    = watch('amountSAR') || 0;
  const amountHalalas = Math.round(amountSAR * 100);

  async function onSubmit(data: FormData) {
    setSaving(true);
    setSaveError('');
    try {
      const { getFirestore, collection, addDoc, Timestamp } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());

      const ref = await addDoc(collection(db, 'supplier_payments'), {
        agencyId,
        bookingId,
        supplierName,
        bookingNumber: bookingNumber || null,
        amountHalalas: Math.round(data.amountSAR * 100),
        paymentMethod: data.paymentMethod,
        reference:     data.reference ?? '',
        notes:         data.notes     ?? '',
        status:        'completed',
        createdAt:     Timestamp.now(),
      });

      // ── قيد محاسبي: دفعة للمورد ──────────────────────────────────────────
      try {
        const paidHalalas = Math.round(data.amountSAR * 100);
        await postJournalEntry({
          agencyId,
          description:   `دفعة مورد - ${supplierName || 'مورد'}`,
          referenceId:   ref.id,
          referenceType: 'supplier_payment',
          lines:         buildSupplierPaymentLines(paidHalalas),
        });
      } catch (jeErr) {
        console.warn('[Accounting] Supplier payment JE failed:', jeErr);
      }

      setRecordId(ref.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ أثناء الحفظ' : 'Save error'));
    } finally {
      setSaving(false);
    }
  }

  const paymentMethodOptions = [
    { value: 'cash',          label: isAr ? 'نقداً'          : 'Cash' },
    { value: 'bank_transfer', label: isAr ? 'تحويل بنكي'    : 'Bank Transfer' },
    { value: 'card',          label: isAr ? 'بطاقة ائتمان'  : 'Credit Card' },
    { value: 'online',        label: isAr ? 'دفع إلكتروني'  : 'Online' },
    { value: 'check',         label: isAr ? 'شيك'            : 'Cheque' },
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
              {isAr ? 'تسجيل دفعة للمورد' : 'Record Supplier Payment'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Supplier info */}
        {!loadingBooking && (
          <div className="rounded-xl p-4 mb-6 bg-red-50 border border-red-200">
            <p className="text-xs text-slate-500 mb-1">{isAr ? 'اسم المورد' : 'Supplier'}</p>
            <p className="font-bold text-slate-900">
              {supplierName || (isAr ? '(غير محدد)' : '(not set)')}
            </p>
            {supplierCostSAR > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                {isAr ? 'تكلفة الحجز: ' : 'Booking cost: '}
                <span className="font-semibold text-red-700">
                  {formatCurrency(supplierCostSAR * 100, isAr ? 'ar-SA' : 'en-SA')}
                </span>
              </p>
            )}
          </div>
        )}

        {recordId ? (
          /* ── Success state ─────────────────────────────────────────────── */
          <div className="flex flex-col items-center py-6 text-center gap-4">
            <CheckCircle2 size={48} className="text-emerald-500" />
            <div>
              <p className="text-base font-semibold text-slate-900">
                {isAr ? 'تم تسجيل الدفعة بنجاح' : 'Payment Recorded Successfully'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {formatCurrency(amountHalalas, isAr ? 'ar-SA' : 'en-SA')}
              </p>
            </div>
            <div className="flex gap-3 w-full pt-2">
              <Link
                href={`/${locale}/supplier-payments/${recordId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
                >
                  <Printer size={15} />
                  {isAr ? 'طباعة سند الصرف' : 'Print Payment Voucher'}
                </button>
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Form ──────────────────────────────────────────────────────── */
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label={`${isAr ? 'المبلغ المدفوع (ريال)' : 'Amount Paid (SAR)'}`}
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={supplierCostSAR || undefined}
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
                  : (isAr ? 'تسجيل الدفعة' : 'Record Payment')}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
