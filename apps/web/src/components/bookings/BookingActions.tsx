'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@masarat/firebase';
import { CreateInvoiceButton } from './CreateInvoiceButton';
import { ProcessPaymentModal } from './ProcessPaymentModal';
import { ProcessRefundModal } from './ProcessRefundModal';
import { Button } from '@/components/ui/Button';
import { RotateCcw } from 'lucide-react';

interface BookingActionsProps {
  bookingId: string;
  agencyId: string;
  bookingStatus: string;
  existingInvoiceId?: string;
  grandTotalHalalas: number;
  paidHalalas: number;
}

export function BookingActions({
  bookingId,
  agencyId,
  bookingStatus,
  existingInvoiceId,
  grandTotalHalalas,
  paidHalalas,
}: BookingActionsProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const canWriteInvoices = !!user;
  const [invoiceId, setInvoiceId] = useState(existingInvoiceId);
  const [paid, setPaid] = useState(paidHalalas);
  const [showPayment, setShowPayment] = useState(false);
  const [showRefund, setShowRefund] = useState(false);

  const remaining = grandTotalHalalas - paid;
  const isFullyPaid = remaining <= 0;

  function handleInvoiceCreated(newInvoiceId: string) {
    setInvoiceId(newInvoiceId);
  }

  return (
    <>
      {/* Invoice action */}
      <div className="pt-4 border-t border-surface-border space-y-3">
        {canWriteInvoices ? (
          <>
            <CreateInvoiceButton
              bookingId={bookingId}
              agencyId={agencyId}
              bookingStatus={bookingStatus}
              existingInvoiceId={invoiceId}
              grandTotalHalalas={grandTotalHalalas}
              onSuccess={(id) => handleInvoiceCreated(id)}
            />

            {/* Payment action — only when invoice exists and not fully paid */}
            {invoiceId && !isFullyPaid && (
              <Button
                fullWidth
                size="sm"
                onClick={() => setShowPayment(true)}
              >
                {isAr ? 'تسجيل دفعة' : 'Record Payment'}
              </Button>
            )}

            {/* Refund action — only when something was paid */}
            {invoiceId && paid > 0 && (
              <Button
                fullWidth
                size="sm"
                variant="ghost"
                onClick={() => setShowRefund(true)}
                className="text-red-600 hover:bg-red-50"
              >
                <RotateCcw size={13} />
                {isAr ? 'استرداد / إلغاء' : 'Refund / Cancel'}
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-400">للعرض فقط / Read-only</p>
        )}

        {/* Quick link to invoice page when exists */}
        {invoiceId && (
          <Link
            href={`/${locale}/invoices/${invoiceId}`}
            className="block text-center text-xs text-brand-600 hover:underline"
          >
            {isAr ? 'عرض الفاتورة كاملة' : 'View Full Invoice'} →
          </Link>
        )}
      </div>

      {showPayment && invoiceId && (
        <ProcessPaymentModal
          bookingId={bookingId}
          invoiceId={invoiceId}
          agencyId={agencyId}
          remainingDueHalalas={remaining}
          onClose={() => setShowPayment(false)}
          onSuccess={(newRemaining) => {
            setPaid(grandTotalHalalas - newRemaining);
            setShowPayment(false);
          }}
        />
      )}

      {showRefund && invoiceId && (
        <ProcessRefundModal
          bookingId={bookingId}
          invoiceId={invoiceId}
          agencyId={agencyId}
          paidAmountHalalas={paid}
          onClose={() => setShowRefund(false)}
          onSuccess={() => {
            setPaid(0);
            setShowRefund(false);
          }}
        />
      )}
    </>
  );
}
