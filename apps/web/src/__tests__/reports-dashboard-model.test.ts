import { describe, expect, it } from 'vitest';
import { dashboardCsvRows, dashboardPeriod, dashboardTotals, emptyDashboardMonth, hasDashboardActivity } from '@/lib/reports-dashboard-model';
import { incomeStatementPeriod } from '@/lib/income-statement-model';

describe('reports dashboard periods and presentation totals', () => {
  const now = new Date('2026-09-08T20:00:00+03:00');

  it('uses an exact year and one current-date cutoff, and rejects partial/future years', () => {
    expect(dashboardPeriod(null, now)).toEqual({ year: 2026, from: '2026-01-01', to: '2026-09-08' });
    expect(dashboardPeriod('2025', now)).toEqual({ year: 2025, from: '2025-01-01', to: '2025-12-31' });
    expect(() => dashboardPeriod('2026junk', now)).toThrow();
    expect(() => dashboardPeriod('2027', now)).toThrow();
  });

  it('clamps current-year quarters but keeps complete historical quarters', () => {
    expect(incomeStatementPeriod(2026, 3, now)).toEqual({ from: '2026-07-01', to: '2026-09-08' });
    expect(incomeStatementPeriod(2025, 1, now)).toEqual({ from: '2025-01-01', to: '2025-03-31' });
  });

  it('retains refund-only, zero-net-document, and expense-only months', () => {
    expect(hasDashboardActivity({ ...emptyDashboardMonth(1), documents: 1, rev: 0 })).toBe(true);
    expect(hasDashboardActivity({ ...emptyDashboardMonth(2), documents: 1, rev: -5_000 })).toBe(true);
    expect(hasDashboardActivity({ ...emptyDashboardMonth(3), expenses: 2_000, netIncome: -2_000, hasLedgerActivity: true })).toBe(true);
    expect(hasDashboardActivity(emptyDashboardMonth(4))).toBe(false);
  });

  it('uses the same signed figures for screen totals and CSV totals', () => {
    const rows = [
      { ...emptyDashboardMonth(1), bookings: 2, documents: 2, rev: 100_000, vat: 15_000, grandTotal: 115_000, revenue: 80_000, expenses: 30_000, netIncome: 50_000 },
      { ...emptyDashboardMonth(2), documents: 1, rev: -20_000, vat: -3_000, grandTotal: -23_000, revenue: -20_000, expenses: -5_000, netIncome: -15_000 },
    ];
    expect(dashboardTotals(rows)).toEqual({ bookings: 2, documents: 3, rev: 80_000, vat: 12_000,
      grandTotal: 92_000, revenue: 60_000, expenses: 25_000, netIncome: 35_000 });
    const csv = dashboardCsvRows(rows, { from: '2026-01-01', to: '2026-09-08' }, true);
    expect(csv.at(-1)).toEqual(['الإجمالي', 2, 3, 800, 120, 920, 600, 250, 350]);
    expect(csv[5]).toEqual(['2026-02', 0, 1, -200, -30, -230, -200, -50, -150]);
  });
});
