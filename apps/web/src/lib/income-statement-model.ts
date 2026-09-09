import { dashboardPeriod, type ReportPeriod } from './reports-dashboard-model';

/** Calendar strings avoid local-midnight conversion shifting a Saudi date backwards. */
export function incomeStatementPeriod(year: number, quarter: 0 | 1 | 2 | 3 | 4, now = new Date()): ReportPeriod {
  const annual = dashboardPeriod(String(year), now);
  if (quarter === 0) return { from: annual.from, to: annual.to };
  const startMonth = (quarter - 1) * 3 + 1;
  const from = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, startMonth + 2, 0)).toISOString().slice(0, 10);
  return { from, to: end < annual.to ? end : annual.to };
}

export interface ProfitLossResponse {
  from: string; to: string;
  revenue: { code: string; nameAr: string; nameEn: string | null; balance: number }[];
  expenses: { code: string; nameAr: string; nameEn: string | null; balance: number }[];
  totalRevenue: number; totalExpenses: number; netIncome: number;
}
