/**
 * ZATCA Phase 2 signing — unit tests with a real EC P-256 key + certificate.
 *
 * Proves the signing pipeline end-to-end at the crypto level:
 *  - every {{...}} placeholder is actually filled in the signed XML,
 *  - the embedded invoice hash matches the canonical XML bytes,
 *  - the ECDSA signature verifies against the certificate's public key,
 *  - the Phase 2 QR TLV carries tags 1–9 with the right payloads,
 *  - credit/debit notes embed the original-invoice BillingReference.
 *
 * The fixtures are a self-signed prime256v1 key/cert generated for tests only.
 * ZATCA sandbox acceptance still requires onboarding (network path, not unit-testable).
 */
import { describe, it, expect, vi } from 'vitest';
import { createHash, createVerify, X509Certificate } from 'crypto';

vi.mock('@/lib/db', () => ({ db: {} }));

import { buildZatcaInvoiceRecord } from '@/lib/zatca-einvoice';
import { buildInvoiceXml, signInvoiceXmlWithQr, removeSignatureBlock } from '@masarat/zatca';

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgoWu0eLh5mWK6nuta
gdwOWegzrCMiJuEe/Ae+DqSFGyehRANCAAQn8KlnZYoid7py4ggmNhK96tBzvUZO
K6yNV6EN26hDv8UV70spIY+pmqgmVpqxY2t14VfMlzTjxe2cjx33ACVv
-----END PRIVATE KEY-----`;

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIB2zCCAYGgAwIBAgIUUGyQgZycwSHHmXziBZ42gJDjwIswCgYIKoZIzj0EAwIw
QzELMAkGA1UEBhMCU0ExGDAWBgNVBAoMD01hc2FyYXQgVGVzdCBDQTEaMBgGA1UE
AwwRTWFzYXJhdC1Vbml0LVRlc3QwHhcNMjYwNjEwMDkyMTQwWhcNNDYwNjA1MDky
MTQwWjBDMQswCQYDVQQGEwJTQTEYMBYGA1UECgwPTWFzYXJhdCBUZXN0IENBMRow
GAYDVQQDDBFNYXNhcmF0LVVuaXQtVGVzdDBZMBMGByqGSM49AgEGCCqGSM49AwEH
A0IABCfwqWdliiJ3unLiCCY2Er3q0HO9Rk4rrI1XoQ3bqEO/xRXvSykhj6maqCZW
mrFja3XhV8yXNOPF7ZyPHfcAJW+jUzBRMB0GA1UdDgQWBBSz4os4qIsFJnAuWf1O
SXQsho9XWjAfBgNVHSMEGDAWgBSz4os4qIsFJnAuWf1OSXQsho9XWjAPBgNVHRMB
Af8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQCSA02QuchXsv7ee0OXZizROAiP
n7iFh5fWbz4rTPLg+gIgRhGvnS+gpXkL0WB8L0ptOApNI/yIGvS0eX31czhCfMk=
-----END CERTIFICATE-----`;

const RECORD_INPUT = {
  uuid:           '8e6a3c4b-0000-4000-8000-000000000002',
  invoiceNumber:  'INV-2026-000777',
  issueDateTime:  new Date('2026-06-10T09:00:00Z'),
  sellerNameAr:   'وكالة مسارات للسفر',
  vatNumber:      '300000000000003',
  buyerName:      'عميل اختبار',
  vatRatePercent: 15,
  subtotalHalalas: 100_000,
  vatHalalas:      15_000,
  totalHalalas:    115_000,
};

function signFixture(extra: Partial<typeof RECORD_INPUT> & { invoiceTypeCode?: '388' | '381' | '383'; originalInvoiceUuid?: string; originalInvoiceNumber?: string } = {}) {
  const record = buildZatcaInvoiceRecord({ ...RECORD_INPUT, ...extra });
  const xml = buildInvoiceXml(record.invoice, 'PIH_TEST_VALUE', 42);
  const signed = signInvoiceXmlWithQr({
    invoiceXml:     xml,
    privateKeyPem:  TEST_PRIVATE_KEY,
    certificatePem: TEST_CERT,
    sellerName:     record.invoice.seller.nameAr,
    vatNumber:      record.invoice.seller.vatNumber,
    issueDateTime:  record.invoice.issueDateTime,
    totalWithVat:   record.invoice.totals.grandTotal,
    totalVat:       record.invoice.totals.totalVat,
  });
  return { record, xml, signed };
}

/** Decodes a base64 TLV QR into tag → raw bytes */
function decodeTlvBytes(b64: string): Map<number, Uint8Array> {
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  const out = new Map<number, Uint8Array>();
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i]!, len = bytes[i + 1]!;
    out.set(tag, bytes.slice(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return out;
}

const txt = (u?: Uint8Array) => new TextDecoder().decode(u ?? new Uint8Array());

describe('signInvoiceXmlWithQr — دمج التوقيع في XML', () => {
  it('لا يُبقي أي placeholder في الـ XML الموقّع', () => {
    const { signed } = signFixture();
    expect(signed.signedXml).not.toContain('{{');
    expect(signed.signedXml).not.toContain('PLACEHOLDER');
  });

  it('hash الفاتورة المدمج يطابق sha256 للنسخة القانونية', () => {
    const { xml, signed } = signFixture();
    const canonical = removeSignatureBlock(xml);
    const expectedHash = createHash('sha256').update(canonical, 'utf8').digest('base64');
    expect(signed.invoiceHash).toBe(expectedHash);
    expect(signed.signedXml).toContain(`<ds:DigestValue>${expectedHash}</ds:DigestValue>`);
  });

  it('التوقيع ECDSA يتحقق بالمفتاح العام للشهادة', () => {
    const { xml, signed } = signFixture();
    const canonical = removeSignatureBlock(xml);
    const cert = new X509Certificate(TEST_CERT);
    const ok = createVerify('SHA256').update(canonical, 'utf8')
      .verify(cert.publicKey, signed.digitalSignature, 'base64');
    expect(ok).toBe(true);
  });

  it('إزالة كتلة التوقيع من الـ XML الموقّع تعيد نفس النسخة القانونية (hash مستقر)', () => {
    const { xml, signed } = signFixture();
    expect(removeSignatureBlock(signed.signedXml)).toBe(removeSignatureBlock(xml));
  });

  it('SignedProperties hash يطابق البايتات المدمجة فعلياً (base64 لـ hex)', () => {
    const { signed } = signFixture();
    const sp = signed.signedXml.match(/<xades:SignedProperties[\s\S]*?<\/xades:SignedProperties>/)![0];
    const expected = Buffer.from(createHash('sha256').update(sp, 'utf8').digest('hex'), 'utf8').toString('base64');
    expect(signed.signedXml).toContain(`<ds:DigestValue>${expected}</ds:DigestValue>`);
  });

  it('يملأ بيانات الشهادة: المُصدِر بصيغة RFC2253 والرقم التسلسلي عشري', () => {
    const { signed } = signFixture();
    expect(signed.signedXml).toMatch(/<ds:X509IssuerName>CN=Masarat-Unit-Test.*C=SA<\/ds:X509IssuerName>/);
    expect(signed.signedXml).toMatch(/<ds:X509SerialNumber>\d+<\/ds:X509SerialNumber>/);
    expect(signed.signedXml).toContain('<ds:X509Certificate>MIIB2zCC');
  });
});

describe('signInvoiceXmlWithQr — رمز QR المرحلة الثانية (TLV)', () => {
  it('يحمل الوسوم 1–9 بالحمولات الصحيحة', () => {
    const { signed } = signFixture();
    const tlv = decodeTlvBytes(signed.qrCodeData);
    expect(txt(tlv.get(1))).toBe(RECORD_INPUT.sellerNameAr);
    expect(txt(tlv.get(2))).toBe(RECORD_INPUT.vatNumber);
    expect(txt(tlv.get(4))).toBe('1150.00');
    expect(txt(tlv.get(5))).toBe('150.00');
    expect(txt(tlv.get(6))).toBe(signed.invoiceHash);
    expect(txt(tlv.get(7))).toBe(signed.digitalSignature);
    // Tag 8: SPKI DER public key — must match the certificate's key exactly
    const cert = new X509Certificate(TEST_CERT);
    const spki = cert.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    expect(Buffer.from(tlv.get(8)!)).toEqual(spki);
    // Tag 9: CA signature over the certificate (raw ECDSA DER, ~70 bytes)
    expect(tlv.get(9)!.length).toBeGreaterThan(60);
    expect(tlv.get(9)!.length).toBeLessThan(256);
  });
});

describe('buildInvoiceXml — مرجع الفاتورة الأصلية للإشعارات', () => {
  it('يدمج BillingReference للإشعار الدائن 381', () => {
    const { xml } = signFixture({
      invoiceTypeCode:       '381',
      originalInvoiceUuid:   '8e6a3c4b-0000-4000-8000-000000000001',
      originalInvoiceNumber: 'INV-2026-000123',
    });
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ID>INV-2026-000123</cbc:ID>');
    expect(xml).toContain('<cbc:UUID>8e6a3c4b-0000-4000-8000-000000000001</cbc:UUID>');
  });

  it('لا يدمج BillingReference للفاتورة العادية 388', () => {
    const { xml } = signFixture();
    expect(xml).not.toContain('<cac:BillingReference>');
  });
});
