import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import React from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { db } from '@/lib/db';
import { bookings, agencies } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { registerArabicFonts } from '@/lib/pdf/fonts';
import { BookingPdf, type PdfBookingData } from '@/lib/pdf/booking-pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);

    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, params.id), eq(bookings.agencyId, agencyId), isNull(bookings.deletedAt)));

    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });

    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
    if (!agency) return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });

    const data: PdfBookingData = {
      bookingNumber:     booking.bookingNumber,
      serviceType:       booking.serviceType,
      customTypeName:    booking.customTypeName ?? null,
      status:            booking.status,
      customerNameAr:    booking.customerNameAr ?? null,
      customerPhone:     booking.customerPhone  ?? null,
      totalPriceHalalas: booking.totalPriceHalalas,
      paidHalalas:       booking.paidHalalas,
      notes:             booking.notes ?? null,
      issueDate:         booking.createdAt.toISOString().slice(0, 10),
      agency: {
        nameAr:    agency.nameAr,
        vatNumber: agency.vatNumber ?? null,
        crNumber:  agency.crNumber  ?? null,
        addressAr: agency.addressAr ?? null,
        phone:     agency.phone     ?? null,
        logoUrl:   agency.logoUrl   ?? null,
      },
    };

    registerArabicFonts();

    const element = React.createElement(BookingPdf, { data }) as React.ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(element);
    const body = new Uint8Array(buffer);

    const filename = `booking-${booking.bookingNumber.replace(/[^A-Za-z0-9-]/g, '-')}.pdf`;

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
