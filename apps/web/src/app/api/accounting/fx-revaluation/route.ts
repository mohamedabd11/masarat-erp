/**
 * POST /api/accounting/fx-revaluation
 *
 * IAS 21 Foreign Currency Revaluation.
 *
 * Revalues all foreign-currency monetary items (bank accounts, AR, AP)
 * to the current exchange rate as of the revaluation date.
 *
 * Creates journal entries for unrealised gains/losses:
 *   Gain: DR Bank/AR/AP / CR FX Gain (4500)
 *   Loss: DR FX Loss (5500) / CR Bank/AR/AP
 *
 * Idempotent per date — won't duplicate if re-run on the same date.
 *
 * Body: {
 *   revaluationDate: YYYY-MM-DD,
 *   dryRun?: boolean,
 *   // Admin supplies the rate at which each currency's balance was last valued
 *   // (booking rate). Required to compute the revaluation gain/loss because the
 *   // booking rate is not persisted on the account.
 *   previousRates?: { currency: string; previousRate: number }[],
 * }
 */
import { NextResponse } from 'next/server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, exchangeRates, journalEntries, journalLines, chartOfAccounts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { logAudit } from '@/lib/audit';
import { GL } from '@/lib/gl-accounts';

// Use the centralized FX accounts (4900 gain / 5900 loss) — single source of truth.
const FX_GAIN_CODE = GL.fxGain.code;  // 4900
const FX_LOSS_CODE = GL.fxLoss.code;  // 5900

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const body = await request.json() as {
      revaluationDate?: string;
      dryRun?: boolean;
      previousRates?: { currency: string; previousRate: number }[];
    };
    const revalDate = body.revaluationDate ?? new Date().toISOString().slice(0, 10);
    const dryRun    = body.dryRun === true;

    // Map of the booking rate (last valued rate) per currency, supplied by the admin.
    const prevRateMap = new Map<string, number>();
    for (const pr of body.previousRates ?? []) {
      if (pr && typeof pr.currency === 'string' && typeof pr.previousRate === 'number' && pr.previousRate > 0) {
        prevRateMap.set(pr.currency, pr.previousRate);
      }
    }

    // Idempotency check — skip if a revaluation entry already exists for this date
    if (!dryRun) {
      const [existing] = await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(
          eq(journalEntries.agencyId, agencyId),
          eq(journalEntries.source, 'fx_revaluation'),
          eq(journalEntries.date, revalDate),
        ))
        .limit(1);
      if (existing) {
        return NextResponse.json({
          message: `تم إعادة التقييم بالفعل في ${revalDate}`,
          alreadyDone: true,
        });
      }
    }

    // Fetch all non-SAR bank accounts
    const fxAccounts = await db
      .select()
      .from(bankAccounts)
      .where(and(
        eq(bankAccounts.agencyId, agencyId),
        ne(bankAccounts.currency, 'SAR'),
        eq(bankAccounts.isActive, true),
      ));

    if (fxAccounts.length === 0) {
      return NextResponse.json({ message: 'لا توجد حسابات بعملة أجنبية للتقييم', adjustments: [] });
    }

    // Collect currencies needed
    const currencies = [...new Set(fxAccounts.map(a => a.currency))];

    // Fetch latest exchange rates for these currencies (as of revalDate)
    const rateMap = new Map<string, number>();
    for (const ccy of currencies) {
      const [rateRow] = await db
        .select()
        .from(exchangeRates)
        .where(and(
          eq(exchangeRates.agencyId, agencyId),
          eq(exchangeRates.fromCurrency, ccy),
          eq(exchangeRates.toCurrency, 'SAR'),
          sql`${exchangeRates.effectiveDate} <= ${revalDate}`,
        ))
        .orderBy(sql`${exchangeRates.effectiveDate} desc`)
        .limit(1);

      if (rateRow) {
        // Rate is stored as rate × 10000
        rateMap.set(ccy, rateRow.rate / 10000);
      }
    }

    // Resolve each FX account's GL account code so the gain/loss posts against the
    // actual bank account rather than a hard-coded cash code.
    const glIds = [...new Set(fxAccounts.map(a => a.glAccountId).filter((x): x is string => !!x))];
    const glCodeById = new Map<string, { code: string; nameAr: string; nameEn: string | null }>();
    if (glIds.length > 0) {
      const glRows = await db
        .select({ id: chartOfAccounts.id, code: chartOfAccounts.code, nameAr: chartOfAccounts.nameAr, nameEn: chartOfAccounts.nameEn })
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.agencyId, agencyId));
      for (const r of glRows) glCodeById.set(r.id, { code: r.code, nameAr: r.nameAr, nameEn: r.nameEn });
    }

    const adjustments: {
      accountId:    string;
      accountName:  string;
      currency:     string;
      balanceFx:    number;
      oldRateSar:   number;
      newRateSar:   number;
      gainLossSar:  number;
      bankGlCode:   string;
      bankGlNameAr: string;
      bankGlNameEn: string;
    }[] = [];

    for (const acct of fxAccounts) {
      const newRate = rateMap.get(acct.currency);
      if (!newRate) continue;

      // The account balance in SAR (Halalas) was recorded at the booking rate.
      // The admin supplies that previousRate; without it we cannot revalue safely.
      const previousRate = prevRateMap.get(acct.currency);
      if (!previousRate || previousRate <= 0) continue;

      // balanceInForeignCurrency = currentBalanceHalalas / previousRate
      // gainLoss = (newRate - previousRate) × balanceInForeignCurrency
      const balanceFx = acct.currentBalanceHalalas / previousRate;
      const gainLoss  = Math.round(balanceFx * (newRate - previousRate));

      if (Math.abs(gainLoss) < 1) continue; // skip trivial rounding

      // Use the bank account's own GL code; fall back to 1100 (Cash) only if unmapped.
      const gl = acct.glAccountId ? glCodeById.get(acct.glAccountId) : undefined;
      const bankGlCode   = gl?.code ?? '1100';
      const bankGlNameAr = gl?.nameAr ?? acct.nameAr;
      const bankGlNameEn = gl?.nameEn ?? acct.nameEn ?? acct.nameAr;

      adjustments.push({
        accountId:   acct.id,
        accountName: acct.nameAr,
        currency:    acct.currency,
        balanceFx,
        oldRateSar:  previousRate,
        newRateSar:  newRate,
        gainLossSar: gainLoss,
        bankGlCode,
        bankGlNameAr,
        bankGlNameEn,
      });
    }

    if (adjustments.length === 0 || dryRun) {
      return NextResponse.json({ dryRun, revaluationDate: revalDate, adjustments });
    }

    // Create journal entries for each adjustment
    const createdEntries: string[] = [];

    for (const adj of adjustments) {
      const entryId     = crypto.randomUUID();
      const isGain      = adj.gainLossSar > 0;
      const absAmount   = Math.abs(adj.gainLossSar);

      await db.transaction(async tx => {
        // Block revaluation postings into a closed accounting period (inside tx
        // to avoid a TOCTOU window between the check and the posting).
        await assertPeriodOpen(agencyId, revalDate, tx);

        const entryNumber = await getNextJournalNumber(agencyId, new Date(revalDate).getFullYear(), tx);

        await tx.insert(journalEntries).values({
          id:              entryId,
          agencyId,
          entryNumber,
          date:            revalDate,
          descriptionAr:   `إعادة تقييم ${adj.currency} — ${adj.accountName}`,
          descriptionEn:   `FX Revaluation ${adj.currency} — ${adj.accountName}`,
          reference:       `FX-${revalDate}`,
          source:          'fx_revaluation',
          sourceId:        adj.accountId,
          isPosted:        true,
          totalDebitHalalas:  absAmount,
          totalCreditHalalas: absAmount,
          createdBy:       uid,
        });

        // Gain: DR Bank / CR FX Gain
        // Loss: DR FX Loss / CR Bank
        await tx.insert(journalLines).values([
          {
            id:             crypto.randomUUID(),
            entryId,
            agencyId,
            accountCode:    isGain ? adj.bankGlCode : FX_LOSS_CODE,
            accountNameAr:  isGain ? adj.bankGlNameAr : 'خسائر فروق العملة',
            accountNameEn:  isGain ? adj.bankGlNameEn  : 'FX Exchange Loss',
            debitHalalas:   absAmount,
            creditHalalas:  0,
            description:    `${adj.currency} revaluation ${revalDate}`,
            sortOrder:      1,
          },
          {
            id:             crypto.randomUUID(),
            entryId,
            agencyId,
            accountCode:    isGain ? FX_GAIN_CODE : adj.bankGlCode,
            accountNameAr:  isGain ? 'أرباح فروق العملة' : adj.bankGlNameAr,
            accountNameEn:  isGain ? 'FX Exchange Gain'   : adj.bankGlNameEn,
            debitHalalas:   0,
            creditHalalas:  absAmount,
            description:    `${adj.currency} revaluation ${revalDate}`,
            sortOrder:      2,
          },
        ]);

        // Update the bank account's current balance
        await tx.update(bankAccounts)
          .set({ currentBalanceHalalas: sql`${bankAccounts.currentBalanceHalalas} + ${adj.gainLossSar}` })
          .where(eq(bankAccounts.id, adj.accountId));
      });

      createdEntries.push(entryId);
    }

    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'fx_revaluation',
      resourceId: revalDate,
      after: { revaluationDate: revalDate, adjustmentCount: adjustments.length },
    });

    return NextResponse.json({
      success:         true,
      revaluationDate: revalDate,
      adjustments,
      journalEntryIds: createdEntries,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'fx_revaluation_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
