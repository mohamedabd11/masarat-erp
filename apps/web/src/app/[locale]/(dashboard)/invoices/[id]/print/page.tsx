'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { Spinner } from '@/components/ui/Spinner';
import { PrintableInvoice } from '@/components/invoices/PrintableInvoice';
import type { ComponentProps } from 'react';

interface InvoiceDoc {
  id: string;
  invoiceNumber?: string;
  issueDate?: { toDate?(): Date };
  dueDate?: { toDate?(): Date };
  createdAt?: { toDate?(): Date };
  totals?: { grandTotal?: number; subtotalExclVat?: number; totalVat?: number };
  lines?: Record<string, unknown>[];
  seller?: {
    name?: { ar?: string; en?: string };
    vatNumber?: string;
    crNumber?: string;
    address?: { streetName?: string; buildingNumber?: string; district?: string; city?: string; postalCode?: string };
    phone?: string;
    email?: string;
  };
  buyer?: { name?: { ar?: string; en?: string }; phone?: string; vatNumber?: string };
  zatca?: { invoiceUUID?: string; invoiceTypeCode?: string; qrCodeData?: string; submissionStatus?: string };
}

type PrintableInvoiceData = ComponentProps<typeof PrintableInvoice>['invoice'];

export default function PrintInvoicePage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const { user } = useAuth();
  const [invoice, setInvoice] = useState<PrintableInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      try {
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());
        const agencyId = user?.agencyId as string | undefined;

        const [snap, agencySnap] = await Promise.all([
          getDoc(doc(db, 'invoices', params.id)),
          agencyId ? getDoc(doc(db, 'agencies', agencyId)) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (!snap.exists()) { setError('الفاتورة غير موجودة'); setLoading(false); return; }

        const d: InvoiceDoc = { id: snap.id, ...(snap.data() as Omit<InvoiceDoc, 'id'>) };
        // Always use the agency's CURRENT isVatRegistered setting — never trust what was stored on the invoice
        const agencyIsVatRegistered = agencySnap?.exists() ? (agencySnap.data() as Record<string, unknown>)['isVatRegistered'] === true : false;

        const grandTotal: number = d.totals?.grandTotal ?? 0;
        const subtotalExclVat: number = d.totals?.subtotalExclVat ?? Math.round(grandTotal / 1.15);
        const totalVat: number = d.totals?.totalVat ?? (grandTotal - subtotalExclVat);

        const isAr = params.locale === 'ar';

        // Build line items from stored lines or synthetic fallback
        const rawLines: PrintableInvoiceData['lines'] = (d.lines && d.lines.length > 0)
          ? d.lines.map((l: Record<string, unknown>, idx: number) => ({
              id: String(l.id ?? idx + 1),
              nameAr: String(l.nameAr ?? ''),
              nameEn: String(l.nameEn ?? ''),
              quantity: Number(l.quantity ?? 1),
              unitCode: String(l.unitCode ?? 'PCE'),
              unitPriceExclVatHalalas: Number(l.unitPriceExclVatHalalas ?? 0),
              totalExclVatHalalas: Number(l.totalExclVatHalalas ?? 0),
              vatRate: Number(l.vatRate ?? 0),
              vatAmountHalalas: Number(l.vatAmountHalalas ?? 0),
              totalInclVatHalalas: Number(l.totalInclVatHalalas ?? 0),
            }))
          : [
              {
                id: '1',
                nameAr: 'خدمة سفر',
                nameEn: 'Travel Service',
                quantity: 1,
                unitCode: 'PCE',
                unitPriceExclVatHalalas: subtotalExclVat,
                totalExclVatHalalas: subtotalExclVat,
                vatRate: totalVat > 0 ? 0.15 : 0,
                vatAmountHalalas: totalVat,
                totalInclVatHalalas: grandTotal,
              },
            ];

        const seller = d.seller ?? {};
        const issueDate = d.issueDate?.toDate?.() ?? d.createdAt?.toDate?.() ?? new Date();
        const dueDate = d.dueDate?.toDate?.() ?? undefined;
        const buyerName = isAr
          ? (d.buyer?.name?.ar ?? d.buyer?.name?.en ?? '')
          : (d.buyer?.name?.en ?? d.buyer?.name?.ar ?? '');

        const mapped: PrintableInvoiceData = {
          invoiceNumber: d.invoiceNumber ?? d.id,
          uuid: d.zatca?.invoiceUUID ?? '',
          issueDate,
          dueDate,
          invoiceTypeCode: (d.zatca?.invoiceTypeCode ?? '388') as '388' | '381' | '383',
          currency: 'SAR',
          seller: {
            nameAr: seller.name?.ar ?? '',
            nameEn: seller.name?.en ?? '',
            vatNumber: seller.vatNumber ?? '',
            crNumber: seller.crNumber ?? '',
            isVatRegistered: agencyIsVatRegistered,
            address: {
              streetName: seller.address?.streetName ?? '',
              buildingNumber: seller.address?.buildingNumber ?? '',
              district: seller.address?.district ?? '',
              city: seller.address?.city ?? '',
              postalCode: seller.address?.postalCode ?? '',
            },
            phone: seller.phone ?? '',
            email: seller.email ?? '',
          },
          buyer: {
            nameAr: d.buyer?.name?.ar ?? buyerName,
            nameEn: d.buyer?.name?.en ?? '',
            phone: d.buyer?.phone ?? '',
            vatNumber: d.buyer?.vatNumber,
          },
          lines: rawLines,
          totals: {
            subtotalExclVatHalalas: subtotalExclVat,
            totalVatHalalas: totalVat,
            grandTotalHalalas: grandTotal,
          },
          qrCodeData: d.zatca?.qrCodeData,
          zatcaStatus: d.zatca?.submissionStatus ?? 'not_submitted',
        };

        setInvoice(mapped);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'حدث خطأ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [params.id, params.locale, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500">{error || 'الفاتورة غير موجودة'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <PrintableInvoice invoice={invoice} />
    </div>
  );
}
