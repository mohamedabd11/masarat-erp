import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    const { agencyId } = auth;

    const [agency] = await db
      .select({
        zatcaOnboardingStatus: agencies.zatcaOnboardingStatus,
        zatcaEnvironment: agencies.zatcaEnvironment,
        zatcaOnboardedAt: agencies.zatcaOnboardedAt,
        zatcaErrorMessage: agencies.zatcaErrorMessage,
        zatcaCertificatePem: agencies.zatcaCertificatePem,
        zatcaCertificateExpiry: agencies.zatcaCertificateExpiry,
        vatNumber: agencies.vatNumber,
        isVatRegistered: agencies.isVatRegistered,
      })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1);

    if (!agency) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const expiry = agency.zatcaCertificateExpiry;
    const daysUntilExpiry = expiry ? Math.floor((expiry.getTime() - Date.now()) / 86_400_000) : null;
    const certWarning = daysUntilExpiry !== null && daysUntilExpiry <= 30
      ? `شهادة ZATCA تنتهي خلال ${daysUntilExpiry} يوم — يجب تجديدها`
      : null;

    return NextResponse.json({
      status: agency.zatcaOnboardingStatus,          // not_started | pending_otp | compliance | production | error
      environment: agency.zatcaEnvironment,
      onboardedAt: agency.zatcaOnboardedAt,
      errorMessage: agency.zatcaErrorMessage,
      hasCertificate: !!agency.zatcaCertificatePem,
      certificateExpiry: agency.zatcaCertificateExpiry,
      daysUntilExpiry,
      certWarning,
      vatNumber: agency.vatNumber,
      isVatRegistered: agency.isVatRegistered,
      isReady: agency.zatcaOnboardingStatus === 'production',
      isComplianceMode: agency.zatcaOnboardingStatus === 'compliance',
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
