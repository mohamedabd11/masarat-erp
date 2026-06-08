import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies } from '@/lib/schema';
import { verifyAuth, assertRole, ROLES_ADMIN_ONLY, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { encrypt } from '@/lib/crypto';
import {
  generateZatcaKeyPair,
  requestComplianceCsid,
  decodeCsid,
} from '@masarat/zatca';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    const { agencyId, role } = auth;
    assertRole(role, ROLES_ADMIN_ONLY as unknown as string[]);

    const body = await request.json() as {
      otp: string;
      vatNumber?: string;
      organizationName?: string;
      crNumber?: string;
      environment?: 'simulation' | 'production';
    };

    if (!body.otp) {
      return NextResponse.json({ error: 'OTP is required' }, { status: 400 });
    }

    // Load agency to get vatNumber/nameAr if not provided in body
    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
    if (!agency) return NextResponse.json({ error: 'Agency not found' }, { status: 404 });

    const vatNumber = body.vatNumber ?? agency.vatNumber;
    const organizationName = body.organizationName ?? agency.nameAr;
    const crNumber = body.crNumber ?? agency.crNumber;
    const environment = body.environment ?? 'simulation';

    if (!vatNumber) {
      return NextResponse.json(
        { error: 'VAT number is required. Add it in agency settings first.' },
        { status: 400 }
      );
    }
    if (!organizationName) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    // Mark as pending
    await db.update(agencies).set({
      zatcaOnboardingStatus: 'pending_otp',
      zatcaEnvironment: environment,
      zatcaErrorMessage: null,
    }).where(eq(agencies.id, agencyId));

    try {
      // 1. Generate EC P-256 key pair + CSR
      const keyPair = generateZatcaKeyPair({
        vatNumber,
        organizationName,
        crNumber: crNumber ?? '',
      });

      // 2. Request compliance CSID from ZATCA
      const complianceResult = await requestComplianceCsid(keyPair.csrPem, body.otp, environment);

      if (complianceResult.dispositionMessage !== 'ISSUED') {
        throw new Error(`ZATCA rejected CSR: ${complianceResult.dispositionMessage}`);
      }

      // 3. Decode certificate
      const certPem = decodeCsid(complianceResult.binarySecurityToken);

      // 4. Store encrypted credentials
      await db.update(agencies).set({
        vatNumber: vatNumber,
        crNumber: crNumber,
        zatcaOnboardingStatus: 'compliance',
        zatcaEnvironment: environment,
        zatcaComplianceRequestId: complianceResult.requestID,
        zatcaComplianceCsid: await encrypt(complianceResult.binarySecurityToken),
        zatcaComplianceSecret: await encrypt(complianceResult.secret),
        zatcaPrivateKey: await encrypt(keyPair.privateKeyPem),
        zatcaCertificatePem: certPem,
        zatcaErrorMessage: null,
      }).where(eq(agencies.id, agencyId));

      return NextResponse.json({
        success: true,
        status: 'compliance',
        message: 'ZATCA compliance CSID obtained successfully. System is now in compliance mode.',
        requestId: complianceResult.requestID,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await db.update(agencies).set({
        zatcaOnboardingStatus: 'error',
        zatcaErrorMessage: message,
      }).where(eq(agencies.id, agencyId));

      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
