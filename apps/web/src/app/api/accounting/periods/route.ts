/**
 * GET  /api/accounting/periods          — list all periods for the agency
 * POST /api/accounting/periods          — lock or unlock a period
 *   body: { year, month, isLocked, notes? }
 *
 * When December is locked, a year-end closing entry is automatically created
 * (idempotent — won't duplicate if December is re-locked).
 * The closing entry zeros all revenue (4xxx) and expense (5xxx) account
 * balances for the year and transfers the net income/loss to Retained
 * Earnings (3200).
 */
import { NextResponse } from 'next/server';
import { eq, and, ne, desc, sql, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accountingPeriods, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import type { Tx } from '@/lib/db';

// ── Account constants ──────────────────────────────────────────────────────────

const RE = { code: '3200', ar: 'الأرباح المحتجزة', en: 'Retained Earnings' };

// ── Year-end closing entry ────────────────────────────────────────────────────

async function createYearEndClosingEntry(
  agencyId: string,
  uid:      string,
  year:     number,
  tx:       Tx,
): Promise<void> {
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  // Idempotency: skip if a closing entry already exists for this year
  const [existing] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.agencyId, agencyId),
      eq(journalEntries.source, 'closing'),
      sql`${journalEntries.date} >= ${yearStart}`,
      sql`${journalEntries.date} <= ${yearEnd}`,
    ))
    .limit(1);

  if (existing) return;

  // Aggregate all posted P&L lines for the year (excluding prior closing entries)
  const plRows = await tx
    .select({
      accountCode:   journalLines.accountCode,
      accountNameAr: journalLines.accountNameAr,
      accountNameEn: journalLines.accountNameEn,
      totalDebit:    sql<number>`cast(sum(${journalLines.debitHalalas})  as bigint)`,
      totalCredit:   sql<number>`cast(sum(${journalLines.creditHalalas}) as bigint)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(
      eq(journalLines.agencyId, agencyId),
      eq(journalEntries.isPosted, true),
      ne(journalEntries.source, 'closing'),
      sql`${journalEntries.date} >= ${yearStart}`,
      sql`${journalEntries.date} <= ${yearEnd}`,
      sql`(${journalLines.accountCode} LIKE '4%' OR ${journalLines.accountCode} LIKE '5%')`,
    ))
    .groupBy(
      journalLines.accountCode,
      journalLines.accountNameAr,
      journalLines.accountNameEn,
    );

  type JLine = { code: string; ar: string; en: string; dr: number; cr: number };
  const jLines: JLine[] = [];
  let netIncome = 0;

  for (const row of plRows) {
    const debit  = Number(row.totalDebit)  || 0;
    const credit = Number(row.totalCredit) || 0;
    const code   = row.accountCode ?? '';
    const ar     = row.accountNameAr ?? code;
    const en     = row.accountNameEn ?? '';

    if (code.startsWith('4')) {
      // Revenue: normal credit balance → Dr to zero it out
      const netCredit = credit - debit;
      if (netCredit > 0) { jLines.push({ code, ar, en, dr: netCredit, cr: 0 }); netIncome += netCredit; }
      else if (netCredit < 0) { jLines.push({ code, ar, en, dr: 0, cr: -netCredit }); netIncome += netCredit; }
    } else if (code.startsWith('5')) {
      // Expense: normal debit balance → Cr to zero it out
      const netDebit = debit - credit;
      if (netDebit > 0) { jLines.push({ code, ar, en, dr: 0, cr: netDebit }); netIncome -= netDebit; }
      else if (netDebit < 0) { jLines.push({ code, ar, en, dr: -netDebit, cr: 0 }); netIncome -= netDebit; }
    }
  }

  if (jLines.length === 0 && netIncome === 0) return; // Nothing to close

  // Transfer net to Retained Earnings
  if (netIncome > 0) {
    jLines.push({ ...RE, dr: 0, cr: netIncome });
  } else if (netIncome < 0) {
    jLines.push({ ...RE, dr: -netIncome, cr: 0 });
  }

  const jeId     = crypto.randomUUID();
  const jeNumber = await getNextJournalNumber(agencyId, year, tx);

  await tx.insert(journalEntries).values({
    id:                 jeId,
    agencyId,
    entryNumber:        jeNumber,
    date:               yearEnd,
    descriptionAr:      `قيد إقفال السنة المالية ${year}`,
    descriptionEn:      `Year-End Closing Entry ${year}`,
    source:             'closing',
    isPosted:           true,
    totalDebitHalalas:  jLines.reduce((s, l) => s + l.dr, 0),
    totalCreditHalalas: jLines.reduce((s, l) => s + l.cr, 0),
    createdBy:          uid,
  });

  for (let i = 0; i < jLines.length; i++) {
    const l = jLines[i]!;
    await tx.insert(journalLines).values({
      id:            crypto.randomUUID(),
      entryId:       jeId,
      agencyId,
      accountCode:   l.code,
      accountNameAr: l.ar,
      accountNameEn: l.en,
      debitHalalas:  l.dr,
      creditHalalas: l.cr,
      sortOrder:     i + 1,
    });
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    await requireFeature(agencyId, 'accounting', db);

    const periods = await db.select().from(accountingPeriods)
      .where(eq(accountingPeriods.agencyId, agencyId))
      .orderBy(desc(accountingPeriods.periodYear), desc(accountingPeriods.periodMonth));

    return NextResponse.json({ periods });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    await requireFeature(agencyId, 'accounting', db);

    const body = await request.json() as {
      year:     number;
      month:    number;
      isLocked: boolean;
      notes?:   string;
    };

    if (!body.year || !body.month || body.isLocked == null) {
      return NextResponse.json({ error: 'year, month, isLocked مطلوبة' }, { status: 400 });
    }
    if (body.month < 1 || body.month > 12) {
      return NextResponse.json({ error: 'month يجب أن يكون بين 1 و 12' }, { status: 400 });
    }

    const now      = new Date();
    const periodId = crypto.randomUUID();

    await db.transaction(async (tx: Tx) => {
      await tx.insert(accountingPeriods)
        .values({
          id:          periodId,
          agencyId,
          periodYear:  body.year,
          periodMonth: body.month,
          isLocked:    body.isLocked,
          lockedAt:    body.isLocked ? now : null,
          lockedBy:    body.isLocked ? uid : null,
          notes:       body.notes ?? null,
          createdAt:   now,
          updatedAt:   now,
        })
        .onConflictDoUpdate({
          target: [accountingPeriods.agencyId, accountingPeriods.periodYear, accountingPeriods.periodMonth],
          set: {
            isLocked:  body.isLocked,
            lockedAt:  body.isLocked ? now : null,
            lockedBy:  body.isLocked ? uid : null,
            notes:     body.notes ?? null,
            updatedAt: now,
          },
        });

      // SM-03: When December is UNLOCKED, delete the existing year-end closing entry
      // so it will be fully recomputed (with current data) when December is re-locked.
      if (!body.isLocked && body.month === 12) {
        const yearStart = `${body.year}-01-01`;
        const yearEnd   = `${body.year}-12-31`;
        const closingEntries = await tx
          .select({ id: journalEntries.id })
          .from(journalEntries)
          .where(and(
            eq(journalEntries.agencyId, agencyId),
            eq(journalEntries.source, 'closing'),
            gte(journalEntries.date, yearStart),
            lte(journalEntries.date, yearEnd),
          ));
        for (const entry of closingEntries) {
          await tx.delete(journalLines).where(eq(journalLines.entryId, entry.id));
          await tx.delete(journalEntries).where(eq(journalEntries.id, entry.id));
        }
      }

      // Year-end closing: automatically create the closing entry when December is locked
      if (body.isLocked && body.month === 12) {
        await createYearEndClosingEntry(agencyId, uid, body.year, tx);
      }
    });

    const action = body.isLocked ? 'lock_period' : 'unlock_period';
    await logAudit({
      agencyId, userId: uid, action: 'update', resource: 'accounting_period',
      resourceId: `${body.year}-${String(body.month).padStart(2, '0')}`,
      after: { action, year: body.year, month: body.month, notes: body.notes },
    });

    const label = `${body.year}/${String(body.month).padStart(2, '0')}`;
    return NextResponse.json({
      success: true,
      message: body.isLocked ? `الفترة ${label} مقفلة` : `الفترة ${label} مفتوحة`,
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'accounting_periods_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
