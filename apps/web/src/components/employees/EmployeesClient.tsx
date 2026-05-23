'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { UserCog, Plus, Search, Phone, Mail, X, Check } from 'lucide-react';

interface Employee {
  id: string;
  nameAr: string;
  nameEn: string;
  role: string;
  phone: string;
  email: string;
  isActive: boolean;
  agencyId: string;
  createdAt: number;
}

type EmployeeRole = 'admin' | 'manager' | 'agent' | 'accountant' | 'support';

const ROLE_LABELS: Record<EmployeeRole, { ar: string; en: string; color: string }> = {
  admin:      { ar: 'مدير النظام',   en: 'Admin',       color: 'bg-purple-100 text-purple-700' },
  manager:    { ar: 'مدير',          en: 'Manager',     color: 'bg-brand-100 text-brand-700' },
  agent:      { ar: 'موظف حجز',     en: 'Booking Agent', color: 'bg-sky-100 text-sky-700' },
  accountant: { ar: 'محاسب',         en: 'Accountant',  color: 'bg-emerald-100 text-emerald-700' },
  support:    { ar: 'دعم العملاء',   en: 'Support',     color: 'bg-amber-100 text-amber-700' },
};

interface EmployeesClientProps { locale: string }

interface FormState {
  nameAr: string; nameEn: string; role: EmployeeRole; phone: string; email: string;
}
const EMPTY_FORM: FormState = { nameAr: '', nameEn: '', role: 'agent', phone: '', email: '' };

export function EmployeesClient({ locale }: EmployeesClientProps) {
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [roleFilter, setRoleFilter] = useState<EmployeeRole | 'all'>('all');

  const agencyId = (user as { agencyId?: string } | null)?.agencyId ?? '';

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    async function subscribe() {
      const { getFirestore, collection, query, where, orderBy, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const col = collection(getFirestore(getApp()), 'employees');
      const q = query(col, where('agencyId', '==', agencyId), orderBy('createdAt', 'desc'));
      unsub = onSnapshot(q, snap => {
        setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
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
      const col = collection(getFirestore(getApp()), 'employees');
      await addDoc(col, { ...form, agencyId, isActive: true, createdAt: Date.now() });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(emp: Employee) {
    const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
    const { getApp } = await import('@masarat/firebase');
    await updateDoc(doc(getFirestore(getApp()), 'employees', emp.id), { isActive: !emp.isActive });
  }

  const filtered = employees.filter(e => {
    const name = isAr ? e.nameAr : e.nameEn;
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || e.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || e.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roles: (EmployeeRole | 'all')[] = ['all', 'admin', 'manager', 'agent', 'accountant', 'support'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'الموظفون' : 'Employees'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{isAr ? 'إدارة فريق العمل' : 'Manage your team'}</p>
        </div>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus size={15} />
          {isAr ? 'موظف جديد' : 'New Employee'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(Object.keys(ROLE_LABELS) as EmployeeRole[]).slice(0, 4).map(role => {
          const count = employees.filter(e => e.role === role && e.isActive).length;
          const info = ROLE_LABELS[role];
          return (
            <Card key={role} className="text-center py-4">
              <p className="text-2xl font-bold text-slate-900">{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{isAr ? info.ar : info.en}</p>
            </Card>
          );
        })}
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">{isAr ? 'إضافة موظف جديد' : 'Add New Employee'}</h2>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'المنصب' : 'Role'}</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as EmployeeRole }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {(Object.keys(ROLE_LABELS) as EmployeeRole[]).map(r => (
                  <option key={r} value={r}>{isAr ? ROLE_LABELS[r].ar : ROLE_LABELS[r].en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'الهاتف' : 'Phone'}</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" dir="ltr" type="tel" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" dir="ltr" type="email" />
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

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-wrap">
            {roles.map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  roleFilter === r ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {r === 'all' ? (isAr ? 'الكل' : 'All') : (isAr ? ROLE_LABELS[r].ar : ROLE_LABELS[r].en)}
              </button>
            ))}
          </div>
          <div className="flex-1 relative">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث عن موظف...' : 'Search employee...'}
              className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserCog size={48} />}
          title={isAr ? 'لا يوجد موظفون' : 'No employees yet'}
          description={isAr ? 'أضف أول موظف للبدء' : 'Add your first employee to get started'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(emp => {
            const name = isAr ? emp.nameAr : (emp.nameEn || emp.nameAr);
            const roleInfo = ROLE_LABELS[emp.role as EmployeeRole] ?? ROLE_LABELS.agent;
            const initials = name.slice(0, 2).toUpperCase();
            return (
              <Card key={emp.id} className={`transition-opacity ${emp.isActive ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-brand-700">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 truncate">{name}</p>
                      <button onClick={() => toggleActive(emp)}
                        className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          emp.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}>
                        {emp.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                      </button>
                    </div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${roleInfo.color}`}>
                      {isAr ? roleInfo.ar : roleInfo.en}
                    </span>
                    <div className="mt-2 space-y-1">
                      {emp.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Phone size={11} /><span dir="ltr">{emp.phone}</span>
                        </div>
                      )}
                      {emp.email && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Mail size={11} /><span className="truncate">{emp.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
