'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Landmark, Plus, X, TrendingUp, TrendingDown, ArrowLeftRight,
  Wallet, RefreshCw, CheckCircle2, AlertCircle, Search,
  ChevronDown, CreditCard, Building2, DollarSign,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountType = 'bank' | 'cash' | 'petty_cash';
type TxType = 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'fee' | 'payment_received' | 'payment_sent';

interface BankAccount {
  id: string;
  agencyId: string;
  nameAr: string;
  nameEn: string;
  bankNameAr: string;
  bankNameEn: string;
  accountNumber: string;
  iban: string;
  type: AccountType;
  currencyCode: string;
  balanceHalalas: number;
  isActive: boolean;
  reconciledAt?: number;
  reconciledBalance?: number;
  createdAt: number;
}

interface BankTx {
  id: string;
  agencyId: string;
  accountId: string;
  type: TxType;
  amountHalalas: number;
  balanceAfterHalalas: number;
  descAr: string;
  descEn: string;
  reference: string;
  date: number;
  isReconciled: boolean;
  linkedAccountId?: string;
  createdAt?: number;
}

interface BankingClientProps { locale: string }

// ─── Static demo data ─────────────────────────────────────────────────────────

const DEMO_ACCOUNTS: Omit<BankAccount, 'id' | 'agencyId'>[] = [
  { nameAr: 'الراجحي — الحساب الجاري', nameEn: 'Al-Rajhi — Current Account', bankNameAr: 'بنك الراجحي', bankNameEn: 'Al-Rajhi Bank', accountNumber: '608010xxxxxxxxxx', iban: 'SA03 8000 0000 6080 1016 7519', type: 'bank', currencyCode: 'SAR', balanceHalalas: 8_740_000, isActive: true, reconciledAt: Date.now() - 2 * 86400000, reconciledBalance: 8_550_000, createdAt: Date.now() - 365 * 86400000 },
  { nameAr: 'الأهلي (SNB) — توفير',    nameEn: 'SNB — Savings Account',       bankNameAr: 'البنك الأهلي السعودي', bankNameEn: 'Saudi National Bank', accountNumber: '10xxxxxxxxxxxxxxxx', iban: 'SA44 1000 0001 0338 0000 1020', type: 'bank', currencyCode: 'SAR', balanceHalalas: 4_230_000, isActive: true, reconciledAt: Date.now() - 5 * 86400000, reconciledBalance: 4_100_000, createdAt: Date.now() - 300 * 86400000 },
  { nameAr: 'صندوق مكتب الرياض',        nameEn: 'Riyadh Office Cash Box',      bankNameAr: 'نقدية',   bankNameEn: 'Cash',        accountNumber: 'CASH-01', iban: '', type: 'cash',       currencyCode: 'SAR', balanceHalalas: 600_000, isActive: true, createdAt: Date.now() - 200 * 86400000 },
  { nameAr: 'صندوق احتياطي',             nameEn: 'Petty Cash Reserve',          bankNameAr: 'عهدة',    bankNameEn: 'Petty Cash',  accountNumber: 'PC-01',   iban: '', type: 'petty_cash', currencyCode: 'SAR', balanceHalalas: 120_000, isActive: true, createdAt: Date.now() - 180 * 86400000 },
];

const DEMO_TXS: Omit<BankTx, 'id' | 'agencyId'>[] = [
  { accountId: 'acc-1', type: 'payment_received', amountHalalas:  2_400_000, balanceAfterHalalas: 8_740_000, descAr: 'دفعة من عميل — شركة الأمانة للسفر',   descEn: 'Payment from Al-Amana Travel Co.',  reference: 'INV-2026-0088', date: Date.now() - 1 * 86400000,  isReconciled: true  },
  { accountId: 'acc-1', type: 'payment_sent',     amountHalalas:  1_800_000, balanceAfterHalalas: 6_340_000, descAr: 'دفعة لمورد — شركة نسمة للسياحة',     descEn: 'Payment to Nasma Tourism Co.',      reference: 'PO-2026-0041',  date: Date.now() - 2 * 86400000,  isReconciled: true  },
  { accountId: 'acc-1', type: 'fee',              amountHalalas:     12_000, balanceAfterHalalas: 8_140_000, descAr: 'رسوم بنكية شهرية',                    descEn: 'Monthly bank charges',              reference: 'BANK-FEE-05',   date: Date.now() - 3 * 86400000,  isReconciled: true  },
  { accountId: 'acc-1', type: 'transfer_out',     amountHalalas:    500_000, balanceAfterHalalas: 8_128_000, descAr: 'تحويل إلى الصندوق',                  descEn: 'Transfer to Cash Box',              reference: 'TRF-0022',      date: Date.now() - 4 * 86400000,  isReconciled: false },
  { accountId: 'acc-1', type: 'deposit',          amountHalalas:  3_200_000, balanceAfterHalalas: 8_628_000, descAr: 'إيداع إيرادات عمرة — موسم رمضان',   descEn: 'Umrah season revenue deposit',      reference: 'DEP-2026-0019', date: Date.now() - 6 * 86400000,  isReconciled: true  },
  { accountId: 'acc-1', type: 'payment_received', amountHalalas:  1_100_000, balanceAfterHalalas: 5_428_000, descAr: 'تحصيل فواتير طيران — مجموعة نجم',   descEn: 'Flight invoices collection — Najm', reference: 'INV-2026-0079', date: Date.now() - 8 * 86400000,  isReconciled: true  },
  { accountId: 'acc-2', type: 'deposit',          amountHalalas:  1_500_000, balanceAfterHalalas: 4_230_000, descAr: 'إيداع توفير شهري',                   descEn: 'Monthly savings deposit',           reference: 'SAV-05-2026',   date: Date.now() - 3 * 86400000,  isReconciled: false },
  { accountId: 'acc-2', type: 'transfer_in',      amountHalalas:    800_000, balanceAfterHalalas: 2_730_000, descAr: 'تحويل من الراجحي',                   descEn: 'Transfer from Al-Rajhi',            reference: 'TRF-0021',      date: Date.now() - 10 * 86400000, isReconciled: true  },
  { accountId: 'acc-3', type: 'transfer_in',      amountHalalas:    500_000, balanceAfterHalalas:   600_000, descAr: 'تعبئة صندوق من الراجحي',             descEn: 'Cash box refill from Al-Rajhi',     reference: 'TRF-0022',      date: Date.now() - 4 * 86400000,  isReconciled: false },
  { accountId: 'acc-3', type: 'withdrawal',       amountHalalas:     80_000, balanceAfterHalalas:   100_000, descAr: 'مصاريف مكتبية وإدارية',              descEn: 'Office admin expenses',             reference: 'EXP-0055',      date: Date.now() - 5 * 86400000,  isReconciled: false },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_META: Record<AccountType, { ar: string; en: string; icon: typeof Landmark; bg: string; text: string; gradient: string }> = {
  bank:       { ar: 'بنكي',       en: 'Bank',       icon: Landmark,   bg: 'bg-brand-50',   text: 'text-brand-700',   gradient: 'from-brand-600 to-brand-800' },
  cash:       { ar: 'صندوق نقدي', en: 'Cash Box',   icon: Wallet,     bg: 'bg-emerald-50', text: 'text-emerald-700', gradient: 'from-emerald-600 to-emerald-800' },
  petty_cash: { ar: 'عهدة',       en: 'Petty Cash', icon: CreditCard, bg: 'bg-amber-50',   text: 'text-amber-700',   gradient: 'from-amber-500 to-amber-700' },
};

const TX_META: Record<TxType, { ar: string; en: string; sign: 1 | -1; color: string }> = {
  deposit:          { ar: 'إيداع',           en: 'Deposit',          sign: 1,  color: 'text-emerald-600' },
  withdrawal:       { ar: 'سحب',             en: 'Withdrawal',       sign: -1, color: 'text-red-600' },
  transfer_in:      { ar: 'تحويل وارد',      en: 'Transfer In',      sign: 1,  color: 'text-sky-600' },
  transfer_out:     { ar: 'تحويل صادر',      en: 'Transfer Out',     sign: -1, color: 'text-violet-600' },
  fee:              { ar: 'رسوم بنكية',       en: 'Bank Fee',         sign: -1, color: 'text-orange-600' },
  payment_received: { ar: 'مقبوضات',         en: 'Payment Received', sign: 1,  color: 'text-emerald-600' },
  payment_sent:     { ar: 'مدفوعات',         en: 'Payment Sent',     sign: -1, color: 'text-red-600' },
};

const SAUDI_BANKS_AR = ['الراجحي', 'البنك الأهلي السعودي (SNB)', 'الرياض', 'البلاد', 'الإنماء', 'العربي', 'سامبا', 'الجزيرة', 'الفرنسي (BNP)', 'الأول', 'البحر المتوسط', 'HSBC السعودية'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskAccount(acc: string) {
  if (acc.length <= 8) return acc;
  return acc.slice(0, 4) + 'xxxx' + acc.slice(-4);
}

// ─── Account Card ─────────────────────────────────────────────────────────────

function AccountCard({ acc, isAr, fmtLocale, selected, onSelect }: {
  acc: BankAccount & { id: string }; isAr: boolean; fmtLocale: string;
  selected: boolean; onSelect: () => void;
}) {
  const meta = ACCOUNT_TYPE_META[acc.type];
  const Icon = meta.icon;
  const daysSinceRecon = acc.reconciledAt ? Math.floor((Date.now() - acc.reconciledAt) / 86400000) : null;
  const reconDiff = acc.reconciledBalance != null ? acc.balanceHalalas - acc.reconciledBalance : null;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-start rounded-2xl overflow-hidden border-2 transition-all duration-200 shadow-sm hover:shadow-md',
        selected ? 'border-brand-500 shadow-brand-100' : 'border-transparent hover:border-slate-200',
      )}
    >
      {/* Gradient header */}
      <div className={`bg-gradient-to-br ${meta.gradient} p-5 text-white`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-xl">
              <Icon size={18} />
            </div>
            <span className="text-xs font-bold opacity-75 uppercase tracking-wider">{isAr ? meta.ar : meta.en}</span>
          </div>
          {!acc.isActive && (
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">{isAr ? 'معطّل' : 'Inactive'}</span>
          )}
        </div>
        <p className="text-2xl font-extrabold tabular-nums mb-0.5">{formatCurrency(acc.balanceHalalas, fmtLocale)}</p>
        <p className="text-xs opacity-75">{isAr ? acc.nameAr : acc.nameEn}</p>
      </div>
      {/* Footer */}
      <div className="bg-white px-4 py-3">
        <p className="text-xs text-slate-500 font-mono">{maskAccount(acc.accountNumber)}</p>
        {acc.iban && <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">{acc.iban}</p>}
        {daysSinceRecon != null && (
          <div className={cn('flex items-center gap-1 mt-2 text-[10px] font-semibold',
            daysSinceRecon <= 3 ? 'text-emerald-600' : daysSinceRecon <= 7 ? 'text-amber-600' : 'text-red-500')}>
            {daysSinceRecon <= 3 ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
            {isAr
              ? `مطابقة منذ ${daysSinceRecon} ${daysSinceRecon === 1 ? 'يوم' : 'أيام'}`
              : `Reconciled ${daysSinceRecon}d ago`}
            {reconDiff != null && reconDiff !== 0 && (
              <span className="ms-1 text-amber-700">
                ({reconDiff > 0 ? '+' : ''}{formatCurrency(reconDiff, fmtLocale)})
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── New Account Modal ────────────────────────────────────────────────────────

function NewAccountModal({ isAr, onClose, onSave }: {
  isAr: boolean;
  onClose: () => void;
  onSave: (acc: Omit<BankAccount, 'id' | 'agencyId'>) => void;
}) {
  const [nameAr, setNameAr]       = useState('');
  const [nameEn, setNameEn]       = useState('');
  const [bankAr, setBankAr]       = useState('');
  const [bankEn, setBankEn]       = useState('');
  const [accNum, setAccNum]       = useState('');
  const [iban, setIban]           = useState('');
  const [type, setType]           = useState<AccountType>('bank');
  const [balance, setBalance]     = useState('');
  const [error, setError]         = useState('');

  function handleSave() {
    if (!nameAr.trim()) { setError(isAr ? 'اسم الحساب مطلوب' : 'Account name required'); return; }
    const balH = Math.round(Number(balance) * 100);
    if (isNaN(balH) || balH < 0) { setError(isAr ? 'رصيد غير صحيح' : 'Invalid balance'); return; }
    onSave({
      nameAr: nameAr.trim(), nameEn: nameEn.trim() || nameAr.trim(),
      bankNameAr: bankAr.trim(), bankNameEn: bankEn.trim() || bankAr.trim(),
      accountNumber: accNum.trim(), iban: iban.trim().toUpperCase(),
      type, currencyCode: 'SAR',
      balanceHalalas: balH, isActive: true, createdAt: Date.now(),
    });
    onClose();
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Landmark size={20} className="text-brand-600" />
            {isAr ? 'إضافة حساب مصرفي / صندوق' : 'Add Bank Account / Cash Box'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'نوع الحساب' : 'Account Type'}</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(ACCOUNT_TYPE_META) as [AccountType, typeof ACCOUNT_TYPE_META[AccountType]][]).map(([k, m]) => (
                <button key={k} onClick={() => setType(k)}
                  className={cn('flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-colors',
                    type === k ? `border-brand-500 ${m.bg} ${m.text}` : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                  <m.icon size={18} />
                  {isAr ? m.ar : m.en}
                </button>
              ))}
            </div>
          </div>
          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'اسم الحساب (عربي) *' : 'Account Name (AR) *'}</label>
              <input className={inputCls} dir="rtl" value={nameAr} onChange={e => setNameAr(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'اسم الحساب (إنجليزي)' : 'Account Name (EN)'}</label>
              <input className={inputCls} value={nameEn} onChange={e => setNameEn(e.target.value)} />
            </div>
          </div>
          {type === 'bank' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'اسم البنك' : 'Bank Name'}</label>
                <select className={inputCls} value={bankAr} onChange={e => { setBankAr(e.target.value); setBankEn(e.target.value); }}>
                  <option value="">{isAr ? 'اختر البنك' : 'Select bank'}</option>
                  {SAUDI_BANKS_AR.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'رقم الحساب' : 'Account Number'}</label>
                  <input className={inputCls} dir="ltr" value={accNum} onChange={e => setAccNum(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">IBAN</label>
                  <input className={inputCls} dir="ltr" placeholder="SA00 0000..." value={iban} onChange={e => setIban(e.target.value)} />
                </div>
              </div>
            </>
          )}
          {/* Opening balance */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'الرصيد الافتتاحي (ر.س)' : 'Opening Balance (SAR)'}</label>
            <input className={inputCls} dir="ltr" type="number" min="0" step="0.01" placeholder="0.00" value={balance} onChange={e => setBalance(e.target.value)} />
          </div>
          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        </div>
        <div className="px-6 py-4 border-t border-surface-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-medium">
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <Button onClick={handleSave}>
            <Plus size={15} /> {isAr ? 'إضافة الحساب' : 'Add Account'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Transfer Modal ───────────────────────────────────────────────────────────

function TransferModal({ accounts, isAr, fmtLocale, onClose, onTransfer }: {
  accounts: (BankAccount & { id: string })[]; isAr: boolean; fmtLocale: string;
  onClose: () => void; onTransfer: (fromId: string, toId: string, amountH: number, desc: string) => void;
}) {
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId]     = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [desc, setDesc]     = useState('');
  const [error, setError]   = useState('');

  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc   = accounts.find(a => a.id === toId);

  function handleTransfer() {
    const amH = Math.round(Number(amount) * 100);
    if (!fromId || !toId || fromId === toId) { setError(isAr ? 'اختر حسابين مختلفين' : 'Select two different accounts'); return; }
    if (isNaN(amH) || amH <= 0) { setError(isAr ? 'أدخل مبلغاً صحيحاً' : 'Enter a valid amount'); return; }
    if (fromAcc && amH > fromAcc.balanceHalalas) { setError(isAr ? 'المبلغ أكبر من الرصيد المتاح' : 'Amount exceeds available balance'); return; }
    onTransfer(fromId, toId, amH, desc.trim() || (isAr ? 'تحويل داخلي' : 'Internal transfer'));
    onClose();
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ArrowLeftRight size={20} className="text-brand-600" />
            {isAr ? 'تحويل بين الحسابات' : 'Inter-Account Transfer'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'من حساب' : 'From Account'}</label>
            <select className={inputCls} value={fromId} onChange={e => setFromId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{isAr ? a.nameAr : a.nameEn} — {formatCurrency(a.balanceHalalas, fmtLocale)}</option>)}
            </select>
          </div>
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center">
              <ArrowLeftRight size={14} className="text-brand-600" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'إلى حساب' : 'To Account'}</label>
            <select className={inputCls} value={toId} onChange={e => setToId(e.target.value)}>
              {accounts.filter(a => a.id !== fromId).map(a => <option key={a.id} value={a.id}>{isAr ? a.nameAr : a.nameEn}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'المبلغ (ر.س) *' : 'Amount (SAR) *'}</label>
            <input className={inputCls} dir="ltr" type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            {fromAcc && (
              <p className="text-xs text-slate-400 mt-1">
                {isAr ? 'متاح:' : 'Available:'} {formatCurrency(fromAcc.balanceHalalas, fmtLocale)}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'البيان' : 'Description'}</label>
            <input className={inputCls} dir={isAr ? 'rtl' : 'ltr'} placeholder={isAr ? 'تحويل داخلي...' : 'Internal transfer...'} value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        </div>
        <div className="px-6 py-4 border-t border-surface-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-medium">
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <Button onClick={handleTransfer}>
            <ArrowLeftRight size={15} /> {isAr ? 'تحويل' : 'Transfer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BankingClient({ locale }: BankingClientProps) {
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { user }  = useAuth();

  const [accounts, setAccounts]       = useState<(BankAccount & { id: string })[]>([]);
  const [txs, setTxs]                 = useState<(BankTx & { id: string })[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [showNewAcc, setShowNewAcc]   = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [search, setSearch]           = useState('');
  const [txFilter, setTxFilter]       = useState<TxType | 'all'>('all');
  const [tick, setTick]               = useState(0);

  const agencyId = user?.agencyId ?? '';

  useEffect(() => {
    if (!agencyId) {
      // No agency context yet — show empty state, never show demo data to real users
      setAccounts([]);
      setTxs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    apiFetch<{ accounts: (BankAccount & { id: string })[]; transactions: (BankTx & { id: string })[]; rates: unknown[] }>('/api/banking')
      .then(({ accounts: accs, transactions }) => {
        const sorted = [...accs].sort((a, b) => b.balanceHalalas - a.balanceHalalas);
        setAccounts(sorted);
        setTxs([...transactions].sort((a, b) => b.date - a.date));
        if (sorted.length > 0 && !selectedId) setSelectedId(sorted[0].id);
      })
      .catch(() => { /* keep previous data on error */ })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId, tick]);

  async function handleNewAccount(data: Omit<BankAccount, 'id' | 'agencyId'>) {
    if (!agencyId) {
      const fakeId = `acc-${Date.now()}`;
      setAccounts(prev => [...prev, { ...data, id: fakeId, agencyId: 'demo' }]);
      if (!selectedId) setSelectedId(fakeId);
      return;
    }
    await apiFetch('/api/banking/accounts', {
      method: 'POST',
      body: JSON.stringify({
        nameAr: data.nameAr,
        nameEn: data.nameEn,
        type: data.type,
        accountNumber: data.accountNumber,
        bankName: data.bankNameAr,
        iban: data.iban,
        openingBalanceHalalas: data.balanceHalalas,
        currency: data.currencyCode,
      }),
    });
    setTick(t => t + 1);
  }

  async function handleTransfer(fromId: string, toId: string, amountH: number, desc: string) {
    const ref = `TRF-${Date.now()}`;
    const now = Date.now();
    const fromAcc = accounts.find(a => a.id === fromId);
    const toAcc   = accounts.find(a => a.id === toId);

    if (!agencyId) {
      // Demo mode: local state only
      setAccounts(prev => prev.map(a => {
        if (a.id === fromId) return { ...a, balanceHalalas: a.balanceHalalas - amountH };
        if (a.id === toId)   return { ...a, balanceHalalas: a.balanceHalalas + amountH };
        return a;
      }));
      const outTx: BankTx & { id: string } = { id: `tx-out-${now}`, agencyId: 'demo', accountId: fromId, type: 'transfer_out', amountHalalas: amountH, balanceAfterHalalas: (fromAcc?.balanceHalalas ?? 0) - amountH, descAr: desc, descEn: desc, reference: ref, date: now, isReconciled: false, linkedAccountId: toId, createdAt: now };
      const inTx:  BankTx & { id: string } = { id: `tx-in-${now}`,  agencyId: 'demo', accountId: toId,   type: 'transfer_in',  amountHalalas: amountH, balanceAfterHalalas: (toAcc?.balanceHalalas  ?? 0) + amountH, descAr: desc, descEn: desc, reference: ref, date: now, isReconciled: false, linkedAccountId: fromId, createdAt: now };
      setTxs(prev => [outTx, inTx, ...prev]);
      return;
    }

    const nowIso = new Date(now).toISOString();
    await Promise.all([
      apiFetch('/api/banking/transactions', {
        method: 'POST',
        body: JSON.stringify({ bankAccountId: fromId, type: 'transfer_out', amountHalalas: amountH, description: desc, reference: ref, date: nowIso }),
      }),
      apiFetch('/api/banking/transactions', {
        method: 'POST',
        body: JSON.stringify({ bankAccountId: toId, type: 'transfer_in', amountHalalas: amountH, description: desc, reference: ref, date: nowIso }),
      }),
    ]);
    setTick(t => t + 1);
  }

  const totalBalance = accounts.filter(a => a.isActive).reduce((s, a) => s + a.balanceHalalas, 0);
  const bankBalance  = accounts.filter(a => a.isActive && a.type === 'bank').reduce((s, a) => s + a.balanceHalalas, 0);
  const cashBalance  = accounts.filter(a => a.isActive && a.type !== 'bank').reduce((s, a) => s + a.balanceHalalas, 0);

  const selectedAccount = accounts.find(a => a.id === selectedId);

  const filteredTxs = useMemo(() => {
    const accTxs = txs.filter(t => t.accountId === selectedId);
    const q = search.toLowerCase();
    return accTxs.filter(t => {
      const matchType = txFilter === 'all' || t.type === txFilter;
      const matchSearch = !q || t.descAr.toLowerCase().includes(q) || t.descEn.toLowerCase().includes(q) || t.reference.toLowerCase().includes(q);
      return matchType && matchSearch;
    });
  }, [txs, selectedId, txFilter, search]);

  const TX_FILTER_TABS: { id: TxType | 'all'; ar: string; en: string }[] = [
    { id: 'all',              ar: 'الكل',        en: 'All' },
    { id: 'payment_received', ar: 'مقبوضات',     en: 'Received' },
    { id: 'payment_sent',     ar: 'مدفوعات',     en: 'Paid' },
    { id: 'transfer_in',      ar: 'تحويل وارد',  en: 'Transfer In' },
    { id: 'transfer_out',     ar: 'تحويل صادر',  en: 'Transfer Out' },
    { id: 'fee',              ar: 'رسوم',        en: 'Fees' },
  ];

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'إدارة البنوك والصناديق' : 'Banks & Cash Management'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr ? 'رصيد الحسابات البنكية والصناديق النقدية ومتابعة الحركات المالية' : 'Bank accounts, cash boxes, and transaction ledger'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTransfer(true)}
            disabled={accounts.length < 2}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            <ArrowLeftRight size={15} />{isAr ? 'تحويل' : 'Transfer'}
          </button>
          <Button onClick={() => setShowNewAcc(true)}>
            <Plus size={15} />{isAr ? 'حساب جديد' : 'New Account'}
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { labelAr: 'إجمالي الأرصدة',    labelEn: 'Total Balance',  amount: totalBalance, bg: 'bg-gradient-to-br from-brand-600 to-brand-800', text: 'text-white' },
          { labelAr: 'أرصدة بنكية',        labelEn: 'Bank Balances',  amount: bankBalance,  bg: 'bg-slate-50 border border-slate-200',            text: 'text-slate-900' },
          { labelAr: 'نقدية وصناديق',      labelEn: 'Cash & Boxes',   amount: cashBalance,  bg: 'bg-emerald-50 border border-emerald-200',         text: 'text-emerald-900' },
        ].map(s => (
          <div key={s.labelEn} className={`rounded-2xl p-5 shadow-sm ${s.bg}`}>
            <p className={`text-[11px] font-bold uppercase tracking-widest opacity-70 mb-1 ${s.text}`}>{isAr ? s.labelAr : s.labelEn}</p>
            <p className={`text-2xl font-extrabold tabular-nums ${s.text}`}>{formatCurrency(s.amount, fmtLocale)}</p>
            <p className={`text-xs opacity-60 mt-0.5 ${s.text}`}>{isAr ? `${accounts.filter(a => a.isActive).length} حساب نشط` : `${accounts.filter(a => a.isActive).length} active accounts`}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        {/* Accounts list */}
        <div className="space-y-3">
          {accounts.map(acc => (
            <AccountCard
              key={acc.id} acc={acc} isAr={isAr} fmtLocale={fmtLocale}
              selected={selectedId === acc.id} onSelect={() => setSelectedId(acc.id)}
            />
          ))}
          {accounts.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              {isAr ? 'لا توجد حسابات بعد' : 'No accounts yet'}
            </div>
          )}
        </div>

        {/* Transactions ledger */}
        <div className="space-y-4">
          {selectedAccount ? (
            <>
              {/* Account detail header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{isAr ? selectedAccount.nameAr : selectedAccount.nameEn}</h2>
                  <p className="text-sm text-slate-500">
                    {isAr ? 'الرصيد الحالي:' : 'Current balance:'}{' '}
                    <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(selectedAccount.balanceHalalas, fmtLocale)}</span>
                  </p>
                </div>
                {selectedAccount.reconciledAt && (
                  <div className="text-end">
                    <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold justify-end">
                      <RefreshCw size={11} />
                      {isAr ? 'آخر مطابقة' : 'Last reconciled'}
                    </div>
                    <p className="text-xs text-slate-400">{formatDate(new Date(selectedAccount.reconciledAt), fmtLocale)}</p>
                  </div>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex gap-1 overflow-x-auto flex-1 pb-px">
                  {TX_FILTER_TABS.map(tab => (
                    <button key={tab.id} onClick={() => setTxFilter(tab.id)}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                        txFilter === tab.id ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
                      {isAr ? tab.ar : tab.en}
                    </button>
                  ))}
                </div>
                <div className="relative flex-shrink-0">
                  <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder={isAr ? 'ابحث في الحركات...' : 'Search transactions...'}
                    className="rounded-lg border border-slate-200 bg-white ps-9 pe-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>

              {/* Transactions table */}
              <Card padding="none">
                {filteredTxs.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-sm">
                    {isAr ? 'لا توجد حركات مالية' : 'No transactions'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 border-b border-surface-border">
                          <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'التاريخ' : 'Date'}</th>
                          <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'البيان' : 'Description'}</th>
                          <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'المرجع' : 'Reference'}</th>
                          <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'المبلغ' : 'Amount'}</th>
                          <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{isAr ? 'الرصيد بعد' : 'Balance After'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border">
                        {filteredTxs.map(tx => {
                          const m = TX_META[tx.type];
                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/40 transition-colors">
                              <td className="ps-5 pe-3 py-3.5">
                                <p className="text-xs font-medium text-slate-500">{formatDate(new Date(tx.date), fmtLocale)}</p>
                                {tx.isReconciled && (
                                  <span className="text-[10px] text-emerald-600 flex items-center gap-0.5 mt-0.5">
                                    <CheckCircle2 size={10} />{isAr ? 'مطابق' : 'Reconciled'}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3.5">
                                <p className="text-sm font-medium text-slate-800">{isAr ? tx.descAr : tx.descEn}</p>
                                <span className={cn('text-[11px] font-semibold', m.color)}>{isAr ? m.ar : m.en}</span>
                              </td>
                              <td className="px-3 py-3.5 hidden md:table-cell">
                                <span className="text-xs font-mono text-slate-400">{tx.reference || '—'}</span>
                              </td>
                              <td className={cn('px-3 py-3.5 text-end text-sm font-bold tabular-nums font-mono', m.color)}>
                                {m.sign > 0 ? '+' : '−'}{formatCurrency(tx.amountHalalas, fmtLocale)}
                              </td>
                              <td className="pe-5 px-3 py-3.5 text-end text-xs tabular-nums font-mono text-slate-500 hidden lg:table-cell">
                                {formatCurrency(tx.balanceAfterHalalas, fmtLocale)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="px-5 py-3 border-t border-surface-border flex items-center justify-between">
                  <span className="text-xs text-slate-400">{isAr ? `${filteredTxs.length} حركة` : `${filteredTxs.length} transactions`}</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-emerald-600 font-semibold">
                      +{formatCurrency(filteredTxs.filter(t => TX_META[t.type].sign > 0).reduce((s, t) => s + t.amountHalalas, 0), fmtLocale)}
                    </span>
                    <span className="text-red-500 font-semibold">
                      −{formatCurrency(filteredTxs.filter(t => TX_META[t.type].sign < 0).reduce((s, t) => s + t.amountHalalas, 0), fmtLocale)}
                    </span>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              {isAr ? 'اختر حساباً لعرض الحركات المالية' : 'Select an account to view transactions'}
            </div>
          )}
        </div>
      </div>

      {showNewAcc && (
        <NewAccountModal isAr={isAr} onClose={() => setShowNewAcc(false)} onSave={handleNewAccount} />
      )}
      {showTransfer && (
        <TransferModal accounts={accounts} isAr={isAr} fmtLocale={fmtLocale} onClose={() => setShowTransfer(false)} onTransfer={handleTransfer} />
      )}
    </div>
  );
}
