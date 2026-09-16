'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { getAuth } from 'firebase/auth';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import {
  ShieldCheck, Building2, Users, RefreshCw,
  CheckCircle2, XCircle, Clock, AlertTriangle,
  CalendarCheck, CalendarDays, Ban, Zap,
  Trash2, TriangleAlert, Sliders, X,
  RotateCcw, TimerOff, UserPlus, Globe, BadgeCheck,
} from 'lucide-react';
import { FEATURE_LABEL, FEATURE_GROUPS, type FeatureKey } from '@/lib/plan-features';

// ─── Types ────────────────────────────────────────────────────────────────────

const SUPER_ADMIN_EMAIL = process.env['NEXT_PUBLIC_SUPER_ADMIN_EMAIL'] ?? '';

interface AgencyRow {
  id:                   string;
  nameAr:               string;
  nameEn:               string;
  contactEmail:         string;
  subscriptionStatus:   string;
  plan:                 string;
  isLifetime:           boolean;
  trialEndDate:         string | null;
  subscriptionEndDate:  string | null;
  trialStartsAt:        string | null;
  subscriptionStartsAt: string | null;
  createdAt:            string | null;
  isActive:             boolean;
  maxUsers:             number;
  userCount:            number;
  providerCount:        number;
  isVatRegistered:      boolean;
}

type AdminAction =
  | 'activate_month'
  | 'activate_year'
  | 'activate_lifetime'
  | 'suspend'
  | 'reactivate'
  | 'expire'
  | 'extend_trial'
  | 'set_max_users';

// ─── Wipe Modal ───────────────────────────────────────────────────────────────

function WipeModal({
  agency,
  onClose,
  onWiped,
  getIdToken,
}: {
  agency:     AgencyRow;
  onClose:    () => void;
  onWiped:    (msg: string) => void;
  getIdToken: () => Promise<string>;
}) {
  const isAr = useLocale() === 'ar';
  const [inputVal, setInputVal] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const confirmed = inputVal.trim() === agency.nameAr;

  async function handleWipe() {
    if (!confirmed) return;
    setLoading(true);
    setError('');
    try {
      const token = await getIdToken();
      const resp  = await fetch('/api/admin/wipe-agency', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ agencyId: agency.id, confirmName: agency.nameAr }),
      });
      const data = await resp.json() as { message?: string; error?: string };
      if (!resp.ok) throw new Error(data.error ?? (isAr ? 'تعذر تنفيذ العملية' : 'The operation could not be completed'));
      onWiped(isAr ? 'تم تصفير بيانات الوكالة' : 'Agency data was reset');
      onClose();
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? (isAr ? 'تعذر الاتصال بالخادم' : 'Could not connect to the server'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-slate-900 border border-red-800/60 rounded-2xl w-full max-w-md shadow-2xl">

        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-red-900/50 flex items-center justify-center flex-shrink-0">
            <TriangleAlert size={20} className="text-red-400" />
          </div>
          <div>
            <p className="font-bold text-white">{isAr ? 'تصفير بيانات الوكالة' : 'Reset agency data'}</p>
            <p className="text-xs text-slate-400">{isAr ? 'هذا الإجراء لا يمكن التراجع عنه' : 'This action cannot be undone'}</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4 text-sm text-red-300 space-y-1">
            <p>{isAr ? 'سيتم حذف جميع بيانات الوكالة التشغيلية:' : 'All operational agency data will be deleted:'}</p>
            <p className="text-xs text-red-400 leading-relaxed">
              {isAr
                ? 'الفواتير · الحجوزات · العملاء · الدفعات · القيود المحاسبية · الموردون · الموظفون · الأقسام · الحسابات البنكية · دليل الحسابات'
                : 'Invoices · bookings · customers · payments · journal entries · suppliers · employees · departments · bank accounts · chart of accounts'}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {isAr ? 'ستبقى بيانات الوكالة الأساسية والمستخدمون وإعدادات النظام.' : 'Agency profile, users, and system settings will remain.'}
            </p>
          </div>

          <div className="bg-slate-800 rounded-xl p-3 text-sm">
            <p className="text-slate-400 text-xs mb-0.5">{isAr ? 'الوكالة المستهدفة' : 'Target agency'}</p>
            <p className="font-bold text-white">{isAr ? agency.nameAr : (agency.nameEn || agency.nameAr)}</p>
            <p className="text-xs text-slate-500 mt-0.5">{agency.contactEmail}</p>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              {isAr ? 'اكتب اسم الوكالة بالعربية للتأكيد:' : 'Enter the agency’s Arabic name to confirm:'}
              <span className="text-white font-semibold"> {agency.nameAr}</span>
            </label>
            <input
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder={isAr ? 'اكتب الاسم هنا…' : 'Enter the name here…'}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-600"
              dir={isAr ? 'rtl' : 'ltr'}
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-sm font-medium text-slate-300 transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={handleWipe}
            disabled={!confirmed || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-30 rounded-xl text-sm font-bold text-white transition-colors"
          >
            {loading ? <Spinner size="sm" /> : <Trash2 size={14} />}
            {isAr ? 'تصفير البيانات' : 'Reset data'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Features Modal ───────────────────────────────────────────────────────────

interface FeatureRow {
  featureKey:   string;
  group:        string;
  overrideType: string | null;
  enabledBy:    string | null;
  notes:        string | null;
}

const GROUP_META: Record<string, { ar: string; en: string; color: string }> = {
  core:       { ar: 'أساسي',           en: 'Core', color: 'text-slate-300' },
  operations: { ar: 'التشغيل',         en: 'Operations', color: 'text-sky-400' },
  finance:    { ar: 'المالية',          en: 'Finance', color: 'text-emerald-400' },
  hr:         { ar: 'الموارد البشرية', en: 'Human resources', color: 'text-violet-400' },
};

function FeaturesModal({
  agency,
  onClose,
  getIdToken: getToken,
}: {
  agency:     AgencyRow;
  onClose:    () => void;
  getIdToken: () => Promise<string>;
}) {
  const isAr = useLocale() === 'ar';
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const resp  = await fetch(`/api/admin/agencies/${agency.id}/features`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json() as { features?: FeatureRow[]; error?: string };
      if (!resp.ok) throw new Error(data.error ?? (isAr ? 'تعذر تحميل الميزات' : 'Could not load features'));
      setFeatures(data.features ?? []);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? (isAr ? 'تعذر تحميل البيانات' : 'Could not load data'));
    } finally {
      setLoading(false);
    }
  }, [agency.id, getToken, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function toggleFeature(featureKey: string, currentType: string | null) {
    setApplying(true);
    setError('');
    try {
      const token        = await getToken();
      const overrideType = currentType === 'revoke' ? 'remove' : 'revoke';
      const resp = await fetch(`/api/admin/agencies/${agency.id}/features`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ featureKey, overrideType }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? (isAr ? `تعذر تنفيذ العملية (${resp.status})` : `Request failed (${resp.status})`));
      }
      await load();
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? (isAr ? 'تعذر تغيير الميزة' : 'Could not update the feature'));
    }
    setApplying(false);
  }

  async function bulkAction(action: 'enable_all' | 'disable_group' | 'enable_group', group?: string) {
    setApplying(true);
    setError('');
    try {
      const token = await getToken();
      const resp = await fetch(`/api/admin/agencies/${agency.id}/features`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ action, group }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? (isAr ? `تعذر تنفيذ العملية (${resp.status})` : `Request failed (${resp.status})`));
      }
      await load();
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? (isAr ? 'تعذر تنفيذ الإجراء' : 'Could not complete the action'));
    }
    setApplying(false);
  }

  const revokedCount = features.filter(f => f.overrideType === 'revoke').length;

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="font-bold text-white text-sm">{isAr ? agency.nameAr : (agency.nameEn || agency.nameAr)}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isAr ? 'إدارة الميزات' : 'Feature management'} —{' '}
              {revokedCount === 0
                ? <span className="text-emerald-400">{isAr ? 'كل الميزات مفعّلة' : 'All features are enabled'}</span>
                : <span className="text-red-400">{isAr ? `${revokedCount} ميزة معطّلة` : `${revokedCount} disabled features`}</span>
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Global actions */}
        <div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-2 bg-slate-800/40 flex-wrap">
          <span className="text-[11px] text-slate-500 font-medium me-1">{isAr ? 'إجراءات سريعة:' : 'Quick actions:'}</span>
          <button
            onClick={() => void bulkAction('enable_all')}
            disabled={applying || loading || revokedCount === 0}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors disabled:opacity-40"
          >
            {isAr ? 'تفعيل جميع الميزات' : 'Enable all features'}
          </button>
          {applying && <Spinner size="sm" />}
        </div>

        {/* Feature groups */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</div>
          )}
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            FEATURE_GROUPS.map(group => {
              const items      = features.filter(f => f.group === group.key);
              const meta       = GROUP_META[group.key] ?? { ar: group.key, en: group.key, color: 'text-slate-400' };
              const allRevoked  = items.length > 0 && items.every(f => f.overrideType === 'revoke');
              const noneRevoked = items.every(f => !f.overrideType);

              return (
                <div key={group.key}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={cn('text-[11px] font-bold uppercase tracking-widest', meta.color)}>
                      {isAr ? meta.ar : meta.en} ({items.length})
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => void bulkAction('enable_group', group.key)}
                        disabled={applying || noneRevoked}
                        className="px-2 py-1 rounded text-[10px] bg-emerald-900/40 hover:bg-emerald-700 text-emerald-400 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        {isAr ? 'تفعيل المجموعة' : 'Enable group'}
                      </button>
                      <button
                        onClick={() => void bulkAction('disable_group', group.key)}
                        disabled={applying || allRevoked}
                        className="px-2 py-1 rounded text-[10px] bg-red-900/30 hover:bg-red-700 text-red-400 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        {isAr ? 'تعطيل المجموعة' : 'Disable group'}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {items.map(f => {
                      const label    = FEATURE_LABEL[f.featureKey as FeatureKey];
                      const isRevoked = f.overrideType === 'revoke';
                      return (
                        <div
                          key={f.featureKey}
                          className={cn(
                            'flex items-center justify-between rounded-xl px-3 py-2',
                            isRevoked ? 'bg-red-900/20 border border-red-800/30' : 'bg-slate-800/60',
                          )}
                        >
                          <span className={cn('text-[13px]', isRevoked ? 'text-red-300 line-through' : 'text-slate-200')}>
                            {(isAr ? label?.ar : label?.en) ?? f.featureKey}
                          </span>
                          <button
                            onClick={() => void toggleFeature(f.featureKey, f.overrideType)}
                            disabled={applying}
                            className={cn(
                              'px-3 py-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40',
                              isRevoked
                                ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                                : 'bg-red-900/50 hover:bg-red-700 text-red-400 hover:text-white',
                            )}
                          >
                            {isRevoked ? (isAr ? 'تفعيل' : 'Enable') : (isAr ? 'تعطيل' : 'Disable')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const cfg: Record<string, { ar: string; en: string; className: string; icon: React.ReactNode }> = {
    trial:     { ar: 'تجريبي', en: 'Trial', className: 'bg-blue-100 text-blue-700', icon: <Clock size={11} /> },
    active:    { ar: 'نشط', en: 'Active', className: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={11} /> },
    lifetime:  { ar: 'دائم', en: 'Lifetime', className: 'bg-amber-100 text-amber-700', icon: <CheckCircle2 size={11} /> },
    suspended: { ar: 'موقوف', en: 'Suspended', className: 'bg-orange-100 text-orange-700', icon: <Ban size={11} /> },
    expired:   { ar: 'منتهي', en: 'Expired', className: 'bg-red-100 text-red-700', icon: <TimerOff size={11} /> },
    past_due:  { ar: 'متأخر', en: 'Past due', className: 'bg-red-100 text-red-700', icon: <AlertTriangle size={11} /> },
    cancelled: { ar: 'ملغي', en: 'Cancelled', className: 'bg-slate-100 text-slate-500', icon: <XCircle size={11} /> },
  };
  const c = cfg[status] ?? cfg['trial']!;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', c.className)}>
      {c.icon}{isAr ? c.ar : c.en}
    </span>
  );
}

function formatDate(iso: string | null, isAr: boolean): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

async function getIdToken(): Promise<string> {
  const { getApp } = await import('@masarat/firebase');
  return getAuth(getApp()).currentUser?.getIdToken() ?? '';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { user, loading: authLoading } = useAuth();

  const [agencies,       setAgencies]      = useState<AgencyRow[]>([]);
  const [loading,        setLoading]       = useState(true);
  const [error,          setError]         = useState('');
  const [toastMsg,       setToastMsg]      = useState('');
  const [acting,         setActing]        = useState<string | null>(null);
  const [wipeTarget,     setWipeTarget]    = useState<AgencyRow | null>(null);
  const [featuresTarget, setFeaturesTarget] = useState<AgencyRow | null>(null);
  const [maxUsersEdits,  setMaxUsersEdits] = useState<Record<string, string>>({});

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  // ── Load agencies ──────────────────────────────────────────────────────────

  const loadAgencies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getIdToken();
      const resp  = await fetch('/api/admin/agencies', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json() as { agencies?: AgencyRow[]; error?: string };
      if (!resp.ok) throw new Error(data.error ?? (isAr ? 'تعذر تحميل الوكالات' : 'Could not load agencies'));
      setAgencies(data.agencies ?? []);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? (isAr ? 'تعذر تحميل البيانات' : 'Could not load data'));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => {
    if (!authLoading && isSuperAdmin) void loadAgencies();
    if (!authLoading && !isSuperAdmin) setLoading(false);
  }, [authLoading, isSuperAdmin, loadAgencies]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  }

  async function doAction(agencyId: string, action: AdminAction, value?: number) {
    setActing(agencyId + action);
    try {
      const token = await getIdToken();
      const resp  = await fetch('/api/admin/action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ agencyId, action, value }),
      });
      const data = await resp.json() as { message?: string; error?: string };
      if (!resp.ok) throw new Error(data.error ?? (isAr ? 'تعذر تنفيذ الإجراء' : 'Could not complete the action'));
      showToast(isAr ? 'تم تنفيذ الإجراء' : 'Action completed');
      await loadAgencies();
    } catch (err: unknown) {
      showToast((isAr ? 'خطأ: ' : 'Error: ') + ((err as { message?: string }).message ?? (isAr ? 'غير معروف' : 'Unknown')));
    } finally {
      setActing(null);
    }
  }

  async function handleSetMaxUsers(agencyId: string) {
    const val = parseInt(maxUsersEdits[agencyId] ?? '', 10);
    if (!val || val < 1 || val > 9999) {
      showToast(isAr ? 'قيمة غير صالحة (1–9999)' : 'Invalid value (1–9999)');
      return;
    }
    await doAction(agencyId, 'set_max_users', val);
    setMaxUsersEdits(prev => ({ ...prev, [agencyId]: '' }));
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-slate-400">{isAr ? 'يجب تسجيل الدخول أولاً' : 'Please sign in first'}</p>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 flex-col gap-3">
        <XCircle size={48} className="text-red-500" />
        <p className="text-slate-300 font-bold text-lg">403 — {isAr ? 'ممنوع الوصول' : 'Access denied'}</p>
        <p className="text-slate-500 text-sm">{isAr ? 'هذه الصفحة مخصصة لإدارة النظام' : 'This page is restricted to system administrators'}</p>
      </div>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Wipe Modal */}
      {wipeTarget && (
        <WipeModal
          agency={wipeTarget}
          onClose={() => setWipeTarget(null)}
          onWiped={msg => { showToast(msg); void loadAgencies(); }}
          getIdToken={getIdToken}
        />
      )}

      {/* Features Modal */}
      {featuresTarget && (
        <FeaturesModal
          agency={featuresTarget}
          onClose={() => setFeaturesTarget(null)}
          getIdToken={getIdToken}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-50 bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold">{isAr ? 'لوحة إدارة النظام' : 'System administration'}</h1>
            <p className="text-xs text-slate-500">{isAr ? 'الإدارة العامة — مسارات' : 'Masarat — Super administration'}</p>
          </div>
        </div>
        <button
          onClick={loadAgencies}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm transition-colors"
        >
          <RefreshCw size={14} />
          {isAr ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {[
          { label: isAr ? 'الإجمالي' : 'Total', value: agencies.length, color: 'text-white' },
          { label: isAr ? 'تجريبية' : 'Trial', value: agencies.filter(a => a.subscriptionStatus === 'trial').length, color: 'text-blue-400' },
          { label: isAr ? 'نشطة' : 'Active', value: agencies.filter(a => a.subscriptionStatus === 'active').length, color: 'text-emerald-400' },
          { label: isAr ? 'دائمة' : 'Lifetime', value: agencies.filter(a => a.subscriptionStatus === 'lifetime').length, color: 'text-amber-400' },
          { label: isAr ? 'موقوفة' : 'Suspended', value: agencies.filter(a => a.subscriptionStatus === 'suspended').length, color: 'text-orange-400' },
          { label: isAr ? 'منتهية' : 'Expired', value: agencies.filter(a => ['expired','past_due','cancelled'].includes(a.subscriptionStatus)).length, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-700">
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={cn('text-2xl font-black tabular-nums', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 mb-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Agencies list */}
      {agencies.length === 0 ? (
        <div className="text-center py-20 text-slate-600">
          <Building2 size={40} className="mx-auto mb-3" />
          <p>{isAr ? 'لا توجد وكالات مسجلة بعد' : 'No agencies have been registered yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agencies.map(agency => {
            const endDate = agency.isLifetime
              ? null
              : agency.subscriptionStatus === 'trial'
                ? agency.trialEndDate
                : agency.subscriptionEndDate;
            const days          = daysLeft(endDate);
            const isActingThis  = acting?.startsWith(agency.id);
            const seatsLeft     = agency.maxUsers - agency.userCount;

            return (
              <div
                key={agency.id}
                className="bg-slate-800 border border-slate-700 rounded-2xl p-4 hover:border-slate-600 transition-colors"
              >
                <div className="flex flex-col gap-4">

                  {/* Top row: name + badges + metadata */}
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-white">{isAr ? agency.nameAr : (agency.nameEn || agency.nameAr)}</p>
                        <StatusBadge status={agency.subscriptionStatus} isAr={isAr} />
                        {!agency.isActive && (
                          <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full">{isAr ? 'معطّلة' : 'Disabled'}</span>
                        )}
                        {agency.isVatRegistered && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-teal-900/40 text-teal-400 px-2 py-0.5 rounded-full">
                            <BadgeCheck size={10} />ZATCA
                          </span>
                        )}
                        {agency.providerCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-sky-900/40 text-sky-400 px-2 py-0.5 rounded-full">
                            <Globe size={10} />GDS
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5" dir="ltr">{agency.contactEmail}</p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                        {/* Users */}
                        <span className="flex items-center gap-1">
                          <Users size={11} />
                          <span className={seatsLeft <= 0 ? 'text-red-400 font-semibold' : ''}>
                            {agency.userCount}/{agency.maxUsers} {isAr ? 'مستخدم' : 'users'}
                            {seatsLeft > 0
                              ? <span className="text-slate-600"> ({isAr ? `${seatsLeft} متبقي` : `${seatsLeft} remaining`})</span>
                              : <span className="text-red-400"> ({isAr ? 'ممتلئ' : 'Full'})</span>
                            }
                          </span>
                        </span>

                        {/* Subscription dates */}
                        {agency.isLifetime ? (
                          <span className="flex items-center gap-1 text-amber-400 font-semibold">
                            {isAr ? 'اشتراك دائم · بلا تاريخ انتهاء' : 'Lifetime subscription · no expiry date'}
                          </span>
                        ) : endDate && days !== null ? (
                          <span className={cn(
                            'flex items-center gap-1',
                            days < 0 ? 'text-red-400' : days <= 3 ? 'text-amber-400' : 'text-slate-400',
                          )}>
                            <CalendarDays size={11} />
                            {days < 0
                              ? (isAr ? `انتهى منذ ${Math.abs(days)} يوم` : `Expired ${Math.abs(days)} days ago`)
                              : (isAr ? `ينتهي بعد ${days} يوم` : `Expires in ${days} days`)}
                            {' '}({formatDate(endDate, isAr)})
                          </span>
                        ) : null}

                        {/* Created */}
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatDate(agency.createdAt, isAr)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="flex flex-wrap gap-2">

                    {/* Subscription actions */}
                    <button
                      onClick={() => doAction(agency.id, 'activate_month')}
                      disabled={!!acting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isActingThis && acting?.endsWith('activate_month') ? <Spinner size="sm" /> : <CalendarCheck size={13} />}
                      {isAr ? 'شهر' : 'One month'}
                    </button>

                    <button
                      onClick={() => doAction(agency.id, 'activate_year')}
                      disabled={!!acting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isActingThis && acting?.endsWith('activate_year') ? <Spinner size="sm" /> : <Zap size={13} />}
                      {isAr ? 'سنة' : 'One year'}
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(isAr ? `تفعيل الاشتراك الدائم لـ "${agency.nameAr}"؟` : `Activate a lifetime subscription for "${agency.nameEn || agency.nameAr}"?`)) {
                          void doAction(agency.id, 'activate_lifetime');
                        }
                      }}
                      disabled={!!acting || agency.isLifetime}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isActingThis && acting?.endsWith('activate_lifetime') ? <Spinner size="sm" /> : '♾'}
                      {isAr ? 'دائم' : 'Lifetime'}
                    </button>

                    <button
                      onClick={() => doAction(agency.id, 'extend_trial')}
                      disabled={!!acting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isActingThis && acting?.endsWith('extend_trial') ? <Spinner size="sm" /> : <Clock size={13} />}
                      {isAr ? 'تمديد تجريبي' : 'Extend trial'}
                    </button>

                    <button
                      onClick={() => doAction(agency.id, 'reactivate')}
                      disabled={!!acting || agency.subscriptionStatus === 'active' || agency.isLifetime}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-600 disabled:opacity-30 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isActingThis && acting?.endsWith('reactivate') ? <Spinner size="sm" /> : <RotateCcw size={13} />}
                      {isAr ? 'إعادة تفعيل' : 'Reactivate'}
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(isAr ? `تعيين اشتراك "${agency.nameAr}" كمنتهٍ؟` : `Mark "${agency.nameEn || agency.nameAr}" subscription as expired?`)) {
                          void doAction(agency.id, 'expire');
                        }
                      }}
                      disabled={!!acting || agency.subscriptionStatus === 'expired'}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-xs font-semibold text-slate-300 transition-colors"
                    >
                      {isActingThis && acting?.endsWith('expire') ? <Spinner size="sm" /> : <TimerOff size={13} />}
                      {isAr ? 'إنهاء' : 'Expire'}
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(isAr ? `إيقاف وكالة "${agency.nameAr}"؟` : `Suspend "${agency.nameEn || agency.nameAr}"?`)) {
                          void doAction(agency.id, 'suspend');
                        }
                      }}
                      disabled={!!acting || agency.subscriptionStatus === 'suspended'}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/50 hover:bg-red-800 disabled:opacity-30 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                    >
                      {isActingThis && acting?.endsWith('suspend') ? <Spinner size="sm" /> : <Ban size={13} />}
                      {isAr ? 'إيقاف' : 'Suspend'}
                    </button>

                    {/* Features */}
                    <button
                      onClick={() => setFeaturesTarget(agency)}
                      disabled={!!acting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-brand-700 disabled:opacity-30 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                    >
                      <Sliders size={13} />
                      {isAr ? 'الميزات' : 'Features'}
                    </button>

                    {/* Wipe — trial only */}
                    {agency.subscriptionStatus === 'trial' && (
                      <button
                        onClick={() => setWipeTarget(agency)}
                        disabled={!!acting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-red-900/60 border border-slate-700 hover:border-red-700 disabled:opacity-30 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                        {isAr ? 'تصفير' : 'Reset'}
                      </button>
                    )}
                  </div>

                  {/* Max-users inline editor */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
                    <UserPlus size={13} className="text-slate-500 flex-shrink-0" />
                    <span className="text-[11px] text-slate-500">{isAr ? 'الحد الأقصى للمستخدمين:' : 'Maximum users:'}</span>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={maxUsersEdits[agency.id] ?? ''}
                      placeholder={String(agency.maxUsers)}
                      onChange={e => setMaxUsersEdits(prev => ({ ...prev, [agency.id]: e.target.value }))}
                      className="w-20 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 tabular-nums"
                    />
                    <button
                      onClick={() => void handleSetMaxUsers(agency.id)}
                      disabled={!!acting || !maxUsersEdits[agency.id]}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-[11px] font-semibold text-slate-300 transition-colors"
                    >
                      {isActingThis && acting?.endsWith('set_max_users') ? <Spinner size="sm" /> : (isAr ? 'تعيين' : 'Set')}
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-slate-700 mt-8">
        {isAr ? `لوحة إدارة مسارات · ${agencies.length} وكالة مسجلة` : `Masarat administration · ${agencies.length} registered agencies`}
      </p>
    </div>
  );
}
