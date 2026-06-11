/**
 * @masarat/zatca — XML Signing for ZATCA Phase 2
 *
 * Signs UBL 2.1 invoice XML with ECDSA-SHA256 per ZATCA Phase 2 spec.
 * The invoice hash is computed over the canonical XML (UBLExtensions and
 * cac:Signature blocks removed), then the hash, ECDSA signature, certificate
 * and XAdES signed properties are embedded back into the XML via the
 * {{...}} placeholders emitted by buildInvoiceXml().
 *
 * NOTE: the ZATCA SDK canonicalizes with C14N11 before hashing; this
 * implementation hashes the literal stripped bytes. The structure follows the
 * published spec, but final acceptance MUST be validated against the ZATCA
 * simulation gateway during onboarding before any production reliance.
 *
 * This module runs server-side (Node.js) only — the private key
 * must never be sent to the browser.
 */

import { createHash, createSign, X509Certificate } from 'crypto';
import * as forge from 'node-forge';

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
   * SHA-256 of the canonical invoice XML (UBLExtensions + cac:Signature
   * stripped), base64. This is the value submitted as `invoiceHash` to ZATCA.
   */
  invoiceHash: string;
  /** ECDSA-SHA256 DER signature over the canonical XML, base64 */
  digitalSignature: string;
  /**
   * Phase 2 QR code TLV data (base64).
   * Contains: seller name, VAT, timestamp, total, VAT amount,
   * invoice hash, digital signature, public key and certificate signature.
   * See ZATCA e-invoicing Implementation Standards §6.
   */
  qrCodeData: string;
}

// ─── Certificate parsing helpers ──────────────────────────────────────────────

/** Strips PEM headers/footers and whitespace, returning bare base64. */
function certPemToBase64(certPem: string): string {
  return certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');
}

interface ParsedCertificate {
  /** RFC 2253-style issuer name: "CN=..., O=..., C=SA" */
  issuerName: string;
  /** Serial number as a decimal integer string (XAdES X509SerialNumber) */
  serialDecimal: string;
  /** SPKI DER public key bytes (QR tag 8) */
  publicKeyDer: Buffer;
  /** ECDSA signature bytes of the certificate by its CA (QR tag 9) */
  certSignature?: Buffer;
}

/**
 * Extracts the certificate's own signature bytes (the CA's ECDSA signature)
 * via a generic ASN.1 walk: Certificate ::= SEQUENCE { tbs, sigAlg, BIT STRING }.
 * node-forge's generic ASN.1 parser handles EC certificates fine (its X.509
 * helpers do not, which is why we don't use forge.pki here).
 */
function extractCertSignatureBytes(certDer: Buffer): Buffer | undefined {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(certDer.toString('binary')));
    const top = asn1.value as forge.asn1.Asn1[];
    const bitString = top[2] as (forge.asn1.Asn1 & { bitStringContents?: string }) | undefined;
    // forge auto-parses the BIT STRING payload (an ECDSA signature is itself a
    // DER SEQUENCE), but keeps the original raw bytes in bitStringContents.
    const raw = bitString?.bitStringContents;
    if (typeof raw !== 'string' || raw.length === 0) return undefined;
    // BIT STRING payload starts with the unused-bits count (always 0 here)
    const bytes = raw.charCodeAt(0) === 0 ? raw.slice(1) : raw;
    return Buffer.from(bytes, 'binary');
  } catch {
    return undefined;
  }
}

function parseCertificate(certificatePem: string): ParsedCertificate {
  const cert = new X509Certificate(certificatePem);
  // X509Certificate.issuer is newline-separated in DN storage order;
  // XAdES expects the RFC 2253 comma-separated form (most-specific first).
  const issuerName = cert.issuer.split('\n').reverse().join(', ');
  const serialDecimal = BigInt(`0x${cert.serialNumber}`).toString();
  const publicKeyDer = cert.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const certSignature = extractCertSignatureBytes(cert.raw);
  return { issuerName, serialDecimal, publicKeyDer, certSignature };
}

/**
 * ZATCA SDK quirk: certificate digest and signed-properties digest are the
 * base64 of the HEX STRING of the SHA-256 (not of the raw digest bytes).
 */
function sha256HexBase64(input: string): string {
  const hex = createHash('sha256').update(input, 'utf8').digest('hex');
  return Buffer.from(hex, 'utf8').toString('base64');
}

// ─── QR TLV encoding ─────────────────────────────────────────────────────────

/** Encodes a single TLV tag (1 byte tag, 1 byte length, n bytes value) */
function tlvEntry(tag: number, value: Buffer): Buffer {
  if (value.length > 255) {
    // A 1-byte length cannot represent this — silently truncating would
    // corrupt the whole TLV stream, so fail loudly instead.
    throw new Error(`ZATCA QR TLV tag ${tag} value exceeds 255 bytes (${value.length})`);
  }
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
 *   6 = Invoice hash (base64 string)
 *   7 = ECDSA signature (base64 string)
 *   8 = ECDSA public key (raw SPKI DER bytes)
 *   9 = ECDSA signature of the certificate by its CA (raw bytes — simplified invoices)
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
  // The full certificate never fits a 1-byte TLV length; per spec tags 8/9
  // carry the public key and the CA's signature over the certificate instead.
  let publicKeyDer: Buffer | undefined;
  let certSignature: Buffer | undefined;
  try {
    const parsed = parseCertificate(params.certificatePem);
    publicKeyDer = parsed.publicKeyDer;
    certSignature = parsed.certSignature;
  } catch {
    // Certificate unparsable — emit tags 1-7 only (still scannable).
  }

  const entries = [
    tlvEntry(1, Buffer.from(params.sellerName, 'utf8')),
    tlvEntry(2, Buffer.from(params.vatNumber, 'utf8')),
    tlvEntry(3, Buffer.from(params.timestamp, 'utf8')),
    tlvEntry(4, Buffer.from(params.totalWithVat, 'utf8')),
    tlvEntry(5, Buffer.from(params.vatAmount, 'utf8')),
    tlvEntry(6, Buffer.from(params.invoiceHash, 'utf8')),
    tlvEntry(7, Buffer.from(params.digitalSignature, 'utf8')),
  ];
  if (publicKeyDer)  entries.push(tlvEntry(8, publicKeyDer));
  if (certSignature) entries.push(tlvEntry(9, certSignature));

  return Buffer.concat(entries).toString('base64');
}

// ─── Canonical form for hashing ───────────────────────────────────────────────

/**
 * Strips the UBLExtensions and cac:Signature blocks from the invoice XML for
 * hashing purposes. Per ZATCA spec, the invoice hash is computed over the XML
 * with the signature envelope (UBLExtensions), the cac:Signature reference and
 * the QR AdditionalDocumentReference removed. Our XML never embeds the QR
 * reference (the QR lives in the DB), so only the first two apply.
 */
export function removeSignatureBlock(xml: string): string {
  return xml
    .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>\s*/m, '')
    .replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>\s*/m, '');
}

// ─── Main signing function ────────────────────────────────────────────────────

/**
 * Signs a ZATCA invoice XML with the agency's EC private key and ZATCA certificate.
 *
 * Process:
 *  1. Remove UBLExtensions + cac:Signature and compute SHA-256 ("invoice hash").
 *  2. Sign the canonical XML with ECDSA-SHA256.
 *  3. Fill every {{...}} placeholder emitted by buildInvoiceXml(): invoice
 *     hash, signature, certificate, signing time, certificate digest,
 *     issuer/serial — then hash the filled XAdES SignedProperties block and
 *     fill {{SIGNED_PROPERTIES_HASH}} last (so the hash matches the bytes
 *     actually embedded in the document).
 */
export function signInvoiceXml(input: SigningInput): SignedInvoiceResult {
  // 1. Invoice hash over canonical XML
  const xmlForHashing  = removeSignatureBlock(input.invoiceXml);
  const invoiceHash    = createHash('sha256').update(xmlForHashing, 'utf8').digest('base64');

  // 2. ECDSA-SHA256 signature over the same canonical XML
  const signer = createSign('SHA256');
  signer.update(xmlForHashing, 'utf8');
  const digitalSignature = signer.sign(input.privateKeyPem, 'base64');

  // 3. Embed into XML via placeholders
  const certBase64 = certPemToBase64(input.certificatePem);
  const cert       = parseCertificate(input.certificatePem);
  // SigningTime must use the same +03:00 (Asia/Riyadh, no DST) offset as IssueTime;
  // a UTC 'Z' timestamp here is inconsistent with the invoice's local times (L3).
  const ksaNow      = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const signingTime = `${ksaNow.toISOString().split('.')[0]}+03:00`;

  let signedXml = input.invoiceXml
    .replaceAll('{{INVOICE_HASH}}',      invoiceHash)
    .replaceAll('{{DIGITAL_SIGNATURE}}', digitalSignature)
    .replaceAll('{{CERTIFICATE}}',       certBase64)
    .replaceAll('{{SIGNING_TIME}}',      signingTime)
    .replaceAll('{{CERT_DIGEST}}',       sha256HexBase64(certBase64))
    .replaceAll('{{CERT_ISSUER}}',       cert.issuerName)
    .replaceAll('{{CERT_SERIAL}}',       cert.serialDecimal);

  // SignedProperties hash is computed over the block exactly as embedded
  // (every other placeholder inside it is already filled at this point).
  const spMatch = signedXml.match(/<xades:SignedProperties[\s\S]*?<\/xades:SignedProperties>/);
  signedXml = signedXml.replaceAll('{{SIGNED_PROPERTIES_HASH}}', spMatch ? sha256HexBase64(spMatch[0]) : '');

  // 4. Minimal QR fallback (hash only) — signInvoiceXmlWithQr builds the full TLV.
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
