import { NextResponse } from 'next/server';
import { eq, asc, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chartOfAccounts, journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [rows, balances] = await Promise.all([
      db.select().from(chartOfAccounts).where(eq(chartOfAccounts.agencyId, agencyId)).orderBy(asc(chartOfAccounts.code)),
      db.select({
        accountCode: journalLines.accountCode,
        debitTotal:  sum(journalLines.debitHalalas),
        creditTotal: sum(journalLines.creditHalalas),
      }).from(journalLines).where(eq(journalLines.agencyId, agencyId)).groupBy(journalLines.accountCode),
    ]);

    const balanceMap = new Map(balances.map(b => [b.accountCode, { debitTotal: Number(b.debitTotal ?? 0), creditTotal: Number(b.creditTotal ?? 0) }]));
    const debitNormal = new Set(['asset', 'expense']);

    const accounts = rows.map(acc => {
      const bal      = balanceMap.get(acc.code) ?? { debitTotal: 0, creditTotal: 0 };
      const side     = debitNormal.has(acc.type) ? 'debit' : 'credit';
      const balance  = side === 'debit' ? bal.debitTotal - bal.creditTotal : bal.creditTotal - bal.debitTotal;
      return { ...acc, side, debitTotal: bal.debitTotal, creditTotal: bal.creditTotal, balanceHalalas: balance + acc.openingBalanceHalalas };
    });

    return NextResponse.json({ accounts });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      code: string; nameAr: string; nameEn?: string; type: string;
    };
    if (!body.code || !body.nameAr || !body.type) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await db.insert(chartOfAccounts).values({
      id, agencyId, code: body.code.trim(), nameAr: body.nameAr, nameEn: body.nameEn ?? null,
      type: body.type, level: 1,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
