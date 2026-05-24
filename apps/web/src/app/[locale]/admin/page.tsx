'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import {
  ShieldCheck, Building2, Users, RefreshCw,
  CheckCircle2, XCircle, Clock, AlertTriangle,
  CalendarCheck, CalendarDays, Ban, Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

const SUPER_ADMIN_EMAIL = 'mohamedabdalazim1111@gmail.com';

interface AgencyRow {
  id:                  string;
  nameAr:              string;
  nameEn:              string;
  contactEmail:        string;
  subscriptionStatus:  string;
  plan:                string;
  trialEndDate:        string | null;
  subscriptionEndDate: string | null;
  createdAt:           string | null;
  isActive:            boolean;
  userCount:           number;
}

type AdminAction = 'activate_month' | 'activate_year' | 'suspend' | 'extend_trial';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    trial:    { label: 'تجريبي',  className: 'bg-blue-100   text-blue-700',   icon: <Clock size={11} /> },
    active:   { label: 'نشط',     className: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={11} /> },
    past_due: { label: 'متأخر',   className: 'bg-red-100    text-red-700',    icon: <AlertTriangle size={11} /> },
    cancelled:{ label: 'ملغي',    className: 'bg-slate-100  text-slate-500',  icon: <XCircle size={11} /> },
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const locale = useLocale();
  const isAr   = locale === 'ar';
  const { user, loading: authLoading } = useAuth();

  const [agencies,  setAgencies]  = useState<AgencyRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [toastMsg,  setToastMsg]  = useState('');
  const [acting,    setActing]    = useState<string | null>(null); // agencyId being updated

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  // ── Load agencies ──────────────────────────────────────────────────────────

  const loadAgencies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp }                      = await import('@masarat/firebase');
      const fn = httpsCallable<Record<string, never>, { agencies: AgencyRow[] }>(
        getFunctions(getApp(), 'me-central2'),
        'adminListAgencies'
      );
      const result = await fn({});
      setAgencies(result.data.agencies);
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
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp }                      = await import('@masarat/firebase');
      const fn = httpsCallable<{ agencyId: string; action: AdminAction }, { message: string }>(
        getFunctions(getApp(), 'me-central2'),
        'adminUpdateSubscription'
      );
      const result = await fn({ agencyId, action });
      setToastMsg(result.data.message);
      setTimeout(() => setToastMsg(''), 3000);
      await loadAgencies(); // refresh
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6" dir="rtl">

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
            const endDate = agency.subscriptionStatus === 'trial'
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
                      {endDate && days !== null && (
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
                      )}
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
