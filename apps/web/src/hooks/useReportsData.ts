'use client';

import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Server response shapes (from GET /api/reports/dashboard) ───────────────────
interface ServerMonthly {
  month:      number;   // 1–12
  bookings:   number;
  rev:        number;
  vat:        number;
  grandTotal: number;
  cost:       number;
}
interface ServerType {
  type:  string;
  count: number;
  rev:   number;
}
interface ServerVatInvoice {
  id:              string;
  invoiceNumber:   string;
  subtotalHalalas: number;
  vatHalalas:      number;
  totalHalalas:    number;
  status:          string;
  createdAt:       string;
}
interface DashboardResponse {
  year:        number;
  monthly:     ServerMonthly[];
  typeMix:     ServerType[];
  vatInvoices: ServerVatInvoice[];
}

export interface MonthlyRow {
  month:      number;
  year:       number;
  nameAr:     string;
  nameEn:     string;
  bookings:   number;
  rev:        number;
  cost:       number;
  vat:        number;
  grandTotal: number;
}

export interface TypeMixRow {
  type:   string;
  nameAr: string;
  nameEn: string;
  count:  number;
  rev:    number;
  pct:    number;
  color:  string;
  dot:    string;
}

export interface VatInvoice {
  id:              string;
  invoiceNumber:   string;
  isVatRegistered: boolean;
  grandTotal:      number;
  subtotalExclVat: number;
  totalVat:        number;
  createdAt:       Date;
}

export interface ReportsData {
  monthly:     MonthlyRow[];
  typeMix:     TypeMixRow[];
  vatInvoices: VatInvoice[];
  loading:     boolean;
  year:        number;
  setYear:     (y: number) => void;
}

const MONTH_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const MONTH_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const TYPE_META: Record<string, { nameAr: string; nameEn: string; color: string; dot: string }> = {
  flight:    { nameAr: 'طيران',         nameEn: 'Flights',       color: 'bg-sky-500',     dot: 'bg-sky-500' },
  hotel:     { nameAr: 'فنادق',         nameEn: 'Hotels',        color: 'bg-amber-500',   dot: 'bg-amber-500' },
  package:   { nameAr: 'باقات سياحية', nameEn: 'Tour Packages', color: 'bg-emerald-500', dot: 'bg-emerald-500' },
  umrah:     { nameAr: 'عمرة',          nameEn: 'Umrah',         color: 'bg-brand-500',   dot: 'bg-brand-500' },
  hajj:      { nameAr: 'حج',           nameEn: 'Hajj',          color: 'bg-purple-500',  dot: 'bg-purple-500' },
  visa:      { nameAr: 'تأشيرات',      nameEn: 'Visas',         color: 'bg-red-400',     dot: 'bg-red-400' },
  insurance: { nameAr: 'تأمين سفر',    nameEn: 'Insurance',     color: 'bg-rose-400',    dot: 'bg-rose-400' },
  transport: { nameAr: 'نقل',          nameEn: 'Transport',     color: 'bg-orange-400',  dot: 'bg-orange-400' },
  other:     { nameAr: 'أخرى',         nameEn: 'Other',         color: 'bg-slate-400',   dot: 'bg-slate-400' },
};

export function useReportsData(agencyId: string | null): ReportsData {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<DashboardResponse>({ year: new Date().getFullYear(), monthly: [], typeMix: [], vatInvoices: [] });
  const [loading, setLoading] = useState(true);

  // Re-fetch whenever the agency or selected year changes. Aggregation now happens
  // server-side over the full year (previously the browser truncated to 50 invoices).
  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    apiFetch<DashboardResponse>(`/api/reports/dashboard?year=${year}`)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData({ year, monthly: [], typeMix: [], vatInvoices: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [agencyId, year]);

  const monthly = useMemo<MonthlyRow[]>(() => {
    const mm = new Map<number, MonthlyRow>();
    for (let m = 0; m < 12; m++) {
      mm.set(m, { month: m, year, nameAr: MONTH_AR[m]!, nameEn: MONTH_EN[m]!,
        bookings: 0, rev: 0, cost: 0, vat: 0, grandTotal: 0 });
    }

    for (const r of data.monthly) {
      const m   = r.month - 1;   // server returns 1–12; client rows are 0–11
      const row = mm.get(m);
      if (!row) continue;
      row.bookings   = r.bookings;
      row.rev        = r.rev;
      row.vat        = r.vat;
      row.grandTotal = r.grandTotal;
      row.cost       = r.cost;
    }

    const nowMonth = year < new Date().getFullYear() ? 11 : new Date().getMonth();
    return Array.from(mm.values()).filter(r => r.month <= nowMonth && r.bookings > 0);
  }, [data.monthly, year]);

  const typeMix = useMemo<TypeMixRow[]>(() => {
    const total = data.typeMix.reduce((s, v) => s + v.count, 0);
    if (total === 0) return [];
    return [...data.typeMix]
      .sort((a, b) => b.count - a.count)
      .map(({ type, count, rev }) => {
        const meta = TYPE_META[type] ?? TYPE_META['other']!;
        return { type, nameAr: meta.nameAr, nameEn: meta.nameEn, count, rev,
          pct: Math.round((count / total) * 100), color: meta.color, dot: meta.dot };
      });
  }, [data.typeMix]);

  const vatInvoices = useMemo<VatInvoice[]>(() =>
    data.vatInvoices.map(inv => ({
      id:              inv.id,
      invoiceNumber:   inv.invoiceNumber,
      // An invoice is VAT-applicable when it has a non-zero VAT amount
      isVatRegistered: (inv.vatHalalas ?? 0) > 0,
      grandTotal:      inv.totalHalalas,
      subtotalExclVat: inv.subtotalHalalas,
      totalVat:        inv.vatHalalas,
      createdAt:       new Date(inv.createdAt),
    })),
  [data.vatInvoices]);

  return { monthly, typeMix, vatInvoices, loading, year, setYear };
}
