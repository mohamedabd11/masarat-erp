import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chartOfAccounts, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import {
  calculateHierarchyLevels,
  descendantIds,
  type CoaAccountType,
  type CoaHierarchyAccount,
} from '@/lib/coa-hierarchy';

const ACCOUNT_TYPES = new Set<CoaAccountType>(['asset', 'liability', 'equity', 'revenue', 'expense']);
const CODE_PATTERN = /^[\p{L}\p{N}._/-]{1,30}$/u;

interface PatchBody {
  code?: string;
  nameAr?: string;
  nameEn?: string | null;
  type?: CoaAccountType;
  subType?: string | null;
  parentId?: string | null;
  allowDirectEntry?: boolean;
  openingBalanceHalalas?: number;
  isActive?: boolean;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'chart_of_accounts', db);

    const body = await request.json() as PatchBody;
    const accounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.agencyId, agencyId));
    const current = accounts.find(account => account.id === params.id);
    if (!current) throw new BusinessError('الحساب غير موجود', 404);

    const code = body.code?.trim() ?? current.code;
    const type = body.type ?? current.type as CoaAccountType;
    const nameAr = body.nameAr?.trim() ?? current.nameAr;
    const nameEn = body.nameEn === undefined ? current.nameEn : body.nameEn?.trim() || null;
    const parentId = body.parentId === undefined ? current.parentId : body.parentId || null;
    const allowDirectEntry = body.allowDirectEntry ?? current.allowDirectEntry;
    const openingBalanceHalalas = body.openingBalanceHalalas ?? current.openingBalanceHalalas;

    if (!nameAr || !CODE_PATTERN.test(code)) throw new BusinessError('الكود والاسم بالعربية مطلوبان', 400);
    if (!ACCOUNT_TYPES.has(type)) throw new BusinessError('نوع الحساب غير صالح', 400);
    if (!Number.isInteger(openingBalanceHalalas) || openingBalanceHalalas < 0) {
      throw new BusinessError('الرصيد الافتتاحي غير صالح', 400);
    }
    if (!allowDirectEntry && openingBalanceHalalas !== 0) {
      throw new BusinessError('الحساب التجميعي لا يقبل رصيداً افتتاحياً مباشراً', 400);
    }

    const [usedLine] = await db.select({ id: journalLines.id }).from(journalLines).where(and(
      eq(journalLines.agencyId, agencyId),
      eq(journalLines.accountCode, current.code),
    )).limit(1);
    if ((current.isSystem || usedLine) && code !== current.code) {
      throw new BusinessError('لا يمكن تغيير كود حساب نظامي أو مستخدم في قيود؛ يمكن تعديل اسمه وموقعه', 409);
    }
    if ((current.isSystem || usedLine) && type !== current.type) {
      throw new BusinessError('لا يمكن تغيير النوع الأساسي لحساب نظامي أو مستخدم؛ يمكن تعديل التصنيف الفرعي وموقعه', 409);
    }
    if (current.isSystem && !allowDirectEntry) {
      throw new BusinessError('حسابات النظام تستقبل القيود الآلية ولا يمكن تحويلها إلى حسابات تجميعية', 409);
    }
    if (current.isSystem && body.isActive === false) {
      throw new BusinessError('لا يمكن تعطيل حساب نظامي لأنه مطلوب للقيود الآلية', 409);
    }

    const descendants = descendantIds(accounts as CoaHierarchyAccount[], current.id);
    if (body.isActive === false && accounts.some(account => descendants.has(account.id) && account.isActive)) {
      throw new BusinessError('عطّل الحسابات الفرعية النشطة أولاً قبل تعطيل الحساب الأب', 409);
    }
    if (parentId === current.id || (parentId && descendants.has(parentId))) {
      throw new BusinessError('لا يمكن نقل الحساب داخل أحد فروعه', 400);
    }
    if (allowDirectEntry && descendants.size > 0) {
      throw new BusinessError('الحساب الذي تحته حسابات فرعية يجب أن يبقى حساباً تجميعياً', 400);
    }
    if (type !== current.type && descendants.size > 0) {
      throw new BusinessError('انقل الحسابات الفرعية أولاً قبل تغيير نوع الحساب', 409);
    }

    const proposedAccounts = accounts.map(account => account.id === current.id ? {
      ...account,
      code,
      nameAr,
      nameEn,
      type,
      parentId,
      allowDirectEntry,
      isActive: body.isActive ?? current.isActive,
    } : account) as CoaHierarchyAccount[];

    let levels: Map<string, number>;
    try {
      levels = calculateHierarchyLevels(proposedAccounts);
    } catch (hierarchyError) {
      throw new BusinessError((hierarchyError as Error).message, 400);
    }

    await db.transaction(async tx => {
      await tx.update(chartOfAccounts).set({
        code,
        nameAr,
        nameEn,
        type,
        subType: body.subType === undefined ? current.subType : body.subType?.trim() || null,
        parentId,
        level: levels.get(current.id) ?? 1,
        allowDirectEntry,
        openingBalanceHalalas,
        isActive: body.isActive ?? current.isActive,
        updatedAt: new Date(),
      }).where(and(eq(chartOfAccounts.id, current.id), eq(chartOfAccounts.agencyId, agencyId)));

      for (const descendantId of descendants) {
        const nextLevel = levels.get(descendantId);
        const old = accounts.find(account => account.id === descendantId);
        if (nextLevel === undefined || !old || nextLevel === old.level) continue;
        await tx.update(chartOfAccounts)
          .set({ level: nextLevel, updatedAt: new Date() })
          .where(and(eq(chartOfAccounts.id, descendantId), eq(chartOfAccounts.agencyId, agencyId)));
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if ((err as { code?: string }).code === '23505') return NextResponse.json({ error: 'كود الحساب مستخدم بالفعل' }, { status: 409 });
    console.error(JSON.stringify({ event: 'coa_update_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'chart_of_accounts', db);

    const accounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.agencyId, agencyId));
    const current = accounts.find(account => account.id === params.id);
    if (!current) throw new BusinessError('الحساب غير موجود', 404);
    if (current.isSystem) throw new BusinessError('الحساب النظامي لا يُحذف، لكن يمكن تعديل اسمه وتصنيفه وموقعه', 409);
    if (accounts.some(account => account.parentId === current.id)) {
      throw new BusinessError('لا يمكن حذف حساب يحتوي حسابات فرعية؛ انقلها أولاً', 409);
    }
    if (current.openingBalanceHalalas !== 0) {
      throw new BusinessError('لا يمكن حذف حساب له رصيد افتتاحي', 409);
    }
    const [usedLine] = await db.select({ id: journalLines.id }).from(journalLines).where(and(
      eq(journalLines.agencyId, agencyId),
      eq(journalLines.accountCode, current.code),
    )).limit(1);
    if (usedLine) throw new BusinessError('لا يمكن حذف حساب مستخدم في قيود سابقة', 409);

    await db.delete(chartOfAccounts).where(and(
      eq(chartOfAccounts.id, current.id),
      eq(chartOfAccounts.agencyId, agencyId),
    ));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'coa_delete_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
