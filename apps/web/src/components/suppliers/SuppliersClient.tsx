'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Truck, Plus, Search, Phone, Mail, X, Check } from 'lucide-react';

interface Supplier {
  id: string;
  nameAr: string;
  nameEn: string;
  type: string;
  phone: string;
  email: string;
  vatNumber: string;
  isActive: boolean;
  agencyId: string;
  createdAt: number;
}

type SupplierType = 'airline' | 'hotel' | 'transport' | 'insurance' | 'visa' | 'other';

const TYPE_LABELS: Record<SupplierType, { ar: string; en: string; color: string }> = {
  airline:   { ar: 'شركة طيران',  en: 'Airline',    color: 'bg-sky-100 text-sky-700' },
  hotel:     { ar: 'فندق',        en: 'Hotel',      color: 'bg-amber-100 text-amber-700' },
  transport: { ar: 'نقل',         en: 'Transport',  color: 'bg-emerald-100 text-emerald-700' },
  insurance: { ar: 'تأمين',       en: 'Insurance',  color: 'bg-rose-100 text-rose-700' },
  visa:      { ar: 'تأشيرات',     en: 'Visa',       color: 'bg-indigo-100 text-indigo-700' },
  other:     { ar: 'أخرى',        en: 'Other',      color: 'bg-slate-100 text-slate-600' },
};

interface SuppliersClientProps { locale: string }

interface FormState {
  nameAr: string; nameEn: string; type: SupplierType;
  phone: string; email: string; vatNumber: string;
}

const EMPTY_FORM: FormState = { nameAr: '', nameEn: '', type: 'airline', phone: '', email: '', vatNumber: '' };

export function SuppliersClient({ locale }: SuppliersClientProps) {
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const agencyId = user?.agencyId ?? '';

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    async function subscribe() {
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const col = collection(getFirestore(getApp()), 'suppliers');
      const q = query(col, where('agencyId', '==', agencyId));
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
      const { getFirestore, collection, addDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const col = collection(getFirestore(getApp()), 'suppliers');
      await addDoc(col, { ...form, agencyId, isActive: true, createdAt: Date.now() });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(supplier: Supplier) {
    const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
    const { getApp } = await import('@masarat/firebase');
    await updateDoc(doc(getFirestore(getApp()), 'suppliers', supplier.id), { isActive: !supplier.isActive });
  }

  const filtered = suppliers.filter(s => {
    const name = isAr ? s.nameAr : s.nameEn;
    return !search || name.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'الموردون' : 'Suppliers'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{isAr ? 'إدارة موردي الخدمات' : 'Manage service suppliers'}</p>
        </div>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus size={15} />
          {isAr ? 'مورد جديد' : 'New Supplier'}
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">{isAr ? 'إضافة مورد جديد' : 'Add New Supplier'}</h2>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'الاسم بالعربية *' : 'Name (Arabic) *'}</label>
              <input value={form.nameAr} onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" dir="rtl" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'الاسم بالإنجليزية' : 'Name (English)'}</label>
              <input value={form.nameEn} onChange={e => setForm(p => ({ ...p, nameEn: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'النوع' : 'Type'}</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as SupplierType }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {(Object.keys(TYPE_LABELS) as SupplierType[]).map(t => (
                  <option key={t} value={t}>{isAr ? TYPE_LABELS[t].ar : TYPE_LABELS[t].en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'الهاتف' : 'Phone'}</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" dir="ltr" type="tel" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" dir="ltr" type="email" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'الرقم الضريبي' : 'VAT Number'}</label>
              <input value={form.vatNumber} onChange={e => setForm(p => ({ ...p, vatNumber: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" dir="ltr" />
            </div>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.nameAr}>
              {saving ? <Spinner size="sm" /> : <Check size={14} />}
              {isAr ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      {/* Search */}
      <Card padding="sm">
        <div className="relative">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث عن مورد...' : 'Search supplier...'}
            className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Truck size={48} />}
          title={isAr ? 'لا يوجد موردون' : 'No suppliers yet'}
          description={isAr ? 'أضف أول مورد للبدء' : 'Add your first supplier to get started'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => {
            const name = isAr ? s.nameAr : (s.nameEn || s.nameAr);
            const typeInfo = TYPE_LABELS[s.type as SupplierType] ?? TYPE_LABELS.other;
            return (
              <Card key={s.id} className={`transition-opacity ${s.isActive ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{name}</p>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${typeInfo.color}`}>
                      {isAr ? typeInfo.ar : typeInfo.en}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleActive(s)}
                    className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      s.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {s.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {s.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone size={13} className="flex-shrink-0 text-slate-400" />
                      <span dir="ltr">{s.phone}</span>
                    </div>
                  )}
                  {s.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail size={13} className="flex-shrink-0 text-slate-400" />
                      <span className="truncate">{s.email}</span>
                    </div>
                  )}
                  {s.vatNumber && (
                    <p className="text-xs text-slate-400">{isAr ? 'الرقم الضريبي:' : 'VAT:'} {s.vatNumber}</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
