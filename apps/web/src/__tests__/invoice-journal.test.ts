/**
 * Unit tests + readable scenario demo for the REAL invoice journal builders
 * (`lib/invoice-journal.ts`) — the GL double-entry produced when a sales invoice
 * is issued. These are the exact functions `api/invoices/create` calls, extracted
 * so the core revenue-recognition path finally has direct coverage.
 *
 * Every scenario asserts the fundamental invariant Σdr === Σcr, plus the correct
 * account amounts. The final `describe` prints a human-readable trial balance for
 * each daily business scenario (run with: `pnpm --filter @masarat/web test invoice-journal`).
 */
import { describe, it, expect } from 'vitest';
import {
  buildInvoiceJournalLines,
  buildJournalLinesFromBookingLines,
  reconcileInvoiceRounding,
  type InvoiceJournalLine,
} from '@/lib/invoice-journal';
import { buildRefundJournalLines, type OriginalJournalLine } from '@/lib/refund-journal';
import type { BookingLine } from '@/lib/schema';

// ─── helpers ────────────────────────────────────────────────────────────────────

const sum  = (ls: InvoiceJournalLine[], k: 'dr' | 'cr') => ls.reduce((s, l) => s + l[k], 0);
const drOf = (ls: InvoiceJournalLine[], code: string) => ls.filter(l => l.code === code).reduce((s, l) => s + l.dr, 0);
const crOf = (ls: InvoiceJournalLine[], code: string) => ls.filter(l => l.code === code).reduce((s, l) => s + l.cr, 0);
const isBalanced = (ls: InvoiceJournalLine[]) => sum(ls, 'dr') === sum(ls, 'cr');

/** Minimal booking_line carrying only the fields the journal builder reads. */
function bl(p: { revenueModel: 'agent' | 'principal'; priceExclVat: number; vat: number; cost: number }): BookingLine {
  return {
    revenueModel:             p.revenueModel,
    totalPriceExclVatHalalas: p.priceExclVat,
    vatHalalas:               p.vat,
    totalCostHalalas:         p.cost,
  } as unknown as BookingLine;
}

// ════════════════════════════════════════════════════════════════════════════
//  LEGACY aggregated path — buildInvoiceJournalLines
// ════════════════════════════════════════════════════════════════════════════

describe('buildInvoiceJournalLines — principal (VAT-registered, with cost)', () => {
  const lines = buildInvoiceJournalLines('principal', true, 11_500_00, 6_000_00, 0, 1_500_00, 10_000_00, false);
  it('Dr AR / Cr revenue + VAT / Dr COGS / Cr AP, balanced', () => {
    expect(drOf(lines, '1120')).toBe(11_500_00);
    expect(crOf(lines, '4100')).toBe(10_000_00);
    expect(crOf(lines, '2200')).toBe(1_500_00);
    expect(drOf(lines, '5000')).toBe(6_000_00);
    expect(crOf(lines, '2000')).toBe(6_000_00);
    expect(isBalanced(lines)).toBe(true);
  });
});

describe('buildInvoiceJournalLines — principal deferred (future-dated package)', () => {
  const lines = buildInvoiceJournalLines('principal', true, 11_500_00, 0, 0, 1_500_00, 10_000_00, true);
  it('credits Deferred Revenue (3201) instead of 4100, VAT still recognised now', () => {
    expect(crOf(lines, '3201')).toBe(10_000_00);
    expect(crOf(lines, '4100')).toBe(0);
    expect(crOf(lines, '2200')).toBe(1_500_00);
    expect(isBalanced(lines)).toBe(true);
  });
});

describe('buildInvoiceJournalLines — agent with breakdown', () => {
  const lines = buildInvoiceJournalLines('agent', true, 1_615_00, 1_500_00, 100_00, 15_00, 1_600_00, false);
  it('Dr AR / Cr AP cost / Cr agent fee / Cr VAT, revenue = fee only, balanced', () => {
    expect(drOf(lines, '1120')).toBe(1_615_00);
    expect(crOf(lines, '2000')).toBe(1_500_00);
    expect(crOf(lines, '4000')).toBe(100_00);
    expect(crOf(lines, '2200')).toBe(15_00);
    expect(isBalanced(lines)).toBe(true);
  });
});

describe('buildInvoiceJournalLines — agent legacy DRIFT (the balance fix)', () => {
  // grandTotal 1615.50 ≠ cost+fee+vat 1615.00: a 50-halala (sub-1-SAR) drift on
  // legacy data. Before the fix this posted Dr 161550 ≠ Cr 161500. Now the
  // residual is absorbed into agent revenue (4000), never into VAT.
  const lines = buildInvoiceJournalLines('agent', true, 1_615_50, 1_500_00, 100_00, 15_00, 1_600_00, false);
  it('stays exactly balanced', () => {
    expect(isBalanced(lines)).toBe(true);
  });
  it('absorbs the 50-halala residual into agent revenue (4000), VAT untouched', () => {
    expect(crOf(lines, '2200')).toBe(15_00);        // VAT exact
    expect(crOf(lines, '4000')).toBe(100_00 + 50);  // fee + 50-halala residual
    expect(drOf(lines, '1120')).toBe(1_615_50);     // AR exact
  });
});

describe('buildInvoiceJournalLines — guards', () => {
  it('returns no lines for a zero-total invoice', () => {
    expect(buildInvoiceJournalLines('principal', true, 0, 0, 0, 0, 0, false)).toEqual([]);
  });
  it('throws when drift exceeds the 1 SAR tolerance (corrupt legacy data)', () => {
    // grandTotal 2000 vs components 1615 → 385-halala gap, not rounding.
    expect(() => buildInvoiceJournalLines('agent', true, 2_000_00, 1_500_00, 100_00, 15_00, 1_600_00, false)).toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  NEW booking_lines path — buildJournalLinesFromBookingLines
// ════════════════════════════════════════════════════════════════════════════

describe('buildJournalLinesFromBookingLines — single principal line', () => {
  const lines = buildJournalLinesFromBookingLines(
    [bl({ revenueModel: 'principal', priceExclVat: 10_000_00, vat: 1_500_00, cost: 6_000_00 })], true, false);
  it('Dr AR 11,500 / Cr 4100 / Cr VAT / Dr COGS / Cr AP, balanced', () => {
    expect(drOf(lines, '1120')).toBe(11_500_00);
    expect(crOf(lines, '4100')).toBe(10_000_00);
    expect(crOf(lines, '2200')).toBe(1_500_00);
    expect(drOf(lines, '5000')).toBe(6_000_00);
    expect(crOf(lines, '2000')).toBe(6_000_00);
    expect(isBalanced(lines)).toBe(true);
  });
});

describe('buildJournalLinesFromBookingLines — single agent line', () => {
  const lines = buildJournalLinesFromBookingLines(
    [bl({ revenueModel: 'agent', priceExclVat: 1_600_00, vat: 15_00, cost: 1_500_00 })], true, false);
  it('revenue = fee (price − cost) only; pass-through cost to AP; balanced', () => {
    expect(drOf(lines, '1120')).toBe(1_615_00);
    expect(crOf(lines, '2000')).toBe(1_500_00);
    expect(crOf(lines, '4000')).toBe(100_00);
    expect(crOf(lines, '2200')).toBe(15_00);
    expect(crOf(lines, '5000')).toBe(0); // agent → no COGS
    expect(isBalanced(lines)).toBe(true);
  });
});

describe('buildJournalLinesFromBookingLines — mixed agent + principal', () => {
  const lines = buildJournalLinesFromBookingLines([
    bl({ revenueModel: 'agent',     priceExclVat: 1_600_00, vat: 15_00,  cost: 1_500_00 }),
    bl({ revenueModel: 'principal', priceExclVat: 5_000_00, vat: 750_00, cost: 3_000_00 }),
  ], true, false);
  it('books BOTH revenue accounts (4000 fee AND 4100), balanced', () => {
    expect(crOf(lines, '4000')).toBe(100_00);
    expect(crOf(lines, '4100')).toBe(5_000_00);
    expect(isBalanced(lines)).toBe(true);
  });
});

describe('buildJournalLinesFromBookingLines — not VAT-registered', () => {
  const lines = buildJournalLinesFromBookingLines(
    [bl({ revenueModel: 'principal', priceExclVat: 10_000_00, vat: 1_500_00, cost: 0 })], false, false);
  it('no VAT line; AR = price excl VAT; balanced', () => {
    expect(crOf(lines, '2200')).toBe(0);
    expect(drOf(lines, '1120')).toBe(10_000_00);
    expect(isBalanced(lines)).toBe(true);
  });
});

describe('buildJournalLinesFromBookingLines — below-cost line (VAT-corruption fix)', () => {
  // Agent line sold 1 SAR below cost: fee clips to 0, leaving a −100 residual.
  // Old behaviour folded it into the LAST credit (the VAT line) → corrupted tax.
  // Now it lands on revenue / rounding, never on VAT.
  const lines = buildJournalLinesFromBookingLines(
    [bl({ revenueModel: 'agent', priceExclVat: 1_000_00, vat: 150_00, cost: 1_100_00 })], true, false);
  it('stays balanced and leaves VAT (2200) exactly as priced', () => {
    expect(isBalanced(lines)).toBe(true);
    expect(crOf(lines, '2200')).toBe(150_00); // untouched — the fix
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  reconcileInvoiceRounding — direct
// ════════════════════════════════════════════════════════════════════════════

describe('reconcileInvoiceRounding', () => {
  it('is a no-op on an already-balanced entry', () => {
    const ls: InvoiceJournalLine[] = [
      { code: '1120', ar: '', en: '', dr: 100, cr: 0 },
      { code: '4100', ar: '', en: '', dr: 0, cr: 100 },
    ];
    expect(reconcileInvoiceRounding(ls)).toHaveLength(2);
    expect(isBalanced(ls)).toBe(true);
  });
  it('books to 8399 when there is no revenue credit to absorb into', () => {
    const ls: InvoiceJournalLine[] = [
      { code: '1120', ar: '', en: '', dr: 105, cr: 0 },
      { code: '2000', ar: '', en: '', dr: 0, cr: 100 },
    ];
    const out = reconcileInvoiceRounding(ls);
    expect(isBalanced(out)).toBe(true);
    expect(out.some(l => l.code === '8399')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  Readable daily-scenario demo (real builders → trial balance)
// ════════════════════════════════════════════════════════════════════════════

describe('عرض السيناريوهات اليومية (الكود الإنتاجي الحقيقي)', () => {
  const money = (h: number) => (h / 100).toFixed(2);
  const pad   = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);
  const padN  = (s: string, n: number) => (' '.repeat(n) + s).slice(-n);

  function trialBalance(title: string, lines: InvoiceJournalLine[]) {
    const acc = new Map<string, { ar: string; dr: number; cr: number }>();
    for (const l of lines) {
      const a = acc.get(l.code) ?? { ar: l.ar, dr: 0, cr: 0 };
      a.dr += l.dr; a.cr += l.cr; acc.set(l.code, a);
    }
    console.log(`\n  ▸ ${title}`);
    console.log('  ' + '─'.repeat(64));
    let dr = 0, cr = 0;
    for (const code of [...acc.keys()].sort()) {
      const a = acc.get(code)!; const net = a.dr - a.cr;
      if (net === 0) continue;
      dr += net > 0 ? net : 0; cr += net < 0 ? -net : 0;
      console.log('  ' + pad(`${code} ${a.ar}`, 34) + padN(net > 0 ? money(net) : '', 14) + padN(net < 0 ? money(-net) : '', 14));
    }
    console.log('  ' + '─'.repeat(64));
    console.log('  ' + pad('الإجمالي', 34) + padN(money(dr), 14) + padN(money(cr), 14) + (dr === cr ? '  ✓' : '  ✗'));
    expect(dr).toBe(cr);
  }

  it('يطبع ميزان المراجعة لكل سيناريو يومي', () => {
    trialBalance('فاتورة طيران (وكيل): تذكرة 1500 + رسوم 100 + ضريبة 15',
      buildJournalLinesFromBookingLines([bl({ revenueModel: 'agent', priceExclVat: 1_600_00, vat: 15_00, cost: 1_500_00 })], true, false));

    trialBalance('فاتورة باقة (أصيل): بيع 10000 + ضريبة 1500، تكلفة 6000',
      buildJournalLinesFromBookingLines([bl({ revenueModel: 'principal', priceExclVat: 10_000_00, vat: 1_500_00, cost: 6_000_00 })], true, false));

    trialBalance('فاتورة عمرة مؤجلة (رحلة بعد شهر): بيع 5000 معفاة، إيراد مؤجل 3201',
      buildJournalLinesFromBookingLines([bl({ revenueModel: 'principal', priceExclVat: 5_000_00, vat: 0, cost: 3_300_00 })], true, true));

    // Refund — the REAL production refund engine (buildRefundJournalLines)
    const original: OriginalJournalLine[] = [
      { accountCode: '1120', accountNameAr: 'ذمم مدينة', accountNameEn: '', debitHalalas: 11_500_00, creditHalalas: 0 },
      { accountCode: '4100', accountNameAr: 'إيراد',     accountNameEn: '', debitHalalas: 0, creditHalalas: 10_000_00 },
      { accountCode: '2200', accountNameAr: 'ضريبة',     accountNameEn: '', debitHalalas: 0, creditHalalas: 1_500_00 },
      { accountCode: '5000', accountNameAr: 'تكلفة',     accountNameEn: '', debitHalalas: 6_000_00, creditHalalas: 0 },
      { accountCode: '2000', accountNameAr: 'موردون',    accountNameEn: '', debitHalalas: 0, creditHalalas: 6_000_00 },
    ];
    const refund = buildRefundJournalLines({
      originalLines: original, originalTotalHalalas: 11_500_00, originalVatHalalas: 1_500_00,
      paidHalalas: 11_500_00, refundAmountHalalas: 9_200_00, cancellationFeeHalalas: 2_300_00, isEInvoice: true,
    }).map(l => ({ code: l.code, ar: l.ar, en: l.en, dr: l.dr, cr: l.cr }));
    trialBalance('استرداد جزئي: يُعاد 9200، رسوم إلغاء 2300 (عكس قيد الفاتورة الأصلية)', refund);
  });
});
