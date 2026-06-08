import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { GL } from '@/lib/gl-accounts';
import { assertPeriodOpen } from '@/lib/period-lock';
import { lookupFxRate, fxToHalalas } from '@/lib/fx';

// Map bank account type to default GL code
function glCodeForType(type: string): { code: string; ar: string; en: string } {
  if (type === 'cash' || type === 'petty_cash') return GL.cash;
  return GL.bank;
}

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const rows = await db.select().from(bankAccounts).where(eq(bankAccounts.agencyId, agencyId));
    return NextResponse.json({ accounts: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const body = await request.json() as {
      nameAr: string; nameEn?: string; type: string; accountNumber?: string;
      bankName?: string; iban?: string; openingBalanceHalalas?: number; currency?: string;
      // Foreign-currency opening (opt-in): balance in the account currency's minor
      // units + an optional rate (×10000). When omitted, the rate is looked up from
      // exchange_rates as of today.
      openingBalanceMinor?: number; fxRate?: number;
    };
    if (!body.nameAr || !body.type) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });

    const id       = crypto.randomUUID();
    const currency = (body.currency ?? 'SAR').toUpperCase();
    const isFx     = currency !== 'SAR' && body.openingBalanceMinor != null;

    let opening: number;                       // SAR halalas (drives the GL opening entry)
    let fxBalanceMinor: number | null = null;  // foreign minor units (FX accounts only)

    if (isFx) {
      const fxMinor = body.openingBalanceMinor!;
      if (!Number.isInteger(fxMinor) || fxMinor < 0) {
        return NextResponse.json({ error: 'الرصيد الافتتاحي بالعملة الأجنبية غير صالح' }, { status: 400 });
      }
      let storedRate = body.fxRate ?? null;
      if (storedRate == null) {
        const today = new Date().toISOString().split('T')[0]!;
        const r = await lookupFxRate(agencyId, currency, 'SAR', today, db);
        storedRate = r?.storedRate ?? null;
      }
      if (storedRate == null || !Number.isInteger(storedRate) || storedRate <= 0) {
        return NextResponse.json({ error: `سعر الصرف مطلوب لإنشاء حساب بعملة ${currency} — أضف سعر صرف للعملة أولاً أو مرّر fxRate` }, { status: 400 });
      }
      opening        = fxToHalalas(fxMinor, storedRate);
      fxBalanceMinor = fxMinor;
    } else {
      opening = body.openingBalanceHalalas ?? 0;
      if (!Number.isInteger(opening) || opening < 0) {
        return NextResponse.json({ error: 'الرصيد الافتتاحي غير صالح' }, { status: 400 });
      }
    }

    await db.transaction(async (tx) => {
      await tx.insert(bankAccounts).values({
        id, agencyId,
        nameAr: body.nameAr, nameEn: body.nameEn ?? null,
        type: body.type, accountNumber: body.accountNumber ?? null,
        bankName: body.bankName ?? null, iban: body.iban ?? null,
        openingBalanceHalalas: opening, currentBalanceHalalas: opening,
        currency,
        fxBalanceMinor,
      });

      // Post opening balance to GL (Dr bank/cash account, Cr Owner Capital 3100)
      if (opening > 0) {
        const now   = new Date();
        const year  = now.getFullYear();
        const today = now.toISOString().split('T')[0]!;
        await assertPeriodOpen(agencyId, today, tx);
        const jeId  = crypto.randomUUID();
        const jeNum = await getNextJournalNumber(agencyId, year, tx);
        const glAc  = glCodeForType(body.type);

        await tx.insert(journalEntries).values({
          id:                  jeId,
          agencyId,
          entryNumber:         jeNum,
          date:                today,
          descriptionAr:       `رصيد افتتاحي — ${body.nameAr}`,
          descriptionEn:       `Opening balance — ${body.nameEn ?? body.nameAr}`,
          source:              'manual',
          sourceId:            id,
          isPosted:            true,
          totalDebitHalalas:   opening,
          totalCreditHalalas:  opening,
          createdBy:           uid,
        });

        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: glAc.code,           accountNameAr: glAc.ar,              accountNameEn: glAc.en,              debitHalalas: opening, creditHalalas: 0,       sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.ownerCapital.code, accountNameAr: GL.ownerCapital.ar, accountNameEn: GL.ownerCapital.en, debitHalalas: 0,       creditHalalas: opening, sortOrder: 2 },
        ]);
      }
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'create_bank_account_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
