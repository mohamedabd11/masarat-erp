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
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());

        // ── 1. Load payment ───────────────────────────────────────────────
        const paySnap = await getDoc(doc(db, 'payments', params.paymentId));
        if (!paySnap.exists()) {
          setError(isAr ? 'سند الدفع غير موجود' : 'Payment not found');
          setLoading(false);
          return;
        }
        const pay = paySnap.data() as Record<string, unknown>;

        // ── 2. Load invoice (for invoiceNumber + customer) ────────────────
        let invoiceNumber = (pay['invoiceId'] as string | undefined) ?? '';
        let bookingNumber: string | undefined;
        let customerNameAr = '';
        let customerNameEn = '';
        let customerPhone = '';

        if (pay['invoiceId']) {
          const invSnap = await getDoc(doc(db, 'invoices', pay['invoiceId'] as string));
          if (invSnap.exists()) {
            const inv = invSnap.data() as Record<string, unknown>;
            invoiceNumber = (inv['invoiceNumber'] as string | undefined) ?? (pay['invoiceId'] as string);
            const buyer = inv['buyer'] as Record<string, unknown> | undefined;
            const buyerName = buyer?.['name'] as Record<string, unknown> | undefined;
            customerNameAr = (buyerName?.['ar'] as string | undefined) ?? '';
            customerNameEn = (buyerName?.['en'] as string | undefined) ?? '';
            customerPhone  = (buyer?.['phone'] as string | undefined) ?? '';
          }
        }

        // ── 3. Load booking (for bookingNumber) ───────────────────────────
        if (pay['bookingId']) {
          const bkSnap = await getDoc(doc(db, 'bookings', pay['bookingId'] as string));
          if (bkSnap.exists()) {
            const bk = bkSnap.data() as Record<string, unknown>;
            bookingNumber = bk['bookingNumber'] as string | undefined;
            if (!customerNameAr) {
              const bkCustomer = bk['customerName'] as Record<string, unknown> | string | undefined;
              customerNameAr = typeof bkCustomer === 'string' ? bkCustomer : ((bkCustomer?.['ar'] as string | undefined) ?? '');
              customerNameEn = typeof bkCustomer === 'object' && bkCustomer ? ((bkCustomer['en'] as string | undefined) ?? '') : '';
            }
            if (!customerPhone) customerPhone = (bk['customerPhone'] as string | undefined) ?? '';
          }
        }

        // Fallback for standalone receipts not tied to an invoice
        if (!customerNameAr) customerNameAr = (pay['customerNameAr'] as string | undefined) ?? '';
        if (!customerNameEn) customerNameEn = (pay['customerNameEn'] as string | undefined) ?? '';
        if (!customerPhone)  customerPhone  = (pay['customerPhone']  as string | undefined) ?? '';

        // ── 4. Load agency (for seller info) ──────────────────────────────
        const agencyId = pay['agencyId'] as string | undefined;
        let agencyNameAr = '';
        let agencyNameEn = '';
        let agencyPhone  = '';
        let agencyVat    = '';
        let agencyCr     = '';
        let agencyAddress: ReceiptVoucherData['agency']['address'] = {};

        if (agencyId) {
          const agSnap = await getDoc(doc(db, 'agencies', agencyId));
          if (agSnap.exists()) {
            const ag = agSnap.data() as Record<string, unknown>;
            agencyNameAr = (ag['nameAr'] as string | undefined)       ?? '';
            agencyNameEn = (ag['nameEn'] as string | undefined)       ?? '';
            agencyPhone  = (ag['contactPhone'] as string | undefined) ?? '';
            agencyVat    = (ag['vatNumber'] as string | undefined)    ?? '';
            agencyCr     = (ag['crNumber'] as string | undefined)     ?? '';
            agencyAddress = {
              streetName:     (ag['streetName'] as string | undefined)     ?? '',
              buildingNumber: (ag['buildingNumber'] as string | undefined) ?? '',
              district:       (ag['district'] as string | undefined)       ?? '',
              city:           (ag['city'] as string | undefined)           ?? '',
              postalCode:     (ag['postalCode'] as string | undefined)     ?? '',
            };
          }
        }

        if (cancelled) return;

        // ── 5. Build voucher number from paymentId ─────────────────────────
        const voucherNumber = (pay['receiptNumber'] as string | undefined) ?? `RCT-${new Date().getFullYear()}-${params.paymentId.slice(-6).toUpperCase()}`;

        const payCreatedAt = pay['createdAt'] as { toDate?: () => Date } | undefined;
        const receipt: ReceiptVoucherData = {
          voucherNumber,
          paymentId: params.paymentId,
          issuedDate: payCreatedAt?.toDate?.() ?? new Date(),
          amountHalalas: (pay['amountHalalas'] as number | undefined) ?? 0,
          paymentMethod: (pay['paymentMethod'] as string | undefined) ?? 'cash',
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
            nameAr: agencyNameAr,
            nameEn: agencyNameEn,
            phone: agencyPhone || undefined,
            vatNumber: agencyVat || undefined,
            crNumber: agencyCr || undefined,
            address: agencyAddress,
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
