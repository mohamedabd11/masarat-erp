'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { PrintableReceiptVoucher } from '@/components/payments/PrintableReceiptVoucher';
import type { ReceiptVoucherData } from '@/components/payments/PrintableReceiptVoucher';
import { Printer, ArrowRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ReceiptVoucherPage({
  params,
}: {
  params: { locale: string; paymentId: string };
}) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const [data, setData] = useState<ReceiptVoucherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      try {
        const { apiFetch } = await import('@/lib/api-client');

        // ── 1. Load payment ───────────────────────────────────────────────
        const payResult = await apiFetch<{ payment: Record<string, unknown> }>(`/api/payments/${params.paymentId}`);
        const pay = payResult.payment;

        // ── 2. Load invoice (for invoiceNumber + customer) ────────────────
        let invoiceNumber = (pay['invoiceId'] as string | undefined) ?? '';
        let bookingNumber: string | undefined;
        let customerNameAr = '';
        let customerNameEn = '';
        let customerPhone = '';

        if (pay['invoiceId']) {
          try {
            const invResult = await apiFetch<{ invoice: Record<string, unknown> }>(`/api/invoices/${pay['invoiceId'] as string}`);
            const inv = invResult.invoice;
            invoiceNumber = (inv['invoiceNumber'] as string | undefined) ?? (pay['invoiceId'] as string);
            const buyer = inv['buyer'] as Record<string, unknown> | undefined;
            const buyerName = buyer?.['name'] as Record<string, unknown> | undefined;
            customerNameAr = (buyerName?.['ar'] as string | undefined) ?? (inv['customerName'] as string | undefined) ?? '';
            customerNameEn = (buyerName?.['en'] as string | undefined) ?? '';
            customerPhone  = (buyer?.['phone'] as string | undefined) ?? (inv['customerPhone'] as string | undefined) ?? '';
          } catch { /* invoice may not exist */ }
        }

        // ── 3. Load booking (for bookingNumber) ───────────────────────────
        if (pay['bookingId']) {
          try {
            const bkResult = await apiFetch<{ booking: Record<string, unknown> }>(`/api/bookings/${pay['bookingId'] as string}`);
            const bk = bkResult.booking;
            bookingNumber = bk['bookingNumber'] as string | undefined;
            if (!customerNameAr) {
              const bkCustomer = bk['customerName'] as Record<string, unknown> | string | undefined;
              customerNameAr = typeof bkCustomer === 'string' ? bkCustomer : ((bkCustomer?.['ar'] as string | undefined) ?? (bk['customerNameAr'] as string | undefined) ?? '');
              customerNameEn = typeof bkCustomer === 'object' && bkCustomer ? ((bkCustomer['en'] as string | undefined) ?? '') : (bk['customerNameEn'] as string | undefined) ?? '';
            }
            if (!customerPhone) customerPhone = (bk['customerPhone'] as string | undefined) ?? '';
          } catch { /* booking may not exist */ }
        }

        // Fallback for standalone receipts not tied to an invoice
        if (!customerNameAr) customerNameAr = (pay['customerNameAr'] as string | undefined) ?? (pay['customerName'] as string | undefined) ?? '';
        if (!customerNameEn) customerNameEn = (pay['customerNameEn'] as string | undefined) ?? '';
        if (!customerPhone)  customerPhone  = (pay['customerPhone']  as string | undefined) ?? '';

        // ── 4. Load agency (for seller info) ──────────────────────────────
        const settingsResult = await apiFetch<{ agency: Record<string, unknown> }>('/api/settings');
        const ag = settingsResult.agency;

        if (cancelled) return;

        // ── 5. Build voucher number from paymentId ─────────────────────────
        const voucherNumber = (pay['voucherNumber'] as string | undefined) ?? (pay['receiptNumber'] as string | undefined) ?? `RCT-${new Date().getFullYear()}-${params.paymentId.slice(-6).toUpperCase()}`;

        const payCreatedAt = pay['createdAt'] as string | undefined;
        const receipt: ReceiptVoucherData = {
          voucherNumber,
          paymentId: params.paymentId,
          issuedDate: payCreatedAt ? new Date(payCreatedAt) : new Date(),
          amountHalalas: (pay['amountHalalas'] as number | undefined) ?? 0,
          paymentMethod: (pay['method'] as string | undefined) ?? (pay['paymentMethod'] as string | undefined) ?? 'cash',
          reference: (pay['reference'] as string | undefined) || undefined,
          notes: (pay['notes'] as string | undefined) || undefined,
          invoiceNumber,
          bookingNumber,
          customer: {
            nameAr: customerNameAr,
            nameEn: customerNameEn,
            phone: customerPhone || undefined,
          },
          agency: {
            nameAr: (ag['nameAr'] as string | undefined) ?? '',
            nameEn: (ag['nameEn'] as string | undefined) ?? '',
            isVatRegistered: (ag['isVatRegistered'] as boolean | undefined) === true,
            phone: (ag['contactPhone'] as string | undefined) || undefined,
            vatNumber: (ag['vatNumber'] as string | undefined) || undefined,
            crNumber: (ag['crNumber'] as string | undefined) || undefined,
            address: {
              city: (ag['city'] as string | undefined) ?? '',
            },
          },
        };

        setData(receipt);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'حدث خطأ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [params.paymentId, isAr, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center flex-col gap-4">
        <p className="text-slate-500">{error || (isAr ? 'السند غير موجود' : 'Voucher not found')}</p>
        <Link href={`/${locale}/bookings`}>
          <Button variant="outline" size="sm">
            <BackIcon size={14} />
            {isAr ? 'العودة' : 'Back'}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      {/* Print toolbar — hidden when printing */}
      <div className="print:hidden flex items-center justify-center gap-3 mb-6">
        <Button
          onClick={() => window.print()}
          className="gap-2"
        >
          <Printer size={16} />
          {isAr ? 'طباعة سند القبض' : 'Print Receipt Voucher'}
        </Button>
        <Link href={`/${locale}/bookings`}>
          <Button variant="outline" size="sm">
            <BackIcon size={14} />
            {isAr ? 'العودة' : 'Back'}
          </Button>
        </Link>
      </div>

      {/* Receipt */}
      <PrintableReceiptVoucher data={data} />

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          #receipt-voucher { box-shadow: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
