import { NextResponse } from 'next/server';
import { eq, and, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, invoices, paymentPlans, paymentPlanInstallments } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_AGENT_UP, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { generateInstallmentSchedule } from '@/lib/payment-plans';

type RouteCtx = { params: { id: string } };

// ── GET — get active plan + installments for a booking ───────────────────────
export async function GET(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId } = await verifyAuth(req);
    const bookingId = params.id;

    const [booking] = await db.select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });

    const [plan] = await db.select()
      .from(paymentPlans)
      .where(and(
        eq(paymentPlans.bookingId, bookingId),
        eq(paymentPlans.agencyId, agencyId),
        eq(paymentPlans.status, 'active'),
      ))
      .limit(1);

    if (!plan) return NextResponse.json({ plan: null, installments: [] });

    const installments = await db.select()
      .from(paymentPlanInstallments)
      .where(and(
        eq(paymentPlanInstallments.planId, plan.id),
        eq(paymentPlanInstallments.agencyId, agencyId),
      ))
      .orderBy(paymentPlanInstallments.installmentNumber);

    return NextResponse.json({ plan, installments });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── POST — create a new payment plan ────────────────────────────────────────
export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { uid, agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const bookingId = params.id;

    const [booking] = await db.select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });
    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'لا يمكن إنشاء خطة أقساط لحجز ملغى' }, { status: 400 });
    }

    // Must have a live invoice
    const [invoice] = await db.select({ id: invoices.id, totalHalalas: invoices.totalHalalas, paidHalalas: invoices.paidHalalas })
      .from(invoices)
      .where(and(
        eq(invoices.bookingId, bookingId),
        eq(invoices.agencyId, agencyId),
        ne(invoices.status, 'cancelled'),
      ))
      .limit(1);
    if (!invoice) {
      return NextResponse.json({ error: 'يجب إصدار الفاتورة أولاً قبل إنشاء خطة الأقساط' }, { status: 400 });
    }

    const remainingHalalas = invoice.totalHalalas - invoice.paidHalalas;
    if (remainingHalalas <= 0) {
      return NextResponse.json({ error: 'الفاتورة مدفوعة بالكامل — لا حاجة لخطة أقساط' }, { status: 400 });
    }

    // One active plan per booking
    const [existingPlan] = await db.select({ id: paymentPlans.id })
      .from(paymentPlans)
      .where(and(
        eq(paymentPlans.bookingId, bookingId),
        eq(paymentPlans.agencyId, agencyId),
        eq(paymentPlans.status, 'active'),
      ))
      .limit(1);
    if (existingPlan) {
      return NextResponse.json({ error: 'يوجد بالفعل خطة أقساط نشطة لهذا الحجز' }, { status: 409 });
    }

    const body = await req.json() as Record<string, unknown>;
    const numInstallments = Number(body['numInstallments']);
    if (!Number.isInteger(numInstallments) || numInstallments < 2 || numInstallments > 24) {
      return NextResponse.json({ error: 'عدد الأقساط يجب أن يكون بين 2 و 24' }, { status: 400 });
    }

    const firstDueDate = (body['firstDueDate'] as string | undefined)?.trim();
    if (!firstDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)) {
      return NextResponse.json({ error: 'تاريخ أول قسط مطلوب بصيغة YYYY-MM-DD' }, { status: 400 });
    }
    const today = new Date().toISOString().split('T')[0]!;
    if (firstDueDate < today) {
      return NextResponse.json({ error: 'تاريخ أول قسط يجب أن يكون اليوم أو في المستقبل' }, { status: 400 });
    }

    const schedule = generateInstallmentSchedule(remainingHalalas, numInstallments, firstDueDate);
    const now    = new Date();
    const planId = crypto.randomUUID();

    const [plan] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(paymentPlans).values({
        id:                 planId,
        agencyId,
        bookingId,
        invoiceId:          invoice.id,
        totalAmountHalalas: remainingHalalas,
        numInstallments,
        notes:              (body['notes'] as string | undefined)?.trim() || null,
        status:             'active',
        createdBy:          uid,
        createdAt:          now,
        updatedAt:          now,
      }).returning();

      await tx.insert(paymentPlanInstallments).values(
        schedule.map((s) => ({
          id:                crypto.randomUUID(),
          agencyId,
          planId,
          bookingId,
          invoiceId:         invoice.id,
          installmentNumber: s.installmentNumber,
          dueDate:           s.dueDate,
          amountHalalas:     s.amountHalalas,
          status:            'pending' as const,
          createdAt:         now,
          updatedAt:         now,
        })),
      );

      return [created];
    });

    const installments = await db.select()
      .from(paymentPlanInstallments)
      .where(and(eq(paymentPlanInstallments.planId, planId), eq(paymentPlanInstallments.agencyId, agencyId)))
      .orderBy(paymentPlanInstallments.installmentNumber);

    return NextResponse.json({ plan, installments }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'payment_plan_create_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── DELETE — cancel the active plan ─────────────────────────────────────────
export async function DELETE(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const bookingId = params.id;

    const [plan] = await db.select({ id: paymentPlans.id })
      .from(paymentPlans)
      .where(and(
        eq(paymentPlans.bookingId, bookingId),
        eq(paymentPlans.agencyId, agencyId),
        eq(paymentPlans.status, 'active'),
      ))
      .limit(1);
    if (!plan) return NextResponse.json({ error: 'لا توجد خطة أقساط نشطة لهذا الحجز' }, { status: 404 });

    await db.update(paymentPlans)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(paymentPlans.id, plan.id), eq(paymentPlans.agencyId, agencyId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
