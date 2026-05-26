'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import {
  Truck, Plus, Search, X, Phone, Mail, Building2,
  Plane, Shield, Car, CreditCard, ToggleLeft, ToggleRight,
  Globe, CheckCircle2, Edit2,
} from 'lucide-react';

interface Supplier {
  id: string;
  nameAr: string;
  nameEn: string;
  type: string;
  phone: string;
  email: string;
  vatNumber: string;
  contactPerson?: string;
  website?: string;
  isActive: boolean;
  agencyId: string;
  createdAt: number;
}

type SupplierType = 'all' | 'airline' | 'hotel' | 'transport' | 'insurance' | 'visa' | 'umrah' | 'other';

const TYPE_META: Record<string, { ar: string; en: string; bg: string; text: string; border: string; icon: typeof Plane }> = {
  airline:   { ar: 'شركة طيران',  en: 'Airline',    bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',    icon: Plane },
  hotel:     { ar: 'فندق / إقامة',en: 'Hotel',      bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  icon: Building2 },
  transport: { ar: 'نقل وتأجير',  en: 'Transport',  bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',icon: Car },
  insurance: { ar: 'تأمين سفر',   en: 'Insurance',  bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',   icon: Shield },
  visa:      { ar: 'تأشيرات',     en: 'Visa',       bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200', icon: CreditCard },
  umrah:     { ar: 'عمرة وحج',    en: 'Umrah/Hajj', bg: 'bg-brand-50',   text: 'text-brand-700',   border: 'border-brand-200',  icon: Globe },
  other:     { ar: 'أخرى',        en: 'Other',      bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',  icon: Truck },
};

const FILTER_TYPES: SupplierType[] = ['all', 'airline', 'hotel', 'transport', 'insurance', 'visa', 'umrah', 'other'];

interface SuppliersClientProps { locale: string }
interface FormState { nameAr: string; nameEn: string; type: string; phone: string; email: string; vatNumber: string; contactPerson: string; website: string }
const EMPTY: FormState = { nameAr: '', nameEn: '', type: 'airline', phone: '', email: '', vatNumber: '', contactPerson: '', website: '' };

export function SuppliersClient({ locale }: SuppliersClientProps) {
  const isAr      = locale === 'ar';
  const { user }  = useAuth();

  const [suppliers, setSuppliers]     = useState<Supplier[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [typeFilter, setTypeFilter]   = useState<SupplierType>('all');
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState<FormState>(EMPTY);
  const [saving, setSaving]           = useState(false);
  const [editId, setEditId]           = useState<string | null>(null);

  const agencyId = user?.agencyId ?? '';

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    async function subscribe() {
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const q = query(collection(getFirestore(getApp()), 'suppliers'), where('agencyId', '==', agencyId));
      unsub = onSnapshot(q, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
        docs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setSuppliers(docs);
        setLoading(false);
      }, () => setLoading(false));
    }
    void subscribe();
    return () => unsub?.();
  }, [agencyId]);

  async function handleSave() {
    if (!form.nameAr || !agencyId) return;
    setSaving(true);
    try {
      const { getFirestore, collection, addDoc, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      if (editId) {
        await updateDoc(doc(db, 'suppliers', editId), { ...form });
      } else {
        await addDoc(collection(db, 'suppliers'), { ...form, agencyId, isActive: true, createdAt: Date.now() });
      }
      setForm(EMPTY); setShowForm(false); setEditId(null);
    } finally { setSaving(false); }
  }

  async function toggleActive(s: Supplier) {
    const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
    const { getApp } = await import('@masarat/firebase');
    await updateDoc(doc(getFirestore(getApp()), 'suppliers', s.id), { isActive: !s.isActive });
  }

  function startEdit(s: Supplier) {
    setForm({ nameAr: s.nameAr, nameEn: s.nameEn, type: s.type, phone: s.phone, email: s.email, vatNumber: s.vatNumber, contactPerson: s.contactPerson ?? '', website: s.website ?? '' });
    setEditId(s.id); setShowForm(true);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return suppliers.filter(s => {
      const name = isAr ? s.nameAr : (s.nameEn || s.nameAr);
      const matchSearch = !q || name.toLowerCase().includes(q) || s.phone?.includes(q) || s.email?.toLowerCase().includes(q);
      const matchType   = typeFilter === 'all' || s.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [suppliers, search, typeFilter, isAr]);

  // KPIs
  const active = suppliers.filter(s => s.isActive).length;

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'الموردين' : 'Suppliers'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{isAr ? 'إدارة شركاء الأعمال وموردي الخدمات' : 'Manage business partners and service providers'}</p>
        </div>
        <Button size="sm" onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY); }}>
          <Plus size={15} />
          {isAr ? 'مورد جديد' : 'New Supplier'}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: isAr ? 'إجمالي الموردين' : 'Total Suppliers',  value: suppliers.length,                                         bg: 'bg-brand-50',   color: 'text-brand-700',   accent: 'border-brand-500' },
          { label: isAr ? 'نشط' : 'Active',                        value: active,                                                   bg: 'bg-emerald-50', color: 'text-emerald-700', accent: 'border-emerald-500' },
          { label: isAr ? 'شركات طيران' : 'Airlines',              value: suppliers.filter(s => s.type === 'airline').length,       bg: 'bg-sky-50',     color: 'text-sky-700',     accent: 'border-sky-500' },
          { label: isAr ? 'فنادق وعمرة' : 'Hotels & Umrah',        value: suppliers.filter(s => s.type === 'hotel' || s.type === 'umrah').length, bg: 'bg-amber-50', color: 'text-amber-700', accent: 'border-amber-500' },
        ].map(k => (
          <div key={k.label} className={cn('bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-s-4', k.accent)}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{k.label}</p>
            <p className={cn('text-2xl font-extrabold tabular-nums', k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-slate-900">{editId ? (isAr ? 'تعديل مورد' : 'Edit Supplier') : (isAr ? 'إضافة مورد جديد' : 'Add New Supplier')}</h2>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {([
              { key: 'nameAr',        label: isAr ? 'الاسم بالعربية *' : 'Name (Arabic) *',      dir: 'rtl',  type: 'text' },
              { key: 'nameEn',        label: isAr ? 'الاسم بالإنجليزية' : 'Name (English)',       dir: 'ltr',  type: 'text' },
              { key: 'contactPerson', label: isAr ? 'جهة الاتصال' : 'Contact Person',              dir: 'auto', type: 'text' },
              { key: 'phone',         label: isAr ? 'الهاتف' : 'Phone',                            dir: 'ltr',  type: 'tel' },
              { key: 'email',         label: isAr ? 'البريد الإلكتروني' : 'Email',                 dir: 'ltr',  type: 'email' },
              { key: 'vatNumber',     label: isAr ? 'الرقم الضريبي (VAT)' : 'VAT Number',          dir: 'ltr',  type: 'text' },
              { key: 'website',       label: isAr ? 'الموقع الإلكتروني' : 'Website',              dir: 'ltr',  type: 'url' },
            ] as const).map(field => (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">{field.label}</label>
                <input
                  type={field.type}
                  value={form[field.key as keyof FormState]}
                  onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                  dir={field.dir}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'نوع المورد' : 'Supplier Type'}</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {(Object.keys(TYPE_META) as string[]).map(t => (
                  <option key={t} value={t}>{isAr ? TYPE_META[t].ar : TYPE_META[t].en}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-5 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY); }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.nameAr}>
              {saving ? <Spinner size="sm" /> : <CheckCircle2 size={14} />}
              {isAr ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 overflow-x-auto pb-px flex-1">
          {FILTER_TYPES.map(t => {
            const meta  = t === 'all' ? null : TYPE_META[t];
            const label = t === 'all' ? { ar: 'الكل', en: 'All' } : { ar: meta!.ar, en: meta!.en };
            const count = t === 'all' ? suppliers.length : suppliers.filter(s => s.type === t).length;
            return (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                  typeFilter === t ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
                )}>
                {isAr ? label.ar : label.en}
                <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full',
                  typeFilter === t ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-shrink-0">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث عن مورد...' : 'Search supplier...'}
            className="rounded-xl border border-slate-200 bg-white ps-9 pe-9 py-2.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          {search && <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13} /></button>}
        </div>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Truck size={48} />}
          title={isAr ? 'لا يوجد موردون' : 'No suppliers yet'}
          description={isAr ? 'أضف أول مورد للبدء' : 'Add your first supplier to get started'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => {
            const name = isAr ? s.nameAr : (s.nameEn || s.nameAr);
            const meta = TYPE_META[s.type] ?? TYPE_META.other;
            const Icon = meta.icon;
            return (
              <div key={s.id} className={cn(
                'bg-white rounded-xl border shadow-sm transition-all hover:shadow-md',
                s.isActive ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60',
              )}>
                {/* Card header */}
                <div className={cn('px-4 py-3 rounded-t-xl border-b flex items-center gap-3', meta.bg, meta.border)}>
                  <div className={cn('p-2 rounded-lg bg-white shadow-sm flex-shrink-0')}>
                    <Icon size={16} className={meta.text} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate text-sm">{name}</p>
                    <span className={cn('text-[11px] font-semibold', meta.text)}>
                      {isAr ? meta.ar : meta.en}
                    </span>
                  </div>
                  <button onClick={() => toggleActive(s)}
                    className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors">
                    {s.isActive
                      ? <ToggleRight size={22} className="text-emerald-500" />
                      : <ToggleLeft size={22} className="text-slate-400" />}
                  </button>
                </div>

                {/* Card body */}
                <div className="px-4 py-3 space-y-2">
                  {s.contactPerson && (
                    <p className="text-xs text-slate-500">{isAr ? 'جهة التواصل:' : 'Contact:'} <span className="text-slate-800 font-medium">{s.contactPerson}</span></p>
                  )}
                  {s.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Phone size={13} className="text-slate-400 flex-shrink-0" />
                      <span className="font-mono">{s.phone}</span>
                    </div>
                  )}
                  {s.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Mail size={13} className="text-slate-400 flex-shrink-0" />
                      <span className="truncate">{s.email}</span>
                    </div>
                  )}
                  {s.vatNumber && (
                    <p className="text-xs text-slate-400 font-mono">{isAr ? 'الرقم الضريبي:' : 'VAT:'} {s.vatNumber}</p>
                  )}
                </div>

                {/* Card footer */}
                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                    s.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    {s.isActive ? (isAr ? '● نشط' : '● Active') : (isAr ? '○ معطل' : '○ Inactive')}
                  </span>
                  <button onClick={() => startEdit(s)}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
                    <Edit2 size={12} />
                    {isAr ? 'تعديل' : 'Edit'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
