import { NextResponse } from 'next/server';
import { eq, asc, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chartOfAccounts, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { calculateHierarchyLevels, type CoaAccountType, type CoaHierarchyAccount } from '@/lib/coa-hierarchy';

const ACCOUNT_TYPES = new Set<CoaAccountType>(['asset', 'liability', 'equity', 'revenue', 'expense']);
const CODE_PATTERN = /^[\p{L}\p{N}._/-]{1,30}$/u;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'chart_of_accounts', db);
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
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'chart_of_accounts', db);
    const body = await request.json() as {
      code: string; nameAr: string; nameEn?: string; type: CoaAccountType;
      subType?: string | null; parentId?: string | null; allowDirectEntry?: boolean;
      openingBalanceHalalas?: number;
    };
    if (!body.code || !body.nameAr || !body.type) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }
    const code = body.code.trim();
    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json({ error: 'كود الحساب غير صالح' }, { status: 400 });
    }
    if (!ACCOUNT_TYPES.has(body.type)) {
      return NextResponse.json({ error: 'نوع الحساب غير صالح' }, { status: 400 });
    }
    const openingBalanceHalalas = body.openingBalanceHalalas ?? 0;
    if (!Number.isInteger(openingBalanceHalalas) || openingBalanceHalalas < 0) {
      return NextResponse.json({ error: 'الرصيد الافتتاحي غير صالح' }, { status: 400 });
    }
    const allowDirectEntry = body.allowDirectEntry ?? true;
    if (!allowDirectEntry && openingBalanceHalalas !== 0) {
      return NextResponse.json({ error: 'الحساب التجميعي لا يقبل رصيداً افتتاحياً مباشراً' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const existing = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.agencyId, agencyId));
    const proposed: CoaHierarchyAccount = {
      id,
      code,
      nameAr: body.nameAr.trim(),
      nameEn: body.nameEn?.trim() || null,
      type: body.type,
      parentId: body.parentId || null,
      level: 1,
      allowDirectEntry,
      isActive: true,
    };
    let level: number;
    try {
      level = calculateHierarchyLevels([...existing as CoaHierarchyAccount[], proposed]).get(id) ?? 1;
    } catch (hierarchyError) {
      throw new BusinessError((hierarchyError as Error).message, 400);
    }

    await db.insert(chartOfAccounts).values({
      id,
      agencyId,
      code,
      nameAr: proposed.nameAr,
      nameEn: proposed.nameEn,
      type: body.type,
      subType: body.subType?.trim() || null,
      parentId: proposed.parentId,
      level,
      allowDirectEntry: proposed.allowDirectEntry,
      openingBalanceHalalas,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if ((err as { code?: string }).code === '23505') return NextResponse.json({ error: 'كود الحساب مستخدم بالفعل' }, { status: 409 });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
