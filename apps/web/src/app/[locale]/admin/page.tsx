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
  CalendarCheck, CalendarDays, Ban, Zap, Infinity,
  Trash2, TriangleAlert, Sliders, X,
} from 'lucide-react';
import { FEATURE_LABEL, FEATURE_MIN_RANK, type FeatureKey } from '@/lib/plan-features';

// ─── Types ────────────────────────────────────────────────────────────────────

const SUPER_ADMIN_EMAIL = process.env['NEXT_PUBLIC_SUPER_ADMIN_EMAIL'] ?? '';

interface AgencyRow {
  id:                  string;
  nameAr:              string;
  nameEn:              string;
  contactEmail:        string;
  subscriptionStatus:  string;
  plan:                string;
  isLifetime:          boolean;
  trialEndDate:        string | null;
  subscriptionEndDate: string | null;
  createdAt:           string | null;
  isActive:            boolean;
  userCount:           number;
}

type AdminAction = 'activate_month' | 'activate_year' | 'activate_lifetime' | 'suspend' | 'extend_trial';

// ─── Wipe Modal ───────────────────────────────────────────────────────────────

function WipeModal({
  agency,
  onClose,
  onWiped,
  getIdToken,
}: {
  agency: AgencyRow;
  onClose: () => void;
  onWiped: (msg: string) => void;
  getIdToken: () => Promise<string>;
}) {
  const [inputVal, setInputVal]   = useState('');
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState('');

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
      if (!resp.ok) throw new Error(data.error ?? 'خطأ');
      onWiped(data.message ?? 'تم التصفير');
      onClose();
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'خطأ في الخادم');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-red-800/60 rounded-2xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-red-900/50 flex items-center justify-center flex-shrink-0">
            <TriangleAlert size={20} className="text-red-400" />
          </div>
          <div>
            <p className="font-bold text-white">تصفير بيانات الوكالة</p>
            <p className="text-xs text-slate-400">هذا الإجراء لا يمكن التراجع عنه</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4 text-sm text-red-300 space-y-1">
            <p>سيتم حذف جميع بيانات الوكالة التشغيلية:</p>
            <p className="text-xs text-red-400 leading-relaxed">
              الفواتير · الحجوزات · العملاء · الدفعات · القيود المحاسبية · الموردين · الموظفين · الأقسام · الحسابات البنكية · دليل الحسابات
            </p>
            <p className="text-xs text-slate-400 mt-2">
              تبقى: بيانات الوكالة الأساسية + المستخدمين + إعدادات النظام
            </p>
          </div>

          <div className="bg-slate-800 rounded-xl p-3 text-sm">
            <p className="text-slate-400 text-xs mb-0.5">الوكالة المستهدفة</p>
            <p className="font-bold text-white">{agency.nameAr}</p>
            <p className="text-xs text-slate-500 mt-0.5">{agency.contactEmail}</p>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              اكتب اسم الوكالة للتأكيد:
              <span className="text-white font-semibold"> {agency.nameAr}</span>
            </label>
            <input
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder="اكتب الاسم هنا…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-600"
              dir="rtl"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-sm font-medium text-slate-300 transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleWipe}
            disabled={!confirmed || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-30 rounded-xl text-sm font-bold text-white transition-colors"
          >
            {loading ? <Spinner size="sm" /> : <Trash2 size={14} />}
            تصفير البيانات
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Features Modal ───────────────────────────────────────────────────────────

interface FeatureRow {
  featureKey:   string;
  minRank:      number;
  overrideType: 'grant' | 'revoke' | null;
  enabledBy:    string | null;
  notes:        string | null;
}

function FeaturesModal({
  agency,
  onClose,
  getIdToken: getToken,
}: {
  agency:      AgencyRow;
  onClose:     () => void;
  getIdToken:  () => Promise<string>;
}) {
  const [features,  setFeatures]  = useState<FeatureRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [applying,  setApplying]  = useState(false);
  const [error,     setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const resp  = await fetch(`/api/admin/agencies/${agency.id}/features`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json() as { features?: FeatureRow[]; error?: string };
      if (!resp.ok) throw new Error(data.error ?? 'خطأ');
      setFeatures(data.features ?? []);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  }, [agency.id, getToken]);

  useEffect(() => { void load(); }, [load]);

  async function setOverride(featureKey: string, overrideType: 'grant' | 'revoke' | 'remove') {
    try {
      const token = await getToken();
      await fetch(`/api/admin/agencies/${agency.id}/features`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ featureKey, overrideType }),
      });
      await load();
    } catch { /* silent */ }
  }

  async function applyTemplate(packageKey: string) {
    if (!confirm(`تطبيق باقة "${packageKey === 'operations' ? 'التشغيل' : packageKey === 'business' ? 'الأعمال' : 'المؤسسات'}" على "${agency.nameAr}"؟\nسيتم حذف جميع الإعدادات الحالية.`)) return;
    setApplying(true);
    try {
      const token = await getToken();
      await fetch(`/api/admin/agencies/${agency.id}/features`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ packageKey }),
      });
      await load();
    } catch { /* silent */ }
    setApplying(false);
  }

  const TIER_LABELS: Record<number, string> = { 0: 'أساسي', 1: 'التشغيل', 2: 'الأعمال', 3: 'المؤسسات' };
  const TIER_COLORS: Record<number, string> = {
    0: 'text-slate-400',
    1: 'text-sky-400',
    2: 'text-violet-400',
    3: 'text-amber-400',
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="font-bold text-white text-sm">{agency.nameAr}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">إدارة ميزات الوكالة — تجاوز الخطة</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Package template buttons */}
        <div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-2 flex-wrap bg-slate-800/40">
          <span className="text-[11px] text-slate-500 font-medium me-1">تطبيق باقة:</span>
          {(['operations', 'business', 'enterprise'] as const).map(pkg => (
            <button
              key={pkg}
              onClick={() => void applyTemplate(pkg)}
              disabled={applying || loading}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40',
                pkg === 'operations' ? 'bg-sky-700 hover:bg-sky-600 text-white'
                  : pkg === 'business'   ? 'bg-violet-700 hover:bg-violet-600 text-white'
                  : 'bg-amber-700 hover:bg-amber-600 text-white',
              )}
            >
              {pkg === 'operations' ? 'التشغيل (499)' : pkg === 'business' ? 'الأعمال (990)' : 'المؤسسات (1990)'}
            </button>
          ))}
          {applying && <Spinner size="sm" />}
        </div>

        {/* Feature rows */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</div>
          )}
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            <div className="space-y-5">
              {([0, 1, 2, 3] as const).map(rank => {
                const items = features.filter(f => f.minRank === rank);
                if (items.length === 0) return null;
                return (
                  <div key={rank}>
                    <p className={cn('text-[11px] font-bold uppercase tracking-widest mb-2', TIER_COLORS[rank])}>
                      {TIER_LABELS[rank]}
                    </p>
                    <div className="space-y-1">
                      {items.map(f => {
                        const label = FEATURE_LABEL[f.featureKey as FeatureKey];
                        return (
                          <div key={f.featureKey} className="flex items-center justify-between bg-slate-800/60 rounded-xl px-3 py-2">
                            <span className="text-[13px] text-slate-200">{label?.ar ?? f.featureKey}</span>
                            <div className="flex items-center gap-1">
                              {/* Grant */}
                              <button
                                onClick={() => void setOverride(f.featureKey, 'grant')}
                                title="منح — يتجاوز الخطة"
                                className={cn(
                                  'w-7 h-7 rounded-lg text-xs font-bold transition-colors flex items-center justify-center',
                                  f.overrideType === 'grant'
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-slate-700 text-slate-400 hover:bg-emerald-800 hover:text-emerald-200',
                                )}
                              >✓</button>
                              {/* Default (remove override) */}
                              <button
                                onClick={() => void setOverride(f.featureKey, 'remove')}
                                title="افتراضي — حسب الخطة"
                                className={cn(
                                  'w-7 h-7 rounded-lg text-xs font-bold transition-colors flex items-center justify-center',
                                  !f.overrideType
                                    ? 'bg-slate-500 text-white'
                                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600',
                                )}
                              >—</button>
                              {/* Revoke */}
                              <button
                                onClick={() => void setOverride(f.featureKey, 'revoke')}
                                title="حجب — يتجاوز الخطة"
                                className={cn(
                                  'w-7 h-7 rounded-lg text-xs font-bold transition-colors flex items-center justify-center',
                                  f.overrideType === 'revoke'
                                    ? 'bg-red-500 text-white'
                                    : 'bg-slate-700 text-slate-400 hover:bg-red-900 hover:text-red-300',
                                )}
                              >✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-5 py-3 border-t border-slate-700/50 flex gap-4 text-[11px] text-slate-500">
          <span><span className="text-emerald-400 font-bold">✓</span> منح — يعمل حتى لو لا تشمله الخطة</span>
          <span><span className="text-slate-400 font-bold">—</span> افتراضي — حسب الخطة</span>
          <span><span className="text-red-400 font-bold">✕</span> حجب — لا يعمل حتى لو تشمله الخطة</span>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    trial:    { label: 'تجريبي',   className: 'bg-blue-100   text-blue-700',   icon: <Clock size={11} /> },
    active:   { label: 'نشط',      className: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={11} /> },
    lifetime: { label: 'دائم', className: 'bg-amber-100  text-amber-700',  icon: <Infinity size={11} /> },
    past_due: { label: 'متأخر',    className: 'bg-red-100    text-red-700',    icon: <AlertTriangle size={11} /> },
    cancelled:{ label: 'ملغي',     className: 'bg-slate-100  text-slate-500',  icon: <XCircle size={11} /> },
  };
  const c = cfg[status] ?? cfg['trial'];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', c.className)}>
      {c.icon}{c.label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

async function getIdToken(): Promise<string> {
  const { getApp } = await import('@masarat/firebase');
  const currentUser = getAuth(getApp()).currentUser;
  return currentUser?.getIdToken() ?? '';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const locale = useLocale();
  const isAr   = locale === 'ar';
  const { user, loading: authLoading } = useAuth();

  const [agencies,        setAgencies]       = useState<AgencyRow[]>([]);
  const [loading,         setLoading]        = useState(true);
  const [error,           setError]          = useState('');
  const [toastMsg,        setToastMsg]       = useState('');
  const [acting,          setActing]         = useState<string | null>(null);
  const [wipeTarget,      setWipeTarget]     = useState<AgencyRow | null>(null);
  const [featuresTarget,  setFeaturesTarget] = useState<AgencyRow | null>(null);

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
      if (!resp.ok) throw new Error(data.error ?? 'خطأ');
      setAgencies(data.agencies ?? []);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isSuperAdmin) void loadAgencies();
    if (!authLoading && !isSuperAdmin) setLoading(false);
  }, [authLoading, isSuperAdmin, loadAgencies]);

  // ── Update subscription ────────────────────────────────────────────────────

  async function doAction(agencyId: string, action: AdminAction) {
    setActing(agencyId + action);
    try {
      const token = await getIdToken();
      const resp  = await fetch('/api/admin/action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ agencyId, action }),
      });
      const data = await resp.json() as { message?: string; error?: string };
      if (!resp.ok) throw new Error(data.error ?? 'خطأ');
      setToastMsg(data.message ?? 'تم');
      setTimeout(() => setToastMsg(''), 3000);
      await loadAgencies();
    } catch (err: unknown) {
      setToastMsg('خطأ: ' + ((err as { message?: string }).message ?? 'unknown'));
      setTimeout(() => setToastMsg(''), 4000);
    } finally {
      setActing(null);
    }
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
        <p className="text-slate-400">يجب تسجيل الدخول أولاً</p>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 flex-col gap-3">
        <XCircle size={48} className="text-red-500" />
        <p className="text-slate-300 font-bold text-lg">403 — ممنوع الوصول</p>
        <p className="text-slate-500 text-sm">هذه الصفحة للمطور فقط</p>
      </div>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6" dir="rtl">

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
            <h1 className="text-xl font-bold">لوحة تحكم المطور</h1>
            <p className="text-xs text-slate-500">Super Admin — مسارات ERP</p>
          </div>
        </div>
        <button
          onClick={loadAgencies}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm transition-colors"
        >
          <RefreshCw size={14} />
          تحديث
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'إجمالي الوكالات', value: agencies.length, color: 'text-white' },
          { label: 'نشطة',            value: agencies.filter(a => a.subscriptionStatus === 'active').length,   color: 'text-emerald-400' },
          { label: 'دائم',             value: agencies.filter(a => a.subscriptionStatus === 'lifetime').length, color: 'text-amber-400' },
          { label: 'تجريبية',         value: agencies.filter(a => a.subscriptionStatus === 'trial').length,    color: 'text-blue-400' },
          { label: 'متوقفة',          value: agencies.filter(a => a.subscriptionStatus === 'past_due' || a.subscriptionStatus === 'cancelled').length, color: 'text-red-400' },
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

      {/* Agencies table */}
      {agencies.length === 0 ? (
        <div className="text-center py-20 text-slate-600">
          <Building2 size={40} className="mx-auto mb-3" />
          <p>لا توجد وكالات مسجلة بعد</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agencies.map(agency => {
            const endDate = agency.isLifetime
              ? null
              : agency.subscriptionStatus === 'trial'
                ? agency.trialEndDate
                : agency.subscriptionEndDate;
            const days    = daysLeft(endDate);
            const isActingOnThis = acting?.startsWith(agency.id);

            return (
              <div
                key={agency.id}
                className="bg-slate-800 border border-slate-700 rounded-2xl p-4 hover:border-slate-600 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">

                  {/* Agency info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white">{agency.nameAr}</p>
                      <StatusBadge status={agency.subscriptionStatus} />
                      {!agency.isActive && (
                        <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full">معطّل</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5" dir="ltr">{agency.contactEmail}</p>

                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users size={11} />
                        {agency.userCount} مستخدم
                      </span>
                      {agency.isLifetime ? (
                        <span className="flex items-center gap-1 text-amber-400 font-semibold">
                          <Infinity size={11} />
                          اشتراك دائم · بلا تاريخ انتهاء
                        </span>
                      ) : endDate && days !== null ? (
                        <span className={cn(
                          'flex items-center gap-1',
                          days < 0 ? 'text-red-400' : days <= 3 ? 'text-amber-400' : 'text-slate-400',
                        )}>
                          <CalendarDays size={11} />
                          {days < 0
                            ? `انتهى منذ ${Math.abs(days)} يوم`
                            : `ينتهي بعد ${days} يوم`}
                          {' '}({formatDate(endDate)})
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatDate(agency.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 flex-shrink-0">

                    <button
                      onClick={() => doAction(agency.id, 'activate_month')}
                      disabled={!!acting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isActingOnThis && acting?.endsWith('activate_month')
                        ? <Spinner size="sm" />
                        : <CalendarCheck size={13} />}
                      شهر
                    </button>

                    <button
                      onClick={() => doAction(agency.id, 'activate_year')}
                      disabled={!!acting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isActingOnThis && acting?.endsWith('activate_year')
                        ? <Spinner size="sm" />
                        : <Zap size={13} />}
                      سنة
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`تفعيل الاشتراك الدائم لوكالة "${agency.nameAr}"؟\nالنظام سيعمل بلا انتهاء بعد التفعيل.`)) {
                          void doAction(agency.id, 'activate_lifetime');
                        }
                      }}
                      disabled={!!acting || agency.isLifetime}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isActingOnThis && acting?.endsWith('activate_lifetime')
                        ? <Spinner size="sm" />
                        : <Infinity size={13} />}
                      دائم
                    </button>

                    <button
                      onClick={() => doAction(agency.id, 'extend_trial')}
                      disabled={!!acting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isActingOnThis && acting?.endsWith('extend_trial')
                        ? <Spinner size="sm" />
                        : <Clock size={13} />}
                      تمديد 14 يوم
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`هل تريد إيقاف وكالة "${agency.nameAr}"؟`)) {
                          void doAction(agency.id, 'suspend');
                        }
                      }}
                      disabled={!!acting || agency.subscriptionStatus === 'past_due'}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/50 hover:bg-red-800 disabled:opacity-30 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                    >
                      {isActingOnThis && acting?.endsWith('suspend')
                        ? <Spinner size="sm" />
                        : <Ban size={13} />}
                      إيقاف
                    </button>

                    {/* Features override panel */}
                    <button
                      onClick={() => setFeaturesTarget(agency)}
                      disabled={!!acting}
                      title="إدارة ميزات الوكالة"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-brand-700 disabled:opacity-30 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                    >
                      <Sliders size={13} />
                      الميزات
                    </button>

                    {/* Wipe — trial only */}
                    {agency.subscriptionStatus === 'trial' && (
                      <button
                        onClick={() => setWipeTarget(agency)}
                        disabled={!!acting}
                        title="تصفير بيانات الفترة التجريبية"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-red-900/60 border border-slate-700 hover:border-red-700 disabled:opacity-30 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                        تصفير
                      </button>
                    )}

                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-slate-700 mt-8">
        مسارات ERP — Super Admin Panel · {agencies.length} وكالة مسجلة
      </p>
    </div>
  );
}
