'use client';

import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { Booking, Invoice } from '@/lib/schema';

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
  const [year, setYear]           = useState(new Date().getFullYear());
  const [allInvoices, setInvoices] = useState<Invoice[]>([]);
  const [allBookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      apiFetch<{ invoices: Invoice[] }>('/api/invoices'),
      apiFetch<{ bookings: Booking[] }>('/api/bookings'),
    ])
      .then(([invData, bkData]) => {
        if (!cancelled) {
          setInvoices(invData.invoices);
          setBookings(bkData.bookings);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [agencyId]);

  const monthly = useMemo<MonthlyRow[]>(() => {
    const mm = new Map<number, MonthlyRow>();
    for (let m = 0; m < 12; m++) {
      mm.set(m, { month: m, year, nameAr: MONTH_AR[m]!, nameEn: MONTH_EN[m]!,
        bookings: 0, rev: 0, cost: 0, vat: 0, grandTotal: 0 });
    }

    // Build a bookingId → costPriceHalalas lookup so invoices can carry cost
    const costByBookingId = new Map<string, number>();
    for (const bk of allBookings) {
      if (bk.id) costByBookingId.set(bk.id, bk.costPriceHalalas ?? 0);
    }

    for (const inv of allInvoices) {
      const date = new Date(inv.createdAt as unknown as string);
      if (date.getFullYear() !== year) continue;
      const m   = date.getMonth();
      const row = mm.get(m)!;
      row.bookings++;
      row.rev       += inv.subtotalHalalas;
      row.vat       += inv.vatHalalas;
      row.grandTotal += inv.totalHalalas;
      // Lookup cost from the linked booking (invoices don't store cost themselves)
      row.cost      += costByBookingId.get(inv.bookingId ?? '') ?? 0;
      mm.set(m, row);
    }

    const nowMonth = year < new Date().getFullYear() ? 11 : new Date().getMonth();
    return Array.from(mm.values()).filter(r => r.month <= nowMonth && r.bookings > 0);
  }, [allInvoices, allBookings, year]);

  const typeMix = useMemo<TypeMixRow[]>(() => {
    const typeMap: Record<string, { count: number; rev: number }> = {};
    for (const bk of allBookings) {
      const date = new Date(bk.createdAt as unknown as string);
      if (date.getFullYear() !== year) continue;
      const type = bk.serviceType ?? 'other';
      if (!typeMap[type]) typeMap[type] = { count: 0, rev: 0 };
      typeMap[type].count++;
      typeMap[type].rev += bk.totalPriceHalalas;
    }
    const total = Object.values(typeMap).reduce((s, v) => s + v.count, 0);
    if (total === 0) return [];
    return Object.entries(typeMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([type, { count, rev }]) => {
        const meta = TYPE_META[type] ?? TYPE_META['other']!;
        return { type, nameAr: meta.nameAr, nameEn: meta.nameEn, count, rev,
          pct: Math.round((count / total) * 100), color: meta.color, dot: meta.dot };
      });
  }, [allBookings, year]);

  const vatInvoices = useMemo<VatInvoice[]>(() =>
    allInvoices
      .filter(inv => inv.status !== 'cancelled' && new Date(inv.createdAt as unknown as string).getFullYear() === year)
      .map(inv => ({
        id:              inv.id,
        invoiceNumber:   inv.invoiceNumber,
        // An invoice is VAT-applicable when it has a non-zero VAT amount
        // (isEInvoice is a ZATCA e-invoicing flag, not a VAT indicator)
        isVatRegistered: (inv.vatHalalas ?? 0) > 0,
        grandTotal:      inv.totalHalalas,
        subtotalExclVat: inv.subtotalHalalas,
        totalVat:        inv.vatHalalas,
        createdAt:       new Date(inv.createdAt as unknown as string),
      })),
  [allInvoices, year]);

  return { monthly, typeMix, vatInvoices, loading, year, setYear };
}
