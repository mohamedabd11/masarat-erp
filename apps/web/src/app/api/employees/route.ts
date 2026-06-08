import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { employees } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'employees', db);
    const rows = await db
      .select()
      .from(employees)
      .where(eq(employees.agencyId, agencyId))
      .orderBy(desc(employees.createdAt));
    return NextResponse.json({ employees: rows });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'employees', db);
    const body = await request.json() as {
      nameAr: string; nameEn?: string; employeeNumber?: string; department?: string;
      position?: string; hireDate?: string; salaryHalalas?: number;
      phone?: string; email?: string; nationalId?: string; iqamaNumber?: string;
      nationalityType?: 'saudi' | 'expat';
    };
    if (!body.nameAr) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
    const id = crypto.randomUUID();
    const empNum = body.employeeNumber ?? `EMP-${Date.now()}`;
    await db.insert(employees).values({
      id, agencyId, employeeNumber: empNum,
      nameAr: body.nameAr, nameEn: body.nameEn ?? null,
      department: body.department ?? null, position: body.position ?? null,
      hireDate: body.hireDate ?? null, salaryHalalas: body.salaryHalalas ?? 0,
      phone: body.phone ?? null, email: body.email ?? null,
      nationalId: body.nationalId ?? null, iqamaNumber: body.iqamaNumber ?? null,
      nationalityType: body.nationalityType ?? 'saudi',
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
