import { describe, expect, it } from 'vitest';
import { buildCreditNoteJournalLines } from '@/lib/credit-note-journal';

const line = (accountCode: string, debitHalalas: number, creditHalalas: number) => ({
  accountCode,
  accountNameAr: accountCode,
  accountNameEn: accountCode,
  debitHalalas,
  creditHalalas,
});

const debit = (rows: ReturnType<typeof buildCreditNoteJournalLines>, code: string) =>
  rows.filter((row) => row.code === code).reduce((sum, row) => sum + row.dr, 0);
const credit = (rows: ReturnType<typeof buildCreditNoteJournalLines>, code: string) =>
  rows.filter((row) => row.code === code).reduce((sum, row) => sum + row.cr, 0);

describe('credit-note journal reversal', () => {
  it('partially reverses a principal invoice including COGS and supplier AP', () => {
    const rows = buildCreditNoteJournalLines({
      originalLines: [
        line('1120', 11_500, 0),
        line('4100', 0, 10_000),
        line('2200', 0, 1_500),
        line('5000', 6_000, 0),
        line('2000', 0, 6_000),
      ],
      originalTotalHalalas: 11_500,
      originalPaidHalalas: 0,
      creditNoteTotalHalalas: 5_750,
    });

    expect(debit(rows, '4100')).toBe(5_000);
    expect(debit(rows, '2200')).toBe(750);
    expect(debit(rows, '2000')).toBe(3_000);
    expect(credit(rows, '5000')).toBe(3_000);
    expect(credit(rows, '1120')).toBe(5_750);
    expect(rows.reduce((s, row) => s + row.dr, 0)).toBe(rows.reduce((s, row) => s + row.cr, 0));
  });

  it('reverses both supplier AP and agent fee for an agent invoice', () => {
    const rows = buildCreditNoteJournalLines({
      originalLines: [
        line('1120', 1_615, 0),
        line('2000', 0, 1_500),
        line('4000', 0, 100),
        line('2200', 0, 15),
      ],
      originalTotalHalalas: 1_615,
      originalPaidHalalas: 0,
      creditNoteTotalHalalas: 1_615,
    });

    expect(debit(rows, '2000')).toBe(1_500);
    expect(debit(rows, '4000')).toBe(100);
    expect(debit(rows, '2200')).toBe(15);
    expect(credit(rows, '1120')).toBe(1_615);
  });

  it('splits the customer credit between AR and deposits using the paid ratio', () => {
    const rows = buildCreditNoteJournalLines({
      originalLines: [line('1120', 11_500, 0), line('4100', 0, 10_000), line('2200', 0, 1_500)],
      originalTotalHalalas: 11_500,
      originalPaidHalalas: 4_600,
      creditNoteTotalHalalas: 5_750,
    });

    expect(credit(rows, '2300')).toBe(2_300);
    expect(credit(rows, '1120')).toBe(3_450);
  });

  it('rejects VAT that does not match the original invoice proportion', () => {
    expect(() => buildCreditNoteJournalLines({
      originalLines: [line('1120', 11_500, 0), line('4100', 0, 10_000), line('2200', 0, 1_500)],
      originalTotalHalalas: 11_500,
      originalPaidHalalas: 0,
      creditNoteTotalHalalas: 5_750,
      creditNoteVatHalalas: 0,
    })).toThrow(/لا تطابق/);
  });
});
