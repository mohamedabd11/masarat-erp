import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cheques, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';

const AC_RECEIVABLE      = { code: '1120', ar: 'ذمم مدينة - عملاء',  en: 'Accounts Receivable' };
const AC_CHEQUES_RCV     = { code: '1125', ar: 'أوراق قبض - شيكات',  en: 'Cheques Receivable'  };
const AC_PAYABLE         = { code: '2000', ar: 'ذمم دائنة - موردون', en: 'Accounts Payable'     };
const AC_BANK            = { code: '1110', ar: 'البنك',               en: 'Bank'                };

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const rows = await db
      .select()
      .from(cheques)
      .where(eq(cheques.agencyId, agencyId))
      .orderBy(desc(cheques.createdAt));
    return NextResponse.json({ cheques: rows });
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
      chequeNumber: string; bankName?: string; amountHalalas: number;
      type: string; status?: string; issueDate?: string; dueDate?: string;
      payerName?: string; payeeName?: string; notes?: string;
    };
    if (!body.chequeNumber) return NextResponse.json({ error: 'رقم الشيك مطلوب' }, { status: 400 });
    if (!body.amountHalalas) return NextResponse.json({ error: 'المبلغ مطلوب' }, { status: 400 });
    if (!Number.isInteger(body.amountHalalas) || body.amountHalalas <= 0) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 });
    }

    const chequeType = body.type ?? 'incoming';
    const id = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(cheques).values({
        id,
        agencyId,
        chequeNumber: body.chequeNumber,
        bankName:     body.bankName ?? null,
        amountHalalas: body.amountHalalas,
        type:         chequeType,
        status:       body.status ?? 'pending',
        issueDate:    body.issueDate ?? null,
        dueDate:      body.dueDate  ?? null,
        payerName:    body.payerName  ?? null,
        payeeName:    body.payeeName  ?? null,
        notes:        body.notes ?? null,
      });

      // Journal entry only for incoming cheques (Dr Cheques Receivable / Cr Accounts Receivable)
      if (chequeType === 'incoming') {
        const now    = new Date();
        const year   = now.getFullYear();
        const today  = now.toISOString().split('T')[0]!;
        const jeId   = crypto.randomUUID();
        const jeNum  = await getNextJournalNumber(agencyId, year, tx);

        await tx.insert(journalEntries).values({
          id:                  jeId,
          agencyId,
          entryNumber:         jeNum,
          date:                today,
          descriptionAr:       `استلام شيك ${body.chequeNumber} - ${body.payerName ?? ''}`,
          descriptionEn:       `Cheque received ${body.chequeNumber}`,
          source:              'cheque',
          sourceId:            id,
          isPosted:            true,
          totalDebitHalalas:   body.amountHalalas,
          totalCreditHalalas:  body.amountHalalas,
          createdBy:           uid,
        });

        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_CHEQUES_RCV.code, accountNameAr: AC_CHEQUES_RCV.ar, accountNameEn: AC_CHEQUES_RCV.en, debitHalalas: body.amountHalalas, creditHalalas: 0,                    sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_RECEIVABLE.code,  accountNameAr: AC_RECEIVABLE.ar,  accountNameEn: AC_RECEIVABLE.en,  debitHalalas: 0,                   creditHalalas: body.amountHalalas, sortOrder: 2 },
        ]);
      }

      // Outgoing cheque: Dr Accounts Payable / Cr Bank (written but not yet cleared)
      if (chequeType === 'outgoing') {
        const now    = new Date();
        const year   = now.getFullYear();
        const today  = now.toISOString().split('T')[0]!;
        const jeId   = crypto.randomUUID();
        const jeNum  = await getNextJournalNumber(agencyId, year, tx);

        await tx.insert(journalEntries).values({
          id:                  jeId,
          agencyId,
          entryNumber:         jeNum,
          date:                today,
          descriptionAr:       `إصدار شيك ${body.chequeNumber} - ${body.payeeName ?? ''}`,
          descriptionEn:       `Cheque issued ${body.chequeNumber}`,
          source:              'cheque',
          sourceId:            id,
          isPosted:            true,
          totalDebitHalalas:   body.amountHalalas,
          totalCreditHalalas:  body.amountHalalas,
          createdBy:           uid,
        });

        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_PAYABLE.code, accountNameAr: AC_PAYABLE.ar, accountNameEn: AC_PAYABLE.en, debitHalalas: body.amountHalalas, creditHalalas: 0,                    sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_BANK.code,    accountNameAr: AC_BANK.ar,    accountNameEn: AC_BANK.en,    debitHalalas: 0,                   creditHalalas: body.amountHalalas, sortOrder: 2 },
        ]);
      }
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'create_cheque_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
