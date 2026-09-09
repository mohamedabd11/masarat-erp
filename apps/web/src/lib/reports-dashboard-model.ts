import { todayIsoDate } from './report-dates';

export interface ReportPeriod { from: string; to: string }

export interface DashboardMonth {
  month: number; // 1–12
  bookings: number;
  documents: number;
  rev: number; // Signed invoice subtotal; NOT accounting revenue.
  vat: number;
  grandTotal: number;
  revenue: number; // Posted revenue accounts.
  expenses: number; // Posted expense accounts.
  netIncome: number;
  hasLedgerActivity: boolean;
}

export interface DashboardReport {
  year: number;
  period: ReportPeriod;
  monthly: DashboardMonth[];
  typeMix: { type: string; count: number; rev: number }[];
}

/** One explicit cutoff for all dashboard measures; never include future activity. */
export function dashboardPeriod(value: string | null, now = new Date()): ReportPeriod & { year: number } {
  const today = todayIsoDate(now);
  const currentYear = Number(today.slice(0, 4));
  const year = value === null ? currentYear : Number(value);
  if ((value !== null && !/^\d{4}$/.test(value)) || !Number.isInteger(year)
    || year < 2000 || year > Math.min(2100, currentYear)) {
    throw new Error('سنة غير صالحة أو مستقبلية');
  }
  return { year, from: `${year}-01-01`, to: year === currentYear ? today : `${year}-12-31` };
}

export function emptyDashboardMonth(month: number): DashboardMonth {
  return { month, bookings: 0, documents: 0, rev: 0, vat: 0, grandTotal: 0,
    revenue: 0, expenses: 0, netIncome: 0, hasLedgerActivity: false };
}

export function hasDashboardActivity(row: DashboardMonth): boolean {
  return row.bookings > 0 || row.documents > 0 || row.hasLedgerActivity;
}

export function dashboardTotals(rows: readonly DashboardMonth[]) {
  return rows.reduce((total, row) => ({
    bookings: total.bookings + row.bookings, documents: total.documents + row.documents,
    rev: total.rev + row.rev, vat: total.vat + row.vat, grandTotal: total.grandTotal + row.grandTotal,
    revenue: total.revenue + row.revenue, expenses: total.expenses + row.expenses,
    netIncome: total.netIncome + row.netIncome,
  }), { bookings: 0, documents: 0, rev: 0, vat: 0, grandTotal: 0, revenue: 0, expenses: 0, netIncome: 0 });
}

/** Shared export values: no second financial calculation in the UI. */
export function dashboardCsvRows(rows: readonly DashboardMonth[], period: ReportPeriod, isAr: boolean): (string | number)[][] {
  const values = (row: ReturnType<typeof dashboardTotals>) => [row.bookings, row.documents,
    row.rev / 100, row.vat / 100, row.grandTotal / 100, row.revenue / 100, row.expenses / 100, row.netIncome / 100];
  return [
    [isAr ? 'من' : 'From', period.from, isAr ? 'إلى' : 'To', period.to],
    [isAr ? 'أساس الفترة: إنشاء الحجز، إصدار الفاتورة، تاريخ القيد المحاسبي' : 'Period basis: booking creation, invoice issue date, journal date'],
    [isAr ? 'المبالغ بالريال السعودي؛ الفواتير بعد الإشعارات، والربح من القيود المرحلة دون قيود الإقفال' : 'Amounts in SAR; invoices net of notes; profit from posted journals excluding closing entries'],
    isAr
      ? ['الشهر', 'الحجوزات', 'مستندات الفوترة', 'صافي الفواتير دون الضريبة', 'ضريبة الفواتير', 'صافي الفواتير شامل الضريبة', 'الإيرادات المحاسبية', 'المصروفات المحاسبية', 'صافي الربح / الخسارة']
      : ['Month', 'Bookings', 'Invoice documents', 'Net invoices excl. VAT', 'Invoice VAT', 'Net invoices incl. VAT', 'Accounting revenue', 'Accounting expenses', 'Net profit / loss'],
    ...rows.map(row => [`${period.from.slice(0, 4)}-${String(row.month).padStart(2, '0')}`, ...values(row)]),
    [isAr ? 'الإجمالي' : 'Total', ...values(dashboardTotals(rows))],
  ];
}
