'use client';

import { useState, useEffect, useMemo } from 'react';

export interface MonthlyRow {
  month:      number;  // 0–11
  year:       number;
  nameAr:     string;
  nameEn:     string;
  bookings:   number;
  rev:        number;  // subtotalExclVat halalas
  cost:       number;  // 0 — requires booking join (future)
  vat:        number;  // totalVat halalas
  grandTotal: number;
}

export interface TypeMixRow {
  type:   string;
  nameAr: string;
  nameEn: string;
  count:  number;
  rev:    number;  // approximate: grand total of invoices for this type
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
  flight:    { nameAr: 'طيران',           nameEn: 'Flights',       color: 'bg-sky-500',     dot: 'bg-sky-500' },
  hotel:     { nameAr: 'فنادق',           nameEn: 'Hotels',        color: 'bg-amber-500',   dot: 'bg-amber-500' },
  package:   { nameAr: 'باقات سياحية',   nameEn: 'Tour Packages', color: 'bg-emerald-500', dot: 'bg-emerald-500' },
  umrah:     { nameAr: 'عمرة',            nameEn: 'Umrah',         color: 'bg-brand-500',   dot: 'bg-brand-500' },
  hajj:      { nameAr: 'حج',             nameEn: 'Hajj',          color: 'bg-purple-500',  dot: 'bg-purple-500' },
  visa:      { nameAr: 'تأشيرات',        nameEn: 'Visas',         color: 'bg-red-400',     dot: 'bg-red-400' },
  insurance: { nameAr: 'تأمين سفر',      nameEn: 'Insurance',     color: 'bg-rose-400',    dot: 'bg-rose-400' },
  transport: { nameAr: 'نقل',            nameEn: 'Transport',     color: 'bg-orange-400',  dot: 'bg-orange-400' },
  other:     { nameAr: 'أخرى',           nameEn: 'Other',         color: 'bg-slate-400',   dot: 'bg-slate-400' },
};

export function useReportsData(agencyId: string | null): ReportsData {
  const [year, setYear]             = useState(new Date().getFullYear());
  const [monthly, setMonthly]       = useState<MonthlyRow[]>([]);
  const [bookingTypes, setBookingTypes] = useState<Record<string, { count: number; rev: number }>>({});
  const [vatInvoices, setVatInvoices]   = useState<VatInvoice[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { getFirestore, collection, query, where, getDocs, Timestamp } =
          await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());

        const start = Timestamp.fromDate(new Date(year, 0, 1));
        const end   = Timestamp.fromDate(new Date(year + 1, 0, 1));

        // Load invoices + bookings in parallel
        const [invSnap, bkSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'invoices'),
            where('agencyId', '==', agencyId),
            where('createdAt', '>=', start),
            where('createdAt', '<',  end),
          )),
          getDocs(query(
            collection(db, 'bookings'),
            where('agencyId', '==', agencyId),
            where('createdAt', '>=', start),
            where('createdAt', '<',  end),
          )),
        ]);

        if (cancelled) return;

        // ── Monthly aggregation ────────────────────────────────────────────
        const mm = new Map<number, MonthlyRow>();
        for (let m = 0; m < 12; m++) {
          mm.set(m, { month: m, year, nameAr: MONTH_AR[m], nameEn: MONTH_EN[m],
            bookings: 0, rev: 0, cost: 0, vat: 0, grandTotal: 0 });
        }

        const allVatInvoices: VatInvoice[] = [];

        for (const d of invSnap.docs) {
          const inv    = d.data() as Record<string, unknown>;
          const ts     = inv.createdAt as { toDate?: () => Date } | undefined;
          const date   = ts?.toDate?.() ?? new Date();
          const m      = date.getMonth();
          const totals = inv.totals as Record<string, number> | undefined;
          const row    = mm.get(m)!;

          const subtotalExclVat = Number(totals?.subtotalExclVat ?? 0);
          const totalVat        = Number(totals?.totalVat        ?? 0);
          const grandTotal      = Number(totals?.grandTotal      ?? inv.amountDue ?? 0);

          row.bookings++;
          row.rev       += subtotalExclVat;
          row.vat       += totalVat;
          row.grandTotal += grandTotal;
          mm.set(m, row);

          allVatInvoices.push({
            id:              d.id,
            invoiceNumber:   String(inv.invoiceNumber ?? ''),
            isVatRegistered: Boolean(inv.isVatRegistered),
            grandTotal,
            subtotalExclVat,
            totalVat,
            createdAt: date,
          });
        }

        // Only include months up to current month of the year (or all if viewing past year)
        const nowMonth = year < new Date().getFullYear() ? 11 : new Date().getMonth();
        const monthly  = Array.from(mm.values()).filter(r => r.month <= nowMonth && r.bookings > 0);
        setMonthly(monthly);
        setVatInvoices(allVatInvoices);

        // ── Booking type mix ───────────────────────────────────────────────
        const typeMap: Record<string, { count: number; rev: number }> = {};
        for (const d of bkSnap.docs) {
          const bk   = d.data() as Record<string, unknown>;
          const type = String(bk.type ?? 'other');
          if (!typeMap[type]) typeMap[type] = { count: 0, rev: 0 };
          typeMap[type].count++;
          typeMap[type].rev += Number((bk.pricing as Record<string, number> | undefined)?.grandTotal ?? 0);
        }
        setBookingTypes(typeMap);

      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agencyId, year]);

  const typeMix: TypeMixRow[] = useMemo(() => {
    const total = Object.values(bookingTypes).reduce((s, v) => s + v.count, 0);
    if (total === 0) return [];
    return Object.entries(bookingTypes)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([type, { count, rev }]) => {
        const meta = TYPE_META[type] ?? TYPE_META.other;
        return {
          type,
          nameAr: meta.nameAr,
          nameEn: meta.nameEn,
          count,
          rev,
          pct: Math.round((count / total) * 100),
          color: meta.color,
          dot:   meta.dot,
        };
      });
  }, [bookingTypes]);

  return { monthly, typeMix, vatInvoices, loading, year, setYear };
}
