export type {
  ZatcaInvoice,
  ZatcaInvoiceTypeCode,
  ZatcaVatCategory,
  ZatcaTransactionType,
  ZatcaExemptionReason,
  ZatcaAddress,
  ZatcaSeller,
  ZatcaBuyer,
  ZatcaInvoiceLine,
  ZatcaTotals,
  ZatcaSignedInvoice,
} from './types';

export { buildInvoiceXml } from './xml-builder';
export { generateQrCodeData, decodeQrCodeData } from './qr-code';
export type { QrCodeInput } from './qr-code';

// ─── Phase 2: Cryptographic layer ────────────────────────────────────────────
export {
  generateZatcaKeyPair,
  extractPublicKeyFromCert,
  decodeCsid,
  sha256Base64,
  signEcdsa,
} from './crypto';
export type { ZatcaCsrInput, ZatcaKeyPair } from './crypto';

// ─── Phase 2: XML signing ─────────────────────────────────────────────────────
export {
  signInvoiceXml,
  signInvoiceXmlWithQr,
  buildQrCodeData,
  removeSignatureBlock,
} from './signing';
export type { SigningInput, SignedInvoiceResult } from './signing';

// ─── Phase 2: ZATCA API client ────────────────────────────────────────────────
export {
  requestComplianceCsid,
  checkCompliance,
  requestProductionCsid,
  clearInvoice,
  reportInvoice,
} from './api-client';
export type {
  ZatcaEnvironment,
  ZatcaComplianceCsidResponse,
  ZatcaProductionCsidResponse,
  ZatcaInvoiceSubmitRequest,
  ZatcaInvoiceSubmitResponse,
  ZatcaValidationMessage,
} from './api-client';
