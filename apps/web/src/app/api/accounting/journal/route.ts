import { NextResponse } from 'next/server';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    const { agencyId, uid } = await verifyAuth(request);
    const body = await request.json() as {
      entryNumber: string;
      date: string;
      descriptionAr?: string;
      descriptionEn?: string;
      reference?: string | null;
      source?: string;
      sourceId?: string;
      totalDebitHalalas: number;
      totalCreditHalalas: number;
      isPosted?: boolean;
      lines: Array<{
        accountCode: string;
        accountNameAr: string;
        accountNameEn?: string;
        debitHalalas: number;
        creditHalalas: number;
        memo?: string;
      }>;
    };
    const id = crypto.randomUUID();
    await db.insert(journalEntries).values({
      id,
      agencyId,
      entryNumber:        body.entryNumber,
      date:               body.date,
      descriptionAr:      body.descriptionAr ?? null,
      descriptionEn:      body.descriptionEn ?? null,
      reference:          body.reference ?? null,
      source:             body.source ?? 'manual',
      sourceId:           body.sourceId ?? null,
      isPosted:           body.isPosted ?? true,
      totalDebitHalalas:  body.totalDebitHalalas,
      totalCreditHalalas: body.totalCreditHalalas,
      createdBy:          uid,
    });
    if (body.lines?.length) {
      await db.insert(journalLines).values(
        body.lines.map((l, idx) => ({
          id:            crypto.randomUUID(),
          entryId:       id,
          agencyId,
          accountCode:   l.accountCode,
          accountNameAr: l.accountNameAr,
          accountNameEn: l.accountNameEn ?? l.accountNameAr,
          debitHalalas:  l.debitHalalas,
          creditHalalas: l.creditHalalas,
          description:   l.memo ?? null,
          sortOrder:     idx,
        })),
      );
    }
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url       = new URL(request.url);
    const fromDate  = url.searchParams.get('from') ?? undefined;
    const toDate    = url.searchParams.get('to')   ?? undefined;
    const withLines = url.searchParams.get('lines') === '1';

    const conditions = [eq(journalEntries.agencyId, agencyId)];
    if (fromDate) conditions.push(gte(journalEntries.date, fromDate));
    if (toDate)   conditions.push(lte(journalEntries.date, toDate));

    const entries = await db
      .select()
      .from(journalEntries)
      .where(and(...conditions))
      .orderBy(desc(journalEntries.date), desc(journalEntries.createdAt));

    if (!withLines) {
      return NextResponse.json({ entries });
    }

    // Fetch lines for all entries in one query
    const entryIds = entries.map(e => e.id);
    if (entryIds.length === 0) return NextResponse.json({ entries: [] });

    const lines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.agencyId, agencyId));

    const linesMap = new Map<string, typeof lines>();
    for (const l of lines) {
      const arr = linesMap.get(l.entryId) ?? [];
      arr.push(l);
      linesMap.set(l.entryId, arr);
    }

    const result = entries.map(e => ({
      ...e,
      lines: (linesMap.get(e.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    return NextResponse.json({ entries: result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
