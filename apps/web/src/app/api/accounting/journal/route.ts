import { NextResponse } from 'next/server';
import { eq, and, desc, gte, lte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { assertPeriodOpen } from '@/lib/period-lock';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { validateJournalLines } from '@/lib/journal-validation';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE     = 500;


export async function POST(request: Request) {
  try {
    const { agencyId, uid, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const rl = await checkRateLimit(`${agencyId}:${getClientIp(request)}`, 'financial');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'تجاوزت الحد المسموح به من الطلبات. حاول مرة أخرى بعد دقيقة.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }
    const body = await request.json() as {
      entryNumber: string;
      date: string;
      descriptionAr?: string;
      descriptionEn?: string;
      reference?: string | null;
      source?: string;
      sourceId?: string;
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

    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: 'التاريخ مطلوب بصيغة YYYY-MM-DD' }, { status: 400 });
    }

    // ── Core invariant: validate double-entry before any DB write ────────────
    // totals are computed from lines — client-supplied header totals are ignored.
    let computedDebit: number;
    let computedCredit: number;
    try {
      const totals = validateJournalLines(body.lines ?? []);
      computedDebit  = totals.totalDebit;
      computedCredit = totals.totalCredit;
    } catch (ve) {
      return NextResponse.json({ error: (ve as Error).message }, { status: 422 });
    }

    await assertPeriodOpen(agencyId, body.date, db);
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
      totalDebitHalalas:  computedDebit,
      totalCreditHalalas: computedCredit,
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
    console.error(JSON.stringify({ event: 'journal_create_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url       = new URL(request.url);
    const fromDate  = url.searchParams.get('from')  ?? undefined;
    const toDate    = url.searchParams.get('to')    ?? undefined;
    const withLines = url.searchParams.get('lines') === '1';
    const pageStr   = url.searchParams.get('page');
    const limitStr  = url.searchParams.get('limit');
    const page      = Math.max(1, parseInt(pageStr  ?? '1',   10) || 1);
    const pageSize  = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limitStr ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset    = (page - 1) * pageSize;

    const conditions = [eq(journalEntries.agencyId, agencyId)];
    if (fromDate) conditions.push(gte(journalEntries.date, fromDate));
    if (toDate)   conditions.push(lte(journalEntries.date, toDate));

    const entries = await db
      .select()
      .from(journalEntries)
      .where(and(...conditions))
      .orderBy(desc(journalEntries.date), desc(journalEntries.createdAt))
      .limit(pageSize)
      .offset(offset);

    if (!withLines) {
      return NextResponse.json({ entries, page, pageSize });
    }

    // Fetch lines for all entries in one query
    const entryIds = entries.map(e => e.id);
    if (entryIds.length === 0) return NextResponse.json({ entries: [] });

    const lines = await db
      .select()
      .from(journalLines)
      .where(and(eq(journalLines.agencyId, agencyId), inArray(journalLines.entryId, entryIds)));

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

    return NextResponse.json({ entries: result, page, pageSize });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
