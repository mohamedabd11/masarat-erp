'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const TYPE_COLORS: Record<string, string> = {
  flight:       '#3b82f6',
  hotel:        '#8b5cf6',
  umrah:        '#f59e0b',
  hajj:         '#d97706',
  visa:         '#ef4444',
  family_visit: '#ec4899',
  package:      '#10b981',
  insurance:    '#06b6d4',
  transfer:     '#84cc16',
  cruise:       '#6366f1',
  flight_hotel: '#0ea5e9',
};
const TYPE_LABELS_AR: Record<string, string> = {
  flight:'طيران', hotel:'فندق', umrah:'عمرة', hajj:'حج',
  visa:'تأشيرة', family_visit:'زيارة عائلية', package:'باقة سياحية',
  insurance:'تأمين', transfer:'نقل', cruise:'بحرية', flight_hotel:'طيران+فندق',
};

interface MonthPoint { month: string; revenue: number; }
interface TypePoint  { name: string; value: number; color: string; }

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function RevenueTooltip({ active, payload, label, isAr }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string; isAr: boolean;
}) {
  if (!active || !payload?.length) return null;
  const loc = isAr ? 'ar-SA' : 'en-SA';
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-2.5 text-sm">
      <p className="font-semibold text-slate-700 mb-0.5">{label}</p>
      <p className="text-brand-600 font-bold">{formatCurrency((payload[0]?.value ?? 0) * 100, loc)}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DashboardCharts({ locale }: { locale: string }) {
  const { user } = useAuth();
  const isAr  = locale === 'ar';
  const loc2  = isAr ? 'ar-SA' : 'en-SA';
  const months = isAr ? MONTHS_AR : MONTHS_EN;

  const [revenue,  setRevenue]  = useState<MonthPoint[]>([]);
  const [types,    setTypes]    = useState<TypePoint[]>([]);
  const [loading,  setLoading]  = useState(true);

  const agencyId = (user?.agencyId as string | undefined) ?? null;

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;

    Promise.all([
      apiFetch<{ invoices: Record<string, unknown>[] }>('/api/invoices'),
      apiFetch<{ bookings: Record<string, unknown>[] }>('/api/bookings'),
    ])
      .then(([invData, bkData]) => {
        if (cancelled) return;

        // ── Revenue: last 6 months ───────────────────────────────────────────
        const now   = new Date();
        const revenueMap: Record<string, number> = {};
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          revenueMap[`${d.getFullYear()}-${d.getMonth()}`] = 0;
        }

        for (const inv of invData.invoices) {
          const date = inv.createdAt ? new Date(inv.createdAt as string) : null;
          if (!date) continue;
          const key = `${date.getFullYear()}-${date.getMonth()}`;
          if (!(key in revenueMap)) continue;
          const grand = Number(inv.totalHalalas ?? inv.subtotalHalalas ?? 0);
          revenueMap[key] = (revenueMap[key] ?? 0) + grand;
        }

        const revenuePoints: MonthPoint[] = Object.keys(revenueMap).map(key => {
          const [y, m] = key.split('-').map(Number) as [number, number];
          return {
            month:   months[m] ?? '',
            // store in SAR (divide halalas by 100) for cleaner axis labels
            revenue: Math.round((revenueMap[key] ?? 0) / 100),
          };
        });

        // ── Booking types ────────────────────────────────────────────────────
        const typeCount: Record<string, number> = {};
        for (const bk of bkData.bookings) {
          const t = String(bk.serviceType ?? bk.type ?? 'other');
          typeCount[t] = (typeCount[t] ?? 0) + 1;
        }

        const typePoints: TypePoint[] = Object.entries(typeCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 7)
          .map(([key, val]) => ({
            name:  isAr ? (TYPE_LABELS_AR[key] ?? key) : key,
            value: val,
            color: TYPE_COLORS[key] ?? '#94a3b8',
          }));

        setRevenue(revenuePoints);
        setTypes(typePoints);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [agencyId, isAr, months]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 animate-pulse h-56 bg-slate-100 rounded-2xl" />
        <div className="animate-pulse h-56 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  const hasRevenue = revenue.some(r => r.revenue > 0);
  const hasTypes   = types.length > 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

      {/* ── Revenue bar chart ───────────────────────────────────────────── */}
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>{isAr ? 'حجم الأعمال (آخر 6 أشهر)' : 'Gross Bookings – Last 6 Months'}</CardTitle>
        </CardHeader>

        {hasRevenue ? (
          <div className="h-52 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue} barSize={28} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'inherit' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'inherit' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  width={36}
                />
                <Tooltip
                  content={<RevenueTooltip isAr={isAr} />}
                  cursor={{ fill: '#f1f5f9', radius: 6 }}
                />
                <Bar dataKey="revenue" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-52 flex items-center justify-center text-sm text-slate-400">
            {isAr ? 'لا توجد إيرادات مسجّلة بعد' : 'No revenue recorded yet'}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">
          {isAr ? '* إجمالي فواتير العملاء بالريال السعودي شامل الضريبة' : '* Gross customer invoices, SAR incl. VAT'}
        </p>
      </Card>

      {/* ── Booking type donut ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{isAr ? 'توزيع الحجوزات' : 'Bookings by Type'}</CardTitle>
        </CardHeader>

        {hasTypes ? (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={types}
                  cx="50%"
                  cy="45%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {types.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: 11, color: '#64748b' }}>{value}</span>
                  )}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-52 flex items-center justify-center text-sm text-slate-400">
            {isAr ? 'لا توجد حجوزات بعد' : 'No bookings yet'}
          </div>
        )}
      </Card>

    </div>
  );
}
