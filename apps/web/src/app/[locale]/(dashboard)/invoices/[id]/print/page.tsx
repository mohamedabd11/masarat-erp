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
        const [{ invoice: inv }, settingsResult] = await Promise.all([
          apiFetch<{ invoice: Invoice }>(`/api/invoices/${params.id}`),
          apiFetch<{ agency: Record<string, unknown> }>('/api/settings').catch(() => ({ agency: {} as Record<string, unknown> })),
        ]);
        const ag = settingsResult.agency;
        if (cancelled) return;

        const grandTotal      = inv.totalHalalas;
        const subtotalExclVat = inv.subtotalHalalas || Math.round(grandTotal / 1.15);
        const totalVat        = inv.vatHalalas;
        const isVatRegistered = !!(ag['isVatRegistered']) || (inv.vatHalalas > 0) || inv.isEInvoice;

        const rawItems = (inv.items as Record<string, unknown>[] | null) ?? [];
        const rawLines: PrintableInvoiceData['lines'] = rawItems.length > 0
          ? rawItems.map((l, idx) => {
              const qty          = Number(l['quantity'] ?? 1);
              // Stored as unitPriceHalalas (new format) or unitPriceExclVatHalalas (legacy)
              const unitPriceExcl = Number(l['unitPriceHalalas'] ?? l['unitPriceExclVatHalalas'] ?? 0);
              const vatAmt       = Number(l['vatHalalas'] ?? l['vatAmountHalalas'] ?? 0);
              const totalIncl    = Number(l['totalHalalas'] ?? l['totalInclVatHalalas'] ?? 0);
              const totalExcl    = unitPriceExcl * qty;
              const vatRate      = totalExcl > 0 ? vatAmt / totalExcl : Number(l['vatRate'] ?? 0);
              return {
                id:                      String(l['id'] ?? idx + 1),
                nameAr:                  String(l['description'] ?? l['nameAr'] ?? ''),
                nameEn:                  String(l['descriptionEn'] ?? l['nameEn'] ?? ''),
                quantity:                qty,
                unitCode:                'PCE',
                unitPriceExclVatHalalas: unitPriceExcl,
                totalExclVatHalalas:     totalExcl,
                vatRate,
                vatAmountHalalas:        vatAmt,
                totalInclVatHalalas:     totalIncl,
              };
            })
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
            nameAr:          (ag['nameAr'] as string | undefined) || inv.sellerNameAr || '',
            nameEn:          (ag['nameEn'] as string | undefined) || inv.sellerNameEn || '',
            vatNumber:       (ag['vatNumber'] as string | undefined) || inv.sellerVatNumber || '',
            crNumber:        (ag['crNumber'] as string | undefined) || inv.sellerCrNumber || '',
            isVatRegistered,
            logoUrl:         (ag['logoUrl'] as string | undefined) || undefined,
            address: {
              streetName:     (ag['streetName'] as string | undefined) || '',
              buildingNumber: (ag['buildingNumber'] as string | undefined) || '',
              district:       (ag['district'] as string | undefined) || '',
              city:           (ag['city'] as string | undefined) || inv.sellerAddress || '',
              postalCode:     (ag['postalCode'] as string | undefined) || '',
            },
            phone:           (ag['contactPhone'] as string | undefined) || (ag['phone'] as string | undefined) || '',
            email:           (ag['contactEmail'] as string | undefined) || '',
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
