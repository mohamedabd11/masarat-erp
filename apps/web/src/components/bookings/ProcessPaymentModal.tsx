'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useProcessPayment } from '@/hooks/useCloudFunctions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { cn, formatCurrency } from '@/lib/utils';
import { X, CheckCircle2, AlertCircle, Receipt } from 'lucide-react';

const paymentSchema = z.object({
  amountSAR: z.coerce.number().min(0.01),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'card', 'online']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface ProcessPaymentModalProps {
  bookingId: string;
  invoiceId: string;
  agencyId: string;
  remainingDueHalalas: number;
  onClose: () => void;
  onSuccess?: (remainingDue: number) => void;
}

export function ProcessPaymentModal({
  bookingId,
  invoiceId,
  agencyId,
  remainingDueHalalas,
  onClose,
  onSuccess,
}: ProcessPaymentModalProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { processPayment, loading, error } = useProcessPayment();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amountSAR: remainingDueHalalas / 100,
      paymentMethod: 'bank_transfer',
    },
  });

  const amountSAR = watch('amountSAR') || 0;
  const amountHalalas = Math.round(amountSAR * 100);

  async function onSubmit(data: PaymentFormData) {
    try {
      const result = await processPayment({
        bookingId,
        invoiceId,
        agencyId,
        amountHalalas: Math.round(data.amountSAR * 100),
        paymentMethod: data.paymentMethod,
        reference: data.reference,
        notes: data.notes,
      });
      setSuccess(true);
      onSuccess?.(result.remainingDueHalalas);
      setTimeout(onClose, 2000);
    } catch {
      // error state handled by hook
    }
  }

  const paymentMethodOptions = [
    { value: 'cash',           label: isAr ? 'نقداً' : 'Cash' },
    { value: 'bank_transfer',  label: isAr ? 'تحويل بنكي' : 'Bank Transfer' },
    { value: 'card',           label: isAr ? 'بطاقة ائتمان' : 'Credit/Debit Card' },
    { value: 'online',         label: isAr ? 'دفع إلكتروني' : 'Online Payment' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Receipt size={20} className="text-brand-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {isAr ? 'تسجيل دفعة' : 'Record Payment'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Remaining due */}
        <div className={cn(
          'rounded-xl p-4 mb-6',
          remainingDueHalalas > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'
        )}>
          <p className="text-xs text-slate-500 mb-1">
            {isAr ? 'المبلغ المتبقي' : 'Remaining Due'}
          </p>
          <p className={cn(
            'text-2xl font-bold',
            remainingDueHalalas > 0 ? 'text-amber-700' : 'text-emerald-700'
          )}>
            {formatCurrency(remainingDueHalalas, isAr ? 'ar-SA' : 'en-SA')}
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 size={48} className="text-emerald-500 mb-3" />
            <p className="text-base font-semibold text-slate-900">
              {isAr ? 'تم تسجيل الدفعة بنجاح' : 'Payment Recorded Successfully'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {formatCurrency(amountHalalas, isAr ? 'ar-SA' : 'en-SA')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label={`${isAr ? 'المبلغ (ريال)' : 'Amount (SAR)'}`}
              type="number"
              step="0.01"
              min="0.01"
              required
              error={errors.amountSAR?.message}
              hint={isAr
                ? `الحد الأقصى: ${formatCurrency(remainingDueHalalas, 'ar-SA')}`
                : `Max: ${formatCurrency(remainingDueHalalas, 'en-SA')}`}
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

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" fullWidth onClick={onClose}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" fullWidth loading={loading}>
                {loading
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
