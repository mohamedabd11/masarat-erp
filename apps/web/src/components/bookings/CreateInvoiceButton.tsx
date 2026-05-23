'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useCreateInvoice } from '@/hooks/useCloudFunctions';
import { Button } from '@/components/ui/Button';
import { FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreateInvoiceButtonProps {
  bookingId: string;
  agencyId: string;
  bookingStatus: string;
  existingInvoiceId?: string;
  onSuccess?: (invoiceId: string, invoiceNumber: string) => void;
}

export function CreateInvoiceButton({
  bookingId,
  agencyId,
  bookingStatus,
  existingInvoiceId,
  onSuccess,
}: CreateInvoiceButtonProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { createInvoice, loading, error, data, reset } = useCreateInvoice();
  const [showSuccess, setShowSuccess] = useState(false);

  const canCreate = bookingStatus === 'confirmed' && !existingInvoiceId;

  async function handleClick() {
    if (!canCreate) return;
    try {
      const result = await createInvoice(bookingId, agencyId);
      setShowSuccess(true);
      onSuccess?.(result.invoiceId, result.invoiceNumber);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch {
      // error state handled by hook
    }
  }

  if (existingInvoiceId) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
        <CheckCircle2 size={15} />
        {isAr ? 'تم إصدار الفاتورة' : 'Invoice Issued'}
      </div>
    );
  }

  if (bookingStatus !== 'confirmed') {
    return (
      <p className="text-xs text-slate-400 italic">
        {isAr
          ? 'يجب تأكيد الحجز أولاً لإصدار الفاتورة'
          : 'Confirm booking first to issue invoice'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        loading={loading}
        disabled={loading || showSuccess}
        variant={showSuccess ? 'secondary' : 'primary'}
        size="sm"
      >
        {showSuccess ? (
          <>
            <CheckCircle2 size={14} />
            {isAr ? 'تم إصدار الفاتورة' : 'Invoice Created'}
          </>
        ) : (
          <>
            <FileText size={14} />
            {isAr ? 'إصدار فاتورة ZATCA' : 'Issue ZATCA Invoice'}
          </>
        )}
      </Button>

      {data && showSuccess && (
        <p className="text-xs text-emerald-600">
          {data.invoiceNumber}
        </p>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-xs text-red-600">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
