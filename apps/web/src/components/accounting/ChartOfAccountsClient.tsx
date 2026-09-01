'use client';

import { Fragment, useState, useMemo, type FormEvent } from 'react';
import {
  useChartOfAccounts,
  type ChartAccountWithBalance,
  type AccountType,
  type NewAccountPayload,
} from '@/hooks/useChartOfAccounts';

type ChartAccount = ChartAccountWithBalance;
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  descendantIds,
  flattenAccountTree,
  rollupAccountAmounts,
  type CoaHierarchyAccount,
} from '@/lib/coa-hierarchy';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Check,
  BookOpen,
  AlertTriangle,
  Layers3,
} from 'lucide-react';

// ─── Labels & helpers ─────────────────────────────────────────────────────────

const ACCOUNT_TYPE_META: Record<
  AccountType,
  { ar: string; en: string; badgeClass: string }
> = {
  asset:     { ar: 'أصول',        en: 'Asset',     badgeClass: 'bg-brand-100 text-brand-700' },
  liability: { ar: 'التزامات',    en: 'Liability', badgeClass: 'bg-red-100 text-red-700' },
  equity:    { ar: 'حقوق ملكية',  en: 'Equity',    badgeClass: 'bg-purple-100 text-purple-700' },
  revenue:   { ar: 'إيرادات',     en: 'Revenue',   badgeClass: 'bg-emerald-100 text-emerald-700' },
  expense:   { ar: 'مصاريف',      en: 'Expense',   badgeClass: 'bg-amber-100 text-amber-700' },
};

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const SUBTYPE_OPTIONS: Record<AccountType, { value: string; ar: string; en: string }[]> = {
  asset: [
    { value: 'current_asset', ar: 'أصول متداولة', en: 'Current assets' },
    { value: 'non_current_asset', ar: 'أصول غير متداولة', en: 'Non-current assets' },
  ],
  liability: [
    { value: 'current_liability', ar: 'التزامات متداولة', en: 'Current liabilities' },
    { value: 'non_current_liability', ar: 'التزامات غير متداولة', en: 'Non-current liabilities' },
  ],
  equity: [{ value: 'equity', ar: 'حقوق الملكية', en: 'Equity' }],
  revenue: [
    { value: 'operating_revenue', ar: 'إيرادات تشغيلية', en: 'Operating revenue' },
    { value: 'other_revenue', ar: 'إيرادات أخرى', en: 'Other revenue' },
  ],
  expense: [
    { value: 'cost_of_sales', ar: 'تكلفة المبيعات / الخدمات', en: 'Cost of sales / services' },
    { value: 'operating_expense', ar: 'مصروفات تشغيلية', en: 'Operating expenses' },
    { value: 'other_expense', ar: 'مصروفات أخرى', en: 'Other expenses' },
  ],
};

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
  subType: string;
  parentId: string;
  allowDirectEntry: boolean;
  openingBalanceHalalas: number;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  nameAr: '',
  nameEn: '',
  type: 'asset',
  subType: 'current_asset',
  parentId: '',
  allowDirectEntry: true,
  openingBalanceHalalas: 0,
  isActive: true,
};

// ─── AccountForm (inline add / edit) ─────────────────────────────────────────

interface AccountFormProps {
  isAr: boolean;
  initial: FormState;
  accounts: ChartAccount[];
  excludeId?: string;
  codeLocked?: boolean;
  onSave: (data: FormState) => Promise<void>;
  onCancel: () => void;
}

function AccountForm({ isAr, initial, accounts, excludeId, codeLocked, onSave, onCancel }: AccountFormProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const parentOptions = useMemo(() => {
    const excluded = excludeId
      ? descendantIds(accounts as CoaHierarchyAccount[], excludeId)
      : new Set<string>();
    return accounts.filter(account =>
      account.id !== excludeId
      && !excluded.has(account.id)
      && account.type === form.type
      && !account.allowDirectEntry
      && account.isActive,
    );
  }, [accounts, excludeId, form.type]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.nameAr.trim()) {
      setErr(isAr ? 'الكود والاسم بالعربية مطلوبان' : 'Code and Arabic name are required');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await onSave(form);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Code */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'كود الحساب *' : 'Account Code *'}
          </label>
          <input
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="e.g. 1100"
            dir="ltr"
            disabled={codeLocked}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono disabled:bg-slate-100 disabled:text-slate-500"
          />
          {codeLocked && <p className="text-[11px] text-slate-400 mt-1">{isAr ? 'الكود محمي لأنه حساب نظامي' : 'Protected system-account code'}</p>}
        </div>

        {/* Name AR */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'الاسم بالعربية *' : 'Arabic Name *'}
          </label>
          <input
            value={form.nameAr}
            onChange={(e) => set('nameAr', e.target.value)}
            dir="rtl"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Name EN */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'الاسم بالإنجليزية' : 'English Name'}
          </label>
          <input
            value={form.nameEn}
            onChange={(e) => set('nameEn', e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'نوع الحساب *' : 'Account Type *'}
          </label>
          <select
            value={form.type}
            onChange={(e) => {
              const nextType = e.target.value as AccountType;
              setForm(previous => ({
                ...previous,
                type: nextType,
                parentId: '',
                subType: SUBTYPE_OPTIONS[nextType][0]?.value ?? '',
              }));
            }}
            disabled={codeLocked}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {isAr ? ACCOUNT_TYPE_META[t].ar : ACCOUNT_TYPE_META[t].en}
              </option>
            ))}
          </select>
        </div>

        {/* Subtype */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'تصنيف العرض' : 'Statement classification'}
          </label>
          <select
            value={form.subType}
            onChange={(e) => set('subType', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none"
          >
            <option value="">{isAr ? 'بدون تصنيف فرعي' : 'No sub-classification'}</option>
            {SUBTYPE_OPTIONS[form.type].map(option => (
              <option key={option.value} value={option.value}>
                {isAr ? option.ar : option.en}
              </option>
            ))}
          </select>
        </div>

        {/* Parent */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'الحساب الأب' : 'Parent account'}
          </label>
          <select
            value={form.parentId}
            onChange={(e) => set('parentId', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none"
          >
            <option value="">{isAr ? 'بدون أب — مستوى رئيسي' : 'No parent — top level'}</option>
            {parentOptions.map(parent => (
              <option key={parent.id} value={parent.id}>
                {parent.code} — {isAr ? parent.nameAr : (parent.nameEn || parent.nameAr)}
              </option>
            ))}
          </select>
        </div>

        {/* Posting / summary */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'طبيعة الحساب' : 'Account role'}
          </label>
          <select
            value={form.allowDirectEntry ? 'posting' : 'summary'}
            onChange={(event) => {
              const isPosting = event.target.value === 'posting';
              setForm(previous => ({
                ...previous,
                allowDirectEntry: isPosting,
                openingBalanceHalalas: isPosting ? previous.openingBalanceHalalas : 0,
              }));
            }}
            disabled={codeLocked}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none disabled:bg-slate-100"
          >
            <option value="posting">{isAr ? 'حساب ترحيل — يستقبل القيود' : 'Posting account — accepts entries'}</option>
            <option value="summary">{isAr ? 'حساب تجميعي — يحتوي حسابات' : 'Summary account — contains children'}</option>
          </select>
        </div>

        {/* Opening balance */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'الرصيد الافتتاحي (ريال)' : 'Opening Balance (SAR)'}
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={!form.allowDirectEntry}
            value={form.openingBalanceHalalas / 100}
            onChange={(e) =>
              set('openingBalanceHalalas', Math.round(parseFloat(e.target.value || '0') * 100))
            }
            dir="ltr"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono disabled:bg-slate-100 disabled:text-slate-400"
          />
          {!form.allowDirectEntry && (
            <p className="text-[11px] text-slate-400 mt-1">
              {isAr ? 'رصيد الحساب التجميعي يُحسب تلقائياً من فروعه' : 'A summary balance is calculated automatically from its children'}
            </p>
          )}
        </div>

        {/* Active status (edit only) */}
        {excludeId && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isAr ? 'حالة الحساب' : 'Account status'}
            </label>
            <select
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(event) => set('isActive', event.target.value === 'active')}
              disabled={codeLocked}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none disabled:bg-slate-100"
            >
              <option value="active">{isAr ? 'نشط — يمكن الاستخدام' : 'Active — available for use'}</option>
              <option value="inactive">{isAr ? 'غير نشط — يحتفظ بالسجل' : 'Inactive — history is retained'}</option>
            </select>
          </div>
        )}
      </div>

      {err && (
        <p className="mt-3 text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle size={12} />
          {err}
        </p>
      )}

      <div className="flex items-center gap-3 mt-4 justify-end">
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          <X size={14} />
          {isAr ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button size="sm" type="submit" loading={saving} disabled={saving}>
          <Check size={14} />
          {isAr ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

// ─── Delete confirmation ───────────────────────────────────────────────────────

interface DeleteConfirmProps {
  isAr: boolean;
  account: ChartAccount;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

function DeleteConfirm({ isAr, account, onConfirm, onCancel }: DeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-3 py-2 px-4 bg-red-50 rounded-lg border border-red-200">
      <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
      <p className="text-sm text-red-700 flex-1">
        {isAr
          ? `هل أنت متأكد من حذف الحساب "${account.nameAr}" (${account.code})؟`
          : `Delete account "${account.nameEn || account.nameAr}" (${account.code})?`}
      </p>
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>
        <X size={13} />
        {isAr ? 'إلغاء' : 'Cancel'}
      </Button>
      <Button variant="danger" size="sm" onClick={handleConfirm} loading={deleting}>
        <Trash2 size={13} />
        {isAr ? 'حذف' : 'Delete'}
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ChartOfAccountsClientProps {
  locale: string;
}

export function ChartOfAccountsClient({ locale }: ChartOfAccountsClientProps) {
  const isAr = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  const { accounts, loading, error, addAccount, updateAccount, deleteAccount } =
    useChartOfAccounts();

  // ── UI state ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Derived / filtered list ───────────────────────────────────────────────
  const rolledBalances = useMemo(() => new Map(
    rollupAccountAmounts(
      accounts as CoaHierarchyAccount[],
      new Map(accounts.map(account => [account.code, account.balanceHalalas])),
      'all',
    ).map(row => [row.id, row.amount]),
  ), [accounts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const ordered = flattenAccountTree(accounts as CoaHierarchyAccount[]) as ChartAccount[];
    return ordered.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.code.includes(q) ||
        a.nameAr.includes(q) ||
        (a.nameEn ?? '').toLowerCase().includes(q)
      );
    });
  }, [accounts, search, typeFilter]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleAdd(data: FormState) {
    const payload: NewAccountPayload = {
      code: data.code.trim(),
      nameAr: data.nameAr.trim(),
      nameEn: data.nameEn.trim(),
      type: data.type,
      subType: data.subType || null,
      parentId: data.parentId || null,
      allowDirectEntry: data.allowDirectEntry,
      openingBalanceHalalas: data.openingBalanceHalalas,
    };
    await addAccount(payload);
    setShowAddForm(false);
  }

  async function handleEdit(account: ChartAccount, data: FormState) {
    await updateAccount(account.id, {
      code: data.code.trim(),
      nameAr: data.nameAr.trim(),
      nameEn: data.nameEn.trim(),
      type: data.type,
      subType: data.subType || null,
      parentId: data.parentId || null,
      allowDirectEntry: data.allowDirectEntry,
      openingBalanceHalalas: data.openingBalanceHalalas,
      isActive: data.isActive,
    });
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await deleteAccount(id);
    setDeletingId(null);
  }

  function accountToForm(a: ChartAccount): FormState {
    return {
      code: a.code,
      nameAr: a.nameAr,
      nameEn: a.nameEn ?? '',
      type: a.type as AccountType,
      subType: a.subType ?? '',
      parentId: a.parentId ?? '',
      allowDirectEntry: a.allowDirectEntry,
      openingBalanceHalalas: a.openingBalanceHalalas,
      isActive: a.isActive,
    };
  }

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <div className="flex items-center gap-3 text-red-700">
          <AlertTriangle size={20} />
          <p className="text-sm font-medium">
            {isAr ? `خطأ: ${error}` : `Error: ${error}`}
          </p>
        </div>
      </Card>
    );
  }

  // ── Full render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-xs w-full">
          <Search
            size={15}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="search"
            aria-label={isAr ? 'البحث في شجرة الحسابات' : 'Search chart of accounts'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث بالكود أو الاسم...' : 'Search by code or name...'}
            className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Type filter + Add button */}
        <div className="flex items-center gap-3">
          <select
            aria-label={isAr ? 'تصفية حسابات الشجرة حسب النوع' : 'Filter accounts by type'}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AccountType | 'all')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none"
          >
            <option value="all">{isAr ? 'كل الأنواع' : 'All Types'}</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {isAr ? ACCOUNT_TYPE_META[t].ar : ACCOUNT_TYPE_META[t].en}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            onClick={() => {
              setShowAddForm((v) => !v);
              setEditingId(null);
              setDeletingId(null);
            }}
          >
            <Plus size={15} />
            {isAr ? 'حساب جديد' : 'New Account'}
          </Button>
        </div>
      </div>

      {/* ── Add form ──────────────────────────────────────────────────────── */}
      {showAddForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">
              {isAr ? 'إضافة حساب جديد' : 'Add New Account'}
            </h3>
            <button
              type="button"
              aria-label={isAr ? 'إغلاق نموذج الإضافة' : 'Close add account form'}
              onClick={() => setShowAddForm(false)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <AccountForm
            isAr={isAr}
            initial={EMPTY_FORM}
            accounts={accounts}
            onSave={handleAdd}
            onCancel={() => setShowAddForm(false)}
          />
        </Card>
      )}

      {/* ── Delete confirm bar ────────────────────────────────────────────── */}
      {deletingId && (() => {
        const account = accounts.find((a) => a.id === deletingId);
        if (!account) return null;
        return (
          <DeleteConfirm
            isAr={isAr}
            account={account}
            onConfirm={() => handleDelete(deletingId)}
            onCancel={() => setDeletingId(null)}
          />
        );
      })()}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {accounts.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title={isAr ? 'لا توجد حسابات' : 'No accounts yet'}
          description={
            isAr
              ? 'سيتم تحميل الحسابات الافتراضية تلقائياً عند أول اتصال'
              : 'Default accounts will be seeded automatically on first load'
          }
        />
      ) : (
        <Card padding="none">
          {/* Summary bar */}
          <div className="px-5 py-3 border-b border-surface-border bg-slate-50/60 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {isAr
                ? `${filtered.length} حساب${typeFilter !== 'all' || search ? ' (مُصفَّى)' : ''}`
                : `${filtered.length} account${filtered.length !== 1 ? 's' : ''}${typeFilter !== 'all' || search ? ' (filtered)' : ''}`}
            </p>
            <div className="flex items-center gap-2">
              {ACCOUNT_TYPES.map((t) => {
                const count = accounts.filter((a) => a.type === t).length;
                return (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                      typeFilter === t
                        ? ACCOUNT_TYPE_META[t].badgeClass
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                  >
                    {isAr ? ACCOUNT_TYPE_META[t].ar : ACCOUNT_TYPE_META[t].en} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-start ps-5 pe-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">
                    {isAr ? 'الكود' : 'Code'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'اسم الحساب' : 'Account Name'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {isAr ? 'النوع' : 'Type'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'الدور / المستوى' : 'Role / Level'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'الرصيد' : 'Balance'}
                  </th>
                  <th className="text-end pe-5 px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">
                    {isAr ? 'إجراءات' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                      {isAr ? 'لا توجد نتائج' : 'No results found'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((account) => {
                    const meta = ACCOUNT_TYPE_META[account.type as AccountType] ?? ACCOUNT_TYPE_META['asset'];
                    const isEditing = editingId === account.id;

                    return (
                      <Fragment key={account.id}>
                        <tr
                          className={cn(
                            'hover:bg-slate-50/60 transition-colors',
                            isEditing && 'bg-brand-50/30',
                            !account.isActive && 'opacity-60 bg-slate-50/70',
                            deletingId === account.id && 'opacity-40',
                          )}
                        >
                          {/* Code */}
                          <td className="ps-5 pe-3 py-3.5">
                            <div className="flex items-center gap-1.5" style={{ paddingInlineStart: `${Math.max(0, account.level - 1) * 14}px` }}>
                              {account.allowDirectEntry
                                ? <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                : <Layers3 size={13} className="text-brand-500" />}
                              <span className="font-mono text-sm font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                {account.code}
                              </span>
                            </div>
                          </td>

                          {/* Name */}
                          <td className="px-3 py-3.5">
                            <p className="text-sm font-medium text-slate-900">
                              {isAr ? account.nameAr : (account.nameEn || account.nameAr)}
                              {!account.isActive && (
                                <span className="ms-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {isAr ? 'غير نشط' : 'Inactive'}
                                </span>
                              )}
                            </p>
                            {isAr && account.nameEn && (
                              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                                {account.nameEn}
                              </p>
                            )}
                            {!isAr && account.nameAr && (
                              <p className="text-xs text-slate-400 mt-0.5" dir="rtl">
                                {account.nameAr}
                              </p>
                            )}
                          </td>

                          {/* Type */}
                          <td className="px-3 py-3.5 hidden md:table-cell">
                            <span
                              className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                                meta.badgeClass,
                              )}
                            >
                              {isAr ? meta.ar : meta.en}
                            </span>
                          </td>

                          {/* Role / level */}
                          <td className="px-3 py-3.5 hidden sm:table-cell">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={cn(
                                'text-xs font-medium px-2 py-0.5 rounded',
                                account.allowDirectEntry ? 'bg-sky-50 text-sky-700' : 'bg-brand-50 text-brand-700',
                              )}>
                                {account.allowDirectEntry
                                  ? (isAr ? 'ترحيل' : 'Posting')
                                  : (isAr ? 'تجميعي' : 'Summary')}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {isAr ? `مستوى ${account.level}` : `Level ${account.level}`}
                              </span>
                            </div>
                          </td>

                          {/* Balance */}
                          <td className="px-3 py-3.5 text-end">
                            <span className="text-sm font-mono tabular-nums text-slate-800 font-semibold">
                              {formatCurrency(rolledBalances.get(account.id) ?? account.balanceHalalas, fmtLocale)}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="pe-5 px-3 py-3.5 text-end">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={isAr ? `تعديل ${account.nameAr}` : `Edit ${account.nameEn || account.nameAr}`}
                                onClick={() => {
                                  setEditingId(isEditing ? null : account.id);
                                  setDeletingId(null);
                                  setShowAddForm(false);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                title={isAr ? 'تعديل' : 'Edit'}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                aria-label={isAr ? `حذف ${account.nameAr}` : `Delete ${account.nameEn || account.nameAr}`}
                                onClick={() => {
                                  setDeletingId(account.id);
                                  setEditingId(null);
                                  setShowAddForm(false);
                                }}
                                disabled={account.isSystem}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                                title={account.isSystem
                                  ? (isAr ? 'حساب نظامي محمي من الحذف' : 'System account is protected from deletion')
                                  : (isAr ? 'حذف' : 'Delete')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Inline edit row */}
                        {isEditing && (
                          <tr key={`edit-${account.id}`} className="bg-brand-50/20">
                            <td colSpan={6} className="px-5 py-4">
                              <AccountForm
                                isAr={isAr}
                                initial={accountToForm(account)}
                                accounts={accounts}
                                excludeId={account.id}
                                codeLocked={account.isSystem}
                                onSave={(data) => handleEdit(account, data)}
                                onCancel={() => setEditingId(null)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-surface-border bg-slate-50/40">
            <p className="text-xs text-slate-400">
              {isAr
                ? `إجمالي ${accounts.length} حساب — محدَّث في الوقت الفعلي`
                : `${accounts.length} total accounts — live updates`}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
