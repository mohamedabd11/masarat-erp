'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@masarat/firebase';
import { CreateInvoiceButton } from './CreateInvoiceButton';
import { ProcessPaymentModal } from './ProcessPaymentModal';
import { ProcessRefundModal } from './ProcessRefundModal';
import { SupplierPaymentModal } from './SupplierPaymentModal';
import { Button } from '@/components/ui/Button';
import { RotateCcw, Banknote } from 'lucide-react';

interface BookingActionsProps {
  bookingId: string;
  agencyId: string;
  bookingStatus: string;
  existingInvoiceId?: string;
  grandTotalHalalas: number;
  paidHalalas: number;
  onPaidChange?: (paidHalalas: number) => void;
  onRefunded?: () => void;
}

export function BookingActions({
  bookingId,
  agencyId,
  bookingStatus,
  existingInvoiceId,
  grandTotalHalalas,
  paidHalalas,
  onPaidChange,
  onRefunded,
}: BookingActionsProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const canWriteInvoices = !!user;
  const [invoiceId, setInvoiceId] = useState(existingInvoiceId);
  const [paid, setPaid] = useState(paidHalalas);
  const [showPayment, setShowPayment]           = useState(false);
  const [showRefund, setShowRefund]             = useState(false);
  const [showSupplierPayment, setShowSupplierPayment] = useState(false);

  useEffect(() => setInvoiceId(existingInvoiceId), [existingInvoiceId]);
  useEffect(() => setPaid(paidHalalas), [paidHalalas]);

  const remaining = grandTotalHalalas - paid;
  const isFullyPaid = remaining <= 0;
  const isCancelled = bookingStatus === 'cancelled';

  function handleInvoiceCreated(newInvoiceId: string) {
    setInvoiceId(newInvoiceId);
  }

  return (
    <>
      {/* Invoice action */}
      <div className="pt-4 border-t border-surface-border space-y-3">
        {canWriteInvoices ? (
          <>
            {!isCancelled && (
              <CreateInvoiceButton
                bookingId={bookingId}
                agencyId={agencyId}
                bookingStatus={bookingStatus}
                existingInvoiceId={invoiceId}
                grandTotalHalalas={grandTotalHalalas}
                onSuccess={(id) => handleInvoiceCreated(id)}
              />
            )}

            {/* Payment action — only when invoice exists and not fully paid */}
            {!isCancelled && invoiceId && !isFullyPaid && (
              <Button
                fullWidth
                size="sm"
                onClick={() => setShowPayment(true)}
              >
                {isAr ? 'تسجيل دفعة' : 'Record Payment'}
              </Button>
            )}

            {/* Refund action — only when something was paid */}
            {!isCancelled && invoiceId && paid > 0 && (
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

            {/* Payment voucher - general */}
            {!isCancelled && (
              <Button
                fullWidth
                size="sm"
                variant="ghost"
                onClick={() => setShowSupplierPayment(true)}
                className="text-slate-600 hover:bg-slate-50 border border-slate-200"
              >
                <Banknote size={13} />
                {isAr ? 'تسجيل سند صرف' : 'Record Payment Voucher'}
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
            const newPaid = grandTotalHalalas - newRemaining;
            setPaid(newPaid);
            onPaidChange?.(newPaid);
            // لا نُغلق النافذة هنا — المستخدم يحتاج يرى زر "طباعة سند القبض" أولاً
          }}
        />
      )}

      {showRefund && invoiceId && (
        <ProcessRefundModal
          bookingId={bookingId}
          invoiceId={invoiceId}
          agencyId={agencyId}
          paidAmountHalalas={paid}
          cancelledTotalHalalas={grandTotalHalalas}
          onClose={() => setShowRefund(false)}
          onSuccess={() => {
            setPaid(0);
            setShowRefund(false);
            onPaidChange?.(0);
            onRefunded?.();
          }}
        />
      )}

      {showSupplierPayment && (
        <SupplierPaymentModal
          bookingId={bookingId}
          agencyId={agencyId}
          onClose={() => setShowSupplierPayment(false)}
        />
      )}
    </>
  );
}
