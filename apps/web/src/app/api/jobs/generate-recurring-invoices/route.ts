import { NextResponse } from 'next/server';
import { generateDueRecurringInvoices } from '@/lib/recurring';
import { requireCronAuth } from '@/lib/cron-auth';

// Generates invoices for all recurring schedules whose nextIssueAt has arrived.
// Authorization: Bearer ${CRON_SECRET}
// CRON_SECRET is required in every environment — missing/invalid → 401 (fail closed)
//
// On Vercel Hobby (max 2 daily crons) this route is also invoked once per day from
// within the reconcile-pending-tickets cron, so it runs automatically without
// consuming a third cron slot. It remains directly callable for manual triggering
// or for a dedicated cron once the plan is upgraded.
export async function GET(request: Request) {
  const unauthorized = await requireCronAuth(request, 'generate-recurring-invoices');
  if (unauthorized) return unauthorized;

  try {
    const result = await generateDueRecurringInvoices(new Date());
    return NextResponse.json(result);
  } catch (err) {
    console.error(JSON.stringify({ event: 'recurring_invoices_cron_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
