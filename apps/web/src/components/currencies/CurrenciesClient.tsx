'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import {
  DollarSign,
  Pencil,
  Check,
  X,
  RefreshCw,
  ArrowLeftRight,
  Copy,
  CheckCheck,
  Plus,
  TrendingUp,
  Globe2,
  Clock,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExchangeRate {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  symbol: string;
  rateToSAR: number;
  buyRate: number;
  sellRate: number;
  isActive: boolean;
  updatedAt: number;
  agencyId: string;
}

// API response type from /api/banking
interface ApiExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number; // integer = rate × 10000
  effectiveDate: string;
  createdAt: string;
}

// ─── Default currencies ────────────────────────────────────────────────────────

const DEFAULT_CURRENCIES: Omit<ExchangeRate, 'id' | 'agencyId' | 'updatedAt'>[] = [
  { code: 'USD', nameAr: 'دولار أمريكي',    nameEn: 'US Dollar',         symbol: '$',    rateToSAR: 3.75,  buyRate: 3.72,  sellRate: 3.78,  isActive: true },
  { code: 'EUR', nameAr: 'يورو',            nameEn: 'Euro',              symbol: '€',    rateToSAR: 4.08,  buyRate: 4.04,  sellRate: 4.12,  isActive: true },
  { code: 'GBP', nameAr: 'جنيه إسترليني',  nameEn: 'British Pound',     symbol: '£',    rateToSAR: 4.73,  buyRate: 4.68,  sellRate: 4.78,  isActive: true },
  { code: 'AED', nameAr: 'درهم إماراتي',   nameEn: 'UAE Dirham',        symbol: 'د.إ',  rateToSAR: 1.02,  buyRate: 1.01,  sellRate: 1.03,  isActive: true },
  { code: 'KWD', nameAr: 'دينار كويتي',    nameEn: 'Kuwaiti Dinar',     symbol: 'د.ك',  rateToSAR: 12.21, buyRate: 12.10, sellRate: 12.32, isActive: true },
  { code: 'BHD', nameAr: 'دينار بحريني',   nameEn: 'Bahraini Dinar',    symbol: '.د.ب', rateToSAR: 9.95,  buyRate: 9.85,  sellRate: 10.05, isActive: true },
  { code: 'OMR', nameAr: 'ريال عُماني',    nameEn: 'Omani Rial',        symbol: 'ر.ع.', rateToSAR: 9.74,  buyRate: 9.64,  sellRate: 9.84,  isActive: true },
  { code: 'QAR', nameAr: 'ريال قطري',      nameEn: 'Qatari Riyal',      symbol: 'ر.ق',  rateToSAR: 1.03,  buyRate: 1.02,  sellRate: 1.04,  isActive: true },
  { code: 'JOD', nameAr: 'دينار أردني',    nameEn: 'Jordanian Dinar',   symbol: 'د.أ',  rateToSAR: 5.29,  buyRate: 5.23,  sellRate: 5.35,  isActive: true },
  { code: 'EGP', nameAr: 'جنيه مصري',      nameEn: 'Egyptian Pound',    symbol: 'ج.م',  rateToSAR: 0.075, buyRate: 0.073, sellRate: 0.077, isActive: true },
  { code: 'TRY', nameAr: 'ليرة تركية',     nameEn: 'Turkish Lira',      symbol: '₺',    rateToSAR: 0.11,  buyRate: 0.109, sellRate: 0.111, isActive: true },
  { code: 'INR', nameAr: 'روبية هندية',    nameEn: 'Indian Rupee',      symbol: '₹',    rateToSAR: 0.045, buyRate: 0.044, sellRate: 0.046, isActive: true },
];

// Map currency code to display metadata from DEFAULT_CURRENCIES
const CURRENCY_META: Record<string, Omit<ExchangeRate, 'id' | 'agencyId' | 'updatedAt' | 'rateToSAR' | 'buyRate' | 'sellRate' | 'isActive'>> = {};
DEFAULT_CURRENCIES.forEach(c => {
  CURRENCY_META[c.code] = { code: c.code, nameAr: c.nameAr, nameEn: c.nameEn, symbol: c.symbol };
});

function mapApiRate(r: ApiExchangeRate): ExchangeRate {
  const rateFloat = r.rate / 10000;
  const meta = CURRENCY_META[r.fromCurrency] ?? {
    code: r.fromCurrency,
    nameAr: r.fromCurrency,
    nameEn: r.fromCurrency,
    symbol: r.fromCurrency,
  };
  return {
    id: r.id,
    agencyId: '',
    code: r.fromCurrency,
    nameAr: meta.nameAr,
    nameEn: meta.nameEn,
    symbol: meta.symbol,
    rateToSAR: rateFloat,
    buyRate: rateFloat,
    sellRate: rateFloat,
    isActive: true,
    updatedAt: new Date(r.createdAt).getTime(),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: number, isAr: boolean): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (isAr) {
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${days} يوم`;
  } else {
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
}

function fmtRate(n: number): string {
  if (n >= 10) return n.toFixed(4);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

// ─── Add Currency Form ─────────────────────────────────────────────────────────

interface AddCurrencyFormProps {
  isAr: boolean;
  onAdd: (data: Omit<ExchangeRate, 'id' | 'agencyId' | 'updatedAt'>) => Promise<void>;
  onCancel: () => void;
  existingCodes: string[];
}

function AddCurrencyForm({ isAr, onAdd, onCancel, existingCodes }: AddCurrencyFormProps) {
  const [form, setForm] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    symbol: '',
    rateToSAR: '',
    buyRate: '',
    sellRate: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!code || !form.nameAr.trim() || !form.nameEn.trim() || !form.symbol.trim()) {
      setErr(isAr ? 'جميع الحقول مطلوبة' : 'All fields are required');
      return;
    }
    if (existingCodes.includes(code)) {
      setErr(isAr ? 'هذه العملة موجودة بالفعل' : 'Currency already exists');
      return;
    }
    const rate = parseFloat(form.rateToSAR);
    const buy = parseFloat(form.buyRate);
    const sell = parseFloat(form.sellRate);
    if (isNaN(rate) || rate <= 0 || isNaN(buy) || buy <= 0 || isNaN(sell) || sell <= 0) {
      setErr(isAr ? 'الأسعار يجب أن تكون أرقاماً موجبة' : 'Rates must be positive numbers');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await onAdd({
        code,
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim(),
        symbol: form.symbol.trim(),
        rateToSAR: rate,
        buyRate: buy,
        sellRate: sell,
        isActive: true,
      });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'block w-full rounded-lg border border-slate-300 bg-white text-slate-900 text-sm ' +
    'px-3.5 py-2.5 placeholder:text-slate-400 ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ' +
    'transition-colors duration-150';

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'كود العملة *' : 'Currency Code *'}
          </label>
          <input
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="e.g. USD"
            maxLength={5}
            className={cn(inputCls, 'uppercase font-mono')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'الرمز *' : 'Symbol *'}
          </label>
          <input
            value={form.symbol}
            onChange={(e) => set('symbol', e.target.value)}
            placeholder="$"
            maxLength={6}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'الاسم بالعربية *' : 'Name (Arabic) *'}
          </label>
          <input
            value={form.nameAr}
            onChange={(e) => set('nameAr', e.target.value)}
            placeholder="دولار أمريكي"
            dir="rtl"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'الاسم بالإنجليزية *' : 'Name (English) *'}
          </label>
          <input
            value={form.nameEn}
            onChange={(e) => set('nameEn', e.target.value)}
            placeholder="US Dollar"
            dir="ltr"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'سعر مقابل الريال *' : 'Rate to SAR *'}
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={form.rateToSAR}
            onChange={(e) => set('rateToSAR', e.target.value)}
            placeholder="3.75"
            className={cn(inputCls, 'font-mono')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'سعر الشراء *' : 'Buy Rate *'}
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={form.buyRate}
            onChange={(e) => set('buyRate', e.target.value)}
            placeholder="3.72"
            className={cn(inputCls, 'font-mono')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isAr ? 'سعر البيع *' : 'Sell Rate *'}
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={form.sellRate}
            onChange={(e) => set('sellRate', e.target.value)}
            placeholder="3.78"
            className={cn(inputCls, 'font-mono')}
          />
        </div>
      </div>

      {err && (
        <p className="text-xs text-red-600 mb-3 flex items-center gap-1.5">
          <AlertCircle size={13} />
          {err}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" loading={saving}>
          <Check size={14} />
          {isAr ? 'إضافة العملة' : 'Add Currency'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X size={14} />
          {isAr ? 'إلغاء' : 'Cancel'}
        </Button>
      </div>
    </form>
  );
}

// ─── Inline Edit Row ───────────────────────────────────────────────────────────

interface EditableRateRowProps {
  rate: ExchangeRate;
  isAr: boolean;
  onSave: (id: string, data: { rateToSAR: number; buyRate: number; sellRate: number }) => Promise<void>;
  onToggle: (id: string, current: boolean) => Promise<void>;
}

function EditableRateRow({ rate, isAr, onSave, onToggle }: EditableRateRowProps) {
  const [editing, setEditing] = useState(false);
  const [rateVal, setRateVal] = useState(String(rate.rateToSAR));
  const [buyVal, setBuyVal] = useState(String(rate.buyRate));
  const [sellVal, setSellVal] = useState(String(rate.sellRate));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  function startEdit() {
    setRateVal(String(rate.rateToSAR));
    setBuyVal(String(rate.buyRate));
    setSellVal(String(rate.sellRate));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function confirmEdit() {
    const r = parseFloat(rateVal);
    const b = parseFloat(buyVal);
    const s = parseFloat(sellVal);
    if (isNaN(r) || r <= 0 || isNaN(b) || b <= 0 || isNaN(s) || s <= 0) return;
    setSaving(true);
    try {
      await onSave(rate.id, { rateToSAR: r, buyRate: b, sellRate: s });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(rate.id, rate.isActive);
    } finally {
      setToggling(false);
    }
  }

  const cellInput =
    'w-24 rounded border border-brand-300 bg-brand-50 text-sm font-mono text-slate-900 ' +
    'px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 tabular-nums';

  return (
    <tr
      className={cn(
        'transition-colors',
        editing ? 'bg-brand-50/30' : 'hover:bg-slate-50/60',
        !rate.isActive && 'opacity-50',
      )}
    >
      {/* Code + Symbol */}
      <td className="ps-5 pe-3 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-50 text-brand-700 font-bold text-xs flex-shrink-0">
            {rate.symbol}
          </span>
          <div>
            <p className="font-mono font-semibold text-sm text-slate-900">{rate.code}</p>
            <p className="text-xs text-slate-400">{isAr ? rate.nameAr : rate.nameEn}</p>
          </div>
        </div>
      </td>

      {/* Rate to SAR */}
      <td className="px-3 py-3.5">
        {editing ? (
          <input
            type="number"
            step="any"
            min="0"
            value={rateVal}
            onChange={(e) => setRateVal(e.target.value)}
            className={cellInput}
            autoFocus
          />
        ) : (
          <span className="font-mono tabular-nums text-sm font-semibold text-slate-800">
            {fmtRate(rate.rateToSAR)}
          </span>
        )}
      </td>

      {/* Buy rate */}
      <td className="px-3 py-3.5 hidden sm:table-cell">
        {editing ? (
          <input
            type="number"
            step="any"
            min="0"
            value={buyVal}
            onChange={(e) => setBuyVal(e.target.value)}
            className={cellInput}
          />
        ) : (
          <span className="font-mono tabular-nums text-sm text-emerald-700">
            {fmtRate(rate.buyRate)}
          </span>
        )}
      </td>

      {/* Sell rate */}
      <td className="px-3 py-3.5 hidden sm:table-cell">
        {editing ? (
          <input
            type="number"
            step="any"
            min="0"
            value={sellVal}
            onChange={(e) => setSellVal(e.target.value)}
            className={cellInput}
          />
        ) : (
          <span className="font-mono tabular-nums text-sm text-rose-700">
            {fmtRate(rate.sellRate)}
          </span>
        )}
      </td>

      {/* Last updated */}
      <td className="px-3 py-3.5 hidden md:table-cell">
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <Clock size={11} />
          {relativeTime(rate.updatedAt, isAr)}
        </span>
      </td>

      {/* Status toggle */}
      <td className="px-3 py-3.5">
        <button
          onClick={handleToggle}
          disabled={toggling || editing}
          title={rate.isActive ? (isAr ? 'تعطيل' : 'Deactivate') : (isAr ? 'تفعيل' : 'Activate')}
          className="transition-colors disabled:opacity-40"
        >
          {toggling ? (
            <Spinner size="sm" />
          ) : rate.isActive ? (
            <ToggleRight size={22} className="text-brand-600" />
          ) : (
            <ToggleLeft size={22} className="text-slate-400" />
          )}
        </button>
      </td>

      {/* Actions */}
      <td className="px-3 pe-5 py-3.5">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={confirmEdit}
              disabled={saving}
              className="p-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              title={isAr ? 'حفظ' : 'Save'}
            >
              {saving ? <Spinner size="sm" className="text-white" /> : <Check size={13} />}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="p-1.5 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors disabled:opacity-50"
              title={isAr ? 'إلغاء' : 'Cancel'}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-brand-600 transition-colors"
            title={isAr ? 'تعديل السعر' : 'Edit Rate'}
          >
            <Pencil size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Exchange Rates Tab ────────────────────────────────────────────────────────

interface ExchangeRatesTabProps {
  rates: ExchangeRate[];
  isAr: boolean;
  loading: boolean;
  lastRefreshed: number | null;
  onUpdateRate: (id: string, data: { rateToSAR: number; buyRate: number; sellRate: number }) => Promise<void>;
  onToggle: (id: string, current: boolean) => Promise<void>;
  onAddCurrency: (data: Omit<ExchangeRate, 'id' | 'agencyId' | 'updatedAt'>) => Promise<void>;
}

function ExchangeRatesTab({
  rates,
  isAr,
  loading,
  lastRefreshed,
  onUpdateRate,
  onToggle,
  onAddCurrency,
}: ExchangeRatesTabProps) {
  const [showAdd, setShowAdd] = useState(false);

  const activeCount = rates.filter((r) => r.isActive).length;
  const existingCodes = rates.map((r) => r.code);

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-brand-50 flex-shrink-0">
            <Globe2 size={18} className="text-brand-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">{isAr ? 'إجمالي العملات' : 'Total Currencies'}</p>
            <p className="text-xl font-bold text-slate-900">{rates.length}</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 flex-shrink-0">
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">{isAr ? 'عملات نشطة' : 'Active Currencies'}</p>
            <p className="text-xl font-bold text-slate-900">{activeCount}</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3 col-span-2 sm:col-span-1">
          <div className="p-2.5 rounded-xl bg-amber-50 flex-shrink-0">
            <Clock size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">{isAr ? 'آخر تحديث' : 'Last Refreshed'}</p>
            <p className="text-sm font-semibold text-slate-700">
              {lastRefreshed ? relativeTime(lastRefreshed, isAr) : (isAr ? 'جارٍ التحميل...' : 'Loading...')}
            </p>
          </div>
        </Card>
      </div>

      {/* Table header + actions */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">
              {isAr ? 'جدول أسعار الصرف' : 'Exchange Rate Table'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAr
                ? 'انقر على أيقونة القلم لتعديل السعر مباشرة'
                : 'Click the pencil icon to edit rates inline'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <RefreshCw size={12} />
              {isAr ? 'تحديث تلقائي' : 'Live updates'}
            </span>
            <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
              <Plus size={14} />
              {isAr ? 'إضافة عملة' : 'Add Currency'}
            </Button>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <Card className="mb-4 border-brand-200 bg-brand-50/20">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">
              {isAr ? 'إضافة عملة جديدة' : 'Add New Currency'}
            </h3>
            <AddCurrencyForm
              isAr={isAr}
              onAdd={async (data) => {
                await onAddCurrency(data);
                setShowAdd(false);
              }}
              onCancel={() => setShowAdd(false)}
              existingCodes={existingCodes}
            />
          </Card>
        )}

        {/* Table */}
        <Card padding="none">
          {loading && rates.length === 0 ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : rates.length === 0 ? (
            <EmptyState
              icon={<Globe2 size={48} />}
              title={isAr ? 'لا توجد عملات' : 'No Currencies'}
              description={isAr ? 'جارٍ تهيئة العملات الافتراضية...' : 'Seeding default currencies...'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border bg-slate-50/60">
                    <th className="text-start ps-5 pe-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {isAr ? 'العملة' : 'Currency'}
                    </th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {isAr ? 'سعر الريال' : 'Rate/SAR'}
                    </th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                      <span className="text-emerald-600">{isAr ? 'سعر الشراء' : 'Buy Rate'}</span>
                    </th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                      <span className="text-rose-600">{isAr ? 'سعر البيع' : 'Sell Rate'}</span>
                    </th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                      {isAr ? 'آخر تحديث' : 'Last Updated'}
                    </th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {isAr ? 'الحالة' : 'Status'}
                    </th>
                    <th className="text-start px-3 pe-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {isAr ? 'تعديل' : 'Edit'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {rates.map((rate) => (
                    <EditableRateRow
                      key={rate.id}
                      rate={rate}
                      isAr={isAr}
                      onSave={onUpdateRate}
                      onToggle={onToggle}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Currency Converter Tab ────────────────────────────────────────────────────

interface ConverterTabProps {
  rates: ExchangeRate[];
  isAr: boolean;
}

function ConverterTab({ rates, isAr }: ConverterTabProps) {
  const activeRates = rates.filter((r) => r.isActive);

  // SAR is always available as "base"
  const sarBase: ExchangeRate = {
    id: 'SAR',
    code: 'SAR',
    nameAr: 'ريال سعودي',
    nameEn: 'Saudi Riyal',
    symbol: 'ر.س',
    rateToSAR: 1,
    buyRate: 1,
    sellRate: 1,
    isActive: true,
    updatedAt: Date.now(),
    agencyId: '',
  };

  const allRates: ExchangeRate[] = [sarBase, ...activeRates];

  const [fromCode, setFromCode] = useState('USD');
  const [toCode, setToCode] = useState('SAR');
  const [amount, setAmount] = useState('100');
  const [copied, setCopied] = useState(false);

  const fromRate = allRates.find((r) => r.code === fromCode) ?? sarBase;
  const toRate = allRates.find((r) => r.code === toCode) ?? sarBase;

  // Convert: amount (in fromCode) → SAR → toCode
  const amountNum = parseFloat(amount) || 0;
  const amountInSAR = amountNum * fromRate.rateToSAR;
  const converted = toRate.rateToSAR === 0 ? 0 : amountInSAR / toRate.rateToSAR;

  // Mid rate: how many toCode units per 1 fromCode
  const midRate = toRate.rateToSAR === 0 ? 0 : fromRate.rateToSAR / toRate.rateToSAR;

  // Buy/Sell context: what does the agency pay/receive
  // "Buy" from agency perspective: agency buys fromCode → uses buyRate
  // "Sell" from agency perspective: agency sells fromCode → uses sellRate
  const buyConverted = toRate.rateToSAR === 0 ? 0 : (amountNum * fromRate.buyRate) / toRate.rateToSAR;
  const sellConverted = toRate.rateToSAR === 0 ? 0 : (amountNum * fromRate.sellRate) / toRate.rateToSAR;

  function swap() {
    setFromCode(toCode);
    setToCode(fromCode);
  }

  async function copyResult() {
    const text = `${amountNum} ${fromCode} = ${converted.toFixed(4)} ${toCode}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silently
    }
  }

  function formatNum(n: number, decimals = 4): string {
    return new Intl.NumberFormat(isAr ? 'ar-SA-u-nu-latn' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    }).format(n);
  }

  const selectCls =
    'block rounded-lg border border-slate-300 bg-white text-slate-900 text-sm ' +
    'px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ' +
    'transition-colors duration-150 min-w-0';

  const inputCls =
    'block w-full rounded-lg border border-slate-300 bg-white text-slate-900 text-lg font-mono font-semibold ' +
    'px-4 py-3 placeholder:text-slate-300 ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ' +
    'transition-colors duration-150';

  return (
    <div className="space-y-6">
      {/* Converter card */}
      <Card>
        <h2 className="text-base font-semibold text-slate-900 mb-6">
          {isAr ? 'تحويل العملات' : 'Currency Converter'}
        </h2>

        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          {/* From */}
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-slate-600">
              {isAr ? 'من' : 'From'}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100"
                className={cn(inputCls, 'flex-1')}
              />
              <select
                value={fromCode}
                onChange={(e) => setFromCode(e.target.value)}
                className={cn(selectCls, 'w-28 flex-shrink-0')}
              >
                {allRates.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} {r.symbol}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-400">
              {isAr ? fromRate.nameAr : fromRate.nameEn}
            </p>
          </div>

          {/* Swap button */}
          <div className="flex items-center justify-center sm:pt-5">
            <button
              onClick={swap}
              className={cn(
                'p-2.5 rounded-xl border border-slate-200 text-slate-500',
                'hover:bg-brand-50 hover:border-brand-300 hover:text-brand-600',
                'transition-all duration-150',
              )}
              title={isAr ? 'تبديل' : 'Swap'}
            >
              <ArrowLeftRight size={18} />
            </button>
          </div>

          {/* To */}
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-slate-600">
              {isAr ? 'إلى' : 'To'}
            </label>
            <div className="flex gap-2">
              <div className={cn(inputCls, 'flex-1 bg-slate-50 text-brand-700 select-all cursor-default')}>
                {formatNum(converted)}
              </div>
              <select
                value={toCode}
                onChange={(e) => setToCode(e.target.value)}
                className={cn(selectCls, 'w-28 flex-shrink-0')}
              >
                {allRates.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} {r.symbol}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-400">
              {isAr ? toRate.nameAr : toRate.nameEn}
            </p>
          </div>
        </div>

        {/* Result highlight */}
        <div className="mt-6 p-4 rounded-xl bg-brand-50 border border-brand-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-brand-600 font-medium mb-1">
                {isAr ? 'نتيجة التحويل' : 'Conversion Result'}
              </p>
              <p className="text-2xl font-bold text-brand-800 font-mono tabular-nums">
                {formatNum(amountNum)} {fromRate.symbol}
                <span className="text-brand-400 mx-2">=</span>
                {formatNum(converted)} {toRate.symbol}
              </p>
              <p className="text-xs text-brand-500 mt-1 font-mono">
                {isAr ? 'السعر الوسطي:' : 'Mid rate:'}{' '}
                1 {fromCode} = {fmtRate(midRate)} {toCode}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={copyResult}>
              {copied ? <CheckCheck size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {copied
                ? (isAr ? 'تم النسخ' : 'Copied!')
                : (isAr ? 'نسخ النتيجة' : 'Copy Result')}
            </Button>
          </div>
        </div>

        {/* Buy / Sell / Mid rates */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
            <p className="text-xs text-emerald-600 font-medium mb-1">
              {isAr ? 'سعر الشراء' : 'Buy Rate'}
            </p>
            <p className="font-mono font-semibold text-emerald-800 tabular-nums">
              {formatNum(buyConverted, 4)}
            </p>
            <p className="text-xs text-emerald-500 mt-0.5">{toCode}</p>
          </div>
          <div className="p-3 rounded-lg bg-brand-50 border border-brand-100 text-center">
            <p className="text-xs text-brand-600 font-medium mb-1">
              {isAr ? 'السعر الوسطي' : 'Mid Rate'}
            </p>
            <p className="font-mono font-semibold text-brand-800 tabular-nums">
              {formatNum(converted, 4)}
            </p>
            <p className="text-xs text-brand-500 mt-0.5">{toCode}</p>
          </div>
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-center">
            <p className="text-xs text-rose-600 font-medium mb-1">
              {isAr ? 'سعر البيع' : 'Sell Rate'}
            </p>
            <p className="font-mono font-semibold text-rose-800 tabular-nums">
              {formatNum(sellConverted, 4)}
            </p>
            <p className="text-xs text-rose-500 mt-0.5">{toCode}</p>
          </div>
        </div>
      </Card>

      {/* Quick reference grid */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">
          {isAr ? 'مرجع سريع — الأسعار مقابل الريال السعودي' : 'Quick Reference — Rates vs SAR'}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {activeRates.map((r) => {
            const isFrom = r.code === fromCode;
            return (
              <button
                key={r.code}
                onClick={() => { setFromCode(r.code); setToCode('SAR'); }}
                className={cn(
                  'p-3.5 rounded-xl border text-start transition-all duration-150',
                  isFrom
                    ? 'border-brand-300 bg-brand-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-brand-200 hover:bg-brand-50/40',
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-sm text-slate-800">{r.code}</span>
                  <span className="text-base">{r.symbol}</span>
                </div>
                <p className="font-mono font-semibold text-brand-700 text-sm tabular-nums">
                  {fmtRate(r.rateToSAR)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {isAr ? r.nameAr : r.nameEn}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main CurrenciesClient ─────────────────────────────────────────────────────

interface CurrenciesClientProps {
  locale: string;
}

type TabId = 'rates' | 'converter';

export function CurrenciesClient({ locale }: CurrenciesClientProps) {
  const isAr = locale === 'ar';
  const { user } = useAuth();

  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('rates');
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  // ── REST fetch & bootstrap ──────────────────────────────────────────────────

  const fetchRates = useCallback(async () => {
    if (!user?.agencyId) return;
    try {
      const data = await apiFetch<{ accounts: unknown[]; transactions: unknown[]; rates: ApiExchangeRate[] }>('/api/banking');
      let mapped = data.rates.map(mapApiRate);
      mapped.sort((a, b) => a.code.localeCompare(b.code));

      // Seed defaults if empty
      if (mapped.length === 0) {
        const today = new Date().toISOString().slice(0, 10);
        await Promise.all(
          DEFAULT_CURRENCIES.map(cur =>
            apiFetch('/api/banking/rates', {
              method: 'POST',
              body: JSON.stringify({
                fromCurrency: cur.code,
                toCurrency: 'SAR',
                rate: cur.rateToSAR,
                effectiveDate: today,
              }),
            })
          )
        );
        setTick(t => t + 1);
        return;
      }

      setRates(mapped);
      setLastRefreshed(Date.now());
      setLoading(false);
    } catch (ex) {
      console.error('Fetch rates error:', ex);
      setError(isAr ? 'خطأ في تحميل أسعار الصرف' : 'Failed to load exchange rates');
      setLoading(false);
    }
  }, [user?.agencyId, isAr]);

  useEffect(() => {
    if (!user?.agencyId) return;
    setLoading(true);
    void fetchRates();
  }, [user?.agencyId, fetchRates, tick]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleUpdateRate(
    id: string,
    data: { rateToSAR: number; buyRate: number; sellRate: number },
  ) {
    if (!user?.agencyId) return;
    await apiFetch(`/api/banking/rates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ rate: data.rateToSAR }),
    });
    setTick(t => t + 1);
  }

  async function handleToggle(id: string, current: boolean) {
    if (!user?.agencyId) return;
    // Optimistic update
    setRates(prev => prev.map(r => r.id === id ? { ...r, isActive: !current } : r));
    await apiFetch(`/api/banking/rates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !current }),
    });
  }

  async function handleAddCurrency(
    data: Omit<ExchangeRate, 'id' | 'agencyId' | 'updatedAt'>,
  ) {
    if (!user?.agencyId) return;
    const today = new Date().toISOString().slice(0, 10);
    await apiFetch('/api/banking/rates', {
      method: 'POST',
      body: JSON.stringify({
        fromCurrency: data.code,
        toCurrency: 'SAR',
        rate: data.rateToSAR,
        effectiveDate: today,
      }),
    });
    setTick(t => t + 1);
  }

  // ── Tab definitions ─────────────────────────────────────────────────────────

  const tabs: { id: TabId; labelAr: string; labelEn: string; icon: ReactNode }[] = [
    {
      id: 'rates',
      labelAr: 'أسعار الصرف',
      labelEn: 'Exchange Rates',
      icon: <TrendingUp size={16} />,
    },
    {
      id: 'converter',
      labelAr: 'تحويل العملات',
      labelEn: 'Currency Converter',
      icon: <ArrowLeftRight size={16} />,
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <AlertCircle size={40} className="mx-auto text-red-400" />
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={() => {
            setError(null);
            setLoading(true);
            setTick(t => t + 1);
          }}>
            <RefreshCw size={14} />
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {isAr ? 'إدارة العملات' : 'Currency Management'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr
              ? 'أسعار الصرف وتحويل العملات للمكتب'
              : 'Exchange rates and currency conversion for your agency'}
          </p>
        </div>
        {lastRefreshed && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {isAr ? 'تحديث مباشر' : 'Live sync'}
            <span className="text-emerald-500">
              {relativeTime(lastRefreshed, isAr)}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div>
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-surface-border mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors',
                'border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-700 bg-brand-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50',
              )}
            >
              {tab.icon}
              {isAr ? tab.labelAr : tab.labelEn}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {activeTab === 'rates' && (
          <ExchangeRatesTab
            rates={rates}
            isAr={isAr}
            loading={loading}
            lastRefreshed={lastRefreshed}
            onUpdateRate={handleUpdateRate}
            onToggle={handleToggle}
            onAddCurrency={handleAddCurrency}
          />
        )}

        {activeTab === 'converter' && (
          loading ? (
            <div className="flex justify-center py-24">
              <Spinner size="lg" />
            </div>
          ) : (
            <ConverterTab rates={rates} isAr={isAr} />
          )
        )}
      </div>
    </div>
  );
}
