'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { X, Plus, Trash2, FileText, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

const SERVICE_TYPES = [
  { value: 'flight',        ar: 'طيران',          en: 'Flight' },
  { value: 'hotel',         ar: 'فندق',           en: 'Hotel' },
  { value: 'flight_hotel',  ar: 'طيران + فندق',   en: 'Flight + Hotel' },
  { value: 'visa',          ar: 'تأشيرة',         en: 'Visa' },
  { value: 'family_visit',  ar: 'زيارة عائلية',   en: 'Family Visit' },
  { value: 'insurance',     ar: 'تأمين',          en: 'Insurance' },
  { value: 'umrah',         ar: 'عمرة',           en: 'Umrah' },
  { value: 'hajj',          ar: 'حج',             en: 'Hajj' },
  { value: 'transfer',      ar: 'نقل',            en: 'Transfer' },
  { value: 'cruise',        ar: 'رحلة بحرية',     en: 'Cruise' },
  { value: 'package',       ar: 'باقة متكاملة',   en: 'Package' },
  { value: 'other',         ar: 'خدمة أخرى',      en: 'Other Service' },
];

interface Line {
  key:           string;
  serviceType:   string;
  descriptionAr: string;
  quantity:      number;
  unitPrice:     string;  // SAR as string while editing
}

interface AgencyVat {
  isVatRegistered: boolean;
  vatRate:         number;
}

interface Props {
  onClose:   () => void;
  onSuccess: (invoiceId: string, invoiceNumber: string) => void;
}

const IC = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white';

function blankLine(): Line {
  return { key: crypto.randomUUID(), serviceType: 'flight', descriptionAr: '', quantity: 1, unitPrice: '' };
}

export function CreateDirectInvoiceModal({ onClose, onSuccess }: Props) {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  const [vatInfo,     setVatInfo]     = useState<AgencyVat | null>(null);
  const [buyerNameAr, setBuyerNameAr] = useState('');
  const [buyerPhone,  setBuyerPhone]  = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [notes,       setNotes]       = useState('');
  const [lines,       setLines]       = useState<Line[]>([blankLine()]);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  // Load agency VAT settings once
  useEffect(() => {
    apiFetch<{ agency: { isVatRegistered: boolean; vatRate: number } }>('/api/settings')
      .then(d => setVatInfo({ isVatRegistered: d.agency.isVatRegistered, vatRate: d.agency.vatRate ?? 15 }))
      .catch(() => setVatInfo({ isVatRegistered: false, vatRate: 15 }));
  }, []);

  const isVat  = vatInfo?.isVatRegistered ?? false;
  const vatPct = vatInfo?.vatRate ?? 15;

  // Live totals
  const subtotalHalalas = lines.reduce((sum, l) => {
    const price = parseFloat(l.unitPrice || '0');
    return sum + Math.round(price * 100 * Math.max(1, l.quantity));
  }, 0);
  const vatHalalas   = isVat ? Math.round(subtotalHalalas * vatPct / 100) : 0;
  const totalHalalas = subtotalHalalas + vatHalalas;

  function fmt(halalas: number) {
    return (halalas / 100).toLocaleString(isAr ? 'ar-SA' : 'en-SA', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  function addLine() { setLines(p => [...p, blankLine()]); }
  function delLine(key: string) { setLines(p => p.filter(l => l.key !== key)); }
  function setLine<K extends keyof Line>(key: string, field: K, val: Line[K]) {
    setLines(p => p.map(l => l.key === key ? { ...l, [field]: val } : l));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!buyerNameAr.trim()) {
      setError(isAr ? 'اسم العميل مطلوب' : 'Customer name is required');
      return;
    }
    if (lines.some(l => !l.descriptionAr.trim())) {
      setError(isAr ? 'أدخل وصفاً لكل بند' : 'Enter a description for each line');
      return;
    }
    if (totalHalalas <= 0) {
      setError(isAr ? 'يجب أن يكون الإجمالي أكبر من صفر' : 'Total must be greater than zero');
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch<{ id: string; invoiceNumber: string }>('/api/invoices/create-direct', {
        method: 'POST',
        body: JSON.stringify({
          buyerNameAr: buyerNameAr.trim(),
          buyerPhone:  buyerPhone.trim() || undefined,
          dueDate:     dueDate || undefined,
          notes:       notes.trim() || undefined,
          lines: lines.map(l => ({
            serviceType:      l.serviceType,
            descriptionAr:    l.descriptionAr.trim(),
            quantity:         Math.max(1, l.quantity),
            unitPriceHalalas: Math.round(parseFloat(l.unitPrice || '0') * 100),
          })),
        }),
      });
      onSuccess(data.id, data.invoiceNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'خطأ في الخادم' : 'Server error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl max-h-[94dvh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
          <div className="text-center">
            <h2 className="font-bold text-slate-900 text-base">
              {isAr ? 'إنشاء فاتورة جديدة' : 'New Invoice'}
            </h2>
            {vatInfo && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isVat
                  ? (isAr ? `فاتورة ضريبية — ضريبة ${vatPct}%` : `Tax Invoice — ${vatPct}% VAT`)
                  : (isAr ? 'فاتورة تجارية — بدون ضريبة' : 'Commercial Invoice — No VAT')}
              </p>
            )}
          </div>
          <div className="w-8" />
        </div>

        {/* Scrollable body */}
        <form id="direct-invoice-form" onSubmit={submit} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* ── Customer ──────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {isAr ? 'بيانات العميل' : 'Customer'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {isAr ? 'اسم العميل *' : 'Customer Name *'}
                </label>
                <input
                  className={IC}
                  value={buyerNameAr}
                  onChange={e => setBuyerNameAr(e.target.value)}
                  placeholder={isAr ? 'الاسم الكامل للعميل' : 'Full customer name'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {isAr ? 'رقم الجوال' : 'Mobile'}
                </label>
                <input
                  className={IC}
                  value={buyerPhone}
                  onChange={e => setBuyerPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  dir="ltr"
                  inputMode="tel"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {isAr ? 'تاريخ الاستحقاق' : 'Due Date'}
                </label>
                <input
                  type="date"
                  className={IC}
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* ── Invoice lines ──────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {isAr ? 'بنود الفاتورة' : 'Invoice Lines'}
              </h3>
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                <Plus size={14} strokeWidth={2.5} />
                {isAr ? 'إضافة بند' : 'Add Line'}
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => {
                const lineNet   = Math.round(parseFloat(line.unitPrice || '0') * 100 * Math.max(1, line.quantity));
                const lineVat   = isVat ? Math.round(lineNet * vatPct / 100) : 0;
                const lineTotal = lineNet + lineVat;
                return (
                  <div key={line.key} className="rounded-xl border border-slate-200 p-3 bg-slate-50/60 space-y-2.5">
                    {/* Row header */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-400">
                        {isAr ? `بند ${idx + 1}` : `Line ${idx + 1}`}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => delLine(line.key)}
                          className="p-1 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    {/* Service type */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {isAr ? 'نوع الخدمة' : 'Service Type'}
                      </label>
                      <select
                        className={IC}
                        value={line.serviceType}
                        onChange={e => setLine(line.key, 'serviceType', e.target.value)}
                      >
                        {SERVICE_TYPES.map(st => (
                          <option key={st.value} value={st.value}>
                            {isAr ? st.ar : st.en}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {isAr ? 'الوصف *' : 'Description *'}
                      </label>
                      <input
                        className={IC}
                        value={line.descriptionAr}
                        onChange={e => setLine(line.key, 'descriptionAr', e.target.value)}
                        placeholder={isAr ? 'مثال: تذكرة طيران الرياض – دبي' : 'e.g. Flight ticket RUH – DXB'}
                      />
                    </div>

                    {/* Qty + Price */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          {isAr ? 'الكمية' : 'Qty'}
                        </label>
                        <input
                          type="number"
                          min={1}
                          className={IC}
                          value={line.quantity}
                          onChange={e => setLine(line.key, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                          dir="ltr"
                          inputMode="numeric"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          {isAr ? 'السعر (ريال)' : 'Unit Price (SAR)'}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className={IC}
                          value={line.unitPrice}
                          onChange={e => setLine(line.key, 'unitPrice', e.target.value)}
                          placeholder="0.00"
                          dir="ltr"
                          inputMode="decimal"
                        />
                      </div>
                    </div>

                    {/* Line subtotal badge */}
                    {lineTotal > 0 && (
                      <div className="flex justify-end">
                        <span className="text-[11px] text-slate-500">
                          {isAr ? 'إجمالي البند:' : 'Line total:'}&nbsp;
                          <span className="font-bold text-slate-700">{fmt(lineTotal)} {isAr ? 'ر.س' : 'SAR'}</span>
                          {isVat && lineVat > 0 && (
                            <span className="text-slate-400"> ({isAr ? 'شامل ضريبة' : 'incl. VAT'} {fmt(lineVat)})</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Notes ─────────────────────────────────────────────── */}
          <section>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
            </label>
            <textarea
              className={IC + ' resize-none'}
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isAr ? 'أي تفاصيل إضافية...' : 'Additional details...'}
            />
          </section>

          {/* ── Summary ───────────────────────────────────────────── */}
          {totalHalalas > 0 && (
            <div className="rounded-xl bg-slate-900 text-white p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">{isAr ? 'المجموع (قبل الضريبة)' : 'Subtotal (excl. VAT)'}</span>
                <span>{fmt(subtotalHalalas)} {isAr ? 'ر.س' : 'SAR'}</span>
              </div>
              {isVat && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">
                    {isAr ? `ضريبة القيمة المضافة ${vatPct}%` : `VAT ${vatPct}%`}
                  </span>
                  <span>{fmt(vatHalalas)} {isAr ? 'ر.س' : 'SAR'}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t border-white/10 pt-2.5">
                <span>{isAr ? 'الإجمالي' : 'Total'}</span>
                <span className="text-emerald-400">{fmt(totalHalalas)} {isAr ? 'ر.س' : 'SAR'}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="h-2" />
        </form>

        {/* Footer */}
        <div className="border-t border-slate-100 px-4 py-3 flex gap-3 flex-shrink-0 bg-white rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            form="direct-invoice-form"
            disabled={submitting || !vatInfo || totalHalalas <= 0}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {submitting
              ? <Loader2 size={16} className="animate-spin" />
              : <FileText size={16} />}
            {submitting
              ? (isAr ? 'جارٍ الإنشاء...' : 'Creating...')
              : (isAr ? 'إنشاء الفاتورة' : 'Create Invoice')}
          </button>
        </div>
      </div>
    </div>
  );
}
