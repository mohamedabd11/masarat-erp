import { NextResponse } from 'next/server';
import { and, eq, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { departments, employees } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { isIsoDate, isNonNegativeInteger } from '@/lib/hr-validation';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'employees', db);
    const url      = new URL(request.url);
    const page     = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset   = (page - 1) * pageSize;

    const [{ total }] = await db.select({ total: count(employees.id) })
      .from(employees).where(eq(employees.agencyId, agencyId));

    const rows = await db
      .select()
      .from(employees)
      .where(eq(employees.agencyId, agencyId))
      .orderBy(desc(employees.createdAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      employees: rows,
      pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) },
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'employees', db);
    const body = await request.json() as {
      nameAr: string; nameEn?: string; employeeNumber?: string; department?: string;
      departmentId?: string;
      position?: string; hireDate?: string; salaryHalalas?: number;
      phone?: string; email?: string; nationalId?: string; iqamaNumber?: string;
      nationalityType: 'saudi' | 'expat';
      gosiScheme?: 'legacy' | 'new' | 'expat' | 'exempt';
      gosiEnrollmentDate?: string;
      sanedApplicable?: boolean;
    };
    const nameAr = body.nameAr?.trim();
    if (!nameAr) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
    if (nameAr.length > 200) return NextResponse.json({ error: 'الاسم طويل جداً' }, { status: 400 });
    if (!body.nationalityType || !['saudi', 'expat'].includes(body.nationalityType)) {
      return NextResponse.json({ error: 'nationality_type مطلوب ويجب أن يكون saudi أو expat' }, { status: 400 });
    }
    if (body.hireDate && !isIsoDate(body.hireDate)) {
      return NextResponse.json({ error: 'تاريخ التعيين غير صالح' }, { status: 400 });
    }
    if (body.salaryHalalas !== undefined && !isNonNegativeInteger(body.salaryHalalas)) {
      return NextResponse.json({ error: 'الراتب يجب أن يكون مبلغاً صحيحاً غير سالب' }, { status: 400 });
    }
    if (body.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return NextResponse.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 });
    }
    if (body.gosiEnrollmentDate && !isIsoDate(body.gosiEnrollmentDate)) {
      return NextResponse.json({ error: 'تاريخ بدء التأمينات غير صالح' }, { status: 400 });
    }
    const gosiScheme = body.nationalityType === 'expat' ? 'expat' : (body.gosiScheme ?? 'legacy');
    if (body.nationalityType === 'saudi' && !['legacy', 'new', 'exempt'].includes(gosiScheme)) {
      return NextResponse.json({ error: 'نظام التأمينات للموظف السعودي غير صالح' }, { status: 400 });
    }
    const insuranceStart = body.gosiEnrollmentDate || body.hireDate;
    if (gosiScheme === 'new' && insuranceStart && insuranceStart < '2024-07-03') {
      return NextResponse.json({ error: 'النظام الجديد يطبق على من يبدأ اشتراكه دون مدد سابقة من 3 يوليو 2024' }, { status: 422 });
    }
    if (body.sanedApplicable !== undefined && typeof body.sanedApplicable !== 'boolean') {
      return NextResponse.json({ error: 'حالة شمول ساند غير صالحة' }, { status: 400 });
    }
    let departmentCode = body.department?.trim() || null;
    if (body.departmentId) {
      const [department] = await db.select({ code: departments.code }).from(departments)
        .where(and(eq(departments.id, body.departmentId), eq(departments.agencyId, agencyId), eq(departments.isActive, true)))
        .limit(1);
      if (!department) return NextResponse.json({ error: 'القسم غير موجود أو غير نشط' }, { status: 422 });
      departmentCode = department.code;
    }
    const id = crypto.randomUUID();
    const empNum = body.employeeNumber?.trim() || `EMP-${Date.now()}`;
    if (empNum.length > 64) return NextResponse.json({ error: 'رقم الموظف طويل جداً' }, { status: 400 });
    await db.insert(employees).values({
      id, agencyId, employeeNumber: empNum,
      nameAr, nameEn: body.nameEn?.trim() || null,
      departmentId: body.departmentId || null, department: departmentCode, position: body.position?.trim() || null,
      hireDate: body.hireDate || null, salaryHalalas: body.salaryHalalas ?? 0,
      phone: body.phone?.trim() || null, email: body.email?.trim() || null,
      nationalId: body.nationalId?.trim() || null, iqamaNumber: body.iqamaNumber?.trim() || null,
      nationalityType: body.nationalityType,
      gosiScheme,
      gosiEnrollmentDate: body.gosiEnrollmentDate || null,
      sanedApplicable: body.nationalityType === 'expat' || gosiScheme === 'exempt' ? false : (body.sanedApplicable ?? true),
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'رقم الموظف مستخدم مسبقاً' }, { status: 409 });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
