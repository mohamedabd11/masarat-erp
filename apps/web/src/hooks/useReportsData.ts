'use client';

import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { DashboardReport, DashboardMonth, ReportPeriod } from '@/lib/reports-dashboard-model';

export interface MonthlyRow extends DashboardMonth {
  year: number;
  nameAr: string;
  nameEn: string;
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

export interface ReportsData {
  monthly:     MonthlyRow[];
  typeMix:     TypeMixRow[];
  loading:     boolean;
  error:       boolean;
  period:      ReportPeriod | null;
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
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [result, setResult] = useState<{ agencyId: string; year: number; data: DashboardReport | null; error: boolean } | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;
    setResult(null);
    apiFetch<DashboardReport>(`/api/reports/dashboard?year=${year}`)
      .then(data => { if (!cancelled) setResult({ agencyId, year, data, error: false }); })
      .catch(() => { if (!cancelled) setResult({ agencyId, year, data: null, error: true }); });
    return () => { cancelled = true; };
  }, [agencyId, year]);

  // Do not render or export an earlier agency/year while a new request is pending.
  const current = result?.agencyId === agencyId && result?.year === year ? result : null;
  const data = current?.data;
  const loading = !!agencyId && !current;
  const error = current?.error ?? false;
  const monthly = useMemo<MonthlyRow[]>(() => (data?.monthly ?? []).map(row => ({
    ...row, year, nameAr: MONTH_AR[row.month - 1]!, nameEn: MONTH_EN[row.month - 1]!,
  })), [data, year]);

  const typeMix = useMemo<TypeMixRow[]>(() => {
    const total = (data?.typeMix ?? []).reduce((s, v) => s + v.count, 0);
    if (total === 0) return [];
    return [...(data?.typeMix ?? [])]
      .sort((a, b) => b.count - a.count)
      .map(({ type, count, rev }) => {
        const meta = TYPE_META[type] ?? TYPE_META['other']!;
        return { type, nameAr: meta.nameAr, nameEn: meta.nameEn, count, rev,
          pct: Math.round((count / total) * 100), color: meta.color, dot: meta.dot };
      });
  }, [data]);

  return { monthly, typeMix, loading, error, period: data?.period ?? null, year, setYear };
}
