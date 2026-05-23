'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@masarat/firebase';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Landmark, Plus, Search, X, ChevronDown,
  TrendingUp, TrendingDown, Clock, AlertCircle,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ChequeDirection = 'incoming' | 'outgoing';
type ChequeStatus = 'pending' | 'cleared' | 'bounced' | 'cancelled' | 'deposited';
type PartyType = 'customer' | 'supplier' | 'other';
type FilterTab = 'all' | 'incoming' | 'outgoing' | 'pending' | 'bounced';

interface ChequeDoc {
  id: string;
  agencyId: string;
  direction: ChequeDirection;
  chequeNumber: string;
  bankName: string;
  amount: number; // halalas
  chequeDate: { toDate(): Date } | null;
  dueDate: { toDate(): Date } | null;
  partyName: string;
  partyType: PartyType;
  purpose: string;
  status: ChequeStatus;
  notes: string;
  createdAt: { toDate(): Date } | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const SAUDI_BANKS = [
  'الراجحي',
  'الأهلي (SNB)',
  'الرياض',
  'البلاد',
  'الإنماء',
  'العربي',
  'سامبا',
  'الجزيرة',
  'البنك السعودي الفرنسي',
  'الخليج',
  'الاستثمار',
  'الأول',
];

const STATUS_CONFIG: Record<ChequeStatus, { ar: string; en: string; className: string }> = {
  pending:   { ar: 'معلق',   en: 'Pending',   className: 'bg-amber-100 text-amber-800 border-amber-200' },
  cleared:   { ar: 'مقبوض', en: 'Cleared',   className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  bounced:   { ar: 'مرتجع', en: 'Bounced',   className: 'bg-red-100 text-red-800 border-red-200' },
  deposited: { ar: 'مودع',  en: 'Deposited', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  cancelled: { ar: 'ملغى',  en: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const FILTER_TABS: { key: FilterTab; ar: string; en: string }[] = [
  { key: 'all',      ar: 'الكل',    en: 'All' },
  { key: 'incoming', ar: 'الواردة', en: 'Incoming' },
  { key: 'outgoing', ar: 'الصادرة', en: 'Outgoing' },
  { key: 'pending',  ar: 'معلقة',   en: 'Pending' },
  { key: 'bounced',  ar: 'مرتجعة',  en: 'Bounced' },
];

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({
  cheque,
  isAr,
  onStatusChange,
}: {
  cheque: ChequeDoc;
  isAr: boolean;
  onStatusChange: (id: string, status: ChequeStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = STATUS_CONFIG[cheque.status];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(p => !p)}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-opacity hover:opacity-80',
          cfg.className,
        )}
      >
        {isAr ? cfg.ar : cfg.en}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 start-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden min-w-[110px]">
          {(Object.keys(STATUS_CONFIG) as ChequeStatus[]).map(s => (
            <button
              key={s}
              onClick={() => { onStatusChange(cheque.id, s); setOpen(false); }}
              className={cn(
                'w-full text-start px-3 py-1.5 text-xs font-medium hover:bg-slate-50 transition-colors',
                cheque.status === s ? 'text-brand-600 bg-brand-50' : 'text-slate-700',
              )}
            >
              {isAr ? STATUS_CONFIG[s].ar : STATUS_CONFIG[s].en}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Form ──────────────────────────────────────────────────────────────────

interface FormState {
  direction: ChequeDirection;
  chequeNumber: string;
  bankName: string;
  amount: string;
  chequeDate: string;
  dueDate: string;
  partyName: string;
  partyType: PartyType;
  purpose: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  direction: 'incoming',
  chequeNumber: '',
  bankName: SAUDI_BANKS[0],
  amount: '',
  chequeDate: '',
  dueDate: '',
  partyName: '',
  partyType: 'customer',
  purpose: '',
  notes: '',
};

function AddChequeForm({
  isAr,
  onSave,
  onCancel,
  saving,
}: {
  isAr: boolean;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';
  const inputCls =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white';

  return (
    <Card className="border-brand-200 bg-brand-50/30">
      <CardHeader>
        <CardTitle>{isAr ? 'إضافة شيك جديد' : 'Add New Cheque'}</CardTitle>
        <button
          onClick={onCancel}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={16} />
        </button>
      </CardHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Direction */}
        <div>
          <label className={labelCls}>{isAr ? 'الاتجاه' : 'Direction'}</label>
          <div className="flex gap-4">
            {(['incoming', 'outgoing'] as const).map(d => (
              <label key={d} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="direction"
                  value={d}
                  checked={form.direction === d}
                  onChange={() => set('direction', d)}
                  className="accent-brand-600 w-4 h-4"
                />
                <span className="text-sm font-medium text-slate-700">
                  {d === 'incoming' ? (isAr ? 'وارد' : 'Incoming') : (isAr ? 'صادر' : 'Outgoing')}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Cheque Number */}
          <div>
            <label className={labelCls}>{isAr ? 'رقم الشيك' : 'Cheque Number'} *</label>
            <input
              required
              type="text"
              value={form.chequeNumber}
              onChange={e => set('chequeNumber', e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </div>

          {/* Bank Name */}
          <div>
            <label className={labelCls}>{isAr ? 'البنك' : 'Bank'} *</label>
            <select
              required
              value={form.bankName}
              onChange={e => set('bankName', e.target.value)}
              className={inputCls}
            >
              {SAUDI_BANKS.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className={labelCls}>{isAr ? 'المبلغ (ريال)' : 'Amount (SAR)'} *</label>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </div>

          {/* Cheque Date */}
          <div>
            <label className={labelCls}>{isAr ? 'تاريخ الشيك' : 'Cheque Date'} *</label>
            <input
              required
              type="date"
              value={form.chequeDate}
              onChange={e => set('chequeDate', e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </div>

          {/* Due Date */}
          <div>
            <label className={labelCls}>{isAr ? 'تاريخ الاستحقاق' : 'Due Date'} *</label>
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={e => set('dueDate', e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </div>

          {/* Party Name */}
          <div>
            <label className={labelCls}>{isAr ? 'اسم الجهة' : 'Party Name'} *</label>
            <input
              required
              type="text"
              value={form.partyName}
              onChange={e => set('partyName', e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Party Type */}
          <div>
            <label className={labelCls}>{isAr ? 'نوع الجهة' : 'Party Type'}</label>
            <select
              value={form.partyType}
              onChange={e => set('partyType', e.target.value as PartyType)}
              className={inputCls}
            >
              <option value="customer">{isAr ? 'عميل' : 'Customer'}</option>
              <option value="supplier">{isAr ? 'مورد' : 'Supplier'}</option>
              <option value="other">{isAr ? 'أخرى' : 'Other'}</option>
            </select>
          </div>

          {/* Purpose */}
          <div className="sm:col-span-2">
            <label className={labelCls}>{isAr ? 'الغرض' : 'Purpose'}</label>
            <input
              type="text"
              value={form.purpose}
              onChange={e => set('purpose', e.target.value)}
              placeholder={isAr ? 'مثال: دفعة حجز عمرة' : 'e.g. Umrah booking payment'}
              className={inputCls}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>{isAr ? 'ملاحظات' : 'Notes'}</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={2}
            className={cn(inputCls, 'resize-none')}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-border">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ الشيك' : 'Save Cheque')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ChequesClient({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const { user } = useAuth();

  const [cheques, setCheques] = useState<ChequeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const agencyId = user?.agencyId ?? user?.uid ?? null;

  // Load cheques from Firestore
  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }
    let unsub: (() => void) | undefined;

    async function load() {
      const { getFirestore, collection, query, where, onSnapshot } =
        await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());

      const q = query(
        collection(db, 'cheques'),
        where('agencyId', '==', agencyId),
      );

      unsub = onSnapshot(
        q,
        snap => {
          const docs = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as ChequeDoc))
            .sort((a, b) => {
              const aDate = a.dueDate?.toDate?.()?.getTime() ?? 0;
              const bDate = b.dueDate?.toDate?.()?.getTime() ?? 0;
              return aDate - bDate;
            });
          setCheques(docs);
          setLoading(false);
        },
        err => {
          setError(err.message);
          setLoading(false);
        },
      );
    }

    void load();
    return () => unsub?.();
  }, [agencyId]);

  // Filter cheques
  const filtered = cheques.filter(c => {
    const matchFilter =
      filter === 'all' ||
      (filter === 'incoming' && c.direction === 'incoming') ||
      (filter === 'outgoing' && c.direction === 'outgoing') ||
      (filter === 'pending' && c.status === 'pending') ||
      (filter === 'bounced' && c.status === 'bounced');

    const searchLower = search.toLowerCase();
    const matchSearch =
      !search ||
      c.chequeNumber.toLowerCase().includes(searchLower) ||
      c.partyName.toLowerCase().includes(searchLower);

    return matchFilter && matchSearch;
  });

  // KPI calculations
  const totalIncoming = cheques
    .filter(c => c.direction === 'incoming')
    .reduce((s, c) => s + c.amount, 0);
  const totalOutgoing = cheques
    .filter(c => c.direction === 'outgoing')
    .reduce((s, c) => s + c.amount, 0);
  const pendingCount = cheques.filter(c => c.status === 'pending').length;
  const bouncedCount = cheques.filter(c => c.status === 'bounced').length;

  const localeStr = isAr ? 'ar-SA' : 'en-SA';

  // Save cheque
  async function handleSave(form: FormState) {
    if (!agencyId) return;
    setSaving(true);
    try {
      const { getFirestore, collection, addDoc, Timestamp } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());

      const amountHalalas = Math.round(parseFloat(form.amount) * 100);
      const chequeDateTs = form.chequeDate
        ? Timestamp.fromDate(new Date(form.chequeDate))
        : Timestamp.now();
      const dueDateTs = form.dueDate
        ? Timestamp.fromDate(new Date(form.dueDate))
        : Timestamp.now();

      await addDoc(collection(db, 'cheques'), {
        agencyId,
        direction: form.direction,
        chequeNumber: form.chequeNumber,
        bankName: form.bankName,
        amount: amountHalalas,
        chequeDate: chequeDateTs,
        dueDate: dueDateTs,
        partyName: form.partyName,
        partyType: form.partyType,
        purpose: form.purpose,
        notes: form.notes,
        status: 'pending' as ChequeStatus,
        createdAt: Timestamp.now(),
      });

      setShowForm(false);
    } catch (err) {
      console.error('Error saving cheque:', err);
    } finally {
      setSaving(false);
    }
  }

  // Change status
  async function handleStatusChange(chequeId: string, newStatus: ChequeStatus) {
    try {
      const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      await updateDoc(doc(db, 'cheques', chequeId), { status: newStatus });
    } catch (err) {
      console.error('Error updating status:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Landmark size={22} className="text-brand-600" />
            {isAr ? 'الشيكات' : 'Cheques'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr ? 'إدارة الشيكات الواردة والصادرة' : 'Manage incoming and outgoing cheques'}
          </p>
        </div>
        <Button onClick={() => setShowForm(v => !v)}>
          <Plus size={16} />
          {isAr ? 'شيك جديد' : 'New Cheque'}
        </Button>
      </div>

      {/* ── Add Form ───────────────────────────────────────────────────────── */}
      {showForm && (
        <AddChequeForm
          isAr={isAr}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
          saving={saving}
        />
      )}

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Incoming */}
        <Card className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl flex-shrink-0 bg-emerald-50">
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">{isAr ? 'إجمالي الواردة' : 'Total Incoming'}</p>
            <p className="text-base font-bold text-slate-900 truncate">{formatCurrency(totalIncoming, localeStr)}</p>
          </div>
        </Card>

        {/* Outgoing */}
        <Card className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl flex-shrink-0 bg-brand-50">
            <TrendingDown size={18} className="text-brand-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">{isAr ? 'إجمالي الصادرة' : 'Total Outgoing'}</p>
            <p className="text-base font-bold text-slate-900 truncate">{formatCurrency(totalOutgoing, localeStr)}</p>
          </div>
        </Card>

        {/* Pending */}
        <Card className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl flex-shrink-0 bg-amber-50">
            <Clock size={18} className="text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">{isAr ? 'معلقة' : 'Pending'}</p>
            <p className="text-2xl font-bold text-slate-900">{pendingCount}</p>
          </div>
        </Card>

        {/* Bounced */}
        <Card className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl flex-shrink-0 bg-red-50">
            <AlertCircle size={18} className="text-red-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">{isAr ? 'مرتجعة' : 'Bounced'}</p>
            <p className={cn('text-2xl font-bold', bouncedCount > 0 ? 'text-red-600' : 'text-slate-900')}>
              {bouncedCount}
            </p>
          </div>
        </Card>
      </div>

      {/* ── Filter + Search ────────────────────────────────────────────────── */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-wrap">
            {FILTER_TABS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  filter === f.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {isAr ? f.ar : f.en}
              </button>
            ))}
          </div>
          <div className="flex-1 relative min-w-[160px]">
            <Search
              size={15}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'رقم الشيك أو اسم الجهة...' : 'Cheque number or party name...'}
              className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </Card>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Landmark size={48} />}
          title={isAr ? 'لا توجد شيكات' : 'No cheques found'}
          description={
            isAr
              ? 'أضف شيكاً جديداً أو غيّر الفلتر'
              : 'Add a new cheque or change the filter'
          }
          action={{ label: isAr ? 'إضافة شيك' : 'Add Cheque', onClick: () => setShowForm(true) }}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/50">
                  {[
                    { ar: 'رقم الشيك', en: 'Cheque #' },
                    { ar: 'الجهة', en: 'Party' },
                    { ar: 'البنك', en: 'Bank' },
                    { ar: 'المبلغ', en: 'Amount' },
                    { ar: 'تاريخ الشيك', en: 'Cheque Date' },
                    { ar: 'تاريخ الاستحقاق', en: 'Due Date' },
                    { ar: 'الاتجاه', en: 'Direction' },
                    { ar: 'الحالة', en: 'Status' },
                  ].map(col => (
                    <th
                      key={col.en}
                      className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider first:ps-6 last:pe-6 whitespace-nowrap"
                    >
                      {isAr ? col.ar : col.en}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(cheque => {
                  const isIncoming = cheque.direction === 'incoming';
                  return (
                    <tr key={cheque.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Cheque Number */}
                      <td className="ps-6 pe-4 py-4">
                        <span className="text-sm font-mono font-semibold text-slate-900">
                          {cheque.chequeNumber}
                        </span>
                      </td>

                      {/* Party */}
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-slate-900">{cheque.partyName}</p>
                        {cheque.purpose && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[150px]">{cheque.purpose}</p>
                        )}
                      </td>

                      {/* Bank */}
                      <td className="px-4 py-4">
                        <span className="text-sm text-slate-700">{cheque.bankName}</span>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            isIncoming ? 'text-emerald-700' : 'text-brand-700',
                          )}
                        >
                          {formatCurrency(cheque.amount, localeStr)}
                        </span>
                      </td>

                      {/* Cheque Date */}
                      <td className="px-4 py-4">
                        <span className="text-sm text-slate-600">
                          {cheque.chequeDate ? formatDate(cheque.chequeDate, localeStr) : '—'}
                        </span>
                      </td>

                      {/* Due Date */}
                      <td className="px-4 py-4">
                        <span className="text-sm text-slate-600">
                          {cheque.dueDate ? formatDate(cheque.dueDate, localeStr) : '—'}
                        </span>
                      </td>

                      {/* Direction */}
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                            isIncoming
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-brand-50 text-brand-700 border-brand-200',
                          )}
                        >
                          {isIncoming
                            ? (isAr ? 'وارد' : 'Incoming')
                            : (isAr ? 'صادر' : 'Outgoing')}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 pe-6">
                        <StatusBadge
                          cheque={cheque}
                          isAr={isAr}
                          onStatusChange={handleStatusChange}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-surface-border">
            <span className="text-xs text-slate-400">
              {isAr
                ? `${filtered.length} شيك`
                : `${filtered.length} cheque${filtered.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
