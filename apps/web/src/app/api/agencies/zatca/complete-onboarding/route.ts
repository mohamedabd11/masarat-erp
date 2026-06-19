import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies } from '@/lib/schema';
import { verifyAuth, assertRole, ROLES_ADMIN_ONLY, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { encrypt, decrypt } from '@/lib/crypto';
import { buildZatcaInvoiceRecord, ZATCA_GENESIS_PIH } from '@/lib/zatca-einvoice';
import {
  buildInvoiceXml,
  signInvoiceXmlWithQr,
  checkCompliance,
  requestProductionCsid,
  decodeCsid,
} from '@masarat/zatca';

/**
 * POST /api/agencies/zatca/complete-onboarding
 *
 * Steps 2 + 3 of ZATCA onboarding:
 *   2. Submit a sample invoice against the compliance CSID
 *   3. Exchange compliance CSID for production CSID
 *
 * Requires the agency to be in 'compliance' status (step 1 done).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    const { agencyId, role } = auth;
    assertRole(role, ROLES_ADMIN_ONLY as unknown as string[]);

    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
    if (!agency) return NextResponse.json({ error: 'Agency not found' }, { status: 404 });

    if (agency.zatcaOnboardingStatus !== 'compliance') {
      return NextResponse.json(
        { error: `Onboarding status must be 'compliance' to complete. Current: ${agency.zatcaOnboardingStatus}` },
        { status: 400 },
      );
    }
    if (!agency.zatcaComplianceRequestId || !agency.zatcaComplianceCsid
      || !agency.zatcaComplianceSecret || !agency.zatcaPrivateKey || !agency.zatcaCertificatePem) {
      return NextResponse.json({ error: 'Missing compliance credentials — repeat step 1' }, { status: 400 });
    }

    const env: 'production' | 'simulation' = agency.zatcaEnvironment === 'production' ? 'production' : 'simulation';

    const [complianceCsid, complianceSecret, privateKeyPem] = await Promise.all([
      decrypt(agency.zatcaComplianceCsid),
      decrypt(agency.zatcaComplianceSecret),
      decrypt(agency.zatcaPrivateKey),
    ]);
    const certificatePem = agency.zatcaCertificatePem;

    try {
      // ── Step 2: Compliance check with a sample invoice ──────────────────

      const sampleRecord = buildZatcaInvoiceRecord({
        uuid:           crypto.randomUUID(),
        invoiceNumber:  'COMP-CHECK-001',
        issueDateTime:  new Date(),
        sellerNameAr:   agency.nameAr,
        sellerNameEn:   agency.nameEn,
        vatNumber:      agency.vatNumber!,
        crNumber:       agency.crNumber,
        buyerName:      'عميل تجريبي',
        buyerVatNumber: null,
        vatRatePercent: agency.vatRate ?? 15,
        subtotalHalalas: 100000,
        vatHalalas:      15000,
        totalHalalas:    115000,
      });

      const sampleXml = buildInvoiceXml(sampleRecord.invoice, ZATCA_GENESIS_PIH, 0);
      const signed = signInvoiceXmlWithQr({
        invoiceXml:     sampleXml,
        privateKeyPem,
        certificatePem,
        sellerName:     agency.nameAr,
        vatNumber:      agency.vatNumber!,
        issueDateTime:  new Date(),
        totalWithVat:   115000,
        totalVat:       15000,
      });

      const compliancePayload = {
        invoiceHash: signed.invoiceHash,
        uuid:        sampleRecord.uuid,
        invoice:     Buffer.from(signed.signedXml, 'utf8').toString('base64'),
      };

      const complianceResult = await checkCompliance(compliancePayload, complianceCsid, complianceSecret, env);

      if (complianceResult.validationResults?.status === 'ERROR') {
        const errors = complianceResult.validationResults.errorMessages?.map((m: { message: string }) => m.message).join('; ') ?? 'Unknown';
        await db.update(agencies).set({
          zatcaErrorMessage: `Compliance check failed: ${errors}`,
        }).where(eq(agencies.id, agencyId));
        return NextResponse.json({ error: `Compliance check failed: ${errors}` }, { status: 422 });
      }

      // ── Step 3: Exchange for production CSID ────────────────────────────

      const productionResult = await requestProductionCsid(
        agency.zatcaComplianceRequestId,
        complianceCsid,
        complianceSecret,
        env,
      );

      const productionCertPem = decodeCsid(productionResult.binarySecurityToken);

      // Parse certificate expiry from PEM
      let certExpiry: Date | null = null;
      try {
        const b64Body = productionCertPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
        const der = Buffer.from(b64Body, 'base64');
        const notAfterMatch = der.toString('hex').match(/170d(\w{12})/);
        if (notAfterMatch) {
          const raw = notAfterMatch[1]!;
          const yr = parseInt(raw.slice(0, 2), 10);
          const fullYear = yr >= 50 ? 1900 + yr : 2000 + yr;
          certExpiry = new Date(Date.UTC(
            fullYear,
            parseInt(raw.slice(2, 4), 10) - 1,
            parseInt(raw.slice(4, 6), 10),
            parseInt(raw.slice(6, 8), 10),
            parseInt(raw.slice(8, 10), 10),
            parseInt(raw.slice(10, 12), 10),
          ));
        }
      } catch { /* best-effort */ }

      await db.update(agencies).set({
        zatcaOnboardingStatus: 'production',
        zatcaProductionCsid:   await encrypt(productionResult.binarySecurityToken),
        zatcaProductionSecret: await encrypt(productionResult.secret),
        zatcaCertificatePem:   productionCertPem,
        zatcaCertificateExpiry: certExpiry,
        zatcaOnboardedAt:      new Date(),
        zatcaErrorMessage:     null,
      }).where(eq(agencies.id, agencyId));

      return NextResponse.json({
        success: true,
        status: 'production',
        message: 'ZATCA production onboarding complete. Live invoice submission is now active.',
        certificateExpiry: certExpiry?.toISOString() ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await db.update(agencies).set({
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
