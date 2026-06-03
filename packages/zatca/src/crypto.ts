/**
 * @masarat/zatca — Cryptographic utilities for ZATCA Phase 2 onboarding
 *
 * Generates EC P-256 (prime256v1) key pairs and PKCS#10 CSRs as required
 * by ZATCA e-invoicing Phase 2 specification.
 *
 * NOTE on node-forge EC support:
 *   node-forge does not natively support EC key signing for CSRs.
 *   This module uses Node.js native `crypto` for all key generation and
 *   signing operations, and node-forge only for ASN.1 structure helpers
 *   (OID encoding, DER/PEM utilities).
 */

import { generateKeyPairSync, createSign, createHash } from 'crypto';
import * as forge from 'node-forge';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ZatcaCsrInput {
  /** 15-digit VAT number, e.g. "310XXXXXXXXX003" */
  vatNumber: string;
  /** Organisation Arabic/legal name */
  organizationName: string;
  /** Commercial registration number */
  crNumber: string;
  /** ISO 3166-1 alpha-2 country code (default: 'SA') */
  country?: string;
  /** ERP software name embedded in serial (default: 'Masarat-ERP') */
  softwareName?: string;
  /** ERP software version embedded in serial (default: '1.0') */
  softwareVersion?: string;
}

export interface ZatcaKeyPair {
  /** PKCS#8 PEM EC private key */
  privateKeyPem: string;
  /** SPKI PEM EC public key */
  publicKeyPem: string;
  /** PKCS#10 CSR in PEM format, ready for ZATCA onboarding API */
  csrPem: string;
}

// ─── OID constants used in the CSR ───────────────────────────────────────────

// Standard X.500 attribute OIDs
const OID_COMMON_NAME           = '2.5.4.3';
const OID_COUNTRY               = '2.5.4.6';
const OID_ORG_NAME              = '2.5.4.10';
const OID_ORG_UNIT              = '2.5.4.11';
const OID_SERIAL_NUMBER         = '2.5.4.5';
// ZATCA-specific: UID (2.5.4.45) carries VAT number in subjectAltName / UID field
const OID_UID                   = '2.5.4.45';

// Signature algorithm OIDs
const OID_ECDSA_WITH_SHA256     = '1.2.840.10045.4.3.2';
const OID_EC_PUBLIC_KEY         = '1.2.840.10045.2.1';
const OID_PRIME256V1            = '1.2.840.10045.3.1.7';

// Extension OIDs
const OID_EXTENSION_REQUEST     = '1.2.840.113549.9.14';
const OID_SUBJECT_ALT_NAME      = '2.5.29.17';
// ZATCA Production OID for subject alternative name UID value
const OID_ZATCA_VAT             = '2.16.840.1.114412.18';

// ─── ASN.1 helper ─────────────────────────────────────────────────────────────

const asn1 = forge.asn1;

/** Encode an OID string as a forge ASN.1 OID value node */
function oidNode(oid: string): forge.asn1.Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false,
    asn1.oidToDer(oid).getBytes());
}

/** Encode a UTF-8 string as a forge ASN.1 UTF8String node */
function utf8Node(value: string): forge.asn1.Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTF8, false, value);
}

/** Encode a printable string (used for serialNumber, country) */
function printableNode(value: string): forge.asn1.Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.PRINTABLESTRING, false, value);
}

/** Build a single RDN attribute: SEQUENCE { SET { SEQUENCE { OID, value } } } */
function rdnAttribute(oid: string, valueNode: forge.asn1.Asn1): forge.asn1.Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      oidNode(oid),
      valueNode,
    ]),
  ]);
}

/**
 * Builds the RDN SEQUENCE from subject fields.
 * Order follows ZATCA CSID spec: CN, OU, O, C, SN, UID
 */
function buildSubjectRdn(input: ZatcaCsrInput, softwareName: string, softwareVersion: string, country: string): forge.asn1.Asn1 {
  // Serial: "1-{softwareName}|2-ERP|3-{softwareVersion}"
  const serialValue = `1-${softwareName}|2-ERP|3-${softwareVersion}`;

  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    rdnAttribute(OID_COMMON_NAME,     utf8Node(`${softwareName}-Device`)),
    rdnAttribute(OID_ORG_UNIT,        utf8Node(input.organizationName)),
    rdnAttribute(OID_ORG_NAME,        utf8Node(input.organizationName)),
    rdnAttribute(OID_COUNTRY,         printableNode(country)),
    rdnAttribute(OID_SERIAL_NUMBER,   printableNode(serialValue)),
    rdnAttribute(OID_UID,             utf8Node(input.vatNumber)),
  ]);
}

/**
 * Builds PKCS#9 extensionRequest attribute containing subjectAltName.
 * ZATCA requires the VAT number embedded as an otherName SAN with OID 2.16.840.1.114412.18.
 */
function buildExtensionRequest(vatNumber: string): forge.asn1.Asn1 {
  // subjectAltName extension value: SEQUENCE of GeneralNames
  // otherName: [0] IMPLICIT { OID, [0] EXPLICIT UTF8String }
  const otherNameValue = asn1.create(asn1.Class.CONTEXT, 0, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTF8, false, vatNumber),
  ]);

  const otherName = asn1.create(asn1.Class.CONTEXT, 0, true, [
    oidNode(OID_ZATCA_VAT),
    otherNameValue,
  ]);

  const sanValue = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [otherName]);
  const sanValueDer = asn1.toDer(sanValue).getBytes();

  const sanExtension = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    oidNode(OID_SUBJECT_ALT_NAME),
    // critical = false (omitted)
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, sanValueDer),
  ]);

  // extensionRequest SEQUENCE of extensions
  const extensionsSeq = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [sanExtension]);

  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    oidNode(OID_EXTENSION_REQUEST),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [extensionsSeq]),
  ]);
}

/**
 * Extracts the raw public key bytes (the EC point) from a SPKI PEM.
 * Returns the BIT STRING value (the SubjectPublicKey field), i.e. the
 * 65-byte uncompressed EC point for prime256v1.
 */
function spkiToEcPublicKeyBytes(spkiPem: string): string {
  const derBytes = forge.util.decode64(
    spkiPem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, ''),
  );
  const spkiAsn1 = asn1.fromDer(derBytes);
  // SPKI = SEQUENCE { AlgorithmIdentifier, BIT STRING }
  const bitString = (spkiAsn1.value as forge.asn1.Asn1[])[1]!;
  return bitString.value as string;
}

/**
 * Builds the AlgorithmIdentifier for EC public key: SEQUENCE { OID ecPublicKey, OID prime256v1 }
 */
function buildEcAlgorithmIdentifier(): forge.asn1.Asn1 {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    oidNode(OID_EC_PUBLIC_KEY),
    oidNode(OID_PRIME256V1),
  ]);
}

/**
 * Builds the SubjectPublicKeyInfo node from a SPKI PEM.
 */
function buildSpki(publicKeyPem: string): forge.asn1.Asn1 {
  const ecPointBytes = spkiToEcPublicKeyBytes(publicKeyPem);
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    buildEcAlgorithmIdentifier(),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BITSTRING, false, ecPointBytes),
  ]);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates an EC P-256 key pair and a ZATCA-compliant PKCS#10 CSR.
 *
 * The CSR includes:
 *  - Subject fields: CN, OU, O, C, serialNumber, UID per ZATCA spec
 *  - subjectAltName extension carrying the VAT number as an otherName
 *  - Signed with ECDSA-SHA256 using Node.js native crypto
 *
 * node-forge EC limitation:
 *   forge.pki does not support EC key import/signing for PKCS#10 CSRs.
 *   All signing is therefore performed with Node.js built-in `crypto.createSign`,
 *   and the resulting DER signature is embedded in the ASN.1 CSR structure manually.
 */
export function generateZatcaKeyPair(input: ZatcaCsrInput): ZatcaKeyPair {
  const softwareName    = input.softwareName    ?? 'Masarat-ERP';
  const softwareVersion = input.softwareVersion ?? '1.0';
  const country         = input.country         ?? 'SA';

  // 1. Generate EC P-256 key pair using Node.js native crypto
  const { privateKey: privateKeyPem, publicKey: publicKeyPem } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding:  { type: 'spki',   format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8',  format: 'pem' },
  });

  // 2. Build TBSCertificationRequest ASN.1 structure
  const subjectRdn        = buildSubjectRdn(input, softwareName, softwareVersion, country);
  const spkiNode          = buildSpki(publicKeyPem);
  const extensionRequest  = buildExtensionRequest(input.vatNumber);

  // Attributes [0] IMPLICIT SET containing extensionRequest
  const attributesNode = asn1.create(asn1.Class.CONTEXT, 0, true, [extensionRequest]);

  // Signature algorithm for TBSCertificationRequest
  const sigAlgNode = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    oidNode(OID_ECDSA_WITH_SHA256),
    // ecdsaWithSHA256 has no parameters
  ]);

  // TBSCertificationRequest ::= SEQUENCE { version, subject, subjectPKInfo, attributes }
  const tbsCsr = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    // version = 0
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(0).getBytes()),
    subjectRdn,
    spkiNode,
    attributesNode,
  ]);

  const tbsDer = Buffer.from(asn1.toDer(tbsCsr).getBytes(), 'binary');

  // 3. Sign TBSCertificationRequest DER with ECDSA-SHA256 using native crypto
  const signer = createSign('SHA256');
  signer.update(tbsDer);
  const signatureDer = signer.sign(privateKeyPem);

  // DER signature is already in DER format (BIT STRING value needs a leading 0x00 padding byte)
  const signatureBitStringValue = '\x00' + signatureDer.toString('binary');

  // 4. Assemble the full CertificationRequest
  const csr = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    tbsCsr,
    sigAlgNode,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BITSTRING, false, signatureBitStringValue),
  ]);

  // 5. Convert to PEM
  const csrDer    = asn1.toDer(csr).getBytes();
  const csrBase64 = forge.util.encode64(csrDer);
  const csrPem    = `-----BEGIN CERTIFICATE REQUEST-----\n${csrBase64.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE REQUEST-----`;

  return {
    privateKeyPem,
    publicKeyPem,
    csrPem,
  };
}

// ─── Certificate utilities ────────────────────────────────────────────────────

/**
 * Extracts the public key PEM from a PEM-encoded X.509 certificate.
 */
export function extractPublicKeyFromCert(certPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  return forge.pki.publicKeyToPem(cert.publicKey);
}

/**
 * Decodes a base64-encoded DER certificate (binarySecurityToken from ZATCA) to PEM.
 */
export function decodeCsid(binarySecurityToken: string): string {
  const der    = Buffer.from(binarySecurityToken, 'base64');
  const asn1Obj = asn1.fromDer(der.toString('binary'));
  const cert   = forge.pki.certificateFromAsn1(asn1Obj);
  return forge.pki.certificateToPem(cert);
}

/**
 * Computes SHA-256 of a UTF-8 string and returns the digest as base64.
 */
export function sha256Base64(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('base64');
}

/**
 * Signs arbitrary data with ECDSA-SHA256 using the provided PKCS#8 PEM private key.
 * Returns the DER-encoded signature as base64.
 */
export function signEcdsa(data: string, privateKeyPem: string): string {
  const signer = createSign('SHA256');
  signer.update(data, 'utf8');
  return signer.sign(privateKeyPem, 'base64');
}
