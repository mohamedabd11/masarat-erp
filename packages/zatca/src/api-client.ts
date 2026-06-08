/**
 * @masarat/zatca — ZATCA Phase 2 API Client
 *
 * Implements the ZATCA Fatoora onboarding and invoice submission API calls:
 *   1. requestComplianceCsid  — submit CSR + OTP to get a Compliance CSID
 *   2. checkCompliance        — run compliance check with a sample invoice
 *   3. requestProductionCsid  — exchange compliance CSID for production CSID
 *   4. clearInvoice           — B2B invoice clearance (>= 1000 SAR or explicit B2B)
 *   5. reportInvoice          — B2C simplified invoice reporting
 *
 * All requests target either the simulation or production gateway.
 * The Accept-Version header is fixed at V2 per ZATCA Phase 2 specification.
 *
 * References:
 *   ZATCA e-invoicing API Specifications v1.x
 *   https://zatca.gov.sa/ar/E-Invoicing/Introduction/Pages/Home.aspx
 */

// ─── Environment ──────────────────────────────────────────────────────────────

export type ZatcaEnvironment = 'simulation' | 'production';

const BASE_URLS: Record<ZatcaEnvironment, string> = {
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

// ─── Response types ───────────────────────────────────────────────────────────

export interface ZatcaComplianceCsidResponse {
  /** ZATCA-assigned request identifier (keep for production CSID step) */
  requestID: string;
  dispositionMessage: string;
  /** Base64-encoded DER X.509 certificate (CSID). Decode with decodeCsid(). */
  binarySecurityToken: string;
  /** API secret bound to this CSID — store securely */
  secret: string;
}

export interface ZatcaProductionCsidResponse {
  requestID: string;
  /** Base64-encoded DER X.509 production certificate */
  binarySecurityToken: string;
  /** API secret bound to this production CSID */
  secret: string;
}

// ─── Invoice submission ───────────────────────────────────────────────────────

export interface ZatcaInvoiceSubmitRequest {
  /** SHA-256 of the canonical (UBLExtensions-stripped) invoice XML, base64 */
  invoiceHash: string;
  /** UUID v4 of the invoice (matches cbc:UUID in the XML) */
  uuid: string;
  /** Base64-encoded signed invoice XML */
  invoice: string;
}

export interface ZatcaValidationMessage {
  type: string;
  code?: string;
  category?: string;
  message: string;
  status?: string;
}

export interface ZatcaInvoiceSubmitResponse {
  validationResults: {
    status: 'PASS' | 'WARNING' | 'ERROR';
    infoMessages?: ZatcaValidationMessage[];
    warningMessages?: ZatcaValidationMessage[];
    errorMessages?: ZatcaValidationMessage[];
  };
  /** Reporting status for simplified invoices */
  reportingStatus?: string;
  /** Base64 cleared invoice XML returned for B2B clearance */
  clearedInvoice?: string;
}

// ─── Internal fetch helper ────────────────────────────────────────────────────

interface FetchOptions {
  method?: string;
  body?: string;
  /** Basic-auth token (binarySecurityToken) */
  authToken?: string;
  /** Basic-auth secret */
  authSecret?: string;
  /** One-time password for CSID onboarding steps */
  otp?: string;
}

async function zatcaFetch<T>(
  env: ZatcaEnvironment,
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const url = `${BASE_URLS[env]}${path}`;

  const headers: Record<string, string> = {
    'Accept-Version': 'V2',
    'Content-Type': 'application/json',
    'Accept-Language': 'en',
  };

  if (options.otp) {
    headers['OTP'] = options.otp;
  }

  if (options.authToken && options.authSecret) {
    const credentials = Buffer.from(`${options.authToken}:${options.authSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const res = await fetch(url, {
    method: options.method ?? 'POST',
    headers,
    body: options.body,
  });

  if (!res.ok) {
    let detail: string;
    try {
      detail = await res.text();
    } catch {
      detail = res.statusText;
    }
    throw new Error(`ZATCA API error ${res.status} ${res.statusText}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

/**
 * Step 1 — Submit a CSR to ZATCA and receive a Compliance CSID.
 *
 * The OTP is obtained from the ZATCA Fatoora portal and is valid for one hour.
 * Store the returned `binarySecurityToken` (= CSID) and `secret` securely —
 * they are required for subsequent compliance-check and production-CSID steps.
 *
 * @param csrPem    PKCS#10 CSR in PEM format (from generateZatcaKeyPair)
 * @param otp       One-time password from ZATCA Fatoora portal
 * @param env       Target environment (default: 'simulation')
 */
export async function requestComplianceCsid(
  csrPem: string,
  otp: string,
  env: ZatcaEnvironment = 'simulation',
): Promise<ZatcaComplianceCsidResponse> {
  const csrBase64 = Buffer.from(csrPem).toString('base64');
  return zatcaFetch<ZatcaComplianceCsidResponse>(env, '/onboarding/compliance', {
    otp,
    body: JSON.stringify({ csr: csrBase64 }),
  });
}

/**
 * Step 2 — Run compliance check by submitting a sample invoice against the
 * compliance CSID obtained in step 1.
 *
 * ZATCA requires at least one successful compliance check before a production
 * CSID can be issued.
 *
 * @param req             Invoice submission payload (hash, uuid, base64 XML)
 * @param complianceCsid  binarySecurityToken from requestComplianceCsid
 * @param secret          secret from requestComplianceCsid
 * @param env             Target environment (default: 'simulation')
 */
export async function checkCompliance(
  req: ZatcaInvoiceSubmitRequest,
  complianceCsid: string,
  secret: string,
  env: ZatcaEnvironment = 'simulation',
): Promise<ZatcaInvoiceSubmitResponse> {
  return zatcaFetch<ZatcaInvoiceSubmitResponse>(env, '/compliance/invoices', {
    authToken: complianceCsid,
    authSecret: secret,
    body: JSON.stringify(req),
  });
}

/**
 * Step 3 — Exchange a validated compliance CSID for a production CSID.
 *
 * Must only be called after a successful compliance check (step 2).
 * Store the returned production `binarySecurityToken` and `secret` securely —
 * they are used for all live invoice submissions.
 *
 * @param complianceRequestId  requestID from requestComplianceCsid response
 * @param complianceCsid       binarySecurityToken from requestComplianceCsid
 * @param complianceSecret     secret from requestComplianceCsid
 * @param env                  Target environment (default: 'simulation')
 */
export async function requestProductionCsid(
  complianceRequestId: string,
  complianceCsid: string,
  complianceSecret: string,
  env: ZatcaEnvironment = 'simulation',
): Promise<ZatcaProductionCsidResponse> {
  return zatcaFetch<ZatcaProductionCsidResponse>(env, '/onboarding/production', {
    authToken: complianceCsid,
    authSecret: complianceSecret,
    body: JSON.stringify({ compliance_request_id: complianceRequestId }),
  });
}

// ─── Invoice submission ───────────────────────────────────────────────────────

/**
 * Submit a B2B tax invoice for clearance.
 *
 * Required for:
 *   - B2B transactions
 *   - Invoices with a total amount >= 1 000 SAR (ZATCA threshold)
 *   - Credit/debit notes linked to a cleared B2B invoice
 *
 * The response may include a `clearedInvoice` (base64 XML) that must be
 * stored and, for B2B transactions, shared with the buyer.
 *
 * @param req              Invoice payload (hash, uuid, base64 signed XML)
 * @param productionCsid   binarySecurityToken from requestProductionCsid
 * @param productionSecret secret from requestProductionCsid
 * @param env              Target environment (default: 'production')
 */
export async function clearInvoice(
  req: ZatcaInvoiceSubmitRequest,
  productionCsid: string,
  productionSecret: string,
  env: ZatcaEnvironment = 'production',
): Promise<ZatcaInvoiceSubmitResponse> {
  return zatcaFetch<ZatcaInvoiceSubmitResponse>(env, '/invoices/clearance/single', {
    authToken: productionCsid,
    authSecret: productionSecret,
    body: JSON.stringify(req),
  });
}

/**
 * Submit a B2C simplified invoice for reporting.
 *
 * Required for B2C (simplified) invoices. The invoice is not cleared but
 * is reported to ZATCA for audit purposes.
 *
 * @param req              Invoice payload (hash, uuid, base64 signed XML)
 * @param productionCsid   binarySecurityToken from requestProductionCsid
 * @param productionSecret secret from requestProductionCsid
 * @param env              Target environment (default: 'production')
 */
export async function reportInvoice(
  req: ZatcaInvoiceSubmitRequest,
  productionCsid: string,
  productionSecret: string,
  env: ZatcaEnvironment = 'production',
): Promise<ZatcaInvoiceSubmitResponse> {
  return zatcaFetch<ZatcaInvoiceSubmitResponse>(env, '/invoices/reporting/single', {
    authToken: productionCsid,
    authSecret: productionSecret,
    body: JSON.stringify(req),
  });
}
