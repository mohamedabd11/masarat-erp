import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies, invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { getNextInvoiceNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { logAudit } from '@/lib/audit';
import type { Tx } from '@/lib/db';

const AC = {
  receivable: { code: '1120', ar: 'ذمم مدينة - عملاء',           en: 'Accounts Receivable' },
  revenue:    { code: '4100', ar: 'إيراد خدمات السفر',            en: 'Revenue - Travel Services' },
  vatPayable: { code: '2200', ar: 'ضريبة القيمة المضافة مستحقة', en: 'VAT Payable' },
};

interface DirectInvoiceLine {
  serviceType:      string;
  descriptionAr:    string;
  descriptionEn?:   string;
  quantity:         number;
  unitPriceHalalas: number;  // excl. VAT
}

interface CreateDirectInvoiceBody {
  buyerNameAr:   string;
  buyerNameEn?:  string;
  buyerPhone?:   string;
  customerId?:   string;
  lines:         DirectInvoiceLine[];
  supplierName?: string;
  supplierId?:   string;
  dueDate?:      string;
  notes?:        string;
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const rl = await checkRateLimit(`${agencyId}:${getClientIp(request)}`, 'financial');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'تجاوزت الحد المسموح به من الطلبات. حاول مرة أخرى بعد دقيقة.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json() as CreateDirectInvoiceBody;

    if (!body.buyerNameAr?.trim()) {
      return NextResponse.json({ error: 'اسم العميل مطلوب' }, { status: 400 });
    }
    if (!body.lines?.length) {
      return NextResponse.json({ error: 'يجب إضافة بند واحد على الأقل' }, { status: 400 });
    }
    for (const line of body.lines) {
      if (!line.descriptionAr?.trim()) {
        return NextResponse.json({ error: 'وصف البند مطلوب لكل سطر' }, { status: 400 });
      }
      if (!Number.isFinite(line.unitPriceHalalas) || line.unitPriceHalalas < 0) {
        return NextResponse.json({ error: 'سعر البند غير صالح' }, { status: 400 });
      }
    }

    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
    if (!agency) return NextResponse.json({ error: 'وكالة غير موجودة' }, { status: 404 });

    const isVatRegistered = agency.isVatRegistered ?? false;
    const vatRate         = agency.vatRate ?? 15;
    const today           = new Date().toISOString().split('T')[0]!;

    // Compute totals
    const lines = body.lines.map(l => {
      const qty     = Math.max(1, Math.round(l.quantity || 1));
      const lineNet = Math.round(qty * l.unitPriceHalalas);
      const lineVat = isVatRegistered ? Math.round(lineNet * vatRate / 100) : 0;
      return { ...l, qty, lineNet, lineVat, lineTotal: lineNet + lineVat };
    });
    const subtotalHalalas = lines.reduce((s, l) => s + l.lineNet,   0);
    let   vatHalalas      = lines.reduce((s, l) => s + l.lineVat,   0);
    const totalHalalas    = subtotalHalalas + vatHalalas;

    if (totalHalalas <= 0) {
      return NextResponse.json({ error: 'إجمالي الفاتورة يجب أن يكون أكبر من صفر' }, { status: 400 });
    }

    await assertPeriodOpen(agencyId, today, db);

    const result = await db.transaction(async (tx: Tx) => {
      const now  = new Date();
      const year = now.getFullYear();

      const invoiceNumber = await getNextInvoiceNumber(
        agencyId, isVatRegistered ? 'taxInvoice' : 'commercialInvoice', year, tx,
      );
      const jeNumber = await getNextJournalNumber(agencyId, year, tx);
      const invId    = crypto.randomUUID();
      const jeId     = crypto.randomUUID();

      // Build ZATCA-compatible line items with proportional VAT
      // Last line absorbs any rounding difference
      const items = lines.map((l, idx) => {
        const isLast    = idx === lines.length - 1;
        const computedVatSum = lines.slice(0, idx).reduce((s, x) => s + x.lineVat, 0);
        const itemVat   = isLast ? vatHalalas - computedVatSum : l.lineVat;
        const itemTotal = l.lineNet + itemVat;
        return {
          description:      l.descriptionAr,
          descriptionEn:    l.descriptionEn ?? null,
          quantity:         l.qty,
          unitPriceHalalas: l.unitPriceHalalas,
          vatHalalas:       itemVat,
          totalHalalas:     itemTotal,
        };
      });

      await tx.insert(invoices).values({
        id:              invId,
        agencyId,
        invoiceNumber,
        type:            '380',
        customerId:      body.customerId      ?? null,
        sellerNameAr:    body.supplierName?.trim() || agency.nameAr,
        sellerNameEn:    body.supplierName?.trim() || (agency.nameEn ?? null),
        sellerVatNumber: agency.vatNumber     ?? null,
        sellerCrNumber:  agency.crNumber      ?? null,
        sellerAddress:   agency.addressAr     ?? null,
        buyerNameAr:     body.buyerNameAr.trim(),
        buyerNameEn:     body.buyerNameEn     ?? null,
        buyerPhone:      body.buyerPhone      ?? null,
        subtotalHalalas,
        vatHalalas,
        totalHalalas,
        paidHalalas:     0,
        issueDate:       today,
        dueDate:         body.dueDate         ?? null,
        status:          'issued',
        isEInvoice:      isVatRegistered,
        items,
        notes:           body.notes?.trim()   ?? null,
        journalEntryId:  jeId,
        createdBy:       uid,
      });

      // Journal entry — standard principal model
      // DR Receivable / CR Revenue / CR VAT Payable
      await tx.insert(journalEntries).values({
        id:                  jeId,
        agencyId,
        entryNumber:         jeNumber,
        date:                today,
        descriptionAr:       `فاتورة ${invoiceNumber} — ${body.buyerNameAr.trim()}`,
        source:              'invoice',
        sourceId:            invId,
        isPosted:            true,
        totalDebitHalalas:   totalHalalas,
        totalCreditHalalas:  totalHalalas,
        createdBy:           uid,
      });

      type JLine = {
        id: string; entryId: string; agencyId: string;
        accountCode: string; accountNameAr: string; accountNameEn: string;
        debitHalalas: number; creditHalalas: number; sortOrder: number;
      };
      const jLines: JLine[] = [
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC.receivable.code, accountNameAr: AC.receivable.ar, accountNameEn: AC.receivable.en, debitHalalas: totalHalalas,    creditHalalas: 0,               sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC.revenue.code,    accountNameAr: AC.revenue.ar,    accountNameEn: AC.revenue.en,    debitHalalas: 0,               creditHalalas: subtotalHalalas, sortOrder: 2 },
      ];
      if (vatHalalas > 0) {
        jLines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC.vatPayable.code, accountNameAr: AC.vatPayable.ar, accountNameEn: AC.vatPayable.en, debitHalalas: 0, creditHalalas: vatHalalas, sortOrder: 3 });
      }
      await tx.insert(journalLines).values(jLines);

      return { id: invId, invoiceNumber };
    });

    await logAudit({
      agencyId, userId: uid,
      action: 'create',
      resource: 'invoice',
      resourceId: result.id,
      after: { invoiceNumber: result.invoiceNumber, totalHalalas },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'direct_invoice_create_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
