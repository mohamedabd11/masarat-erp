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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pay = paySnap.data() as Record<string, any>;

        // ── 2. Load invoice (for invoiceNumber + customer) ────────────────
        let invoiceNumber = pay.invoiceId ?? '';
        let bookingNumber: string | undefined;
        let customerNameAr = '';
        let customerNameEn = '';
        let customerPhone = '';

        if (pay.invoiceId) {
          const invSnap = await getDoc(doc(db, 'invoices', pay.invoiceId));
          if (invSnap.exists()) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const inv = invSnap.data() as Record<string, any>;
            invoiceNumber = inv.invoiceNumber ?? pay.invoiceId;
            customerNameAr = inv.buyer?.name?.ar ?? '';
            customerNameEn = inv.buyer?.name?.en ?? '';
            customerPhone  = inv.buyer?.phone ?? '';
          }
        }

        // ── 3. Load booking (for bookingNumber) ───────────────────────────
        if (pay.bookingId) {
          const bkSnap = await getDoc(doc(db, 'bookings', pay.bookingId));
          if (bkSnap.exists()) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bk = bkSnap.data() as Record<string, any>;
            bookingNumber = bk.bookingNumber;
            if (!customerNameAr) {
              customerNameAr = bk.customerName?.ar ?? bk.customerName ?? '';
              customerNameEn = bk.customerName?.en ?? '';
            }
            if (!customerPhone) customerPhone = bk.customerPhone ?? '';
          }
        }

        // ── 4. Load agency (for seller info) ──────────────────────────────
        const agencyId = pay.agencyId;
        let agencyNameAr = '';
        let agencyNameEn = '';
        let agencyPhone  = '';
        let agencyVat    = '';
        let agencyCr     = '';
        let agencyAddress: ReceiptVoucherData['agency']['address'] = {};

        if (agencyId) {
          const agSnap = await getDoc(doc(db, 'agencies', agencyId));
          if (agSnap.exists()) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ag = agSnap.data() as Record<string, any>;
            agencyNameAr = ag.nameAr ?? '';
            agencyNameEn = ag.nameEn ?? '';
            agencyPhone  = ag.contactPhone ?? '';
            agencyVat    = ag.vatNumber ?? '';
            agencyCr     = ag.crNumber ?? '';
            agencyAddress = {
              streetName:     ag.streetName ?? '',
              buildingNumber: ag.buildingNumber ?? '',
              district:       ag.district ?? '',
              city:           ag.city ?? '',
              postalCode:     ag.postalCode ?? '',
            };
          }
        }

        if (cancelled) return;

        // ── 5. Build voucher number from paymentId ─────────────────────────
        const voucherNumber = (pay.receiptNumber as string | undefined) ?? `RCT-${new Date().getFullYear()}-${params.paymentId.slice(-6).toUpperCase()}`;

        const receipt: ReceiptVoucherData = {
          voucherNumber,
          paymentId: params.paymentId,
          issuedDate: pay.createdAt?.toDate?.() ?? new Date(),
          amountHalalas: pay.amountHalalas ?? 0,
          paymentMethod: pay.paymentMethod ?? 'cash',
          reference: pay.reference || undefined,
          notes: pay.notes || undefined,
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
