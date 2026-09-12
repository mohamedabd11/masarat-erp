'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { canRecordTerminationPayment } from '@/lib/employee-lifecycle-ui';
import { Banknote, FileText, Plus, UserMinus, WalletCards, X } from 'lucide-react';

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white';
const labelCls = 'block text-xs font-medium text-slate-700 mb-1';

interface EmployeeRow {
  id: string;
  nameAr: string;
  nameEn: string | null;
  employeeNumber: string;
  hireDate: string | null;
  isActive: boolean;
}

async function fetchEveryEmployee(): Promise<EmployeeRow[]> {
  const rows: EmployeeRow[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await apiFetch<{ employees: EmployeeRow[]; pagination: { totalPages: number } }>(`/api/employees?page=${page}&limit=200`);
    rows.push(...result.employees);
    totalPages = Math.max(1, result.pagination.totalPages);
    page += 1;
  } while (page <= totalPages);
  return rows;
}

function employeeName(employee: EmployeeRow | undefined, isAr: boolean): string {
  if (!employee) return '—';
  return isAr ? employee.nameAr : (employee.nameEn || employee.nameAr);
}

function ErrorBanner({ message }: { message: string }) {
  return message ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div> : null;
}

interface Contract {
  id: string;
  employeeId: string;
  contractNumber: string;
  type: string;
  startDate: string;
  endDate: string | null;
  baseSalaryHalalas: number;
  housingAllowanceHalalas: number;
  transportAllowanceHalalas: number;
  otherAllowancesHalalas: number;
  status: string;
}

export function ContractsTab({ isAr, agencyId }: { isAr: boolean; agencyId: string }) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState({ employeeId: '', contractNumber: '', type: 'full_time', startDate: '', endDate: '', base: '', housing: '', transport: '', other: '', workingDays: '5', workingHours: '8', annualLeave: '21' });

  useEffect(() => {
    if (!agencyId) return;
    setLoading(true);
    Promise.all([fetchEveryEmployee(), apiFetch<{ contracts: Contract[] }>('/api/employees/contracts')])
      .then(([employeeRows, contractRows]) => { setEmployees(employeeRows); setContracts(contractRows.contracts); setError(''); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [agencyId, tick]);

  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);

  async function save() {
    if (!form.employeeId || !form.startDate || !form.base) return;
    setSaving(true);
    try {
      await apiFetch('/api/employees/contracts', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: form.employeeId, contractNumber: form.contractNumber || undefined, type: form.type,
          startDate: form.startDate, endDate: form.endDate || undefined,
          baseSalaryHalalas: Math.round(Number(form.base) * 100),
          housingAllowanceHalalas: Math.round(Number(form.housing || 0) * 100),
          transportAllowanceHalalas: Math.round(Number(form.transport || 0) * 100),
          otherAllowancesHalalas: Math.round(Number(form.other || 0) * 100),
          workingDaysPerWeek: Number(form.workingDays), workingHoursPerDay: Number(form.workingHours),
          annualLeaveDays: Number(form.annualLeave),
        }),
      });
      setShowForm(false);
      setForm({ employeeId: '', contractNumber: '', type: 'full_time', startDate: '', endDate: '', base: '', housing: '', transport: '', other: '', workingDays: '5', workingHours: '8', annualLeave: '21' });
      setTick(value => value + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function closeContract(contract: Contract) {
    const endDate = window.prompt(isAr ? 'أدخل تاريخ نهاية العقد بصيغة YYYY-MM-DD' : 'Enter contract end date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!endDate) return;
    try {
      await apiFetch(`/api/employees/contracts/${contract.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'expired', endDate }),
      });
      setTick(value => value + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  return <div className="space-y-5">
    <ErrorBanner message={error} />
    <div className="flex justify-end"><Button size="sm" onClick={() => setShowForm(true)}><Plus size={15} />{isAr ? 'عقد جديد' : 'New contract'}</Button></div>
    {showForm ? <Card>
      <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">{isAr ? 'إضافة عقد موظف' : 'Add employee contract'}</h2><button aria-label={isAr ? 'إغلاق' : 'Close'} onClick={() => setShowForm(false)}><X size={18} /></button></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div><label className={labelCls}>{isAr ? 'الموظف *' : 'Employee *'}</label><select className={inputCls} value={form.employeeId} onChange={event => setForm(current => ({ ...current, employeeId: event.target.value }))}><option value="">—</option>{employees.filter(employee => employee.isActive).map(employee => <option key={employee.id} value={employee.id}>{employeeName(employee, isAr)}</option>)}</select></div>
        <div><label className={labelCls}>{isAr ? 'رقم العقد' : 'Contract number'}</label><input className={inputCls} value={form.contractNumber} onChange={event => setForm(current => ({ ...current, contractNumber: event.target.value }))} /></div>
        <div><label className={labelCls}>{isAr ? 'النوع' : 'Type'}</label><select className={inputCls} value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}><option value="full_time">{isAr ? 'دوام كامل' : 'Full time'}</option><option value="part_time">{isAr ? 'دوام جزئي' : 'Part time'}</option><option value="contract">{isAr ? 'محدد المدة' : 'Contract'}</option><option value="intern">{isAr ? 'تدريب' : 'Intern'}</option></select></div>
        <div><label className={labelCls}>{isAr ? 'تاريخ البداية *' : 'Start date *'}</label><input type="date" className={inputCls} value={form.startDate} onChange={event => setForm(current => ({ ...current, startDate: event.target.value }))} /></div>
        <div><label className={labelCls}>{isAr ? 'تاريخ النهاية' : 'End date'}</label><input type="date" className={inputCls} value={form.endDate} onChange={event => setForm(current => ({ ...current, endDate: event.target.value }))} /></div>
        <div><label className={labelCls}>{isAr ? 'الراتب الأساسي (ر.س.) *' : 'Base salary (SAR) *'}</label><input type="number" min="0" className={inputCls} value={form.base} onChange={event => setForm(current => ({ ...current, base: event.target.value }))} /></div>
        <div><label className={labelCls}>{isAr ? 'بدل السكن' : 'Housing allowance'}</label><input type="number" min="0" className={inputCls} value={form.housing} onChange={event => setForm(current => ({ ...current, housing: event.target.value }))} /></div>
        <div><label className={labelCls}>{isAr ? 'بدل النقل' : 'Transport allowance'}</label><input type="number" min="0" className={inputCls} value={form.transport} onChange={event => setForm(current => ({ ...current, transport: event.target.value }))} /></div>
        <div><label className={labelCls}>{isAr ? 'بدلات أخرى' : 'Other allowances'}</label><input type="number" min="0" className={inputCls} value={form.other} onChange={event => setForm(current => ({ ...current, other: event.target.value }))} /></div>
        <div><label className={labelCls}>{isAr ? 'أيام العمل أسبوعيًا' : 'Days per week'}</label><input type="number" min="1" max="7" className={inputCls} value={form.workingDays} onChange={event => setForm(current => ({ ...current, workingDays: event.target.value }))} /></div>
        <div><label className={labelCls}>{isAr ? 'ساعات العمل يوميًا' : 'Hours per day'}</label><input type="number" min="1" max="24" className={inputCls} value={form.workingHours} onChange={event => setForm(current => ({ ...current, workingHours: event.target.value }))} /></div>
        <div><label className={labelCls}>{isAr ? 'رصيد الإجازة السنوي' : 'Annual leave days'}</label><input type="number" min="0" className={inputCls} value={form.annualLeave} onChange={event => setForm(current => ({ ...current, annualLeave: event.target.value }))} /></div>
      </div>
      <div className="flex justify-end mt-4"><Button size="sm" onClick={save} disabled={saving || !form.employeeId || !form.startDate || !form.base}>{saving ? <Spinner size="sm" /> : <FileText size={15} />}{isAr ? 'حفظ العقد' : 'Save contract'}</Button></div>
    </Card> : null}
    {contracts.length === 0 ? <EmptyState icon={<FileText size={48} />} title={isAr ? 'لا توجد عقود' : 'No contracts'} description={isAr ? 'أضف أول عقد موظف' : 'Add the first employee contract'} /> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{contracts.map(contract => <Card key={contract.id}>
      <div className="flex justify-between gap-3"><div><p className="font-semibold text-slate-900">{employeeName(employeeById.get(contract.employeeId), isAr)}</p><p className="text-xs text-slate-500 mt-1">{contract.contractNumber} · {contract.startDate} — {contract.endDate || (isAr ? 'مفتوح' : 'Open')}</p></div><Badge variant={contract.status === 'active' ? 'success' : 'neutral'}>{contract.status}</Badge></div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><span className="text-slate-500">{isAr ? 'الراتب الأساسي' : 'Base salary'}</span><span className="font-medium text-end">{formatCurrency(contract.baseSalaryHalalas, isAr ? 'ar-SA' : 'en-US')}</span><span className="text-slate-500">{isAr ? 'إجمالي البدلات' : 'Allowances'}</span><span className="font-medium text-end">{formatCurrency(contract.housingAllowanceHalalas + contract.transportAllowanceHalalas + contract.otherAllowancesHalalas, isAr ? 'ar-SA' : 'en-US')}</span></div>
      {contract.status === 'active' ? <div className="flex justify-end mt-3"><Button size="sm" variant="ghost" onClick={() => closeContract(contract)}>{isAr ? 'إغلاق العقد' : 'Close contract'}</Button></div> : null}
    </Card>)}</div>}
  </div>;
}

interface AdvanceInstallment { id: string; installmentNumber: number; dueMonth: string; amountHalalas: number; status: string; deferralCount: number }
interface SalaryAdvance { id: string; employeeId: string; amountHalalas: number; remainingHalalas: number; installmentCount: number; status: string; requestDate: string; reason: string | null; installments: AdvanceInstallment[] }

export function AdvancesTab({ isAr, agencyId }: { isAr: boolean; agencyId: string }) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState({ employeeId: '', amount: '', deductFrom: '', installmentCount: '', paymentMethod: 'cash', reason: '' });

  useEffect(() => {
    if (!agencyId) return;
    setLoading(true);
    Promise.all([fetchEveryEmployee(), apiFetch<{ advances: SalaryAdvance[] }>('/api/employees/advances')])
      .then(([employeeRows, advanceRows]) => { setEmployees(employeeRows); setAdvances(advanceRows.advances); setError(''); })
      .catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [agencyId, tick]);
  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/api/employees/advances', { method: 'POST', body: JSON.stringify({
        employeeId: form.employeeId, amountHalalas: Math.round(Number(form.amount) * 100), deductFrom: form.deductFrom,
        installmentCount: form.installmentCount ? Number(form.installmentCount) : undefined,
        paymentMethod: form.paymentMethod, reason: form.reason,
      }) });
      setShowForm(false); setForm({ employeeId: '', amount: '', deductFrom: '', installmentCount: '', paymentMethod: 'cash', reason: '' }); setTick(value => value + 1);
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }
  async function defer(advanceId: string, installment: AdvanceInstallment) {
    const month = window.prompt(isAr ? 'أدخل شهر الاستحقاق الجديد بصيغة YYYY-MM' : 'Enter the new due month (YYYY-MM)', installment.dueMonth);
    if (!month) return;
    try { await apiFetch(`/api/employees/advances/${advanceId}`, { method: 'PATCH', body: JSON.stringify({ action: 'defer', installmentId: installment.id, dueMonth: month }) }); setTick(value => value + 1); } catch (err) { setError((err as Error).message); }
  }
  async function repay(advance: SalaryAdvance) {
    if (!window.confirm(isAr ? 'تسجيل سداد مبكر لكامل الرصيد المتبقي؟' : 'Record early repayment of the full remaining balance?')) return;
    try { await apiFetch(`/api/employees/advances/${advance.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'repay', paymentMethod: 'cash' }) }); setTick(value => value + 1); } catch (err) { setError((err as Error).message); }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  return <div className="space-y-5"><ErrorBanner message={error} />
    <div className="flex justify-end"><Button size="sm" onClick={() => setShowForm(true)}><Plus size={15} />{isAr ? 'سلفة جديدة' : 'New advance'}</Button></div>
    {showForm ? <Card><div className="flex items-center justify-between mb-4"><h2 className="font-semibold">{isAr ? 'صرف سلفة وجدولة الخصم' : 'Issue and schedule advance'}</h2><button aria-label={isAr ? 'إغلاق' : 'Close'} onClick={() => setShowForm(false)}><X size={18} /></button></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div><label className={labelCls}>{isAr ? 'الموظف *' : 'Employee *'}</label><select className={inputCls} value={form.employeeId} onChange={event => setForm(current => ({ ...current, employeeId: event.target.value }))}><option value="">—</option>{employees.filter(employee => employee.isActive).map(employee => <option key={employee.id} value={employee.id}>{employeeName(employee, isAr)}</option>)}</select></div>
      <div><label className={labelCls}>{isAr ? 'المبلغ (ر.س.) *' : 'Amount (SAR) *'}</label><input type="number" min="0" className={inputCls} value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></div>
      <div><label className={labelCls}>{isAr ? 'بدء الخصم *' : 'First deduction *'}</label><input type="month" className={inputCls} value={form.deductFrom} onChange={event => setForm(current => ({ ...current, deductFrom: event.target.value }))} /></div>
      <div><label className={labelCls}>{isAr ? 'عدد الأقساط (اتركه فارغًا للحساب الآلي)' : 'Installments (blank for automatic)'}</label><input type="number" min="1" max="120" className={inputCls} value={form.installmentCount} onChange={event => setForm(current => ({ ...current, installmentCount: event.target.value }))} /></div>
      <div><label className={labelCls}>{isAr ? 'طريقة الصرف' : 'Payment method'}</label><select className={inputCls} value={form.paymentMethod} onChange={event => setForm(current => ({ ...current, paymentMethod: event.target.value }))}><option value="cash">{isAr ? 'نقدي' : 'Cash'}</option><option value="bank_transfer">{isAr ? 'تحويل بنكي' : 'Bank transfer'}</option></select></div>
      <div><label className={labelCls}>{isAr ? 'السبب' : 'Reason'}</label><input className={inputCls} value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} /></div>
    </div><p className="mt-3 text-xs text-slate-500">{isAr ? 'يتحقق النظام تلقائيًا من ألا يتجاوز مجموع أقساط السلف 10% من أجر الموظف في الشهر.' : 'The system automatically keeps total monthly advance deductions within 10% of wage.'}</p><div className="flex justify-end mt-4"><Button size="sm" onClick={save} disabled={saving || !form.employeeId || !form.amount || !form.deductFrom}>{saving ? <Spinner size="sm" /> : <WalletCards size={15} />}{isAr ? 'صرف وجدولة' : 'Issue & schedule'}</Button></div></Card> : null}
    {advances.length === 0 ? <EmptyState icon={<WalletCards size={48} />} title={isAr ? 'لا توجد سلف' : 'No advances'} description={isAr ? 'يمكن صرف السلفة وجدولة أقساطها من هنا' : 'Issue and schedule an advance here'} /> : <div className="space-y-4">{advances.map(advance => <Card key={advance.id}>
      <div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{employeeName(employeeById.get(advance.employeeId), isAr)}</p><p className="text-xs text-slate-500">{advance.requestDate} · {advance.installmentCount} {isAr ? 'قسط' : 'installments'}</p></div><div className="text-end"><p className="font-bold">{formatCurrency(advance.amountHalalas, isAr ? 'ar-SA' : 'en-US')}</p><p className="text-xs text-slate-500">{isAr ? 'متبقي' : 'Remaining'}: {formatCurrency(advance.remainingHalalas, isAr ? 'ar-SA' : 'en-US')}</p></div></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-500 border-b"><th className="text-start py-2">#</th><th className="text-start">{isAr ? 'الشهر' : 'Month'}</th><th className="text-start">{isAr ? 'المبلغ' : 'Amount'}</th><th className="text-start">{isAr ? 'الحالة' : 'Status'}</th><th /></tr></thead><tbody>{advance.installments.map(installment => <tr key={installment.id} className="border-b last:border-0"><td className="py-2">{installment.installmentNumber}</td><td>{installment.dueMonth}</td><td>{formatCurrency(installment.amountHalalas, isAr ? 'ar-SA' : 'en-US')}</td><td>{installment.status}</td><td className="text-end">{installment.status === 'pending' ? <button onClick={() => defer(advance.id, installment)} className="text-xs text-brand-600">{isAr ? 'تأجيل' : 'Defer'}</button> : null}</td></tr>)}</tbody></table></div>
      {advance.remainingHalalas > 0 ? <div className="flex justify-end mt-3"><Button size="sm" variant="ghost" onClick={() => repay(advance)}>{isAr ? 'سداد مبكر' : 'Early repayment'}</Button></div> : null}
    </Card>)}</div>}
  </div>;
}

interface EosbEmployee extends EmployeeRow { lastWageHalalas: number; eosbAmount: number; monthlyAccrual: number }
interface Termination { id: string; employeeId: string; terminationDate: string; terminationType: string; reason: string | null; status: string; baseBenefitHalalas: number; entitlementRateBps: number; settlementHalalas: number }

export function EndOfServiceTab({ isAr, agencyId }: { isAr: boolean; agencyId: string }) {
  const [employees, setEmployees] = useState<EosbEmployee[]>([]);
  const [terminations, setTerminations] = useState<Termination[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({ employeeId: '', terminationDate: '', terminationType: 'contract_end', reason: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!agencyId) return;
    setLoading(true);
    Promise.all([
      apiFetch<{ employees: EosbEmployee[] }>('/api/employees/eosb'),
      apiFetch<{ terminations: Termination[] }>('/api/employees/terminations'),
    ]).then(([eosb, terminationRows]) => { setEmployees(eosb.employees); setTerminations(terminationRows.terminations); setError(''); })
      .catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [agencyId, tick]);
  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);
  async function accrue() {
    setSaving(true); try { await apiFetch('/api/employees/eosb', { method: 'POST', body: JSON.stringify({ action: 'accrue', month }) }); setTick(value => value + 1); } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }
  async function createTermination() {
    setSaving(true); try { await apiFetch('/api/employees/terminations', { method: 'POST', body: JSON.stringify(form) }); setShowForm(false); setForm({ employeeId: '', terminationDate: '', terminationType: 'contract_end', reason: '' }); setTick(value => value + 1); } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }
  async function act(id: string, action: 'approve' | 'pay' | 'cancel', paymentDate?: string) {
    if (!window.confirm(isAr ? 'تأكيد تنفيذ هذا الإجراء؟' : 'Confirm this action?')) return;
    try { await apiFetch(`/api/employees/terminations/${id}`, { method: 'PATCH', body: JSON.stringify({ action, paymentMethod: 'bank_transfer', ...(paymentDate ? { paymentDate } : {}) }) }); setTick(value => value + 1); } catch (err) { setError((err as Error).message); }
  }
  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  return <div className="space-y-5"><ErrorBanner message={error} />
    <Card><div className="flex flex-col sm:flex-row sm:items-end gap-3"><div className="flex-1"><label className={labelCls}>{isAr ? 'شهر احتساب المخصص' : 'Provision month'}</label><input type="month" className={inputCls} value={month} onChange={event => setMonth(event.target.value)} /></div><Button size="sm" onClick={accrue} disabled={saving}>{saving ? <Spinner size="sm" /> : <Banknote size={15} />}{isAr ? 'احتساب وتسوية المخصص' : 'Accrue provision'}</Button><Button size="sm" variant="ghost" onClick={() => setShowForm(true)}><UserMinus size={15} />{isAr ? 'إنهاء خدمة' : 'Terminate employee'}</Button></div><p className="mt-3 text-xs text-slate-500">{isAr ? 'هذا تقدير نظامي داخل النظام، ولا يحل محل التقييم الاكتواري عند انطباقه.' : 'This is a statutory ERP estimate and does not replace an actuarial valuation where required.'}</p></Card>
    {showForm ? <Card><div className="flex items-center justify-between mb-4"><h2 className="font-semibold">{isAr ? 'مسودة تسوية نهاية الخدمة' : 'Termination settlement draft'}</h2><button aria-label={isAr ? 'إغلاق' : 'Close'} onClick={() => setShowForm(false)}><X size={18} /></button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><label className={labelCls}>{isAr ? 'الموظف *' : 'Employee *'}</label><select className={inputCls} value={form.employeeId} onChange={event => setForm(current => ({ ...current, employeeId: event.target.value }))}><option value="">—</option>{employees.filter(employee => employee.isActive).map(employee => <option key={employee.id} value={employee.id}>{employeeName(employee, isAr)}</option>)}</select></div>
      <div><label className={labelCls}>{isAr ? 'تاريخ نهاية الخدمة *' : 'Termination date *'}</label><input type="date" className={inputCls} value={form.terminationDate} onChange={event => setForm(current => ({ ...current, terminationDate: event.target.value }))} /></div>
      <div><label className={labelCls}>{isAr ? 'النوع *' : 'Type *'}</label><select className={inputCls} value={form.terminationType} onChange={event => setForm(current => ({ ...current, terminationType: event.target.value }))}><option value="contract_end">{isAr ? 'انتهاء العقد' : 'Contract end'}</option><option value="employer">{isAr ? 'إنهاء من صاحب العمل' : 'Employer termination'}</option><option value="resignation">{isAr ? 'استقالة' : 'Resignation'}</option><option value="article_80">{isAr ? 'المادة 80' : 'Article 80'}</option><option value="article_87">{isAr ? 'حالة مشمولة بالمادة 87' : 'Article 87 case'}</option><option value="force_majeure">{isAr ? 'قوة قاهرة' : 'Force majeure'}</option><option value="other">{isAr ? 'أخرى' : 'Other'}</option></select></div>
      <div><label className={labelCls}>{isAr ? 'السبب والتوثيق' : 'Reason and documentation'}</label><input className={inputCls} value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} /></div>
    </div><div className="flex justify-end mt-4"><Button size="sm" onClick={createTermination} disabled={saving || !form.employeeId || !form.terminationDate}>{saving ? <Spinner size="sm" /> : <UserMinus size={15} />}{isAr ? 'إنشاء المسودة' : 'Create draft'}</Button></div></Card> : null}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{employees.filter(employee => employee.isActive).map(employee => <Card key={employee.id}><p className="font-semibold">{employeeName(employee, isAr)}</p><div className="grid grid-cols-2 text-sm gap-2 mt-3"><span className="text-slate-500">{isAr ? 'آخر أجر' : 'Last wage'}</span><span className="text-end">{formatCurrency(employee.lastWageHalalas, isAr ? 'ar-SA' : 'en-US')}</span><span className="text-slate-500">{isAr ? 'الاستحقاق التقديري' : 'Estimated benefit'}</span><span className="text-end font-medium">{formatCurrency(employee.eosbAmount, isAr ? 'ar-SA' : 'en-US')}</span></div></Card>)}</div>
    <h2 className="font-semibold text-slate-900">{isAr ? 'تسويات نهاية الخدمة' : 'Termination settlements'}</h2>
    {terminations.length === 0 ? <p className="text-sm text-slate-500">{isAr ? 'لا توجد تسويات.' : 'No settlements.'}</p> : <div className="space-y-3">{terminations.map(termination => {
      const paymentDate = paymentDates[termination.id] ?? '';
      return <Card key={termination.id}><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{employeeName(employeeById.get(termination.employeeId), isAr)}</p><p className="text-xs text-slate-500">{termination.terminationDate} · {termination.terminationType}</p></div><div className="text-end"><Badge variant={termination.status === 'paid' ? 'success' : 'neutral'}>{termination.status}</Badge><p className="mt-1 font-bold">{formatCurrency(termination.settlementHalalas, isAr ? 'ar-SA' : 'en-US')}</p></div></div><div className="flex flex-wrap items-end justify-end gap-2 mt-3">{termination.status === 'draft' ? <><Button size="sm" onClick={() => act(termination.id, 'approve')}>{isAr ? 'اعتماد' : 'Approve'}</Button><Button size="sm" variant="ghost" onClick={() => act(termination.id, 'cancel')}>{isAr ? 'إلغاء' : 'Cancel'}</Button></> : null}{termination.status === 'approved' ? <><div><label className={labelCls}>{isAr ? 'تاريخ الدفع *' : 'Payment date *'}</label><input aria-label={isAr ? 'تاريخ دفع نهاية الخدمة' : 'Termination payment date'} type="date" min={termination.terminationDate} className={inputCls} value={paymentDate} onChange={event => setPaymentDates(current => ({ ...current, [termination.id]: event.target.value }))} /></div><Button size="sm" disabled={!canRecordTerminationPayment(paymentDate, termination.terminationDate)} onClick={() => act(termination.id, 'pay', paymentDate)}>{isAr ? 'تسجيل الدفع' : 'Record payment'}</Button></> : null}</div></Card>;
    })}</div>}
  </div>;
}
