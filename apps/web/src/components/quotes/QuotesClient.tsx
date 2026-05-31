'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  FileText, Plus, Search, X, Send, CheckCircle2, XCircle,
  Clock, ArrowRight, Printer, Copy, ChevronDown, ChevronRight,
  AlertTriangle, RotateCcw, TrendingUp, Users, BookOpen,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

interface QuoteItem {
  serviceType: string;
  description: string;
  quantity: number;
  unitPriceSAR: number;
}

interface Quote {
  id: string;
  agencyId: string;
  quoteNumber: string;
  customerNameAr: string;
  customerNameEn: string;
  customerPhone: string;
  customerEmail: string;
  issueDate: number;
  expiryDate: number;
  status: QuoteStatus;
  items: QuoteItem[];
  subtotalHalalas: number;
  vatHalalas: number;
  grandTotalHalalas: number;
  notes: string;
  terms: string;
  convertedToBookingId?: string;
  createdAt: string;
}

interface QuotesClientProps { locale: string }

const STATUS_META: Record<QuoteStatus, { ar: string; en: string; bg: string; text: string; icon: typeof Clock }> = {
  draft:     { ar: 'مسودة',       en: 'Draft',     bg: 'bg-slate-100',   text: 'text-slate-600',  icon: FileText },
  sent:      { ar: 'مُرسَلة',     en: 'Sent',      bg: 'bg-sky-100',     text: 'text-sky-700',    icon: Send },
  accepted:  { ar: 'مقبولة',      en: 'Accepted',  bg: 'bg-emerald-100', text: 'text-emerald-700',icon: CheckCircle2 },
  rejected:  { ar: 'مرفوضة',      en: 'Rejected',  bg: 'bg-red-100',     text: 'text-red-700',    icon: XCircle },
  expired:   { ar: 'منتهية',      en: 'Expired',   bg: 'bg-amber-100',   text: 'text-amber-700',  icon: AlertTriangle },
  converted: { ar: 'تحوّلت لحجز', en: 'Converted', bg: 'bg-purple-100',  text: 'text-purple-700', icon: ArrowRight },
};

const SERVICE_TYPES = [
  { key: 'flight',    ar: 'طيران',        en: 'Flight' },
  { key: 'hotel',     ar: 'فندق',         en: 'Hotel' },
  { key: 'package',   ar: 'باقة سياحية',  en: 'Tour Package' },
  { key: 'umrah',     ar: 'عمرة وحج',     en: 'Umrah & Hajj' },
  { key: 'visa',      ar: 'تأشيرة',       en: 'Visa' },
  { key: 'insurance', ar: 'تأمين سفر',    en: 'Travel Insurance' },
  { key: 'transfer',  ar: 'نقل',          en: 'Transfer' },
  { key: 'other',     ar: 'أخرى',         en: 'Other' },
];

const EMPTY_ITEM: QuoteItem = { serviceType: 'flight', description: '', quantity: 1, unitPriceSAR: 0 };

const DEFAULT_TERMS_AR = `• العرض صالح حتى تاريخ الانتهاء المحدد أعلاه
• الأسعار بالريال السعودي
• يُرجى التأكيد خطياً لحجز هذا العرض
• قد تتغير الأسعار بعد انتهاء صلاحية العرض
• شروط الإلغاء وفق سياسة المورد`;

const DEFAULT_TERMS_EN = `• Quote valid until the expiry date stated above
• Prices in SAR
• Written confirmation required to proceed with booking
• Prices subject to change after expiry
• Cancellation terms apply per supplier policy`;

// ─── QuoteBadge ───────────────────────────────────────────────────────────────

function QuoteBadge({ status, isAr }: { status: QuoteStatus; isAr: boolean }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold', m.bg, m.text)}>
      <Icon size={12} />
      {isAr ? m.ar : m.en}
    </span>
  );
}

// ─── QuoteRow (expandable) ────────────────────────────────────────────────────

function QuoteRow({ q, isAr, fmtLocale, locale, onStatusChange }: {
  q: Quote; isAr: boolean; fmtLocale: string; locale: string;
  onStatusChange: (id: string, status: QuoteStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const now = Date.now();
  const expired = q.status === 'sent' && q.expiryDate < now;

  return (
    <>
      <tr
        className={cn('hover:bg-slate-50/60 transition-colors cursor-pointer', expanded && 'bg-brand-50/30')}
        onClick={() => setExpanded(v => !v)}
      >
        <td className="ps-5 pe-2 py-3.5 w-8">
          <span className="text-slate-400">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        </td>
        <td className="px-3 py-3.5">
          <span className="font-mono text-sm font-bold text-brand-700">{q.quoteNumber}</span>
          {expired && (
            <span className="ms-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
              {isAr ? 'منتهي' : 'Expired'}
            </span>
          )}
        </td>
        <td className="px-3 py-3.5">
          <p className="text-sm font-semibold text-slate-900">{isAr ? q.customerNameAr : q.customerNameEn}</p>
          {q.customerPhone && <p className="text-xs text-slate-400 mt-0.5 font-mono">{q.customerPhone}</p>}
        </td>
        <td className="px-3 py-3.5 hidden md:table-cell">
          <span className="text-xs text-slate-500">
            {q.items.slice(0, 2).map(i => {
              const st = SERVICE_TYPES.find(s => s.key === i.serviceType);
              return isAr ? st?.ar : st?.en;
            }).join(' + ')}
            {q.items.length > 2 && ` +${q.items.length - 2}`}
          </span>
        </td>
        <td className="px-3 py-3.5 hidden lg:table-cell">
          <span className="text-xs text-slate-500">{formatDate(new Date(q.expiryDate), fmtLocale)}</span>
        </td>
        <td className="px-3 py-3.5">
          <QuoteBadge status={expired ? 'expired' : q.status} isAr={isAr} />
        </td>
        <td className="px-3 pe-5 py-3.5 text-end">
          <span className="text-sm font-bold tabular-nums text-slate-900">
            {formatCurrency(q.grandTotalHalalas, fmtLocale)}
          </span>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} className="px-0 py-0 border-b border-surface-border">
            <div className="bg-slate-50 border-y border-surface-border">
              {/* Items */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-start ps-10 pe-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{isAr ? 'الخدمة / الوصف' : 'Service / Description'}</th>
                      <th className="text-end px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20">{isAr ? 'الكمية' : 'Qty'}</th>
                      <th className="text-end px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                      <th className="text-end pe-8 px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{isAr ? 'الإجمالي' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.items.map((item, idx) => {
                      const st = SERVICE_TYPES.find(s => s.key === item.serviceType);
                      return (
                        <tr key={idx} className="border-b border-slate-100 last:border-0">
                          <td className="ps-10 pe-4 py-2.5">
                            <p className="text-sm font-semibold text-slate-700">{isAr ? st?.ar : st?.en}</p>
                            {item.description && <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-end text-sm text-slate-700 tabular-nums">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-end text-sm font-mono tabular-nums text-slate-700">{formatCurrency(item.unitPriceSAR * 100, fmtLocale)}</td>
                          <td className="pe-8 px-4 py-2.5 text-end text-sm font-mono tabular-nums font-semibold text-slate-900">{formatCurrency(item.quantity * item.unitPriceSAR * 100, fmtLocale)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {q.vatHalalas > 0 && (
                      <tr className="bg-white border-t border-slate-200">
                        <td colSpan={3} className="ps-10 pe-4 py-2 text-sm text-slate-500 text-end">{isAr ? 'الإجمالي قبل الضريبة' : 'Subtotal (excl. VAT)'}</td>
                        <td className="pe-8 px-4 py-2 text-end text-sm font-mono tabular-nums text-slate-800">{formatCurrency(q.subtotalHalalas, fmtLocale)}</td>
                      </tr>
                    )}
                    {q.vatHalalas > 0 && (
                      <tr className="bg-white">
                        <td colSpan={3} className="ps-10 pe-4 py-2 text-sm text-slate-500 text-end">{isAr ? 'ضريبة القيمة المضافة' : 'VAT'}</td>
                        <td className="pe-8 px-4 py-2 text-end text-sm font-mono tabular-nums text-slate-800">{formatCurrency(q.vatHalalas, fmtLocale)}</td>
                      </tr>
                    )}
                    <tr className="bg-brand-50 border-t border-brand-200">
                      <td colSpan={3} className="ps-10 pe-4 py-3 text-sm font-bold text-slate-900 text-end">{isAr ? 'الإجمالي الكلي' : 'Grand Total'}</td>
                      <td className="pe-8 px-4 py-3 text-end text-base font-black font-mono tabular-nums text-brand-700">{formatCurrency(q.grandTotalHalalas, fmtLocale)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Notes + Actions */}
              <div className="px-10 py-4 flex flex-col sm:flex-row gap-4 justify-between items-start border-t border-slate-200">
                <div className="flex-1">
                  {q.notes && (
                    <p className="text-xs text-slate-500 mb-1 font-semibold">{isAr ? 'ملاحظات:' : 'Notes:'}</p>
                  )}
                  {q.notes && <p className="text-xs text-slate-600 whitespace-pre-line">{q.notes}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); window.print(); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <Printer size={12} /> {isAr ? 'طباعة' : 'Print'}
                  </button>
                  {q.status === 'draft' && (
                    <button
                      onClick={e => { e.stopPropagation(); onStatusChange(q.id, 'sent'); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 transition-colors"
                    >
                      <Send size={12} /> {isAr ? 'إرسال للعميل' : 'Send to Customer'}
                    </button>
                  )}
                  {q.status === 'sent' && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); onStatusChange(q.id, 'accepted'); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 size={12} /> {isAr ? 'قَبِل العميل' : 'Mark Accepted'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onStatusChange(q.id, 'rejected'); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 transition-colors"
                      >
                        <XCircle size={12} /> {isAr ? 'رفض العميل' : 'Mark Rejected'}
                      </button>
                    </>
                  )}
                  {q.status === 'accepted' && (
                    <Link
                      href={`/${locale}/bookings/new?customerNameAr=${encodeURIComponent(q.customerNameAr)}&customerPhone=${encodeURIComponent(q.customerPhone ?? '')}&notes=${encodeURIComponent((isAr ? 'من عرض سعر ' : 'From quote ') + q.quoteNumber)}`}
                      onClick={e => { e.stopPropagation(); onStatusChange(q.id, 'converted'); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
                    >
                      <ArrowRight size={12} /> {isAr ? 'تحويل لحجز' : 'Convert to Booking'}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── New Quote Modal ───────────────────────────────────────────────────────────

function NewQuoteModal({ isAr, onClose, onSave }: {
  isAr: boolean; onClose: () => void; onSave: (q: Omit<Quote, 'id'>) => void;
}) {
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const today  = new Date().toISOString().slice(0, 10);
  const in7d   = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [customerNameAr, setCustomerNameAr] = useState('');
  const [customerNameEn, setCustomerNameEn] = useState('');
  const [customerPhone,  setCustomerPhone]  = useState('');
  const [customerEmail,  setCustomerEmail]  = useState('');
  const [issueDate,      setIssueDate]      = useState(today);
  const [expiryDate,     setExpiryDate]     = useState(in7d);
  const [items, setItems]   = useState<QuoteItem[]>([{ ...EMPTY_ITEM }]);
  const [notes, setNotes]   = useState('');
  const [terms, setTerms]   = useState(isAr ? DEFAULT_TERMS_AR : DEFAULT_TERMS_EN);
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const [agencyIsVat, setAgencyIsVat] = useState(false);
  const [agencyVatRate, setAgencyVatRate] = useState(15);

  useEffect(() => {
    let cancelled = false;
    async function loadAgency() {
      try {
        const { apiFetch } = await import('@/lib/api-client');
        const res = await apiFetch<{ agency: { isVatRegistered: boolean; vatRate?: number; defaultQuoteTerms?: string } }>('/api/settings');
        if (!cancelled) {
          setAgencyIsVat(res.agency.isVatRegistered === true);
          setAgencyVatRate(res.agency.vatRate ?? 15);
          if (res.agency.defaultQuoteTerms?.trim()) {
            setTerms(res.agency.defaultQuoteTerms.trim());
          }
        }
      } catch { /* keep defaults */ }
    }
    void loadAgency();
    return () => { cancelled = true; };
  }, []);

  const subtotalHalalas = items.reduce((s, i) => s + i.quantity * i.unitPriceSAR * 100, 0);
  const vatHalalas      = agencyIsVat ? Math.round(subtotalHalalas * agencyVatRate / 100) : 0;
  const grandTotalHalalas = subtotalHalalas + vatHalalas;

  function updateItem(idx: number, field: keyof QuoteItem, value: string | number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }
  function addItem()         { setItems(p => [...p, { ...EMPTY_ITEM }]); }
  function removeItem(idx: number) { if (items.length > 1) setItems(p => p.filter((_, i) => i !== idx)); }

  async function handleSave() {
    if (!customerNameAr.trim()) { setError(isAr ? 'اسم العميل بالعربية مطلوب' : 'Customer Arabic name required'); return; }
    if (items.some(i => i.unitPriceSAR <= 0)) { setError(isAr ? 'يجب إدخال سعر لكل خدمة' : 'Price required for each item'); return; }
    setSaving(true);
    const quoteNum = `QT-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    onSave({
      agencyId: '',
      quoteNumber: quoteNum,
      customerNameAr: customerNameAr.trim(),
      customerNameEn: customerNameEn.trim() || customerNameAr.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      issueDate: new Date(issueDate).getTime(),
      expiryDate: new Date(expiryDate).getTime(),
      status: 'draft',
      items,
      subtotalHalalas,
      vatHalalas,
      grandTotalHalalas,
      notes: notes.trim(),
      terms: terms.trim(),
      createdAt: new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText size={20} className="text-brand-600" />
            {isAr ? 'إنشاء عرض سعر جديد' : 'New Price Quotation'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Customer + Dates */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'اسم العميل (عربي) *' : "Customer Name (AR) *"}</label>
              <input className={inputCls} dir="rtl" value={customerNameAr} onChange={e => setCustomerNameAr(e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'اسم العميل (إنجليزي)' : "Customer Name (EN)"}</label>
              <input className={inputCls} value={customerNameEn} onChange={e => setCustomerNameEn(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'الجوال' : 'Phone'}</label>
              <input className={inputCls} dir="ltr" type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
              <input className={inputCls} dir="ltr" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</label>
              <input className={inputCls} type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'تاريخ انتهاء الصلاحية' : 'Expiry Date'}</label>
              <input className={inputCls} type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700">{isAr ? 'بنود العرض' : 'Quote Items'}</h3>
              <button onClick={addItem} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors">
                <Plus size={13} />{isAr ? 'إضافة بند' : 'Add Item'}
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-start ps-4 pe-2 py-2.5 text-xs font-semibold text-slate-500 w-36">{isAr ? 'نوع الخدمة' : 'Service'}</th>
                    <th className="text-start px-2 py-2.5 text-xs font-semibold text-slate-500">{isAr ? 'الوصف / التفاصيل' : 'Description'}</th>
                    <th className="text-end px-2 py-2.5 text-xs font-semibold text-slate-500 w-20">{isAr ? 'الكمية' : 'Qty'}</th>
                    <th className="text-end px-2 py-2.5 text-xs font-semibold text-slate-500 w-36">{isAr ? 'السعر (ر.س)' : 'Price (SAR)'}</th>
                    <th className="text-end pe-4 px-2 py-2.5 text-xs font-semibold text-slate-500 w-36">{isAr ? 'الإجمالي' : 'Total'}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="ps-4 pe-2 py-2">
                        <select value={item.serviceType} onChange={e => updateItem(idx, 'serviceType', e.target.value)}
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400">
                          {SERVICE_TYPES.map(s => <option key={s.key} value={s.key}>{isAr ? s.ar : s.en}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                          placeholder={isAr ? 'مثال: رياض → دبي ذهاب وإياب' : 'e.g. Riyadh → Dubai return'}
                          dir={isAr ? 'rtl' : 'ltr'}
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs text-end font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" step="0.01" value={item.unitPriceSAR || ''} onChange={e => updateItem(idx, 'unitPriceSAR', Number(e.target.value))}
                          placeholder="0.00"
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs text-end font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </td>
                      <td className="pe-4 px-2 py-2 text-end">
                        <span className="text-xs font-semibold font-mono text-slate-800 tabular-nums">
                          {formatCurrency(item.quantity * item.unitPriceSAR * 100, fmtLocale)}
                        </span>
                      </td>
                      <td className="pe-2 py-2">
                        <button onClick={() => removeItem(idx)} disabled={items.length === 1}
                          className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 disabled:opacity-20 transition-colors">
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {agencyIsVat && (
                    <tr className="bg-slate-50 border-t border-slate-200">
                      <td colSpan={4} className="ps-4 pe-2 py-2 text-end text-xs text-slate-500">{isAr ? 'المجموع قبل الضريبة' : 'Subtotal (excl. VAT)'}</td>
                      <td className="pe-4 px-2 py-2 text-end text-xs font-mono tabular-nums font-semibold text-slate-800">{formatCurrency(subtotalHalalas, fmtLocale)}</td>
                      <td />
                    </tr>
                  )}
                  {agencyIsVat && (
                    <tr className="bg-slate-50">
                      <td colSpan={4} className="ps-4 pe-2 py-2 text-end text-xs text-slate-500">
                        {isAr ? `ضريبة القيمة المضافة (${agencyVatRate}%)` : `VAT (${agencyVatRate}%)`}
                      </td>
                      <td className="pe-4 px-2 py-2 text-end text-xs font-mono tabular-nums font-semibold text-amber-700">{formatCurrency(vatHalalas, fmtLocale)}</td>
                      <td />
                    </tr>
                  )}
                  <tr className="bg-brand-50 border-t-2 border-brand-200">
                    <td colSpan={4} className="ps-4 pe-2 py-2.5 text-end text-sm font-bold text-slate-900">{isAr ? 'الإجمالي الكلي' : 'Grand Total'}</td>
                    <td className="pe-4 px-2 py-2.5 text-end text-base font-black font-mono tabular-nums text-brand-700">{formatCurrency(grandTotalHalalas, fmtLocale)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes + Terms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'ملاحظات خاصة' : 'Special Notes'}</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} dir={isAr ? 'rtl' : 'ltr'}
                placeholder={isAr ? 'ملاحظات إضافية للعميل...' : 'Additional notes for the customer...'}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'الشروط والأحكام' : 'Terms & Conditions'}</label>
              <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3} dir={isAr ? 'rtl' : 'ltr'}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
          </div>

          {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-border flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {isAr ? 'الإجمالي:' : 'Total:'} <span className="font-bold text-brand-700">{formatCurrency(grandTotalHalalas, fmtLocale)}</span>
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <Button onClick={handleSave} disabled={saving}>
              <FileText size={15} />
              {isAr ? 'حفظ العرض' : 'Save Quote'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function QuotesClient({ locale }: QuotesClientProps) {
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { user }  = useAuth();

  const [quotes, setQuotes]         = useState<Quote[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [showModal, setShowModal]   = useState(false);

  const agencyId = user?.agencyId ?? '';

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    setLoading(true);
    apiFetch<{ quotes: Quote[] }>('/api/quotes')
      .then(data => {
        const docs = data.quotes;
        docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setQuotes(docs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agencyId, tick]);

  async function handleSave(data: Omit<Quote, 'id'>) {
    if (!agencyId) return;
    await apiFetch('/api/quotes', { method: 'POST', body: JSON.stringify(data) });
    setTick(t => t + 1);
  }

  async function handleStatusChange(id: string, status: QuoteStatus) {
    await apiFetch(`/api/quotes/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setTick(t => t + 1);
  }

  const now = Date.now();

  // KPIs
  const sent      = quotes.filter(q => q.status === 'sent').length;
  const accepted  = quotes.filter(q => q.status === 'accepted').length;
  const converted = quotes.filter(q => q.status === 'converted').length;
  const convRate  = quotes.length > 0 ? Math.round((converted / quotes.length) * 100) : 0;
  const totalValue = quotes.filter(q => q.status === 'accepted' || q.status === 'converted').reduce((s, q) => s + q.grandTotalHalalas, 0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return quotes.filter(quote => {
      const matchStatus = statusFilter === 'all' || quote.status === statusFilter;
      const nameAr = quote.customerNameAr.toLowerCase();
      const nameEn = quote.customerNameEn.toLowerCase();
      const matchSearch = !q || nameAr.includes(q) || nameEn.includes(q) || quote.quoteNumber.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [quotes, statusFilter, search]);

  const STATUS_TABS: { id: QuoteStatus | 'all'; ar: string; en: string }[] = [
    { id: 'all',       ar: 'الكل',         en: 'All' },
    { id: 'draft',     ar: 'مسودة',        en: 'Draft' },
    { id: 'sent',      ar: 'مُرسَلة',      en: 'Sent' },
    { id: 'accepted',  ar: 'مقبولة',       en: 'Accepted' },
    { id: 'converted', ar: 'تحوّلت لحجز',  en: 'Converted' },
    { id: 'rejected',  ar: 'مرفوضة',       en: 'Rejected' },
    { id: 'expired',   ar: 'منتهية',       en: 'Expired' },
  ];

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'عروض الأسعار' : 'Quotations'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr ? 'أرسل عروض أسعار احترافية للعملاء وحوّلها لحجوزات بضغطة واحدة' : 'Send professional price quotes to customers and convert to bookings in one click'}
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus size={15} />
          {isAr ? 'عرض سعر جديد' : 'New Quotation'}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          { icon: FileText,    bg: 'bg-slate-50',   color: 'text-slate-600',   accent: 'border-slate-400',   label: isAr ? 'إجمالي العروض' : 'Total Quotes',   value: formatCount(quotes.length, fmtLocale) },
          { icon: Send,        bg: 'bg-sky-50',     color: 'text-sky-600',     accent: 'border-sky-500',     label: isAr ? 'بانتظار الرد' : 'Awaiting Reply',   value: formatCount(sent, fmtLocale) },
          { icon: CheckCircle2,bg: 'bg-emerald-50', color: 'text-emerald-600', accent: 'border-emerald-500', label: isAr ? 'مقبولة' : 'Accepted',               value: formatCount(accepted, fmtLocale) },
          { icon: ArrowRight,  bg: 'bg-purple-50',  color: 'text-purple-600',  accent: 'border-purple-500',  label: isAr ? 'تحوّلت لحجز' : 'Converted',        value: formatCount(converted, fmtLocale) },
          { icon: TrendingUp,  bg: 'bg-brand-50',   color: 'text-brand-600',   accent: 'border-brand-500',   label: isAr ? 'قيمة المقبولة' : 'Accepted Value',  value: formatCurrency(totalValue, fmtLocale) },
        ].map(k => (
          <div key={k.label} className={cn('bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-s-4', k.accent)}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{k.label}</p>
                <p className="text-xl font-extrabold text-slate-900 tabular-nums">{k.value}</p>
              </div>
              <div className={cn('p-2.5 rounded-xl', k.bg)}>
                <k.icon size={18} className={k.color} strokeWidth={2} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Conversion rate banner */}
      {quotes.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-brand-50 to-slate-50 rounded-xl border border-brand-100">
          <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={18} className="text-brand-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {isAr ? `معدل التحويل: ${convRate}%` : `Conversion Rate: ${convRate}%`}
            </p>
            <p className="text-xs text-slate-500">
              {isAr
                ? `${converted} من ${quotes.length} عرض تحوّل إلى حجز مؤكد`
                : `${converted} of ${quotes.length} quotes converted to confirmed bookings`}
            </p>
          </div>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 overflow-x-auto pb-px flex-1">
          {STATUS_TABS.map(tab => {
            const count = tab.id === 'all' ? quotes.length : quotes.filter(q => q.status === tab.id).length;
            return (
              <button key={tab.id} onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                  statusFilter === tab.id ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
                )}>
                {isAr ? tab.ar : tab.en}
                <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full',
                  statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-shrink-0">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث بالاسم أو رقم العرض...' : 'Search by name or quote #...'}
            className="rounded-xl border border-slate-200 bg-white ps-9 pe-9 py-2.5 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          {search && <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13} /></button>}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={48} />}
          title={isAr ? 'لا توجد عروض أسعار' : 'No quotations yet'}
          description={isAr ? 'أنشئ أول عرض سعر وأرسله للعميل' : 'Create your first quote and send it to a customer'}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/60">
                  <th className="w-8 ps-4 pe-2 py-3.5" />
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رقم العرض' : 'Quote #'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'الخدمات' : 'Services'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{isAr ? 'صلاحية العرض' : 'Expires'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="text-end pe-5 px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الإجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(q => (
                  <QuoteRow key={q.id} q={q} isAr={isAr} fmtLocale={fmtLocale} locale={locale} onStatusChange={handleStatusChange} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-surface-border">
            <span className="text-xs text-slate-400">
              {isAr ? `${formatCount(filtered.length, fmtLocale)} عرض` : `${filtered.length} quotes`}
            </span>
          </div>
        </Card>
      )}

      {/* Modal */}
      {showModal && (
        <NewQuoteModal isAr={isAr} onClose={() => setShowModal(false)} onSave={handleSave} />
      )}
    </div>
  );
}
