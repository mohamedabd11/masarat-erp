/**
 * ZATCA e-invoice pipeline.
 *
 * Two halves:
 *
 *  1. buildZatcaInvoiceRecord() — pure. Derives the persistable ZATCA fields
 *     (transaction type, Phase 1 QR, structured UBL payload) from invoice
 *     amounts at issuance time. No I/O, fully unit-testable.
 *
 *  2. submitInvoiceToZatca() — integration. Loads the agency's encrypted CSID
 *     credentials, signs the UBL XML, maintains the PIH hash chain + ICV
 *     counter, and clears (B2B) or reports (B2C) the invoice with ZATCA.
 *     It is a gated no-op until the agency completes production onboarding,
 *     so calling it on every invoice creation is safe.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies, invoices } from '@/lib/schema';
import { decrypt } from '@/lib/crypto';
import { buildZatcaQr } from '@/lib/zatca-qr';
import {
  buildInvoiceXml,
  signInvoiceXmlWithQr,
  clearInvoice,
  reportInvoice,
} from '@masarat/zatca';
import type {
  ZatcaInvoice,
  ZatcaInvoiceLine,
  ZatcaInvoiceTypeCode,
  ZatcaTransactionType,
  ZatcaVatCategory,
  ZatcaExemptionReason,
  ZatcaEnvironment,
  ZatcaInvoiceSubmitResponse,
} from '@masarat/zatca';

/**
 * Previous Invoice Hash for the FIRST invoice in an agency's chain.
 * Per the ZATCA SDK convention this is base64(hex(sha256("0"))).
 */
export const ZATCA_GENESIS_PIH =
  'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

// ─── Pure record builder ──────────────────────────────────────────────────────

export interface ZatcaRecordItem {
  description:      string;
  quantity:         number;
  unitPriceHalalas: number;   // excl. VAT
  vatHalalas:       number;
  totalHalalas:     number;   // incl. VAT
  /** Actual VAT category (S/Z/E/O) from the source booking line — overrides the vatHalalas-based inference below */
  vatCategory?:     ZatcaVatCategory;
  /** VATEX exemption reason for non-standard categories (e.g. VATEX-SA-32 international transport) */
  exemptionReason?: ZatcaExemptionReason;
}

export interface ZatcaInvoiceRecordInput {
  uuid:             string;
  invoiceNumber:    string;
  issueDateTime:    Date;
  sellerNameAr:     string;
  sellerNameEn?:    string | null;
  vatNumber:        string;
  crNumber?:        string | null;
  buyerName:        string;
  buyerVatNumber?:  string | null;
  vatRatePercent:   number;                 // agency VAT rate, e.g. 15
  invoiceTypeCode?: ZatcaInvoiceTypeCode;   // default '388'
  subtotalHalalas:  number;                 // excl. VAT
  vatHalalas:       number;
  totalHalalas:     number;                 // incl. VAT
  items?:           ZatcaRecordItem[];
  /** For credit/debit notes (381/383): the original invoice's ZATCA UUID + number */
  originalInvoiceUuid?:   string | null;
  originalInvoiceNumber?: string | null;
}

export interface ZatcaInvoiceRecord {
  uuid:            string;
  transactionType: ZatcaTransactionType;
  /** Phase 1 TLV QR (base64) — rendered on the printed invoice immediately */
  qr:              string;
  /** Structured UBL payload — input for Phase 2 signing/submission */
  invoice:         ZatcaInvoice;
}

/**
 * Builds the ZATCA record persisted with a new invoice.
 *
 * Throws when the inputs cannot produce a ZATCA-valid document (missing VAT
 * number, non-reconciling totals) — better to fail issuance loudly than to
 * store an invoice ZATCA will later reject.
 */
export function buildZatcaInvoiceRecord(input: ZatcaInvoiceRecordInput): ZatcaInvoiceRecord {
  if (!input.vatNumber || input.vatNumber.trim() === '') {
    throw new Error('ZATCA record requires the agency VAT number');
  }
  if (input.subtotalHalalas < 0 || input.vatHalalas < 0 || input.totalHalalas < 0) {
    throw new Error('ZATCA record amounts must be non-negative');
  }
  if (input.subtotalHalalas + input.vatHalalas !== input.totalHalalas) {
    throw new Error(
      `ZATCA totals do not reconcile: ${input.subtotalHalalas} + ${input.vatHalalas} != ${input.totalHalalas}`,
    );
  }

  // B2B when the buyer has a VAT number; otherwise simplified (B2C).
  const transactionType: ZatcaTransactionType = input.buyerVatNumber ? 'B2B' : 'B2C';
  const vatRate = input.vatRatePercent / 100;

  const lines = buildLines(input, vatRate);

  // VAT breakdown — BR-KSA requires a separate TaxSubtotal per distinct
  // (category, exemption reason) combination, e.g. an invoice mixing a
  // standard-rated hotel line (S) with a zero-rated international flight
  // line (Z / VATEX-SA-32) needs two TaxSubtotal entries.
  const breakdownGroups = new Map<string, { category: ZatcaVatCategory; exemptionReason?: ZatcaExemptionReason; taxableAmount: number; vatAmount: number }>();
  for (const line of lines) {
    const key = `${line.vatCategory}|${line.exemptionReason ?? ''}`;
    let group = breakdownGroups.get(key);
    if (!group) {
      group = { category: line.vatCategory, exemptionReason: line.exemptionReason, taxableAmount: 0, vatAmount: 0 };
      breakdownGroups.set(key, group);
    }
    group.taxableAmount += line.totalPriceExclVat;
    group.vatAmount     += line.vatAmount;
  }
  // Preserve the historical S-before-Z-before-others ordering for stable output.
  const CATEGORY_ORDER: Record<ZatcaVatCategory, number> = { S: 0, Z: 1, E: 2, O: 3 };
  const vatBreakdown: ZatcaInvoice['totals']['vatBreakdown'] = [...breakdownGroups.values()]
    .sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
      || (a.exemptionReason ?? '').localeCompare(b.exemptionReason ?? ''))
    .map(g => ({
      category:      g.category,
      taxableAmount: g.taxableAmount,
      vatAmount:     g.vatAmount,
      ...(g.exemptionReason ? { exemptionReason: g.exemptionReason } : {}),
    }));

  const invoice: ZatcaInvoice = {
    uuid:            input.uuid,
    invoiceNumber:   input.invoiceNumber,
    invoiceTypeCode: input.invoiceTypeCode ?? '388',
    transactionType,
    issueDateTime:   input.issueDateTime,
    currency:        'SAR',
    seller: {
      nameAr:    input.sellerNameAr,
      nameEn:    input.sellerNameEn ?? input.sellerNameAr,
      vatNumber: input.vatNumber,
      crNumber:  input.crNumber ?? '',
      // Address is snapshotted at submission time from agency settings;
      // empty placeholders keep the record buildable at issuance.
      address: { buildingNumber: '', streetName: '', district: '', city: '', postalCode: '', countryCode: 'SA' },
    },
    buyer: {
      name:      input.buyerName,
      vatNumber: input.buyerVatNumber ?? undefined,
    },
    lines,
    totals: {
      subtotalExclVat: input.subtotalHalalas,
      totalVat:        input.vatHalalas,
      grandTotal:      input.totalHalalas,
      vatBreakdown,
    },
    originalInvoiceUUID:   input.originalInvoiceUuid ?? undefined,
    originalInvoiceNumber: input.originalInvoiceNumber ?? undefined,
  };

  const qr = buildZatcaQr({
    sellerName:   input.sellerNameAr,
    vatNumber:    input.vatNumber,
    invoiceDate:  input.issueDateTime.toISOString().split('T')[0]!,
    totalHalalas: input.totalHalalas,
    vatHalalas:   input.vatHalalas,
  });

  return { uuid: input.uuid, transactionType, qr, invoice };
}

/**
 * Maps invoice items to ZATCA lines. Falls back to a single aggregate line
 * when no items exist or when item sums do not reconcile with the invoice
 * totals (a non-reconciling breakdown would make ZATCA reject the document).
 */
function buildLines(input: ZatcaInvoiceRecordInput, vatRate: number): ZatcaInvoiceLine[] {
  const items = input.items ?? [];
  const itemsTotal = items.reduce((s, i) => s + i.totalHalalas, 0);
  const itemsVat   = items.reduce((s, i) => s + i.vatHalalas, 0);
  const reconciles = items.length > 0
    && itemsTotal === input.totalHalalas
    && itemsVat === input.vatHalalas;

  if (!reconciles) {
    return [{
      id:                '1',
      name:              'خدمات سفر وسياحة',
      quantity:          1,
      unitCode:          'PCE',
      unitPriceExclVat:  input.subtotalHalalas,
      totalPriceExclVat: input.subtotalHalalas,
      vatCategory:       input.vatHalalas > 0 ? 'S' : 'Z',
      vatRate:           input.vatHalalas > 0 ? vatRate : 0,
      vatAmount:         input.vatHalalas,
    }];
  }

  return items.map((item, idx) => {
    const vatCategory = item.vatCategory ?? ((item.vatHalalas > 0 ? 'S' : 'Z') as ZatcaVatCategory);
    return {
      id:                String(idx + 1),
      name:              item.description,
      quantity:          item.quantity,
      unitCode:          'PCE' as const,
      unitPriceExclVat:  item.unitPriceHalalas,
      totalPriceExclVat: item.totalHalalas - item.vatHalalas,
      vatCategory,
      vatRate:           item.vatHalalas > 0 ? vatRate : 0,
      vatAmount:         item.vatHalalas,
      ...(vatCategory !== 'S' && item.exemptionReason ? { exemptionReason: item.exemptionReason } : {}),
    };
  });
}

// ─── Phase 2 submission (DB + network) ────────────────────────────────────────

export interface ZatcaSubmissionResult {
  submitted: boolean;
  status:    'cleared' | 'reported' | 'warning' | 'failed' | 'skipped';
  reason?:   string;
}

/**
 * Signs and submits an issued invoice to ZATCA (clearance for B2B,
 * reporting for B2C).
 *
 * Safe to call unconditionally after invoice creation:
 *  - skips unless the agency has completed PRODUCTION onboarding,
 *  - skips invoices already cleared/reported (idempotent on retries),
 *  - never throws — failures are recorded on the invoice row
 *    (zatca_status = 'failed') for later retry.
 *
 * The PIH chain and ICV counter advance inside a row-locked transaction at
 * signing time (per ZATCA, the chain follows document GENERATION order,
 * regardless of the subsequent API outcome).
 */
export async function submitInvoiceToZatca(agencyId: string, invoiceId: string): Promise<ZatcaSubmissionResult> {
  try {
    const [inv] = await db.select().from(invoices)
      .where(eq(invoices.id, invoiceId));
    if (!inv || inv.agencyId !== agencyId) {
      return { submitted: false, status: 'skipped', reason: 'invoice not found' };
    }
    if (!inv.isEInvoice || !inv.zatcaUuid || !inv.sellerVatNumber) {
      return { submitted: false, status: 'skipped', reason: 'not an e-invoice' };
    }
    if (inv.type !== '388' && inv.type !== '381' && inv.type !== '383') {
      return { submitted: false, status: 'skipped', reason: 'unsupported invoice type' };
    }
    if (inv.zatcaStatus === 'cleared' || inv.zatcaStatus === 'reported' || inv.zatcaStatus === 'warning') {
      return { submitted: false, status: 'skipped', reason: 'already submitted' };
    }

    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
    if (!agency) return { submitted: false, status: 'skipped', reason: 'agency not found' };

    if (agency.zatcaOnboardingStatus !== 'production') {
      return { submitted: false, status: 'skipped', reason: 'agency not production-onboarded' };
    }
    if (!agency.zatcaProductionCsid || !agency.zatcaProductionSecret
      || !agency.zatcaPrivateKey || !agency.zatcaCertificatePem) {
      return { submitted: false, status: 'skipped', reason: 'missing ZATCA credentials' };
    }

    const [csid, secret, privateKeyPem] = await Promise.all([
      decrypt(agency.zatcaProductionCsid),
      decrypt(agency.zatcaProductionSecret),
      decrypt(agency.zatcaPrivateKey),
    ]);
    const certificatePem = agency.zatcaCertificatePem;

    // For credit/debit notes, fetch the original invoice for BillingReference
    let originalInvoiceUuid: string | undefined;
    let originalInvoiceNumber: string | undefined;
    if ((inv.type === '381' || inv.type === '383') && inv.originalInvoiceId) {
      const [origInv] = await db.select({ zatcaUuid: invoices.zatcaUuid, invoiceNumber: invoices.invoiceNumber })
        .from(invoices).where(eq(invoices.id, inv.originalInvoiceId));
      originalInvoiceUuid   = origInv?.zatcaUuid ?? undefined;
      originalInvoiceNumber = origInv?.invoiceNumber ?? undefined;
    }

    // Rebuild the UBL payload from the immutable invoice snapshot.
    const record = buildZatcaInvoiceRecord({
      uuid:            inv.zatcaUuid,
      invoiceNumber:   inv.invoiceNumber,
      issueDateTime:   inv.createdAt,
      sellerNameAr:    inv.sellerNameAr ?? agency.nameAr,
      sellerNameEn:    inv.sellerNameEn,
      vatNumber:       inv.sellerVatNumber,
      crNumber:        inv.sellerCrNumber,
      buyerName:       inv.buyerNameAr || inv.buyerNameEn || 'عميل نقدي',
      buyerVatNumber:  inv.buyerVatNumber ?? null,
      vatRatePercent:  agency.vatRate ?? 15,
      invoiceTypeCode: inv.type as '388' | '381' | '383',
      subtotalHalalas: inv.subtotalHalalas,
      vatHalalas:      inv.vatHalalas,
      totalHalalas:    inv.totalHalalas,
      items:           parseStoredInvoiceItems(inv.items),
      originalInvoiceUuid,
      originalInvoiceNumber,
    });

    // ── Advance the chain atomically: lock the agency row, take PIH + next ICV,
    //    sign, persist the signed artefacts, move the chain head forward. ──────
    const { signedXml, invoiceHash, qrCodeData, icv, pih } = await db.transaction(async (tx) => {
      const [locked] = await tx.select({
        pih:     agencies.zatcaLastInvoiceHash,
        counter: agencies.zatcaInvoiceCounter,
      }).from(agencies).where(eq(agencies.id, agencyId)).for('update');

      const pih = locked?.pih ?? ZATCA_GENESIS_PIH;
      const icv = Number(locked?.counter ?? 0) + 1;

      const xml = buildInvoiceXml(record.invoice, pih, icv);
      const signed = signInvoiceXmlWithQr({
        invoiceXml:     xml,
        privateKeyPem,
        certificatePem,
        sellerName:     record.invoice.seller.nameAr,
        vatNumber:      record.invoice.seller.vatNumber,
        issueDateTime:  record.invoice.issueDateTime,
        totalWithVat:   record.invoice.totals.grandTotal,
        totalVat:       record.invoice.totals.totalVat,
      });

      await tx.update(agencies).set({
        zatcaLastInvoiceHash: signed.invoiceHash,
        zatcaInvoiceCounter:  icv,
      }).where(eq(agencies.id, agencyId));

      await tx.update(invoices).set({
        zatcaHash:      signed.invoiceHash,
        zatcaQr:        signed.qrCodeData,
        zatcaSignedXml: signed.signedXml,
        zatcaPih:       pih,
        zatcaIcv:       icv,
        zatcaStatus:    'pending',
      }).where(eq(invoices.id, invoiceId));

      return { ...signed, icv, pih };
    });

    // ── Network call (outside the row lock) ─────────────────────────────────
    const env = (agency.zatcaEnvironment === 'production' ? 'production' : 'simulation') as ZatcaEnvironment;
    const payload = {
      invoiceHash,
      uuid:    inv.zatcaUuid,
      invoice: Buffer.from(signedXml, 'utf8').toString('base64'),
    };

    let response: ZatcaInvoiceSubmitResponse;
    try {
      response = record.transactionType === 'B2B'
        ? await clearInvoice(payload, csid, secret, env)
        : await reportInvoice(payload, csid, secret, env);
    } catch (apiErr) {
      await db.update(invoices).set({
        zatcaStatus:      'failed',
        zatcaSubmittedAt: new Date(),
        zatcaResponse:    { error: String(apiErr) },
      }).where(eq(invoices.id, invoiceId));
      return { submitted: false, status: 'failed', reason: String(apiErr) };
    }

    const vStatus = response.validationResults?.status;
    const status: ZatcaSubmissionResult['status'] =
      vStatus === 'PASS'    ? (record.transactionType === 'B2B' ? 'cleared' : 'reported')
      : vStatus === 'WARNING' ? 'warning'
      : 'failed';

    await db.update(invoices).set({
      zatcaStatus:      status,
      zatcaSubmittedAt: new Date(),
      zatcaResponse:    response as unknown as Record<string, unknown>,
    }).where(eq(invoices.id, invoiceId));

    return { submitted: status !== 'failed', status };
  } catch (err) {
    // Submission must never break invoice issuance — log and surface as failed.
    console.error(JSON.stringify({ event: 'zatca_submit_failed', invoiceId, error: String(err) }));
    return { submitted: false, status: 'failed', reason: String(err) };
  }
}

/**
 * Parses an invoices.items-shaped JSONB value into ZATCA record items.
 * Returns undefined when the shape is invalid — callers fall back to the
 * single aggregate line inside buildZatcaInvoiceRecord().
 */
export function parseStoredInvoiceItems(raw: unknown): ZatcaRecordItem[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const items: ZatcaRecordItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const it = entry as Record<string, unknown>;
    if (typeof it['description'] !== 'string'
      || typeof it['quantity'] !== 'number'
      || typeof it['unitPriceHalalas'] !== 'number'
      || typeof it['vatHalalas'] !== 'number'
      || typeof it['totalHalalas'] !== 'number') return undefined;
    items.push({
      description:      it['description'],
      quantity:         it['quantity'],
      unitPriceHalalas: it['unitPriceHalalas'],
      vatHalalas:       it['vatHalalas'],
      totalHalalas:     it['totalHalalas'],
      vatCategory:      typeof it['vatCategory'] === 'string' ? it['vatCategory'] as ZatcaVatCategory : undefined,
      exemptionReason:  typeof it['exemptionReason'] === 'string' ? it['exemptionReason'] as ZatcaExemptionReason : undefined,
    });
  }
  return items;
}

/**
 * Infers the ZATCA VATEX exemption reason for a zero-rated (Z) line from its
 * service type and booking context. Returns undefined for non-Z categories or
 * when no specific VATEX code can be determined — the line is still emitted
 * as Z but without a TaxExemptionReasonCode (status quo behaviour).
 *
 * Covers the two cases that make up the bulk of zero-rated travel-agency
 * supplies in KSA: international passenger transport (VATEX-SA-32) and
 * Umrah/Hajj packages (VATEX-SA-34-1).
 */
export function inferZatcaExemptionReason(
  vatCategory: string,
  lineServiceType: string | null | undefined,
  bookingServiceType: string | null | undefined,
  isInternational: boolean,
): ZatcaExemptionReason | undefined {
  if (vatCategory !== 'Z') return undefined;

  const svc = (lineServiceType ?? bookingServiceType ?? '').toLowerCase();
  if ((svc === 'flight' || svc === 'flights') && isInternational) {
    return 'VATEX-SA-32';
  }
  if (svc === 'umrah' || svc === 'hajj') {
    return 'VATEX-SA-34-1';
  }
  return undefined;
}
