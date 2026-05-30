/**
 * POST /api/banking/reconcile
 *
 * Reconciles a bank account for a given statement period.
 *
 * Workflow:
 *   1. User fetches unreconciled transactions for the account (GET with query params).
 *   2. User ticks off which transactions appear on the bank statement.
 *   3. User submits the list with the statement closing balance.
 *   4. This endpoint marks the transactions reconciled and records the statement
 *      balance on the account for future discrepancy detection.
 *
 * GET  /api/banking/reconcile?accountId=&from=&to=
 *   → returns unreconciled + recently-reconciled transactions for the period
 *
 * POST /api/banking/reconcile
 *   body: { bankAccountId, statementDate, statementBalanceHalalas, transactionIds[] }
 *   → marks transactions reconciled, updates account.reconciledBalance
 */
import { NextResponse } from 'next/server';
import { eq, and, inArray, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, bankTransactions } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

// ─── GET: list transactions eligible for reconciliation ──────────────────────

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const from      = searchParams.get('from');  // YYYY-MM-DD
    const to        = searchParams.get('to');    // YYYY-MM-DD

    if (!accountId) {
      return NextResponse.json({ error: 'accountId مطلوب' }, { status: 400 });
    }

    // Verify account belongs to agency
    const [account] = await db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.agencyId, agencyId)));
    if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

    // Build date filter
    const conditions = [
      eq(bankTransactions.bankAccountId, accountId),
      eq(bankTransactions.agencyId, agencyId),
    ];
    if (from) conditions.push(gte(bankTransactions.date, from));
    if (to)   conditions.push(lte(bankTransactions.date, to));

    const txs = await db.select().from(bankTransactions)
      .where(and(...conditions))
      .orderBy(bankTransactions.date);

    const unreconciledSum = txs
      .filter(t => !t.isReconciled)
      .reduce((s, t) => {
        const sign = ['deposit', 'transfer_in', 'payment_received'].includes(t.type) ? 1 : -1;
        return s + sign * t.amountHalalas;
      }, 0);

    return NextResponse.json({
      account: {
        id:                     account.id,
        nameAr:                 account.nameAr,
        currentBalanceHalalas:  account.currentBalanceHalalas,
        reconciledAt:           account.reconciledAt,
        reconciledBalanceHalalas: account.reconciledBalanceHalalas,
      },
      transactions: txs,
      unreconciledSum,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ─── POST: submit reconciliation ─────────────────────────────────────────────

interface ReconcileBody {
  bankAccountId:            string;
  statementDate:            string;   // YYYY-MM-DD — closing date on bank statement
  statementBalanceHalalas:  number;   // closing balance as shown on the statement
  transactionIds:           string[]; // IDs the user confirmed match the statement
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const body = await request.json() as ReconcileBody;
    const { bankAccountId, statementDate, statementBalanceHalalas, transactionIds } = body;

    if (!bankAccountId || !statementDate || statementBalanceHalalas == null) {
      return NextResponse.json({ error: 'بيانات ناقصة: bankAccountId, statementDate, statementBalanceHalalas مطلوبة' }, { status: 400 });
    }
    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return NextResponse.json({ error: 'transactionIds يجب أن تحتوي على معرّف واحد على الأقل' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      // Verify account ownership
      const [account] = await tx.select().from(bankAccounts)
        .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.agencyId, agencyId)));
      if (!account) throw new BusinessError('الحساب البنكي غير موجود', 404);

      const now = new Date();

      // Verify all transaction IDs belong to this account and agency
      const rows = await tx.select({ id: bankTransactions.id })
        .from(bankTransactions)
        .where(and(
          inArray(bankTransactions.id, transactionIds),
          eq(bankTransactions.bankAccountId, bankAccountId),
          eq(bankTransactions.agencyId, agencyId),
        ));

      const validIds = rows.map(r => r.id);
      if (validIds.length !== transactionIds.length) {
        throw new BusinessError(`${transactionIds.length - validIds.length} معرّفات حركة غير صالحة`, 400);
      }

      // Mark transactions as reconciled
      await tx.update(bankTransactions)
        .set({ isReconciled: true, reconciledAt: now, reconciledBy: uid })
        .where(inArray(bankTransactions.id, validIds));

      // Update account's reconciled snapshot
      await tx.update(bankAccounts)
        .set({
          reconciledAt:             now,
          reconciledBalanceHalalas: statementBalanceHalalas,
          updatedAt:                now,
        })
        .where(eq(bankAccounts.id, bankAccountId));

      const discrepancy = account.currentBalanceHalalas - statementBalanceHalalas;

      return { reconciledCount: validIds.length, discrepancyHalalas: discrepancy };
    });

    await logAudit({
      agencyId, userId: uid, action: 'update', resource: 'bank_account', resourceId: bankAccountId,
      after: {
        action:            'reconcile',
        statementDate,
        statementBalance:  statementBalanceHalalas,
        reconciledCount:   result.reconciledCount,
        discrepancy:       result.discrepancyHalalas,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'banking_reconcile_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
