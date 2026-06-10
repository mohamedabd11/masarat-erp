import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies, users } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { encrypt } from '@/lib/crypto';

export async function GET(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);

    const [[agency], [user], allUsers] = await Promise.all([
      db.select().from(agencies).where(eq(agencies.id, agencyId)),
      db.select().from(users).where(eq(users.id, uid)),
      db.select().from(users).where(eq(users.agencyId, agencyId)),
    ]);

    if (!agency) return NextResponse.json({ error: 'وكالة غير موجودة' }, { status: 404 });

    // Never return the SMTP password to the client
    const { smtpPassword: _, ...safeAgency } = agency as typeof agency & { smtpPassword?: unknown };
    const smtpConfigured = Boolean(agency.smtpHost && agency.smtpUser);

    return NextResponse.json({ agency: { ...safeAgency, smtpConfigured }, user: user ?? null, users: allUsers });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const body = await request.json() as Partial<{
      nameAr: string; nameEn: string; phone: string; addressAr: string;
      vatNumber: string; crNumber: string; isVatRegistered: boolean;
      vatRate: number; defaultCurrency: string; logoUrl: string;
      city: string; contactEmail: string; contactPhone: string; contactHours: string;
      defaultQuoteTerms: string;
      // GOSI rates (basis points × 100; e.g. 1200 = 12.00%)
      gosiEmployerRateSaudi: number; gosiEmployeeRateSaudi: number; gosiEmployerRateExpat: number;
      // SMTP — only admin/owner may change
      smtpHost: string; smtpPort: number; smtpUser: string; smtpPassword: string;
      smtpFromName: string; smtpFromEmail: string; smtpEncryption: string;
    }>;

    // SMTP changes require admin
    const smtpFields = ['smtpHost','smtpPort','smtpUser','smtpPassword','smtpFromName','smtpFromEmail','smtpEncryption'] as const;
    const wantsSmtp  = smtpFields.some(k => body[k] !== undefined);
    if (wantsSmtp) assertRole(role, [...ROLES_ADMIN_ONLY]);

    // GOSI rate changes require admin — they alter statutory liability booked on
    // every subsequent payslip, so they are gated like SMTP credentials.
    const gosiFields = ['gosiEmployerRateSaudi','gosiEmployeeRateSaudi','gosiEmployerRateExpat'] as const;
    const wantsGosi  = gosiFields.some(k => body[k] !== undefined);
    if (wantsGosi) assertRole(role, [...ROLES_ADMIN_ONLY]);

    if (body.isVatRegistered && body.vatNumber !== undefined) {
      const vat = body.vatNumber.trim();
      if (vat && !/^300\d{12}$/.test(vat)) {
        return NextResponse.json({ error: 'الرقم الضريبي يجب أن يكون 15 خانة ويبدأ بـ 300' }, { status: 400 });
      }
    }
    if (body.vatRate !== undefined) {
      if (![0, 5, 10, 15, 20].includes(body.vatRate)) {
        return NextResponse.json({ error: 'معدل الضريبة غير مدعوم' }, { status: 400 });
      }
    }
    for (const gf of gosiFields) {
      if (body[gf] !== undefined) {
        const v = body[gf]!;
        if (!Number.isInteger(v) || v < 0 || v > 3000) {
          return NextResponse.json({ error: `${gf}: يجب أن يكون عدداً صحيحاً بين 0 و 3000` }, { status: 400 });
        }
      }
    }

    if (body.smtpEncryption !== undefined && !['tls','ssl','none'].includes(body.smtpEncryption)) {
      return NextResponse.json({ error: 'نوع التشفير غير صالح' }, { status: 400 });
    }
    if (body.logoUrl !== undefined && body.logoUrl !== '') {
      try {
        const u = new URL(body.logoUrl);
        if (u.protocol !== 'https:') throw new Error();
      } catch {
        return NextResponse.json({ error: 'رابط الشعار يجب أن يكون رابط https صالح' }, { status: 400 });
      }
    }

    const ALLOWED = [
      'nameAr','nameEn','phone','addressAr','vatNumber','crNumber','isVatRegistered',
      'vatRate','defaultCurrency','logoUrl','city','contactEmail','contactPhone','contactHours',
      'defaultQuoteTerms',
      ...gosiFields,
      ...smtpFields,
    ] as const;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ALLOWED) {
      if (body[k] !== undefined) patch[k] = body[k];
    }

    // Encrypt the SMTP password at rest (AES-256-GCM). Empty string clears it.
    if (body.smtpPassword !== undefined) {
      patch['smtpPassword'] = body.smtpPassword ? await encrypt(body.smtpPassword) : null;
    }

    await db.update(agencies).set(patch as Partial<typeof agencies.$inferInsert>).where(eq(agencies.id, agencyId));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
