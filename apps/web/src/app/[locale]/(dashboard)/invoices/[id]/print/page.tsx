'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { Spinner } from '@/components/ui/Spinner';
import { PrintableInvoice } from '@/components/invoices/PrintableInvoice';
import { apiFetch } from '@/lib/api-client';
import type { ComponentProps } from 'react';
import type { Invoice } from '@/lib/schema';

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
        const { invoice: inv } = await apiFetch<{ invoice: Invoice }>(`/api/invoices/${params.id}`);
        if (cancelled) return;

        const grandTotal      = inv.totalHalalas;
        const subtotalExclVat = inv.subtotalHalalas || Math.round(grandTotal / 1.15);
        const totalVat        = inv.vatHalalas;
        const isVatRegistered = (inv.vatHalalas > 0) || inv.isEInvoice;

        const rawItems = (inv.items as Record<string, unknown>[] | null) ?? [];
        const rawLines: PrintableInvoiceData['lines'] = rawItems.length > 0
          ? rawItems.map((l, idx) => ({
              id:                      String(l['id'] ?? idx + 1),
              nameAr:                  String(l['nameAr'] ?? ''),
              nameEn:                  String(l['nameEn'] ?? ''),
              quantity:                Number(l['quantity'] ?? 1),
              unitCode:                String(l['unitCode'] ?? 'PCE'),
              unitPriceExclVatHalalas: Number(l['unitPriceExclVatHalalas'] ?? 0),
              totalExclVatHalalas:     Number(l['totalExclVatHalalas'] ?? 0),
              vatRate:                 Number(l['vatRate'] ?? 0),
              vatAmountHalalas:        Number(l['vatAmountHalalas'] ?? 0),
              totalInclVatHalalas:     Number(l['totalInclVatHalalas'] ?? 0),
            }))
          : [{
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
            }];

        const mapped: PrintableInvoiceData = {
          invoiceNumber:   inv.invoiceNumber,
          uuid:            inv.zatcaUuid ?? '',
          issueDate:       new Date(inv.issueDate),
          dueDate:         inv.dueDate ? new Date(inv.dueDate) : undefined,
          invoiceTypeCode: (inv.type as '388' | '381' | '383') ?? '388',
          currency:        'SAR',
          seller: {
            nameAr:          inv.sellerNameAr ?? '',
            nameEn:          inv.sellerNameEn ?? '',
            vatNumber:       inv.sellerVatNumber ?? '',
            crNumber:        inv.sellerCrNumber ?? '',
            isVatRegistered,
            address: { streetName: '', buildingNumber: '', district: '', city: inv.sellerAddress ?? '', postalCode: '' },
            phone:           '',
            email:           '',
          },
          buyer: {
            nameAr:    inv.buyerNameAr ?? '',
            nameEn:    inv.buyerNameEn ?? '',
            phone:     inv.buyerPhone ?? '',
            vatNumber: undefined,
          },
          lines:   rawLines,
          totals: {
            subtotalExclVatHalalas: subtotalExclVat,
            totalVatHalalas:        totalVat,
            grandTotalHalalas:      grandTotal,
          },
          qrCodeData:  undefined,
          zatcaStatus: 'not_submitted',
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
