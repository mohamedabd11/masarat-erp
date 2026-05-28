'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { COUNTRIES } from '@/lib/countries';
import {
  UserCog, Plus, Search, Phone, Mail, X, Check,
  Banknote, CalendarDays, Building2, ChevronLeft, ChevronRight,
  ThumbsUp, ThumbsDown, CreditCard, Users,
  Clock, UserCheck,
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
  terminatedAt?: number;
  terminationReason?: string;
  agencyId: string;
  createdAt: string;
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
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

// input class reuse
const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white';
const labelCls = 'block text-xs font-medium text-slate-700 mb-1';

// ─── Main component ───────────────────────────────────────────────────────────

interface EmployeesClientProps { locale: string }

type Tab = 'employees' | 'salaries' | 'leaves' | 'departments' | 'shifts' | 'attendance';

export function EmployeesClient({ locale }: EmployeesClientProps) {
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const agencyId = user?.agencyId ?? '';

  const [activeTab, setActiveTab] = useState<Tab>('employees');

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'employees',   label: isAr ? 'الموظفين'  : 'Employees',   icon: <UserCog size={16} /> },
    { key: 'salaries',    label: isAr ? 'الرواتب'   : 'Salaries',    icon: <Banknote size={16} /> },
    { key: 'leaves',      label: isAr ? 'الإجازات'  : 'Leave',        icon: <CalendarDays size={16} /> },
    { key: 'departments', label: isAr ? 'الأقسام'   : 'Departments',  icon: <Building2 size={16} /> },
    { key: 'shifts',      label: isAr ? 'الورديات'  : 'Shifts',       icon: <Clock size={16} /> },
    { key: 'attendance',  label: isAr ? 'الحضور'    : 'Attendance',   icon: <UserCheck size={16} /> },
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
      {activeTab === 'shifts'      && <ShiftsTab      isAr={isAr} agencyId={agencyId} locale={locale} />}
      {activeTab === 'attendance'  && <AttendanceTab  isAr={isAr} agencyId={agencyId} locale={locale} />}
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
  const [tick, setTick]           = useState(0);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    setLoading(true);
    apiFetch<{ employees: Employee[] }>('/api/employees')
      .then(data => {
        const docs = data.employees;
        docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setEmployees(docs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agencyId, tick]);

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
      const payload = {
        nameAr: form.nameAr, nameEn: form.nameEn,
        department: form.department,
        phone: form.phone, email: form.email,
        nationalId: form.nationalId,
        hireDate: form.joinDate,
        salaryHalalas: salaryToHalalas(form.salary),
      };
      if (editEmp) {
        await apiFetch(`/api/employees/${editEmp.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/employees', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setEditEmp(null);
      setForm(EMPTY_EMP_FORM);
      setTick(t => t + 1);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(emp: Employee) {
    await apiFetch(`/api/employees/${emp.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !emp.isActive }) });
    setTick(t => t + 1);
  }

  async function terminateEmployee(emp: Employee) {
    const reason = window.prompt(isAr ? 'سبب إنهاء الخدمة (اختياري):' : 'Termination reason (optional):') ?? '';
    if (reason === null) return; // cancelled
    if (reason === '__DELETE__') {
      await apiFetch(`/api/employees/${emp.id}`, { method: 'DELETE' });
    } else {
      await apiFetch(`/api/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: false,
          terminatedAt: new Date().toISOString(),
          terminationReason: reason || (isAr ? 'إنهاء خدمة' : 'Terminated'),
        }),
      });
    }
    setTick(t => t + 1);
  }

  async function deleteEmployee(emp: Employee) {
    const confirmed = window.confirm(
      isAr
        ? `هل أنت متأكد من حذف "${emp.nameAr}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`
        : `Are you sure you want to permanently delete "${emp.nameEn || emp.nameAr}"? This cannot be undone.`
    );
    if (!confirmed) return;
    await apiFetch(`/api/employees/${emp.id}`, { method: 'DELETE' });
    setTick(t => t + 1);
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
                className={inputCls} list="emp-countries-datalist"
                placeholder={isAr ? 'اختر أو اكتب...' : 'Select or type...'} />
              <datalist id="emp-countries-datalist">
                {COUNTRIES.map(c => (
                  <option key={c.code} value={isAr ? c.ar : c.en} />
                ))}
              </datalist>
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
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {emp.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate">
                        {emp.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap font-medium">
                        {emp.salary ? formatCurrency(emp.salary, isAr ? 'ar-SA' : 'en-US') : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {emp.joinDate || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={emp.isActive ? 'success' : 'neutral'}>
                          {emp.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => openEdit(emp)}
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                            {isAr ? 'تعديل' : 'Edit'}
                          </button>
                          <button onClick={() => toggleActive(emp)}
                            className="text-xs text-slate-500 hover:text-slate-700 font-medium">
                            {emp.isActive ? (isAr ? 'تعطيل' : 'Suspend') : (isAr ? 'تفعيل' : 'Activate')}
                          </button>
                          {emp.isActive && (
                            <button onClick={() => terminateEmployee(emp)}
                              className="text-xs text-orange-500 hover:text-orange-700 font-medium">
                              {isAr ? 'إنهاء الخدمة' : 'Terminate'}
                            </button>
                          )}
                          {!emp.isActive && (
                            <button onClick={() => deleteEmployee(emp)}
                              className="text-xs text-red-500 hover:text-red-700 font-medium">
                              {isAr ? 'حذف نهائي' : 'Delete'}
                            </button>
                          )}
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
                        {emp.phone && <div className="flex items-center gap-1.5"><Phone size={11} /><span>{emp.phone}</span></div>}
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
    apiFetch<{ employees: Employee[] }>('/api/employees')
      .then(data => setEmployees(data.employees.filter(e => e.isActive)))
      .catch(() => {});
  }, [agencyId]);

  // Load payments for selected month (not yet migrated — stub empty)
  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    setPayments([]);
    setLoading(false);
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

  async function markPaid(emp: Employee, pay: SalaryPayment) {
    setActionId(emp.id);
    try {
      // salary_payments API not yet migrated — no-op placeholder
      setPayments(prev => prev.map(p => p.employeeId === emp.id ? { ...p, status: 'paid' as PaymentStatus, paidAt: Date.now() } : p));
    } finally {
      setActionId(null);
    }
  }

  async function markUnpaid(pay: SalaryPayment) {
    if (!pay.id) return;
    setActionId(pay.employeeId);
    try {
      setPayments(prev => prev.map(p => p.id === pay.id ? { ...p, status: 'unpaid' as PaymentStatus, paidAt: undefined } : p));
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
      const bonus      = salaryToHalalas(editBonus);
      const deductions = salaryToHalalas(editDeduct);
      const netSalary  = (emp.salary ?? 0) + bonus - deductions;
      if (netSalary < 0) {
        alert(
          isAr
            ? `الراتب الصافي سالب (${(netSalary / 100).toFixed(2)} ر.س) — يرجى مراجعة الخصومات`
            : `Net salary is negative (${(netSalary / 100).toFixed(2)} SAR) — please review deductions`
        );
        return;
      }
      setPayments(prev => prev.map(p => p.employeeId === emp.id ? { ...p, bonus, deductions, netSalary } : p));
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
    apiFetch<{ employees: Employee[] }>('/api/employees')
      .then(data => setEmployees(data.employees.filter(e => e.isActive)))
      .catch(() => {});
  }, [agencyId]);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    // leave_requests API not yet migrated — stub empty
    setLeaves([]);
    setLoading(false);
  }, [agencyId]);

  async function handleAdd() {
    if (!form.employeeId || !form.fromDate || !form.toDate || !agencyId) return;
    setSaving(true);
    try {
      // leave_requests API not yet migrated — optimistic local add
      const emp = employees.find(e => e.id === form.employeeId);
      const newLeave: LeaveRequest = {
        id: crypto.randomUUID(),
        employeeId: form.employeeId,
        employeeName: emp ? (isAr ? emp.nameAr : (emp.nameEn || emp.nameAr)) : '',
        type: form.type,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason,
        status: 'pending',
        agencyId,
        createdAt: Date.now(),
      };
      setLeaves(prev => [newLeave, ...prev]);
      setForm(EMPTY_LEAVE_FORM);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(leave: LeaveRequest, status: LeaveStatus) {
    setActionId(leave.id);
    try {
      setLeaves(prev => prev.map(l => l.id === leave.id ? { ...l, status } : l));
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
  const seededRef = useRef(false);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    // departments API not yet migrated — seed from defaults
    if (!seededRef.current) {
      seededRef.current = true;
      setDepartments(DEFAULT_DEPARTMENTS.map((def, i) => ({ ...def, id: String(i), agencyId })));
    }
    setLoading(false);
    // Fetch employees for counts
    apiFetch<{ employees: Employee[] }>('/api/employees')
      .then(data => setEmployees(data.employees.filter(e => e.isActive)))
      .catch(() => {});
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
      // departments API not yet migrated — optimistic local update
      if (editDept) {
        setDepartments(prev => prev.map(d => d.id === editDept.id ? { ...d, nameAr, nameEn } : d));
      } else {
        const newDept: Department = { id: crypto.randomUUID(), nameAr, nameEn, agencyId };
        setDepartments(prev => [...prev, newDept]);
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
      setDepartments(prev => prev.filter(d => d.id !== dept.id));
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

// ─── Types for Shifts & Attendance ────────────────────────────────────────────

interface Shift {
  id: string; nameAr: string; nameEn?: string;
  startTime: string; endTime: string;
  daysOfWeek?: number[]; isDefault: boolean; isActive: boolean;
}

interface AttendanceRecord {
  id: string; employeeId: string; date: string;
  checkIn: string | null; checkOut: string | null;
  status: string; workMinutes: number; notes?: string;
}

const DAY_LABELS_AR = ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
const DAY_LABELS_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const ATT_STATUS_AR: Record<string, string> = {
  present: 'حاضر', absent: 'غائب', late: 'متأخر', half_day: 'نصف يوم', on_leave: 'إجازة',
};
const ATT_STATUS_EN: Record<string, string> = {
  present: 'Present', absent: 'Absent', late: 'Late', half_day: 'Half Day', on_leave: 'On Leave',
};
const ATT_BADGE: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent:  'bg-red-100 text-red-700',
  late:    'bg-amber-100 text-amber-700',
  half_day:'bg-sky-100 text-sky-700',
  on_leave:'bg-slate-100 text-slate-600',
};

// ─── Shifts Tab ───────────────────────────────────────────────────────────────

function ShiftsTab({ isAr, agencyId }: { isAr: boolean; agencyId: string; locale: string }) {
  const [shifts, setShifts]       = useState<Shift[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [saving, setSaving]       = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [nameAr, setNameAr]       = useState('');
  const [nameEn, setNameEn]       = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime]     = useState('17:00');
  const [selDays, setSelDays]     = useState<number[]>([0,1,2,3,4]);

  useEffect(() => {
    if (!agencyId) return;
    apiFetch<{ shifts: Shift[] }>('/api/employees/shifts')
      .then(d => setShifts(d.shifts)).catch(() => {}).finally(() => setLoading(false));
  }, [agencyId]);

  function openAdd() {
    setEditShift(null); setNameAr(''); setNameEn('');
    setStartTime('08:00'); setEndTime('17:00'); setSelDays([0,1,2,3,4]);
    setShowForm(true);
  }
  function openEdit(s: Shift) {
    setEditShift(s); setNameAr(s.nameAr); setNameEn(s.nameEn ?? '');
    setStartTime(s.startTime); setEndTime(s.endTime); setSelDays(s.daysOfWeek ?? []);
    setShowForm(true);
  }
  function toggleDay(d: number) {
    setSelDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  async function handleSave() {
    if (!nameAr || !startTime || !endTime) return;
    setSaving(true);
    try {
      const payload = { nameAr, nameEn: nameEn || undefined, startTime, endTime, daysOfWeek: selDays };
      if (editShift) {
        await apiFetch(`/api/employees/shifts/${editShift.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setShifts(prev => prev.map(s => s.id === editShift.id ? { ...s, ...payload } : s));
      } else {
        const res = await apiFetch<{ id: string }>('/api/employees/shifts', { method: 'POST', body: JSON.stringify(payload) });
        setShifts(prev => [...prev, { id: res.id, ...payload, isDefault: false, isActive: true }]);
      }
      setShowForm(false); setEditShift(null);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  async function handleDelete(s: Shift) {
    setDeletingId(s.id);
    try {
      await apiFetch(`/api/employees/shifts/${s.id}`, { method: 'DELETE' });
      setShifts(prev => prev.filter(x => x.id !== s.id));
    } catch (e) { console.error(e); } finally { setDeletingId(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd}><Plus size={15} />{isAr ? 'وردية جديدة' : 'New Shift'}</Button>
      </div>

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">
              {editShift ? (isAr ? 'تعديل الوردية' : 'Edit Shift') : (isAr ? 'إضافة وردية' : 'Add Shift')}
            </h2>
            <button onClick={() => { setShowForm(false); setEditShift(null); }}
              className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>{isAr ? 'الاسم بالعربية *' : 'Name (Arabic) *'}</label>
              <input value={nameAr} onChange={e => setNameAr(e.target.value)} className={inputCls} dir="rtl" /></div>
            <div><label className={labelCls}>{isAr ? 'الاسم بالإنجليزية' : 'Name (English)'}</label>
              <input value={nameEn} onChange={e => setNameEn(e.target.value)} className={inputCls} dir="ltr" /></div>
            <div><label className={labelCls}>{isAr ? 'وقت البداية *' : 'Start Time *'}</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{isAr ? 'وقت النهاية *' : 'End Time *'}</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} /></div>
          </div>
          <div className="mt-4">
            <label className={labelCls}>{isAr ? 'أيام الدوام' : 'Work Days'}</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {(isAr ? DAY_LABELS_AR : DAY_LABELS_EN).map((day, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selDays.includes(i) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
                  }`}>{day}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditShift(null); }}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !nameAr}>
              {saving ? <Spinner size="sm" /> : <Check size={14} />}{isAr ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : shifts.length === 0 ? (
        <EmptyState icon={<Clock size={48} />}
          title={isAr ? 'لا توجد ورديات' : 'No shifts'}
          description={isAr ? 'أضف أول وردية لتنظيم مواعيد الدوام' : 'Add your first shift to organize work schedules'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {shifts.map(shift => (
            <Card key={shift.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Clock size={20} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{isAr ? shift.nameAr : (shift.nameEn || shift.nameAr)}</p>
                    <p className="text-sm text-slate-500 mt-0.5 tabular-nums">{shift.startTime} — {shift.endTime}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(shift)} className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                    {isAr ? 'تعديل' : 'Edit'}</button>
                  <button onClick={() => handleDelete(shift)} disabled={deletingId === shift.id}
                    className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
                    {deletingId === shift.id ? <Spinner size="sm" /> : (isAr ? 'حذف' : 'Delete')}</button>
                </div>
              </div>
              {(shift.daysOfWeek ?? []).length > 0 && (
                <div className="flex gap-1 flex-wrap mt-3">
                  {(shift.daysOfWeek ?? []).map(d => (
                    <span key={d} className="px-2 py-0.5 bg-brand-50 text-brand-700 text-[11px] rounded-full">
                      {isAr ? DAY_LABELS_AR[d] : DAY_LABELS_EN[d]}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Attendance Tab ───────────────────────────────────────────────────────────

function AttendanceTab({ isAr, agencyId, locale }: { isAr: boolean; agencyId: string; locale: string }) {
  const today = new Date().toISOString().split('T')[0]!;
  const [records, setRecords]         = useState<AttendanceRecord[]>([]);
  const [empList, setEmpList]         = useState<Employee[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterEmp, setFilterEmp]     = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [fEmpId, setFEmpId]           = useState('');
  const [fDate, setFDate]             = useState(today);
  const [fStatus, setFStatus]         = useState('present');
  const [fIn, setFIn]                 = useState('');
  const [fOut, setFOut]               = useState('');
  const [fNotes, setFNotes]           = useState('');

  useEffect(() => {
    if (!agencyId) return;
    apiFetch<{ employees: Employee[] }>('/api/employees').then(d => setEmpList(d.employees)).catch(() => {});
  }, [agencyId]);

  useEffect(() => {
    if (!agencyId) return;
    setLoading(true);
    const q = new URLSearchParams({ month: filterMonth });
    if (filterEmp) q.set('employeeId', filterEmp);
    apiFetch<{ attendance: AttendanceRecord[] }>(`/api/employees/attendance?${q}`)
      .then(d => setRecords(d.attendance)).catch(() => {}).finally(() => setLoading(false));
  }, [agencyId, filterMonth, filterEmp]);

  function empName(id: string) {
    const e = empList.find(x => x.id === id);
    return e ? (isAr ? e.nameAr : (e.nameEn || e.nameAr)) : id;
  }
  function fmtTime(iso: string | null) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString(locale === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  }
  function fmtMins(m: number) {
    if (!m) return '—';
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  async function handleSave() {
    if (!fEmpId || !fDate) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { employeeId: fEmpId, date: fDate, status: fStatus, notes: fNotes || undefined };
      if (fIn)  payload['checkIn']  = `${fDate}T${fIn}:00`;
      if (fOut) payload['checkOut'] = `${fDate}T${fOut}:00`;
      await apiFetch('/api/employees/attendance', { method: 'POST', body: JSON.stringify(payload) });
      const q = new URLSearchParams({ month: filterMonth });
      if (filterEmp) q.set('employeeId', filterEmp);
      const d = await apiFetch<{ attendance: AttendanceRecord[] }>(`/api/employees/attendance?${q}`);
      setRecords(d.attendance);
      setShowForm(false);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className={labelCls}>{isAr ? 'الشهر' : 'Month'}</label>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className={inputCls + ' w-44'} /></div>
          <div><label className={labelCls}>{isAr ? 'الموظف' : 'Employee'}</label>
            <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className={inputCls + ' w-48'}>
              <option value="">{isAr ? 'جميع الموظفين' : 'All Employees'}</option>
              {empList.map(e => <option key={e.id} value={e.id}>{isAr ? e.nameAr : (e.nameEn || e.nameAr)}</option>)}
            </select></div>
          <Button size="sm" onClick={() => { setFEmpId(''); setFDate(today); setFStatus('present'); setFIn(''); setFOut(''); setFNotes(''); setShowForm(true); }}>
            <Plus size={15} />{isAr ? 'تسجيل حضور' : 'Record'}
          </Button>
        </div>
      </Card>

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">{isAr ? 'تسجيل حضور' : 'Record Attendance'}</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className={labelCls}>{isAr ? 'الموظف *' : 'Employee *'}</label>
              <select value={fEmpId} onChange={e => setFEmpId(e.target.value)} className={inputCls}>
                <option value="">{isAr ? 'اختر' : 'Select'}</option>
                {empList.map(e => <option key={e.id} value={e.id}>{isAr ? e.nameAr : (e.nameEn || e.nameAr)}</option>)}
              </select></div>
            <div><label className={labelCls}>{isAr ? 'التاريخ *' : 'Date *'}</label>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{isAr ? 'الحالة' : 'Status'}</label>
              <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={inputCls}>
                {Object.entries(ATT_STATUS_AR).map(([k, v]) => (
                  <option key={k} value={k}>{isAr ? v : ATT_STATUS_EN[k]}</option>
                ))}
              </select></div>
            <div><label className={labelCls}>{isAr ? 'وقت الدخول' : 'Check-in'}</label>
              <input type="time" value={fIn} onChange={e => setFIn(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{isAr ? 'وقت الخروج' : 'Check-out'}</label>
              <input type="time" value={fOut} onChange={e => setFOut(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{isAr ? 'ملاحظات' : 'Notes'}</label>
              <input value={fNotes} onChange={e => setFNotes(e.target.value)} className={inputCls} /></div>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !fEmpId}>
              {saving ? <Spinner size="sm" /> : <Check size={14} />}{isAr ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : records.length === 0 ? (
        <EmptyState icon={<UserCheck size={48} />}
          title={isAr ? 'لا توجد سجلات حضور' : 'No attendance records'}
          description={isAr ? 'سجّل حضور الموظفين لهذا الشهر' : 'Record employee attendance for this month'} />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">{isAr ? 'الموظف' : 'Employee'}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">{isAr ? 'دخول' : 'In'}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">{isAr ? 'خروج' : 'Out'}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">{isAr ? 'ساعات' : 'Hours'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(rec => (
                  <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-slate-900">{empName(rec.employeeId)}</td>
                    <td className="px-4 py-3.5 text-slate-600 tabular-nums">{rec.date}</td>
                    <td className="px-4 py-3.5 text-slate-600 tabular-nums hidden sm:table-cell">{fmtTime(rec.checkIn)}</td>
                    <td className="px-4 py-3.5 text-slate-600 tabular-nums hidden sm:table-cell">{fmtTime(rec.checkOut)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ATT_BADGE[rec.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {isAr ? (ATT_STATUS_AR[rec.status] ?? rec.status) : (ATT_STATUS_EN[rec.status] ?? rec.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-end text-slate-500 tabular-nums hidden md:table-cell">{fmtMins(rec.workMinutes ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
