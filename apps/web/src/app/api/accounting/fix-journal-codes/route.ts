import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

// Fixes wrong expense account codes inserted by the old supplier-payments handler.
// Safe to re-run: if already fixed, 0 rows will be updated.
export async function POST(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
    }

    const result = await db.transaction(async (tx) => {
      // Case 1: accountCode='5900' (non-existent "other") → '5400' Operating Expenses
      const r1 = await tx
        .update(journalLines)
        .set({ accountCode: '5400', accountNameAr: 'المصاريف التشغيلية', accountNameEn: 'Operating Expenses' })
        .where(and(eq(journalLines.agencyId, agencyId), eq(journalLines.accountCode, '5900')));

      // Case 2: accountCode='5100' but name says 'المصاريف التشغيلية' (was operational/office wrongly) → '5400'
      const r2 = await tx
        .update(journalLines)
        .set({ accountCode: '5400' })
        .where(and(
          eq(journalLines.agencyId, agencyId),
          eq(journalLines.accountCode, '5100'),
          eq(journalLines.accountNameAr, 'المصاريف التشغيلية'),
        ));

      // Case 3: accountCode='5200' but name says 'الرواتب والأجور' (salaries wrongly placed at rent code) → '5100'
      const r3 = await tx
        .update(journalLines)
        .set({ accountCode: '5100' })
        .where(and(
          eq(journalLines.agencyId, agencyId),
          eq(journalLines.accountCode, '5200'),
          eq(journalLines.accountNameAr, 'الرواتب والأجور'),
        ));

      return {
        fixed5900to5400: r1.rowCount ?? 0,
        fixed5100to5400: r2.rowCount ?? 0,
        fixed5200to5100: r3.rowCount ?? 0,
      };
    });

    const total = result.fixed5900to5400 + result.fixed5100to5400 + result.fixed5200to5100;
    console.log(JSON.stringify({ event: 'fix_journal_codes', agencyId, ...result, total }));
    return NextResponse.json({ success: true, ...result, total });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'fix_journal_codes_failed', error: String(err) }));
    return NextResponse.json({ error: err instanceof Error ? err.message : 'خطأ في الخادم' }, { status: 500 });
  }
}
