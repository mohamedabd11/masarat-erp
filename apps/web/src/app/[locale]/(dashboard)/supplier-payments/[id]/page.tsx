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
        const { apiFetch } = await import('@/lib/api-client');

        // ── 1. Load supplier payment record ────────────────────────────────
        const result = await apiFetch<{ payment: Record<string, unknown> }>(`/api/supplier-payments/${params.id}`);
        const rec = result.payment;

        // ── 2. Load agency info ────────────────────────────────────────────
        const settingsData = await apiFetch<{ agency: Record<string, unknown> }>('/api/settings');
        const ag = settingsData.agency;

        if (cancelled) return;

        // ── 3. Build voucher number ────────────────────────────────────────
        const voucherNumber = (rec['voucherNumber'] as string | undefined)
          ?? `PV-${new Date().getFullYear()}-${params.id.slice(-6).toUpperCase()}`;

        const createdAtVal = rec['createdAt'] as string | undefined;
        const voucher: PaymentVoucherData = {
          voucherNumber,
          recordId:        params.id,
          issuedDate:      createdAtVal ? new Date(createdAtVal) : new Date(),
          amountHalalas:   (rec['amountHalalas'] as number | undefined) ?? 0,
          paymentMethod:   (rec['method'] as string | undefined) ?? (rec['paymentMethod'] as string | undefined) ?? 'cash',
          reference:       (rec['reference'] as string | undefined) || undefined,
          notes:           (rec['notes'] as string | undefined)     || undefined,
          bookingNumber:   (rec['bookingNumber'] as string | undefined) ?? undefined,
          payeeName:       (rec['payeeName'] as string | undefined) ?? (rec['supplierName'] as string | undefined) ?? '',
          expenseCategory: (rec['expenseCategory'] as string | undefined) ?? undefined,
          agency: {
            nameAr:    (ag['nameAr'] as string | undefined)       ?? '',
            nameEn:    (ag['nameEn'] as string | undefined)       ?? '',
            logoUrl:   (ag['logoUrl'] as string | undefined)      || undefined,
            phone:     (ag['contactPhone'] as string | undefined) || undefined,
            vatNumber: (ag['vatNumber'] as string | undefined)    || undefined,
            crNumber:  (ag['crNumber'] as string | undefined)     || undefined,
            address:   {
              city: (ag['city'] as string | undefined) ?? '',
            },
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
