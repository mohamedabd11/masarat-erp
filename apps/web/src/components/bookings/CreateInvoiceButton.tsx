'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useCreateInvoice } from '@/hooks/useCloudFunctions';
import { Button } from '@/components/ui/Button';
import { FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface CreateInvoiceButtonProps {
  bookingId: string;
  agencyId: string;
  bookingStatus: string;
  existingInvoiceId?: string;
  grandTotalHalalas?: number;
  onSuccess?: (invoiceId: string, invoiceNumber: string) => void;
}

export function CreateInvoiceButton({
  bookingId,
  agencyId,
  bookingStatus,
  existingInvoiceId,
  grandTotalHalalas,
  onSuccess,
}: CreateInvoiceButtonProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { createInvoice, loading, error, data } = useCreateInvoice();
  const [showSuccess, setShowSuccess] = useState(false);
  const [isVatRegistered, setIsVatRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;
    async function loadAgency() {
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const snap = await getDoc(doc(getFirestore(getApp()), 'agencies', agencyId));
      if (cancelled) return;
      if (snap.exists()) {
        const d = snap.data() as Record<string, unknown>;
        setIsVatRegistered((d['isVatRegistered'] as boolean) ?? false);
      } else {
        setIsVatRegistered(false);
      }
    }
    void loadAgency();
    return () => { cancelled = true; };
  }, [agencyId]);

  const canCreate = bookingStatus === 'confirmed' && !existingInvoiceId;
  const isLoading = isVatRegistered === null;

  async function handleClick() {
    if (!canCreate) return;
    try {
      const result = await createInvoice(bookingId, agencyId, grandTotalHalalas);
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

  const invoiceLabel = isVatRegistered
    ? (isAr ? 'فاتورة ضريبية' : 'Tax Invoice')
    : (isAr ? 'إصدار إيصال' : 'Issue Receipt');

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        loading={loading || isLoading}
        disabled={loading || showSuccess || isLoading}
        variant={showSuccess ? 'secondary' : 'primary'}
        size="sm"
      >
        {showSuccess ? (
          <>
            <CheckCircle2 size={14} />
            {isAr ? 'تم الإصدار' : 'Issued'}
          </>
        ) : (
          <>
            <FileText size={14} />
            {invoiceLabel}
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
