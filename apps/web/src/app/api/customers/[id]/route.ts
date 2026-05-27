import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { customers } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);
    const { id } = params;

    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)));

    if (!customer) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ customer });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);
    const { id } = params;

    const body = await request.json() as Partial<{
      nameAr: string; nameEn: string; phone: string; email: string;
      nationality: string; nationalId: string; passportNumber: string;
      dateOfBirth: string; notes: string; isActive: boolean;
    }>;

    const [existing] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)));

    if (!existing) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });
    }

    const [updated] = await db
      .update(customers)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)))
      .returning();

    return NextResponse.json({ success: true, customer: updated });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);
    const { id } = params;

    const [existing] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)));

    if (!existing) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });
    }

    await db
      .delete(customers)
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
