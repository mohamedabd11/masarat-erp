'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useProcessRefund } from '@/hooks/useCloudFunctions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { cn, formatCurrency } from '@/lib/utils';
import { X, CheckCircle2, AlertCircle, RotateCcw, AlertTriangle } from 'lucide-react';

const refundSchema = z.object({
  refundAmountSAR: z.coerce.number().min(0),
  cancellationFeeSAR: z.coerce.number().min(0),
  reason: z.string().min(5),
}).refine(d => d.refundAmountSAR >= d.cancellationFeeSAR, {
  message: 'رسوم الإلغاء لا يمكن أن تتجاوز مبلغ الاسترداد',
  path: ['cancellationFeeSAR'],
});

type RefundFormData = z.infer<typeof refundSchema>;

interface ProcessRefundModalProps {
  bookingId: string;
  invoiceId: string;
  agencyId: string;
  paidAmountHalalas: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ProcessRefundModal({
  bookingId,
  invoiceId,
  agencyId,
  paidAmountHalalas,
  onClose,
  onSuccess,
}: ProcessRefundModalProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { processRefund, loading, error } = useProcessRefund();
  const [success, setSuccess] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RefundFormData>({
    resolver: zodResolver(refundSchema),
    defaultValues: {
      refundAmountSAR: paidAmountHalalas / 100,
      cancellationFeeSAR: 0,
      reason: '',
    },
  });

  const refundAmountSAR = watch('refundAmountSAR') || 0;
  const cancellationFeeSAR = watch('cancellationFeeSAR') || 0;
  const netRefundSAR = Math.max(0, refundAmountSAR - cancellationFeeSAR);

  async function onSubmit(data: RefundFormData) {
    if (!confirmed) { setConfirmed(true); return; }
    try {
      const grossHalalas = Math.round(data.refundAmountSAR * 100);
      const feeHalalas = Math.round(data.cancellationFeeSAR * 100);
      await processRefund({
        bookingId,
        invoiceId,
        agencyId,
        refundAmountHalalas: grossHalalas - feeHalalas,
        cancellationFeeHalalas: feeHalalas,
        reason: data.reason,
      });
      setSuccess(true);
      onSuccess?.();
      setTimeout(onClose, 2500);
    } catch {
      setConfirmed(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full sm:max-w-md shadow-2xl rounded-t-2xl rounded-b-none sm:rounded-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <RotateCcw size={20} className="text-red-500" />
            <h2 className="text-lg font-bold text-slate-900">
              {isAr ? 'إصدار استرداد / إلغاء' : 'Process Refund / Cancel'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-6">
          <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            {isAr
              ? 'هذا الإجراء لا يمكن التراجع عنه. سيتم إلغاء الحجز وإصدار إشعار دائن.'
              : 'This action cannot be undone. The booking will be cancelled and a credit note issued.'}
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 size={48} className="text-emerald-500 mb-3" />
            <p className="text-base font-semibold text-slate-900">
              {isAr ? 'تم إصدار إشعار الاسترداد' : 'Refund Credit Note Issued'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label={`${isAr ? 'مبلغ الاسترداد (ريال)' : 'Refund Amount (SAR)'}`}
              type="number"
              step="0.01"
              min="0"
              required
              hint={`${isAr ? 'المدفوع:' : 'Paid:'} ${formatCurrency(paidAmountHalalas, isAr ? 'ar-SA' : 'en-SA')}`}
              error={errors.refundAmountSAR?.message}
              {...register('refundAmountSAR')}
            />

            <Input
              label={`${isAr ? 'رسوم الإلغاء (ريال)' : 'Cancellation Fee (SAR)'}`}
              type="number"
              step="0.01"
              min="0"
              hint={isAr ? 'إن وجدت' : 'If applicable'}
              error={errors.cancellationFeeSAR?.message}
              {...register('cancellationFeeSAR')}
            />

            {/* Net refund summary */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="flex justify-between text-sm text-slate-600 mb-1">
                <span>{isAr ? 'المبلغ المسترد' : 'Refund Amount'}</span>
                <span>{formatCurrency(Math.round(refundAmountSAR * 100), isAr ? 'ar-SA' : 'en-SA')}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600 mb-2">
                <span>{isAr ? 'رسوم الإلغاء' : 'Cancellation Fee'}</span>
                <span>- {formatCurrency(Math.round(cancellationFeeSAR * 100), isAr ? 'ar-SA' : 'en-SA')}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2">
                <span>{isAr ? 'مبلغ الإشعار الدائن' : 'Credit Note Amount'}</span>
                <span className="text-emerald-600">{formatCurrency(Math.round(netRefundSAR * 100), isAr ? 'ar-SA' : 'en-SA')}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">
                {isAr ? 'سبب الإلغاء' : 'Cancellation Reason'}
                <span className="text-red-500 ms-1">*</span>
              </label>
              <textarea
                rows={3}
                placeholder={isAr ? 'اكتب سبب الإلغاء أو الاسترداد...' : 'Enter reason for cancellation or refund...'}
                className={cn(
                  'block w-full rounded-lg border bg-white text-slate-900 text-sm px-3.5 py-2.5 resize-none',
                  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
                  errors.reason ? 'border-red-400' : 'border-slate-300'
                )}
                {...register('reason')}
              />
              {errors.reason && <p className="text-xs text-red-600">{errors.reason.message}</p>}
            </div>

            {confirmed && !error && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                {isAr ? 'اضغط مرة أخرى لتأكيد الإلغاء النهائي' : 'Press again to confirm final cancellation'}
              </div>
            )}

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
              <Button type="submit" variant="danger" fullWidth loading={loading}>
                {confirmed
                  ? (isAr ? 'تأكيد الإلغاء النهائي' : 'Confirm Final Cancellation')
                  : (isAr ? 'متابعة الاسترداد' : 'Proceed with Refund')}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
