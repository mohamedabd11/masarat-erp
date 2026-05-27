'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { PrintablePaymentVoucher } from '@/components/payments/PrintablePaymentVoucher';
import type { PaymentVoucherData } from '@/components/payments/PrintablePaymentVoucher';
import { Printer, ArrowRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function SupplierPaymentVoucherPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = useLocale();
  const isAr   = locale === 'ar';
  const { user } = useAuth();
  const [data, setData]       = useState<PaymentVoucherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      try {
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());

        // ── 1. Load supplier payment record ────────────────────────────────
        const snap = await getDoc(doc(db, 'supplier_payments', params.id));
        if (!snap.exists()) {
          setError(isAr ? 'سند الصرف غير موجود' : 'Voucher not found');
          setLoading(false);
          return;
        }
        const rec = snap.data() as Record<string, unknown>;

        // ── 2. Load booking (for bookingNumber if not stored on record) ───
        let bookingNumber: string | undefined = (rec['bookingNumber'] as string | undefined) ?? undefined;
        if (!bookingNumber && rec['bookingId']) {
          const bkSnap = await getDoc(doc(db, 'bookings', rec['bookingId'] as string));
          if (bkSnap.exists()) {
            bookingNumber = (bkSnap.data() as Record<string, string>)['bookingNumber'];
          }
        }

        // ── 3. Load agency ─────────────────────────────────────────────────
        const agencyId = rec['agencyId'] as string | undefined;
        let agencyNameAr = '';
        let agencyNameEn = '';
        let agencyPhone  = '';
        let agencyVat    = '';
        let agencyCr     = '';
        let agencyAddress: PaymentVoucherData['agency']['address'] = {};

        if (agencyId) {
          const agSnap = await getDoc(doc(db, 'agencies', agencyId));
          if (agSnap.exists()) {
            const ag = agSnap.data() as Record<string, unknown>;
            agencyNameAr  = (ag['nameAr'] as string | undefined)       ?? '';
            agencyNameEn  = (ag['nameEn'] as string | undefined)       ?? '';
            agencyPhone   = (ag['contactPhone'] as string | undefined) ?? '';
            agencyVat     = (ag['vatNumber'] as string | undefined)    ?? '';
            agencyCr      = (ag['crNumber'] as string | undefined)     ?? '';
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

        // ── 4. Build voucher number ───────────────────────────────────────
        const voucherNumber = (rec['voucherNumber'] as string | undefined)
          ?? `PV-${new Date().getFullYear()}-${params.id.slice(-6).toUpperCase()}`;

        const createdAtVal = rec['createdAt'] as { toDate?: () => Date } | undefined;
        const voucher: PaymentVoucherData = {
          voucherNumber,
          recordId:        params.id,
          issuedDate:      createdAtVal?.toDate?.() ?? new Date(),
          amountHalalas:   (rec['amountHalalas'] as number | undefined) ?? 0,
          paymentMethod:   (rec['paymentMethod'] as string | undefined) ?? 'cash',
          reference:       (rec['reference'] as string | undefined) || undefined,
          notes:           (rec['notes'] as string | undefined)     || undefined,
          bookingNumber,
          payeeName:       (rec['payeeName'] as string | undefined) ?? (rec['supplierName'] as string | undefined) ?? '',
          expenseCategory: (rec['expenseCategory'] as string | undefined) ?? undefined,
          agency: {
            nameAr:    agencyNameAr,
            nameEn:    agencyNameEn,
            phone:     agencyPhone  || undefined,
            vatNumber: agencyVat    || undefined,
            crNumber:  agencyCr     || undefined,
            address:   agencyAddress,
          },
        };

        setData(voucher);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'حدث خطأ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [params.id, isAr, user]);

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
      {/* Print toolbar */}
      <div className="print:hidden flex items-center justify-center gap-3 mb-6">
        <Button onClick={() => window.print()} className="gap-2">
          <Printer size={16} />
          {isAr ? 'طباعة سند الصرف' : 'Print Payment Voucher'}
        </Button>
        <Link href={`/${locale}/bookings`}>
          <Button variant="outline" size="sm">
            <BackIcon size={14} />
            {isAr ? 'العودة' : 'Back'}
          </Button>
        </Link>
      </div>

      <PrintablePaymentVoucher data={data} />

      <style>{`
        @media print {
          body { background: white !important; }
          #payment-voucher { box-shadow: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
