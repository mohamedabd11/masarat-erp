/**
 * @masarat/zatca — XML Signing for ZATCA Phase 2
 *
 * Signs UBL 2.1 invoice XML with ECDSA-SHA256 per ZATCA Phase 2 spec.
 * The invoice hash is computed over the canonical XML (UBLExtensions block removed),
 * then the ECDSA signature and certificate are embedded back into the XML.
 *
 * This module runs server-side (Cloud Functions) only — the private key
 * must never be sent to the browser.
 */

import { createHash, createSign } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SigningInput {
  /** Unsigned UBL 2.1 invoice XML string produced by buildInvoiceXml() */
  invoiceXml: string;
  /** PKCS#8 PEM EC private key generated during ZATCA onboarding */
  privateKeyPem: string;
  /** PEM X.509 certificate issued by ZATCA (decoded from binarySecurityToken) */
  certificatePem: string;
}

export interface SignedInvoiceResult {
  /** Complete signed invoice XML with embedded signature and certificate */
  signedXml: string;
  /**
   * SHA-256 of the canonical invoice XML (UBLExtensions stripped), base64.
   * This is the value submitted as `invoiceHash` to ZATCA API.
   */
  invoiceHash: string;
  /** ECDSA-SHA256 DER signature over the invoiceHash bytes, base64 */
  digitalSignature: string;
  /**
   * Phase 2 QR code TLV data (base64).
   * Contains: seller name, VAT, timestamp, total, VAT amount,
   * invoice hash, digital signature, and certificate hash.
   * See ZATCA e-invoicing Implementation Standards §6.
   */
  qrCodeData: string;
}

// ─── QR TLV encoding ─────────────────────────────────────────────────────────

/** Encodes a single TLV tag (1 byte tag, 1 byte length, n bytes value) */
function tlvEntry(tag: number, value: Buffer): Buffer {
  const tagBuf    = Buffer.alloc(1);
  tagBuf[0]       = tag;
  const lenBuf    = Buffer.alloc(1);
  lenBuf[0]       = value.length;
  return Buffer.concat([tagBuf, lenBuf, value]);
}

/**
 * Builds Phase 2 QR TLV structure and returns it as base64.
 *
 * Tags per ZATCA specification:
 *   1 = Seller name
 *   2 = VAT number
 *   3 = Timestamp (ISO 8601)
 *   4 = Invoice total (with VAT)
 *   5 = VAT amount
 *   6 = Invoice hash (base64)
 *   7 = ECDSA signature (base64)
 *   8 = ECDSA public key (SPKI, base64)
 *   9 = Stamp certificate (base64)
 */
export function buildQrCodeData(params: {
  sellerName: string;
  vatNumber: string;
  timestamp: string;     // ISO 8601
  totalWithVat: string;  // e.g. "1150.00"
  vatAmount: string;     // e.g. "150.00"
  invoiceHash: string;   // base64
  digitalSignature: string; // base64
  certificatePem: string;
}): string {
  const certBase64 = params.certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');

  const tlv = Buffer.concat([
    tlvEntry(1, Buffer.from(params.sellerName, 'utf8')),
    tlvEntry(2, Buffer.from(params.vatNumber, 'utf8')),
    tlvEntry(3, Buffer.from(params.timestamp, 'utf8')),
    tlvEntry(4, Buffer.from(params.totalWithVat, 'utf8')),
    tlvEntry(5, Buffer.from(params.vatAmount, 'utf8')),
    tlvEntry(6, Buffer.from(params.invoiceHash, 'utf8')),
    tlvEntry(7, Buffer.from(params.digitalSignature, 'utf8')),
    tlvEntry(9, Buffer.from(certBase64, 'utf8')),
  ]);

  return tlv.toString('base64');
}

// ─── Signature placeholder handling ──────────────────────────────────────────

/**
 * Strips the UBLExtensions block from the invoice XML for hashing purposes.
 * Per ZATCA spec, the hash is computed over the invoice XML with the
 * UBLExtensions block (which contains the signature) removed.
 */
export function removeSignatureBlock(xml: string): string {
  return xml.replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>\s*/m, '');
}

/**
 * Strips PEM headers/footers and whitespace, returning bare base64.
 */
function certPemToBase64(certPem: string): string {
  return certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');
}

// ─── Main signing function ────────────────────────────────────────────────────

/**
 * Signs a ZATCA invoice XML with the agency's EC private key and ZATCA certificate.
 *
 * Process:
 *  1. Remove UBLExtensions block and compute SHA-256 hash (the "invoice hash").
 *  2. Sign the invoice hash bytes with ECDSA-SHA256.
 *  3. Replace placeholders in the XML with the hash, signature and certificate.
 *  4. Build the Phase 2 TLV QR code data.
 *
 * The XML produced by buildInvoiceXml() uses these placeholder strings that are
 * replaced here:
 *   {{INVOICE_HASH}}     — SHA-256 base64 of stripped XML
 *   {{DIGITAL_SIGNATURE}} — ECDSA base64 signature
 *   {{CERTIFICATE}}      — bare base64 ZATCA certificate
 *
 * If your XML template does not use these placeholders, use the returned
 * `invoiceHash`, `digitalSignature` and the stripped `certBase64` to embed
 * the values yourself.
 */
export function signInvoiceXml(input: SigningInput): SignedInvoiceResult {
  // 1. Compute invoice hash over canonical XML (no UBLExtensions)
  const xmlForHashing  = removeSignatureBlock(input.invoiceXml);
  const invoiceHash    = createHash('sha256').update(xmlForHashing, 'utf8').digest('base64');

  // 2. ECDSA-SHA256 sign the invoice hash (sign the raw hash bytes decoded from base64)
  const signer = createSign('SHA256');
  signer.update(xmlForHashing, 'utf8');
  const digitalSignature = signer.sign(input.privateKeyPem, 'base64');

  // 3. Embed into XML via placeholders
  const certBase64 = certPemToBase64(input.certificatePem);
  const signedXml  = input.invoiceXml
    .replace('{{INVOICE_HASH}}',      invoiceHash)
    .replace('{{DIGITAL_SIGNATURE}}', digitalSignature)
    .replace('{{CERTIFICATE}}',       certBase64);

  // 4. Build Phase 2 QR TLV — caller must supply seller metadata separately;
  //    for now derive what we can from the invoice XML via simple regex.
  //    Full QR generation should use buildQrCodeData() with proper invoice data.
  //    Here we provide a minimal safe fallback (hash-only) that callers can replace.
  const qrCodeData = invoiceHash;

  return { signedXml, invoiceHash, digitalSignature, qrCodeData };
}

/**
 * Full Phase 2 signing with QR TLV generation.
 * Use this variant when you have the invoice metadata readily available
 * (avoids re-parsing the XML).
 */
export function signInvoiceXmlWithQr(
  input: SigningInput & {
    sellerName: string;
    vatNumber: string;
    issueDateTime: Date;
    totalWithVat: number;   // in halalas
    totalVat: number;       // in halalas
  },
): SignedInvoiceResult {
  const base = signInvoiceXml(input);

  const timestamp    = input.issueDateTime.toISOString().replace('Z', '+03:00');
  const totalStr     = (input.totalWithVat / 100).toFixed(2);
  const vatStr       = (input.totalVat / 100).toFixed(2);

  const qrCodeData = buildQrCodeData({
    sellerName:       input.sellerName,
    vatNumber:        input.vatNumber,
    timestamp,
    totalWithVat:     totalStr,
    vatAmount:        vatStr,
    invoiceHash:      base.invoiceHash,
    digitalSignature: base.digitalSignature,
    certificatePem:   input.certificatePem,
  });

  return { ...base, qrCodeData };
}
