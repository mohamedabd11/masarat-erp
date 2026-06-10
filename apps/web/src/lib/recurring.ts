/**
 * Recurring invoice scheduling + generation.
 *
 * `calcNextIssueDate` is the single source of truth for advancing a schedule
 * (shared by the create route and the generator).
 *
 * `generateDueRecurringInvoices` issues an invoice for every active schedule whose
 * nextIssueAt has arrived. It mirrors the journal-entry logic of
 * POST /api/invoices/create-direct (Dr 1120 / Cr 4100 / Cr 2200) so generated
 * invoices are indistinguishable from manually-created direct invoices.
 *
 * Concurrency: each schedule is advanced with a conditional UPDATE that matches the
 * exact nextIssueAt we read. Two concurrent runs cannot both issue for the same
 * period — the loser matches 0 rows and the whole transaction rolls back, so no
 * duplicate invoice and no skipped period.
 */
import { eq, and, lte, gte, or, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { recurringInvoices, invoices, journalEntries, journalLines, agencies } from './schema';
import { getNextInvoiceNumber, getNextJournalNumber } from './invoice-counter';
import { assertPeriodOpen } from './period-lock';
import { buildZatcaInvoiceRecord, parseStoredInvoiceItems, submitInvoiceToZatca } from './zatca-einvoice';

const AC = {
  receivable: { code: '1120', ar: 'ذمم مدينة - عملاء',           en: 'Accounts Receivable' },
  revenue:    { code: '4100', ar: 'إيراد خدمات السفر',            en: 'Revenue - Travel Services' },
  vatPayable: { code: '2200', ar: 'ضريبة القيمة المضافة مستحقة', en: 'VAT Payable' },
};

/**
 * Advance a schedule date by one period. All arithmetic is in UTC and clamps the
 * target day to the last day of the target month, so a month-end schedule never
 * skips a month (e.g. monthly from 2026-01-31 → 2026-02-28, not 2026-03-31).
 */
export function calcNextIssueDate(frequency: string, dayOfMonth: number, from: Date): string {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();      // 0-indexed
  const d = from.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (yy: number, mm0: number, dd: number) => `${yy}-${pad(mm0 + 1)}-${pad(dd)}`;

  if (frequency === 'weekly') {
    const nd = new Date(Date.UTC(y, m, d) + 7 * 24 * 60 * 60 * 1000);
    return fmt(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate());
  }

  const addMonths = (n: number): string => {
    const total   = m + n;
    const yy      = y + Math.floor(total / 12);
    const mm      = ((total % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return fmt(yy, mm, Math.min(dayOfMonth || d, lastDay));
  };

  if (frequency === 'monthly')   return addMonths(1);
  if (frequency === 'quarterly') return addMonths(3);
  if (frequency === 'yearly') {
    const lastDay = new Date(Date.UTC(y + 1, m + 1, 0)).getUTCDate();
    return fmt(y + 1, m, Math.min(d, lastDay));
  }
  return fmt(y, m, d); // unknown frequency — no advance (defensive)
}

export interface RecurringRunResult {
  generated: number;
  skipped:   number;
  errors:    number;
  invoiceIds: string[];
}

export async function generateDueRecurringInvoices(now: Date = new Date()): Promise<RecurringRunResult> {
  const today = now.toISOString().split('T')[0]!;

  // Active schedules due today (or overdue), not past their end date.
  const due = await db
    .select()
    .from(recurringInvoices)
    .where(and(
      eq(recurringInvoices.isActive, true),
      lte(recurringInvoices.nextIssueAt, today),
      or(isNull(recurringInvoices.endDate), gte(recurringInvoices.endDate, today)),
    ))
    .limit(200);

  const out: RecurringRunResult = { generated: 0, skipped: 0, errors: 0, invoiceIds: [] };
  if (due.length === 0) return out;

  const agencyCache = new Map<string, typeof agencies.$inferSelect | null>();

  for (const r of due) {
    // Misconfigured zero-amount template — nothing to invoice. Skip without
    // advancing so the owner can notice and fix it.
    if ((r.totalHalalas ?? 0) <= 0) { out.skipped++; continue; }

    try {
      const newInvoiceId = await db.transaction(async (tx) => {
        // ── Race-safe claim: advance the schedule only if nextIssueAt is still
        // exactly what we read. 0 rows → another run already issued this period.
        const dayOfMonth = r.dayOfMonth ?? new Date(r.startDate).getDate();
        const nextAfter  = calcNextIssueDate(r.frequency, dayOfMonth, new Date(r.nextIssueAt));
        const [claimed]  = await tx
          .update(recurringInvoices)
          .set({
            nextIssueAt:  nextAfter,
            lastIssuedAt: today,
            totalIssued:  sql`${recurringInvoices.totalIssued} + 1`,
            updatedAt:    now,
          })
          .where(and(
            eq(recurringInvoices.id, r.id),
            eq(recurringInvoices.nextIssueAt, r.nextIssueAt),
            eq(recurringInvoices.isActive, true),
          ))
          .returning({ id: recurringInvoices.id });
        if (!claimed) return null; // already claimed by a concurrent run

        // ── Agency snapshot (seller info + VAT registration), cached per run ──
        let agency = agencyCache.get(r.agencyId);
        if (agency === undefined) {
          const [a] = await tx.select().from(agencies).where(eq(agencies.id, r.agencyId));
          agency = a ?? null;
          agencyCache.set(r.agencyId, agency);
        }
        if (!agency) throw new Error(`agency ${r.agencyId} not found`);

        await assertPeriodOpen(r.agencyId, today, tx);

        const isVatRegistered = agency.isVatRegistered ?? false;
        const subtotalHalalas = r.subtotalHalalas;
        const vatHalalas      = r.vatHalalas;
        const totalHalalas    = r.totalHalalas;
        const year            = now.getFullYear();

        const invoiceNumber = await getNextInvoiceNumber(
          r.agencyId, isVatRegistered ? 'taxInvoice' : 'commercialInvoice', year, tx,
        );
        const jeNumber = await getNextJournalNumber(r.agencyId, year, tx);
        const invId    = crypto.randomUUID();
        const jeId     = crypto.randomUUID();
        const buyer    = r.buyerNameAr ?? r.title;

        // ZATCA e-invoice record. Schedule amounts are user-entered, so a
        // non-reconciling schedule must not block generation — fall back to
        // no QR (legacy behaviour) and log for correction.
        let zatcaRecord: ReturnType<typeof buildZatcaInvoiceRecord> | null = null;
        if (isVatRegistered && agency.vatNumber) {
          try {
            zatcaRecord = buildZatcaInvoiceRecord({
              uuid:            crypto.randomUUID(),
              invoiceNumber,
              issueDateTime:   now,
              sellerNameAr:    agency.nameAr,
              sellerNameEn:    agency.nameEn,
              vatNumber:       agency.vatNumber,
              crNumber:        agency.crNumber,
              buyerName:       buyer,
              vatRatePercent:  agency.vatRate ?? 15,
              subtotalHalalas,
              vatHalalas,
              totalHalalas,
              items:           parseStoredInvoiceItems(r.items),
            });
          } catch (zErr) {
            console.error(JSON.stringify({ event: 'recurring_zatca_record_failed', recurringId: r.id, error: String(zErr) }));
          }
        }

        await tx.insert(invoices).values({
          id:              invId,
          agencyId:        r.agencyId,
          invoiceNumber,
          type:            '388',
          customerId:      r.customerId ?? null,
          sellerNameAr:    agency.nameAr,
          sellerNameEn:    agency.nameEn ?? null,
          sellerVatNumber: agency.vatNumber ?? null,
          sellerCrNumber:  agency.crNumber  ?? null,
          sellerAddress:   agency.addressAr ?? null,
          buyerNameAr:     buyer,
          subtotalHalalas,
          vatHalalas,
          totalHalalas,
          paidHalalas:     0,
          issueDate:       today,
          status:          'issued',
          isEInvoice:      isVatRegistered,
          items:           (r.items ?? null) as never,
          notes:           r.notes ?? `فاتورة دورية: ${r.title}`,
          paymentMethod:   r.paymentMethod ?? null,
          journalEntryId:  jeId,
          createdBy:       r.createdBy ?? 'system',
          zatcaUuid:       zatcaRecord?.uuid ?? crypto.randomUUID(),
          zatcaQr:         zatcaRecord?.qr ?? null,
        });

        await tx.insert(journalEntries).values({
          id:                 jeId,
          agencyId:           r.agencyId,
          entryNumber:        jeNumber,
          date:               today,
          descriptionAr:      `فاتورة دورية ${invoiceNumber} — ${buyer}`,
          source:             'invoice',
          sourceId:           invId,
          isPosted:           true,
          totalDebitHalalas:  totalHalalas,
          totalCreditHalalas: totalHalalas,
          createdBy:          r.createdBy ?? 'system',
        });

        type JLine = {
          id: string; entryId: string; agencyId: string;
          accountCode: string; accountNameAr: string; accountNameEn: string;
          debitHalalas: number; creditHalalas: number; sortOrder: number;
        };
        const jLines: JLine[] = [
          { id: crypto.randomUUID(), entryId: jeId, agencyId: r.agencyId, accountCode: AC.receivable.code, accountNameAr: AC.receivable.ar, accountNameEn: AC.receivable.en, debitHalalas: totalHalalas, creditHalalas: 0,               sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId: r.agencyId, accountCode: AC.revenue.code,    accountNameAr: AC.revenue.ar,    accountNameEn: AC.revenue.en,    debitHalalas: 0,            creditHalalas: subtotalHalalas, sortOrder: 2 },
        ];
        if (vatHalalas > 0) {
          jLines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId: r.agencyId, accountCode: AC.vatPayable.code, accountNameAr: AC.vatPayable.ar, accountNameEn: AC.vatPayable.en, debitHalalas: 0, creditHalalas: vatHalalas, sortOrder: 3 });
        }
        await tx.insert(journalLines).values(jLines);

        return invId;
      });

      if (newInvoiceId) {
        out.generated++;
        out.invoiceIds.push(newInvoiceId);
        // Phase 2 submission — gated on production onboarding, never throws.
        await submitInvoiceToZatca(r.agencyId, newInvoiceId);
      }
      else out.skipped++;
    } catch (err) {
      out.errors++;
      console.error(JSON.stringify({ event: 'recurring_invoice_generation_failed', recurringId: r.id, error: String(err) }));
    }
  }

  return out;
}
