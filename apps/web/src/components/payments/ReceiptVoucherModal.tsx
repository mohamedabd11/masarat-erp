'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import { X, CheckCircle2, AlertCircle, Printer, TrendingUp } from 'lucide-react';

const schema = z.object({
  customerNameAr: z.string().min(1, 'مطلوب'),
  customerPhone:  z.string().optional(),
  amountSAR:      z.coerce.number().min(0.01),
  paymentMethod:  z.enum(['cash', 'bank_transfer', 'card', 'online']),
  description:    z.string().optional(),
  reference:      z.string().optional(),
  notes:          z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ReceiptVoucherModalProps {
  agencyId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReceiptVoucherModal({
  onClose,
  onSuccess,
}: ReceiptVoucherModalProps) {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  const [saving,         setSaving]         = useState(false);
  const [saveError,      setSaveError]      = useState('');
  const [recordId,       setRecordId]       = useState<string | null>(null);
  const [receiptNumber,  setReceiptNumber]  = useState('');
  const [amountHalalas,  setAmountHalalas]  = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentMethod: 'cash',
    },
  });

  const amountSAR = watch('amountSAR') || 0;

  async function onSubmit(data: FormData) {
    setSaving(true);
    setSaveError('');
    try {
      const { apiFetch } = await import('@/lib/api-client');

      const result = await apiFetch<{ id: string; receiptNumber: string }>('/api/receipts/create', {
        method: 'POST',
        body: JSON.stringify({
          customerNameAr: data.customerNameAr,
          customerPhone:  data.customerPhone,
          amountHalalas:  Math.round(data.amountSAR * 100),
          paymentMethod:  data.paymentMethod,
          description:    data.description,
          reference:      data.reference,
          notes:          data.notes,
        }),
      });

      setRecordId(result.id);
      setReceiptNumber(result.receiptNumber);
      setAmountHalalas(Math.round(data.amountSAR * 100));
      onSuccess?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ أثناء الحفظ' : 'Save error'));
    } finally {
      setSaving(false);
    }
  }

  const paymentMethodOptions = [
    { value: 'cash',          label: isAr ? 'نقداً'         : 'Cash'          },
    { value: 'bank_transfer', label: isAr ? 'تحويل بنكي'   : 'Bank Transfer'  },
    { value: 'card',          label: isAr ? 'بطاقة ائتمان' : 'Credit Card'   },
    { value: 'online',        label: isAr ? 'دفع إلكتروني' : 'Online'        },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {isAr ? 'تسجيل سند قبض' : 'Record Receipt Voucher'}
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
          <div className="flex flex-col items-center py-6 text-center gap-4">
            <CheckCircle2 size={48} className="text-emerald-500" />
            <div>
              <p className="text-base font-semibold text-slate-900">
                {isAr ? 'تم تسجيل سند القبض بنجاح' : 'Receipt Voucher Recorded Successfully'}
              </p>
              {receiptNumber && (
                <p className="text-sm font-mono text-slate-500 mt-0.5">{receiptNumber}</p>
              )}
              <p className="text-2xl font-black text-emerald-700 tabular-nums mt-1">
                {formatCurrency(amountHalalas, isAr ? 'ar-SA' : 'en-SA')}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full pt-2">
              <Link
                href={`/${locale}/payments/${recordId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <Printer size={15} />
                  {isAr ? 'طباعة سند القبض' : 'Print Receipt Voucher'}
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
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label={isAr ? 'اسم العميل' : 'Customer Name'}
              placeholder={isAr ? 'الاسم بالعربي' : 'Customer name'}
              required
              error={errors.customerNameAr?.message}
              {...register('customerNameAr')}
            />

            <Input
              label={isAr ? 'رقم الجوال' : 'Phone Number'}
              placeholder={isAr ? 'اختياري' : 'Optional'}
              {...register('customerPhone')}
            />

            <Input
              label={`${isAr ? 'المبلغ المستلم (ريال)' : 'Amount Received (SAR)'}`}
              type="number"
              step="0.01"
              min="0.01"
              required
              error={errors.amountSAR?.message}
              {...register('amountSAR')}
            />

            {amountSAR > 0 && (
              <p className="text-xs text-slate-500 -mt-2 tabular-nums">
                = {formatCurrency(Math.round(amountSAR * 100), isAr ? 'ar-SA' : 'en-SA')}
              </p>
            )}

            <Select
              label={isAr ? 'طريقة الدفع' : 'Payment Method'}
              required
              options={paymentMethodOptions}
              error={errors.paymentMethod?.message}
              {...register('paymentMethod')}
            />

            <Input
              label={isAr ? 'الوصف / الغرض' : 'Description / Purpose'}
              placeholder={isAr ? 'اختياري' : 'Optional'}
              {...register('description')}
            />

            <Input
              label={isAr ? 'رقم المرجع' : 'Reference Number'}
              placeholder={isAr ? 'اختياري' : 'Optional'}
              {...register('reference')}
            />

            <Textarea
              label={isAr ? 'ملاحظات' : 'Notes'}
              placeholder={isAr ? 'اختياري' : 'Optional'}
              rows={3}
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
