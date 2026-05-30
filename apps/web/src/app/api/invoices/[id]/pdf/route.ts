import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import React from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { db } from '@/lib/db';
import { invoices, agencies } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { registerArabicFonts } from '@/lib/pdf/fonts';
import { buildZatcaQrDataUrl } from '@/lib/pdf/qr-utils';
import { InvoicePdf, type PdfInvoiceData, type PdfInvoiceItem } from '@/lib/pdf/invoice-pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);

    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.id, params.id), eq(invoices.agencyId, agencyId), isNull(invoices.deletedAt)));

    if (!invoice) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });

    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
    if (!agency) return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });

    const qrDataUrl = agency.vatNumber
      ? await buildZatcaQrDataUrl({
          sellerName:    agency.nameAr,
          vatNumber:     agency.vatNumber,
          issueDateTime: new Date(invoice.issueDate),
          totalHalalas:  invoice.totalHalalas,
          vatHalalas:    invoice.vatHalalas,
        })
      : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    const rawItems = Array.isArray(invoice.items) ? invoice.items : [];
    const items: PdfInvoiceItem[] = rawItems.map((it) => {
      const item = it as Record<string, unknown>;
      return {
        description:      String(item.description ?? ''),
        quantity:         Number(item.quantity ?? 1),
        unitPriceHalalas: Number(item.unitPriceHalalas ?? 0),
        vatHalalas:       Number(item.vatHalalas ?? 0),
        totalHalalas:     Number(item.totalHalalas ?? 0),
      };
    });

    const data: PdfInvoiceData = {
      invoiceNumber:   invoice.invoiceNumber,
      type:            invoice.type,
      issueDate:       invoice.issueDate,
      dueDate:         invoice.dueDate ?? null,
      buyerNameAr:     invoice.buyerNameAr ?? null,
      buyerPhone:      invoice.buyerPhone  ?? null,
      buyerNationalId: invoice.buyerNationalId ?? null,
      buyerVatNumber:  null,
      subtotalHalalas: invoice.subtotalHalalas,
      vatHalalas:      invoice.vatHalalas,
      totalHalalas:    invoice.totalHalalas,
      paidHalalas:     invoice.paidHalalas,
      notes:           invoice.notes ?? null,
      items,
      agency: {
        nameAr:    invoice.sellerNameAr ?? agency.nameAr,
        vatNumber: invoice.sellerVatNumber ?? agency.vatNumber ?? null,
        crNumber:  invoice.sellerCrNumber  ?? agency.crNumber  ?? null,
        addressAr: invoice.sellerAddress   ?? agency.addressAr ?? null,
        phone:     agency.phone ?? null,
        logoUrl:   agency.logoUrl ?? null,
      },
      qrDataUrl,
    };

    registerArabicFonts();

    const element = React.createElement(InvoicePdf, { data }) as React.ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(element);
    const body = new Uint8Array(buffer);

    const filename = `invoice-${invoice.invoiceNumber.replace(/[^A-Za-z0-9-]/g, '-')}.pdf`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(body.length),
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
