/**
 * POST /api/accounting/fx-revaluation
 *
 * IAS 21 Foreign Currency Revaluation.
 *
 * SCOPE (MED-2): currently revalues foreign-currency **bank/cash accounts** only
 * (those carrying an `fxBalanceMinor`). Revaluation of foreign-currency AR/AP
 * monetary balances is NOT yet implemented — it requires per-currency AR/AP
 * balances which the subledger does not track today. Do not assume AR/AP are
 * remeasured here.
 *
 * Creates journal entries for unrealised gains/losses on those bank/cash accounts:
 *   Gain: DR Bank/Cash / CR FX Gain (4900)
 *   Loss: DR FX Loss (5900) / CR Bank/Cash
 *
 * Idempotent per (account, date) — won't duplicate if re-run on the same date.
 *
 * Body: { revaluationDate: YYYY-MM-DD, dryRun?: boolean }
 */
import { NextResponse } from 'next/server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, exchangeRates, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { logAudit } from '@/lib/audit';
import { GL } from '@/lib/gl-accounts';

// Use the centralized FX accounts (4900 gain / 5900 loss) — single source of truth.
const FX_GAIN_CODE = GL.fxGain.code;  // 4900
const FX_LOSS_CODE = GL.fxLoss.code;  // 5900

// Thrown inside a per-account tx when a concurrent run already claimed the
// (agency, account, date) revaluation. Rolls the tx back (un-consuming the
// journal counter → no number gap) and is swallowed by the loop to skip the
// account rather than fail the whole request.
class FxAlreadyClaimed extends Error {}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const body = await request.json() as { revaluationDate?: string; dryRun?: boolean };
    const revalDate = body.revaluationDate ?? new Date().toISOString().slice(0, 10);
    const dryRun    = body.dryRun === true;

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

    const adjustments: {
      accountId:    string;
      accountName:  string;
      accountType:  string;
      currency:     string;
      balanceFx:    number;
      oldRateSar:   number;
      newRateSar:   number;
      gainLossSar:  number;
    }[] = [];

    for (const acct of fxAccounts) {
      // Only revalue accounts whose foreign-currency balance is actually tracked
      // (set when the account/its transactions are entered in their own currency).
      if (acct.fxBalanceMinor == null) continue;
      const newRate = rateMap.get(acct.currency);
      if (!newRate) continue;

      // Remeasure the foreign-currency balance at the current rate and compare to
      // the SAR carrying amount. fxBalanceMinor is in the currency's minor units;
      // newRate is SAR per 1 unit, so (units × rate) already yields halalas.
      const revaluedSar = Math.round(acct.fxBalanceMinor * newRate);
      const gainLoss    = revaluedSar - acct.currentBalanceHalalas;
      if (Math.abs(gainLoss) < 1) continue; // no material change

      adjustments.push({
        accountId:   acct.id,
        accountName: acct.nameAr,
        accountType: acct.type,
        currency:    acct.currency,
        balanceFx:   acct.fxBalanceMinor,
        oldRateSar:  acct.fxBalanceMinor !== 0 ? acct.currentBalanceHalalas / acct.fxBalanceMinor : 0,
        newRateSar:  newRate,
        gainLossSar: gainLoss,
      });
    }

    if (adjustments.length === 0 || dryRun) {
      return NextResponse.json({ dryRun, revaluationDate: revalDate, adjustments });
    }

    // Create journal entries for each adjustment
    const createdEntries: string[] = [];

    for (const adj of adjustments) {
      const isGain    = adj.gainLossSar > 0;
      const absAmount = Math.abs(adj.gainLossSar);
      const bankGl    = (adj.accountType === 'cash' || adj.accountType === 'petty_cash') ? GL.cash : GL.bank;
      const entryId   = crypto.randomUUID();

      try {
      await db.transaction(async tx => {
        // Period lock must be checked inside the transaction (with tx) so a
        // concurrent lock can't slip a posting into a just-closed period.
        await assertPeriodOpen(agencyId, revalDate, tx);
        const entryNumber = await getNextJournalNumber(agencyId, new Date(revalDate).getFullYear(), tx);

        // Atomically claim this (agency, account, date) revaluation via the partial
        // unique index journal_entries_fx_reval_uq. If a concurrent run already
        // posted it, 0 rows return → abort the tx so the journal counter consumed
        // above rolls back (no number gap) and the account is skipped (HIGH-7).
        const claimed = await tx.insert(journalEntries).values({
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
        }).onConflictDoNothing().returning({ id: journalEntries.id });
        if (claimed.length === 0) throw new FxAlreadyClaimed();

        // Gain: DR Bank / CR FX Gain
        // Loss: DR FX Loss / CR Bank
        await tx.insert(journalLines).values([
          {
            id:             crypto.randomUUID(),
            entryId,
            agencyId,
            accountCode:    isGain ? bankGl.code : FX_LOSS_CODE,
            accountNameAr:  isGain ? bankGl.ar   : 'خسائر فروق العملة',
            accountNameEn:  isGain ? bankGl.en   : 'FX Exchange Loss',
            debitHalalas:   absAmount,
            creditHalalas:  0,
            description:    `${adj.currency} revaluation ${revalDate}`,
            sortOrder:      1,
          },
          {
            id:             crypto.randomUUID(),
            entryId,
            agencyId,
            accountCode:    isGain ? FX_GAIN_CODE : bankGl.code,
            accountNameAr:  isGain ? 'أرباح فروق العملة' : bankGl.ar,
            accountNameEn:  isGain ? 'FX Exchange Gain'   : bankGl.en,
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
      } catch (txErr) {
        // Concurrent run already revalued this account/date — skip it, don't fail
        // the whole request (the counter increment rolled back with the tx).
        if (txErr instanceof FxAlreadyClaimed) continue;
        throw txErr;
      }
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
