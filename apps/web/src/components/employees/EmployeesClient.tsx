'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import {
  UserCog, Plus, Search, Phone, Mail, X, Check,
  Banknote, CalendarDays, Building2, ChevronLeft, ChevronRight,
  ThumbsUp, ThumbsDown, CreditCard, Users,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type EmployeeRole       = 'admin' | 'manager' | 'agent' | 'accountant' | 'support';
type EmployeeDepartment = 'management' | 'bookings' | 'accounting' | 'customer_service' | 'operations';
type LeaveType          = 'annual' | 'sick' | 'unpaid';
type LeaveStatus        = 'pending' | 'approved' | 'rejected';
type PaymentStatus      = 'paid' | 'unpaid';

interface Employee {
  id: string;
  nameAr: string;
  nameEn: string;
  role: EmployeeRole;
  department: EmployeeDepartment;
  phone: string;
  email: string;
  nationalId: string;
  nationality: string;
  joinDate: string;
  salary: number; // monthly SAR in halalas (x100)
  isActive: boolean;
  agencyId: string;
  createdAt: number;
}

interface SalaryPayment {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string; // 'YYYY-MM'
  baseSalary: number; // halalas
  bonus: number;      // halalas
  deductions: number; // halalas
  netSalary: number;  // halalas
  status: PaymentStatus;
  agencyId: string;
  paidAt?: number;
}

interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  reason: string;
  status: LeaveStatus;
  agencyId: string;
  createdAt: number;
}

interface Department {
  id: string;
  nameAr: string;
  nameEn: string;
  agencyId: string;
}

// ─── Static label maps ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<EmployeeRole, { ar: string; en: string; color: string }> = {
  admin:      { ar: 'مدير النظام',  en: 'Admin',         color: 'bg-purple-100 text-purple-700' },
  manager:    { ar: 'مدير',         en: 'Manager',        color: 'bg-brand-100 text-brand-700' },
  agent:      { ar: 'موظف حجز',    en: 'Booking Agent',  color: 'bg-sky-100 text-sky-700' },
  accountant: { ar: 'محاسب',        en: 'Accountant',     color: 'bg-emerald-100 text-emerald-700' },
  support:    { ar: 'دعم العملاء',  en: 'Support',        color: 'bg-amber-100 text-amber-700' },
};

const DEPT_LABELS: Record<EmployeeDepartment, { ar: string; en: string }> = {
  management:       { ar: 'الإدارة',        en: 'Management' },
  bookings:         { ar: 'الحجوزات',       en: 'Bookings' },
  accounting:       { ar: 'المحاسبة',       en: 'Accounting' },
  customer_service: { ar: 'خدمة العملاء',   en: 'Customer Service' },
  operations:       { ar: 'العمليات',       en: 'Operations' },
};

const LEAVE_TYPE_LABELS: Record<LeaveType, { ar: string; en: string }> = {
  annual: { ar: 'إجازة سنوية', en: 'Annual Leave' },
  sick:   { ar: 'إجازة مرضية', en: 'Sick Leave' },
  unpaid: { ar: 'إجازة بدون راتب', en: 'Unpaid Leave' },
};

const DEFAULT_DEPARTMENTS: Omit<Department, 'id' | 'agencyId'>[] = [
  { nameAr: 'الإدارة',        nameEn: 'Management' },
  { nameAr: 'الحجوزات',       nameEn: 'Bookings' },
  { nameAr: 'المحاسبة',       nameEn: 'Accounting' },
  { nameAr: 'خدمة العملاء',   nameEn: 'Customer Service' },
  { nameAr: 'العمليات',       nameEn: 'Operations' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-');
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(Number(y), Number(m) - 1, 1));
}

function salaryDisplayValue(halalas: number): string {
  return String(halalas / 100);
}

function salaryToHalalas(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// input class reuse
const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white';
const labelCls = 'block text-xs font-medium text-slate-700 mb-1';

// ─── Main component ───────────────────────────────────────────────────────────

interface EmployeesClientProps { locale: string }

type Tab = 'employees' | 'salaries' | 'leaves' | 'departments';

export function EmployeesClient({ locale }: EmployeesClientProps) {
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const agencyId = user?.agencyId ?? '';

  const [activeTab, setActiveTab] = useState<Tab>('employees');

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'employees',   label: isAr ? 'الموظفون'  : 'Employees',   icon: <UserCog size={16} /> },
    { key: 'salaries',    label: isAr ? 'الرواتب'   : 'Salaries',    icon: <Banknote size={16} /> },
    { key: 'leaves',      label: isAr ? 'الإجازات'  : 'Leave',        icon: <CalendarDays size={16} /> },
    { key: 'departments', label: isAr ? 'الأقسام'   : 'Departments',  icon: <Building2 size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'إدارة الموارد البشرية' : 'HR Management'}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isAr ? 'الموظفون، الرواتب، الإجازات والأقسام' : 'Employees, salaries, leaves & departments'}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === t.key
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'employees'   && <EmployeesTab   isAr={isAr} agencyId={agencyId} locale={locale} />}
      {activeTab === 'salaries'    && <SalariesTab    isAr={isAr} agencyId={agencyId} locale={locale} />}
      {activeTab === 'leaves'      && <LeavesTab      isAr={isAr} agencyId={agencyId} locale={locale} />}
      {activeTab === 'departments' && <DepartmentsTab isAr={isAr} agencyId={agencyId} locale={locale} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1 – Employees
// ═══════════════════════════════════════════════════════════════════════════════

interface EmployeeFormState {
  nameAr: string; nameEn: string;
  role: EmployeeRole; department: EmployeeDepartment;
  phone: string; email: string;
  nationalId: string; nationality: string;
  joinDate: string; salary: string; // display value in SAR
}

const EMPTY_EMP_FORM: EmployeeFormState = {
  nameAr: '', nameEn: '', role: 'agent', department: 'bookings',
  phone: '', email: '', nationalId: '', nationality: '',
  joinDate: '', salary: '',
};

function EmployeesTab({ isAr, agencyId, locale }: { isAr: boolean; agencyId: string; locale: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [roleFilter, setRoleFilter] = useState<EmployeeRole | 'all'>('all');
  const [deptFilter, setDeptFilter] = useState<EmployeeDepartment | 'all'>('all');
  const [showForm, setShowForm]   = useState(false);
  const [editEmp, setEditEmp]     = useState<Employee | null>(null);
  const [form, setForm]           = useState<EmployeeFormState>(EMPTY_EMP_FORM);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    (async () => {
      const { getFirestore, collection, query, where, orderBy, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const q = query(
        collection(getFirestore(getApp()), 'employees'),
        where('agencyId', '==', agencyId),
        orderBy('createdAt', 'desc'),
      );
      unsub = onSnapshot(q, snap => {
        setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
        setLoading(false);
      }, () => setLoading(false));
    })();
    return () => unsub?.();
  }, [agencyId]);

  function openAdd() {
    setEditEmp(null);
    setForm(EMPTY_EMP_FORM);
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setEditEmp(emp);
    setForm({
      nameAr: emp.nameAr, nameEn: emp.nameEn,
      role: emp.role, department: emp.department,
      phone: emp.phone ?? '', email: emp.email ?? '',
      nationalId: emp.nationalId ?? '', nationality: emp.nationality ?? '',
      joinDate: emp.joinDate ?? '', salary: salaryDisplayValue(emp.salary ?? 0),
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.nameAr || !agencyId) return;
    setSaving(true);
    try {
      const { getFirestore, collection, addDoc, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const payload = {
        nameAr: form.nameAr, nameEn: form.nameEn,
        role: form.role, department: form.department,
        phone: form.phone, email: form.email,
        nationalId: form.nationalId, nationality: form.nationality,
        joinDate: form.joinDate,
        salary: salaryToHalalas(form.salary),
        agencyId,
      };
      if (editEmp) {
        await updateDoc(doc(db, 'employees', editEmp.id), payload);
      } else {
        await addDoc(collection(db, 'employees'), { ...payload, isActive: true, createdAt: Date.now() });
      }
      setShowForm(false);
      setEditEmp(null);
      setForm(EMPTY_EMP_FORM);
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
    const name = isAr ? e.nameAr : (e.nameEn || e.nameAr);
    const matchSearch = !search
      || name.toLowerCase().includes(search.toLowerCase())
      || e.email?.toLowerCase().includes(search.toLowerCase())
      || e.phone?.includes(search);
    const matchRole = roleFilter === 'all' || e.role === roleFilter;
    const matchDept = deptFilter === 'all' || e.department === deptFilter;
    return matchSearch && matchRole && matchDept;
  });

  const roles: (EmployeeRole | 'all')[] = ['all', 'admin', 'manager', 'agent', 'accountant', 'support'];
  const depts: (EmployeeDepartment | 'all')[] = ['all', 'management', 'bookings', 'accounting', 'customer_service', 'operations'];

  const activeCount   = employees.filter(e => e.isActive).length;
  const inactiveCount = employees.length - activeCount;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="text-center py-4">
          <p className="text-2xl font-bold text-slate-900">{employees.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'إجمالي الموظفين' : 'Total Employees'}</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
          <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'نشطون' : 'Active'}</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-2xl font-bold text-slate-400">{inactiveCount}</p>
          <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'غير نشطين' : 'Inactive'}</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-2xl font-bold text-brand-600">
            {employees.filter(e => e.role === 'manager').length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'مديرون' : 'Managers'}</p>
        </Card>
      </div>

      {/* Add button */}
      <div className="flex justify-end">
        <Button onClick={openAdd} size="sm">
          <Plus size={15} />
          {isAr ? 'موظف جديد' : 'New Employee'}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">
              {editEmp
                ? (isAr ? 'تعديل بيانات الموظف' : 'Edit Employee')
                : (isAr ? 'إضافة موظف جديد' : 'Add New Employee')}
            </h2>
            <button onClick={() => { setShowForm(false); setEditEmp(null); setForm(EMPTY_EMP_FORM); }}
              className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{isAr ? 'الاسم بالعربية *' : 'Name (Arabic) *'}</label>
              <input value={form.nameAr} onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))}
                className={inputCls} dir="rtl" />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'الاسم بالإنجليزية' : 'Name (English)'}</label>
              <input value={form.nameEn} onChange={e => setForm(p => ({ ...p, nameEn: e.target.value }))}
                className={inputCls} dir="ltr" />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'المنصب' : 'Role'}</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as EmployeeRole }))}
                className={inputCls}>
                {(Object.keys(ROLE_LABELS) as EmployeeRole[]).map(r => (
                  <option key={r} value={r}>{isAr ? ROLE_LABELS[r].ar : ROLE_LABELS[r].en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'القسم' : 'Department'}</label>
              <select value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value as EmployeeDepartment }))}
                className={inputCls}>
                {(Object.keys(DEPT_LABELS) as EmployeeDepartment[]).map(d => (
                  <option key={d} value={d}>{isAr ? DEPT_LABELS[d].ar : DEPT_LABELS[d].en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'الهاتف' : 'Phone'}</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className={inputCls} dir="ltr" type="tel" />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className={inputCls} dir="ltr" type="email" />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'رقم الهوية' : 'National ID'}</label>
              <input value={form.nationalId} onChange={e => setForm(p => ({ ...p, nationalId: e.target.value }))}
                className={inputCls} dir="ltr" />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'الجنسية' : 'Nationality'}</label>
              <input value={form.nationality} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'تاريخ الالتحاق' : 'Join Date'}</label>
              <input value={form.joinDate} onChange={e => setForm(p => ({ ...p, joinDate: e.target.value }))}
                className={inputCls} type="date" dir="ltr" />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'الراتب الشهري (ر.س.)' : 'Monthly Salary (SAR)'}</label>
              <input value={form.salary} onChange={e => setForm(p => ({ ...p, salary: e.target.value }))}
                className={inputCls} dir="ltr" type="number" min="0" placeholder="0.00" />
            </div>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditEmp(null); setForm(EMPTY_EMP_FORM); }}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.nameAr}>
              {saving ? <Spinner size="sm" /> : <Check size={14} />}
              {isAr ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card padding="sm">
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={isAr ? 'ابحث عن موظف...' : 'Search employee...'}
                className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          {/* Role filter */}
          <div className="flex gap-2 flex-wrap">
            {roles.map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  roleFilter === r ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {r === 'all' ? (isAr ? 'كل المناصب' : 'All Roles') : (isAr ? ROLE_LABELS[r].ar : ROLE_LABELS[r].en)}
              </button>
            ))}
          </div>
          {/* Dept filter */}
          <div className="flex gap-2 flex-wrap">
            {depts.map(d => (
              <button key={d} onClick={() => setDeptFilter(d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  deptFilter === d ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {d === 'all' ? (isAr ? 'كل الأقسام' : 'All Depts') : (isAr ? DEPT_LABELS[d].ar : DEPT_LABELS[d].en)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table / Cards */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserCog size={48} />}
          title={isAr ? 'لا يوجد موظفون' : 'No employees yet'}
          description={isAr ? 'أضف أول موظف للبدء' : 'Add your first employee to get started'}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-surface-border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    isAr ? 'الموظف' : 'Employee',
                    isAr ? 'المنصب' : 'Role',
                    isAr ? 'القسم' : 'Department',
                    isAr ? 'الهاتف' : 'Phone',
                    isAr ? 'البريد' : 'Email',
                    isAr ? 'الراتب' : 'Salary',
                    isAr ? 'تاريخ الالتحاق' : 'Join Date',
                    isAr ? 'الحالة' : 'Status',
                    '',
                  ].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map(emp => {
                  const name     = isAr ? emp.nameAr : (emp.nameEn || emp.nameAr);
                  const roleInfo = ROLE_LABELS[emp.role] ?? ROLE_LABELS.agent;
                  const deptInfo = DEPT_LABELS[emp.department] ?? { ar: emp.department, en: emp.department };
                  return (
                    <tr key={emp.id} className={`hover:bg-slate-50 transition-colors ${emp.isActive ? '' : 'opacity-60'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-brand-700">{name.slice(0, 2)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{name}</p>
                            {emp.nameEn && isAr && <p className="text-xs text-slate-400">{emp.nameEn}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleInfo.color}`}>
                          {isAr ? roleInfo.ar : roleInfo.en}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {isAr ? deptInfo.ar : deptInfo.en}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap" dir="ltr">
                        {emp.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate">
                        {emp.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap font-medium" dir="ltr">
                        {emp.salary ? formatCurrency(emp.salary, isAr ? 'ar-SA' : 'en-US') : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap" dir="ltr">
                        {emp.joinDate || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={emp.isActive ? 'success' : 'neutral'}>
                          {emp.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(emp)}
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                            {isAr ? 'تعديل' : 'Edit'}
                          </button>
                          <button onClick={() => toggleActive(emp)}
                            className="text-xs text-slate-500 hover:text-slate-700 font-medium">
                            {emp.isActive ? (isAr ? 'تعطيل' : 'Deactivate') : (isAr ? 'تفعيل' : 'Activate')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map(emp => {
              const name     = isAr ? emp.nameAr : (emp.nameEn || emp.nameAr);
              const roleInfo = ROLE_LABELS[emp.role] ?? ROLE_LABELS.agent;
              const deptInfo = DEPT_LABELS[emp.department] ?? { ar: emp.department, en: emp.department };
              return (
                <Card key={emp.id} className={`transition-opacity ${emp.isActive ? '' : 'opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-brand-700">{name.slice(0, 2)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-slate-900 truncate">{name}</p>
                        <Badge variant={emp.isActive ? 'success' : 'neutral'} size="sm">
                          {emp.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleInfo.color}`}>
                          {isAr ? roleInfo.ar : roleInfo.en}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          {isAr ? deptInfo.ar : deptInfo.en}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-slate-500">
                        {emp.phone && <div className="flex items-center gap-1.5"><Phone size={11} /><span dir="ltr">{emp.phone}</span></div>}
                        {emp.email && <div className="flex items-center gap-1.5"><Mail size={11} /><span className="truncate">{emp.email}</span></div>}
                        {emp.salary ? <div className="flex items-center gap-1.5"><Banknote size={11} /><span>{formatCurrency(emp.salary, isAr ? 'ar-SA' : 'en-US')}</span></div> : null}
                      </div>
                      <div className="flex gap-3 mt-3 pt-2 border-t border-slate-100">
                        <button onClick={() => openEdit(emp)} className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                          {isAr ? 'تعديل' : 'Edit'}
                        </button>
                        <button onClick={() => toggleActive(emp)} className="text-xs text-slate-500 hover:text-slate-700 font-medium">
                          {emp.isActive ? (isAr ? 'تعطيل' : 'Deactivate') : (isAr ? 'تفعيل' : 'Activate')}
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2 – Salaries
// ═══════════════════════════════════════════════════════════════════════════════

function SalariesTab({ isAr, agencyId, locale }: { isAr: boolean; agencyId: string; locale: string }) {
  const [month, setMonth]           = useState(currentMonth());
  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [payments, setPayments]     = useState<SalaryPayment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [actionId, setActionId]     = useState<string | null>(null);
  const [showEditId, setShowEditId] = useState<string | null>(null);
  const [editBonus, setEditBonus]   = useState('');
  const [editDeduct, setEditDeduct] = useState('');
  const [saving, setSaving]         = useState(false);

  // Load employees once
  useEffect(() => {
    if (!agencyId) return;
    (async () => {
      const { getFirestore, collection, query, where, getDocs } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const snap = await getDocs(
        query(collection(getFirestore(getApp()), 'employees'), where('agencyId', '==', agencyId))
      );
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)).filter(e => e.isActive));
    })();
  }, [agencyId]);

  // Load payments for selected month
  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    setLoading(true);
    (async () => {
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const q = query(
        collection(getFirestore(getApp()), 'salary_payments'),
        where('agencyId', '==', agencyId),
        where('month', '==', month),
      );
      unsub = onSnapshot(q, snap => {
        setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryPayment)));
        setLoading(false);
      }, () => setLoading(false));
    })();
    return () => unsub?.();
  }, [agencyId, month]);

  // Build merged rows: one per active employee, creating payment doc if missing
  const rows = employees.map(emp => {
    const pay = payments.find(p => p.employeeId === emp.id);
    if (pay) return { emp, pay };
    // virtual unpaid row (not yet in Firestore)
    const virtual: SalaryPayment = {
      id: '', employeeId: emp.id,
      employeeName: isAr ? emp.nameAr : (emp.nameEn || emp.nameAr),
      month, baseSalary: emp.salary ?? 0,
      bonus: 0, deductions: 0, netSalary: emp.salary ?? 0,
      status: 'unpaid', agencyId,
    };
    return { emp, pay: virtual };
  });

  async function ensurePaymentDoc(emp: Employee, pay: SalaryPayment): Promise<string> {
    if (pay.id) return pay.id;
    const { getFirestore, collection, addDoc } = await import('firebase/firestore');
    const { getApp } = await import('@masarat/firebase');
    const ref = await addDoc(collection(getFirestore(getApp()), 'salary_payments'), {
      employeeId: emp.id,
      employeeName: isAr ? emp.nameAr : (emp.nameEn || emp.nameAr),
      month,
      baseSalary: emp.salary ?? 0,
      bonus: 0,
      deductions: 0,
      netSalary: emp.salary ?? 0,
      status: 'unpaid',
      agencyId,
    });
    return ref.id;
  }

  async function markPaid(emp: Employee, pay: SalaryPayment) {
    setActionId(emp.id);
    try {
      const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const id = await ensurePaymentDoc(emp, pay);
      await updateDoc(doc(getFirestore(getApp()), 'salary_payments', id), {
        status: 'paid', paidAt: Date.now(),
      });
    } finally {
      setActionId(null);
    }
  }

  async function markUnpaid(pay: SalaryPayment) {
    if (!pay.id) return;
    setActionId(pay.employeeId);
    try {
      const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      await updateDoc(doc(getFirestore(getApp()), 'salary_payments', pay.id), {
        status: 'unpaid', paidAt: null,
      });
    } finally {
      setActionId(null);
    }
  }

  function openEdit(emp: Employee, pay: SalaryPayment) {
    setShowEditId(emp.id);
    setEditBonus(salaryDisplayValue(pay.bonus));
    setEditDeduct(salaryDisplayValue(pay.deductions));
  }

  async function saveAdjustments(emp: Employee, pay: SalaryPayment) {
    setSaving(true);
    try {
      const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const bonus      = salaryToHalalas(editBonus);
      const deductions = salaryToHalalas(editDeduct);
      const netSalary  = (emp.salary ?? 0) + bonus - deductions;
      const id = await ensurePaymentDoc(emp, pay);
      await updateDoc(doc(getFirestore(getApp()), 'salary_payments', id), { bonus, deductions, netSalary });
      setShowEditId(null);
    } finally {
      setSaving(false);
    }
  }

  function prevMonth() {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const totalBase    = rows.reduce((s, r) => s + (r.emp.salary ?? 0), 0);
  const totalPaid    = rows.filter(r => r.pay.status === 'paid').reduce((s, r) => s + r.pay.netSalary, 0);
  const totalPending = rows.filter(r => r.pay.status === 'unpaid').reduce((s, r) => s + r.pay.netSalary, 0);

  const fmt = (v: number) => formatCurrency(v, isAr ? 'ar-SA' : 'en-US');

  return (
    <div className="space-y-5">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ChevronRight size={18} />
        </button>
        <span className="text-base font-semibold text-slate-800 min-w-[140px] text-center">
          {monthLabel(month, locale)}
        </span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center py-4">
          <p className="text-xs text-slate-500 mb-1">{isAr ? 'إجمالي الرواتب' : 'Total Payroll'}</p>
          <p className="text-xl font-bold text-slate-900">{fmt(totalBase)}</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-xs text-slate-500 mb-1">{isAr ? 'تم الصرف' : 'Total Paid'}</p>
          <p className="text-xl font-bold text-emerald-600">{fmt(totalPaid)}</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-xs text-slate-500 mb-1">{isAr ? 'لم يُصرف بعد' : 'Total Pending'}</p>
          <p className="text-xl font-bold text-amber-600">{fmt(totalPending)}</p>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Banknote size={48} />}
          title={isAr ? 'لا يوجد موظفون نشطون' : 'No active employees'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  isAr ? 'الموظف' : 'Employee',
                  isAr ? 'الراتب الأساسي' : 'Base Salary',
                  isAr ? 'بونص' : 'Bonus',
                  isAr ? 'خصومات' : 'Deductions',
                  isAr ? 'الصافي' : 'Net Salary',
                  isAr ? 'الحالة' : 'Status',
                  '',
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map(({ emp, pay }) => {
                const name    = isAr ? emp.nameAr : (emp.nameEn || emp.nameAr);
                const editing = showEditId === emp.id;
                const net     = (emp.salary ?? 0) + (pay.bonus ?? 0) - (pay.deductions ?? 0);
                return (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
                          <span className="text-xs font-bold text-brand-700">{name.slice(0, 2)}</span>
                        </div>
                        <span className="font-medium text-slate-900">{name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmt(emp.salary ?? 0)}</td>
                    <td className="px-4 py-3 text-emerald-600 whitespace-nowrap">
                      {editing ? (
                        <input value={editBonus} onChange={e => setEditBonus(e.target.value)}
                          className="w-24 rounded border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" dir="ltr" />
                      ) : fmt(pay.bonus ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-red-500 whitespace-nowrap">
                      {editing ? (
                        <input value={editDeduct} onChange={e => setEditDeduct(e.target.value)}
                          className="w-24 rounded border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" dir="ltr" />
                      ) : fmt(pay.deductions ?? 0)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">{fmt(net)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={pay.status === 'paid' ? 'success' : 'warning'}>
                        {pay.status === 'paid'
                          ? (isAr ? 'مدفوع' : 'Paid')
                          : (isAr ? 'لم يُدفع' : 'Unpaid')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => saveAdjustments(emp, pay)} disabled={saving}>
                            {saving ? <Spinner size="sm" /> : (isAr ? 'حفظ' : 'Save')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowEditId(null)}>
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(emp, pay)}
                            className="text-xs text-slate-500 hover:text-slate-700 font-medium">
                            {isAr ? 'تعديل' : 'Adjust'}
                          </button>
                          {pay.status === 'unpaid' ? (
                            <Button size="sm" onClick={() => markPaid(emp, pay)}
                              disabled={actionId === emp.id}>
                              {actionId === emp.id ? <Spinner size="sm" /> : <CreditCard size={13} />}
                              {isAr ? 'صرف' : 'Mark Paid'}
                            </Button>
                          ) : (
                            <button onClick={() => markUnpaid(pay)}
                              disabled={actionId === pay.employeeId}
                              className="text-xs text-slate-400 hover:text-red-600 font-medium">
                              {isAr ? 'إلغاء الصرف' : 'Undo'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3 – Leave Requests
// ═══════════════════════════════════════════════════════════════════════════════

interface LeaveFormState {
  employeeId: string;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  reason: string;
}
const EMPTY_LEAVE_FORM: LeaveFormState = { employeeId: '', type: 'annual', fromDate: '', toDate: '', reason: '' };

function LeavesTab({ isAr, agencyId, locale }: { isAr: boolean; agencyId: string; locale: string }) {
  const [leaves, setLeaves]         = useState<LeaveRequest[]>([]);
  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState<LeaveFormState>(EMPTY_LEAVE_FORM);
  const [saving, setSaving]         = useState(false);
  const [actionId, setActionId]     = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'all'>('all');

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    (async () => {
      const { getFirestore, collection, query, where, getDocs } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const snap = await getDocs(
        query(collection(getFirestore(getApp()), 'employees'), where('agencyId', '==', agencyId))
      );
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)).filter(e => e.isActive));
    })();
  }, [agencyId]);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    (async () => {
      const { getFirestore, collection, query, where, orderBy, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const q = query(
        collection(getFirestore(getApp()), 'leave_requests'),
        where('agencyId', '==', agencyId),
        orderBy('createdAt', 'desc'),
      );
      unsub = onSnapshot(q, snap => {
        setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
        setLoading(false);
      }, () => setLoading(false));
    })();
    return () => unsub?.();
  }, [agencyId]);

  async function handleAdd() {
    if (!form.employeeId || !form.fromDate || !form.toDate || !agencyId) return;
    setSaving(true);
    try {
      const emp = employees.find(e => e.id === form.employeeId);
      const { getFirestore, collection, addDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      await addDoc(collection(getFirestore(getApp()), 'leave_requests'), {
        employeeId: form.employeeId,
        employeeName: emp ? (isAr ? emp.nameAr : (emp.nameEn || emp.nameAr)) : '',
        type: form.type,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason,
        status: 'pending',
        agencyId,
        createdAt: Date.now(),
      });
      setForm(EMPTY_LEAVE_FORM);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(leave: LeaveRequest, status: LeaveStatus) {
    setActionId(leave.id);
    try {
      const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      await updateDoc(doc(getFirestore(getApp()), 'leave_requests', leave.id), { status });
    } finally {
      setActionId(null);
    }
  }

  const filtered = statusFilter === 'all' ? leaves : leaves.filter(l => l.status === statusFilter);

  const statuses: (LeaveStatus | 'all')[] = ['all', 'pending', 'approved', 'rejected'];
  const statusColors: Record<LeaveStatus, string> = {
    pending:  'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const statusLabels: Record<LeaveStatus, { ar: string; en: string }> = {
    pending:  { ar: 'معلق',   en: 'Pending' },
    approved: { ar: 'موافق',  en: 'Approved' },
    rejected: { ar: 'مرفوض', en: 'Rejected' },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {s === 'all'
                ? (isAr ? 'الكل' : 'All')
                : (isAr ? statusLabels[s].ar : statusLabels[s].en)}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus size={15} />
          {isAr ? 'طلب إجازة' : 'New Request'}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">{isAr ? 'إضافة طلب إجازة' : 'Add Leave Request'}</h2>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_LEAVE_FORM); }}
              className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{isAr ? 'الموظف *' : 'Employee *'}</label>
              <select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                className={inputCls}>
                <option value="">{isAr ? 'اختر موظفاً...' : 'Select employee...'}</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {isAr ? emp.nameAr : (emp.nameEn || emp.nameAr)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'نوع الإجازة' : 'Leave Type'}</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as LeaveType }))}
                className={inputCls}>
                {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map(t => (
                  <option key={t} value={t}>{isAr ? LEAVE_TYPE_LABELS[t].ar : LEAVE_TYPE_LABELS[t].en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'من تاريخ *' : 'From Date *'}</label>
              <input value={form.fromDate} onChange={e => setForm(p => ({ ...p, fromDate: e.target.value }))}
                className={inputCls} type="date" dir="ltr" />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'إلى تاريخ *' : 'To Date *'}</label>
              <input value={form.toDate} onChange={e => setForm(p => ({ ...p, toDate: e.target.value }))}
                className={inputCls} type="date" dir="ltr" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>{isAr ? 'السبب' : 'Reason'}</label>
              <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                className={inputCls} rows={3} />
            </div>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setForm(EMPTY_LEAVE_FORM); }}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={saving || !form.employeeId || !form.fromDate || !form.toDate}>
              {saving ? <Spinner size="sm" /> : <Check size={14} />}
              {isAr ? 'إرسال' : 'Submit'}
            </Button>
          </div>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={48} />}
          title={isAr ? 'لا توجد طلبات إجازة' : 'No leave requests'}
          description={isAr ? 'لا توجد طلبات في هذه الفئة' : 'No requests in this category'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  isAr ? 'الموظف' : 'Employee',
                  isAr ? 'نوع الإجازة' : 'Type',
                  isAr ? 'من' : 'From',
                  isAr ? 'إلى' : 'To',
                  isAr ? 'الأيام' : 'Days',
                  isAr ? 'السبب' : 'Reason',
                  isAr ? 'الحالة' : 'Status',
                  '',
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.map(leave => {
                const days = leave.fromDate && leave.toDate
                  ? Math.max(1, Math.ceil((new Date(leave.toDate).getTime() - new Date(leave.fromDate).getTime()) / 86400000) + 1)
                  : '—';
                return (
                  <tr key={leave.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{leave.employeeName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {isAr ? LEAVE_TYPE_LABELS[leave.type].ar : LEAVE_TYPE_LABELS[leave.type].en}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap" dir="ltr">{leave.fromDate}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap" dir="ltr">{leave.toDate}</td>
                    <td className="px-4 py-3 text-slate-600 text-center">{days}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{leave.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[leave.status]}`}>
                        {isAr ? statusLabels[leave.status].ar : statusLabels[leave.status].en}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {leave.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateStatus(leave, 'approved')}
                            disabled={actionId === leave.id}
                            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                            {actionId === leave.id ? <Spinner size="sm" /> : <ThumbsUp size={13} />}
                            {isAr ? 'موافقة' : 'Approve'}
                          </button>
                          <button onClick={() => updateStatus(leave, 'rejected')}
                            disabled={actionId === leave.id}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
                            <ThumbsDown size={13} />
                            {isAr ? 'رفض' : 'Reject'}
                          </button>
                        </div>
                      )}
                      {leave.status !== 'pending' && (
                        <button onClick={() => updateStatus(leave, 'pending')}
                          className="text-xs text-slate-400 hover:text-slate-600 font-medium">
                          {isAr ? 'إعادة فتح' : 'Reopen'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 4 – Departments
// ═══════════════════════════════════════════════════════════════════════════════

function DepartmentsTab({ isAr, agencyId, locale }: { isAr: boolean; agencyId: string; locale: string }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees]     = useState<Employee[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editDept, setEditDept]       = useState<Department | null>(null);
  const [nameAr, setNameAr]           = useState('');
  const [nameEn, setNameEn]           = useState('');
  const [saving, setSaving]           = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [seeded, setSeeded]           = useState(false);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    (async () => {
      const { getFirestore, collection, query, where, onSnapshot, getDocs, addDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db  = getFirestore(getApp());
      const col = collection(db, 'departments');
      const q   = query(col, where('agencyId', '==', agencyId));

      unsub = onSnapshot(q, async snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Department));
        setDepartments(docs);
        setLoading(false);

        // Seed default departments once if none exist
        if (docs.length === 0 && !seeded) {
          setSeeded(true);
          for (const def of DEFAULT_DEPARTMENTS) {
            await addDoc(col, { ...def, agencyId });
          }
        }
      }, () => setLoading(false));

      // Also fetch employees for counts
      const empSnap = await getDocs(query(collection(db, 'employees'), where('agencyId', '==', agencyId)));
      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)).filter(e => e.isActive));
    })();
    return () => unsub?.();
  }, [agencyId]);

  function openAdd() {
    setEditDept(null);
    setNameAr('');
    setNameEn('');
    setShowForm(true);
  }

  function openEdit(dept: Department) {
    setEditDept(dept);
    setNameAr(dept.nameAr);
    setNameEn(dept.nameEn);
    setShowForm(true);
  }

  async function handleSave() {
    if (!nameAr) return;
    setSaving(true);
    try {
      const { getFirestore, collection, addDoc, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      if (editDept) {
        await updateDoc(doc(db, 'departments', editDept.id), { nameAr, nameEn });
      } else {
        await addDoc(collection(db, 'departments'), { nameAr, nameEn, agencyId });
      }
      setShowForm(false);
      setEditDept(null);
      setNameAr('');
      setNameEn('');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(dept: Department) {
    setDeletingId(dept.id);
    try {
      const { getFirestore, doc, deleteDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      await deleteDoc(doc(getFirestore(getApp()), 'departments', dept.id));
    } finally {
      setDeletingId(null);
    }
  }

  // Map departments to Firestore department keys for employee counts
  // We match department name against DEPT_LABELS or by nameAr
  function empCountForDept(dept: Department): number {
    const key = (Object.keys(DEPT_LABELS) as EmployeeDepartment[]).find(k =>
      DEPT_LABELS[k].ar === dept.nameAr || DEPT_LABELS[k].en === dept.nameEn
    );
    if (key) return employees.filter(e => e.department === key).length;
    // fallback: match by nameAr in employee's department label
    return employees.filter(e => {
      const info = DEPT_LABELS[e.department];
      return info?.ar === dept.nameAr || info?.en === dept.nameEn;
    }).length;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd}>
          <Plus size={15} />
          {isAr ? 'قسم جديد' : 'New Department'}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">
              {editDept ? (isAr ? 'تعديل القسم' : 'Edit Department') : (isAr ? 'إضافة قسم جديد' : 'Add Department')}
            </h2>
            <button onClick={() => { setShowForm(false); setEditDept(null); }}
              className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{isAr ? 'اسم القسم بالعربية *' : 'Name (Arabic) *'}</label>
              <input value={nameAr} onChange={e => setNameAr(e.target.value)}
                className={inputCls} dir="rtl" />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'اسم القسم بالإنجليزية' : 'Name (English)'}</label>
              <input value={nameEn} onChange={e => setNameEn(e.target.value)}
                className={inputCls} dir="ltr" />
            </div>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditDept(null); }}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !nameAr}>
              {saving ? <Spinner size="sm" /> : <Check size={14} />}
              {isAr ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      {/* Departments list */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : departments.length === 0 ? (
        <EmptyState
          icon={<Building2 size={48} />}
          title={isAr ? 'لا توجد أقسام' : 'No departments'}
          description={isAr ? 'أضف أول قسم للبدء' : 'Add your first department to get started'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {departments.map(dept => {
            const count = empCountForDept(dept);
            return (
              <Card key={dept.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Building2 size={20} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{isAr ? dept.nameAr : (dept.nameEn || dept.nameAr)}</p>
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
                      <Users size={11} />
                      <span>{count} {isAr ? 'موظف' : 'employees'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(dept)}
                    className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                    {isAr ? 'تعديل' : 'Edit'}
                  </button>
                  <button onClick={() => handleDelete(dept)}
                    disabled={deletingId === dept.id}
                    className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
                    {deletingId === dept.id ? <Spinner size="sm" /> : (isAr ? 'حذف' : 'Delete')}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
