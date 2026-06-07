'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { MasaratLogo } from '@/components/ui/MasaratLogo';
import {
  Calculator, ReceiptText, Plane, Coins, Users, Landmark,
  ArrowLeft, CheckCircle2, Clock, ShieldCheck,
} from 'lucide-react';

export default function LandingPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, loading } = useAuth();

  // Logged-in users skip the marketing page and go straight to their dashboard
  // (preserves the behaviour of the old /[locale] redirect page that this replaced).
  useEffect(() => {
    if (!loading && user) router.replace(`/${locale}/dashboard`);
  }, [loading, user, locale, router]);

  const isAr   = locale === 'ar';
  const other  = isAr ? 'en' : 'ar';
  const L = (ar: string, en: string) => (isAr ? ar : en);

  // ── Features that ACTUALLY exist in the system today ──────────────────────────
  const features = [
    {
      icon: Calculator,
      title: L('محاسبة كاملة', 'Full accounting'),
      desc:  L('قيد مزدوج، دليل حسابات، و8 تقارير مالية: قائمة الدخل، الميزانية، التدفقات النقدية، ميزان المراجعة، وأعمار الذمم.',
               'Double-entry, chart of accounts, and 8 financial reports: P&L, balance sheet, cash flow, trial balance, and aging.'),
    },
    {
      icon: ReceiptText,
      title: L('الضريبة وفاتورة ZATCA', 'VAT & ZATCA invoice'),
      desc:  L('احتساب ضريبة القيمة المضافة (15%)، إقرار ضريبي، ورمز QR متوافق مع هيئة الزكاة والضريبة (المرحلة الأولى).',
               '15% VAT, a VAT-return report, and a ZATCA-compliant QR code (Phase 1) on every invoice.'),
    },
    {
      icon: Plane,
      title: L('عمليات السفر', 'Travel operations'),
      desc:  L('حجوزات، عروض أسعار، وتذاكر (إصدار، إلغاء، استرداد، استبدال) مع ربط سجلات PNR.',
               'Bookings, quotes, and tickets (issue, void, refund, exchange) with PNR linkage.'),
    },
    {
      icon: Coins,
      title: L('تعدد العملات', 'Multi-currency'),
      desc:  L('حسابات وأرصدة بعملات أجنبية مع أسعار صرف وإعادة تقييم محاسبي للفروق.',
               'Foreign-currency accounts and balances with exchange rates and accounting revaluation.'),
    },
    {
      icon: Users,
      title: L('أدوار وصلاحيات', 'Roles & permissions'),
      desc:  L('فرق متعددة بصلاحيات دقيقة: مالك، مدير، محاسب، موظف — وواجهة ثنائية اللغة (عربي/إنجليزي).',
               'Multiple teams with granular roles: owner, manager, accountant, staff — and a bilingual UI (Arabic/English).'),
    },
    {
      icon: Landmark,
      title: L('الخزينة والموارد البشرية', 'Treasury & HR'),
      desc:  L('بنوك وشيكات وخزينة، ورواتب مع GOSI ومكافأة نهاية الخدمة والإجازات والحضور.',
               'Banks, cheques and treasury, plus payroll with GOSI, end-of-service, leave and attendance.'),
    },
  ];

  const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors';
  const btnGhost   = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors';

  return (
    <div className="min-h-screen bg-surface-muted text-slate-900">
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <a href={`/${locale}`} className="flex items-center gap-2.5 group">
            <MasaratLogo size={48} variant="full" />
            <span className="text-lg font-bold text-slate-900 group-hover:text-brand-700 transition-colors hidden sm:block">
              {L('مسارات', 'Masarat')}
            </span>
          </a>
          <nav className="flex items-center gap-2 sm:gap-3">
            <a href={`/${other}`} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
              {L('English', 'عربي')}
            </a>
            <a href={`/${locale}/login`} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">
              {L('تسجيل الدخول', 'Sign in')}
            </a>
            <a href={`/${locale}/register`} className={btnPrimary + ' !px-4 !py-2'}>
              {L('ابدأ مجاناً', 'Start free')}
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-xs font-medium text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {L('تجربة مجانية 14 يوماً — بدون بطاقة ائتمان', '14-day free trial — no credit card')}
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
            {L('نظام إدارة وكالات السفر المتكامل', 'The integrated travel-agency management system')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            {L('أدِر الحجوزات والتذاكر والفواتير والمحاسبة والموارد البشرية لوكالتك من منصّة واحدة — وفق مبادئ المحاسبة الدولية (IFRS) وضريبة القيمة المضافة السعودية.',
               'Run your agency’s bookings, tickets, invoices, accounting and HR from one platform — aligned with IFRS principles and Saudi VAT.')}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={`/${locale}/register`} className={btnPrimary}>
              {L('ابدأ مجاناً', 'Start free')}
              <ArrowLeft size={16} className={isAr ? '' : 'rotate-180'} />
            </a>
            <a href={`/${locale}/login`} className={btnGhost}>
              {L('تسجيل الدخول', 'Sign in')}
            </a>
          </div>
        </div>
      </section>

      {/* ── Features (what exists today) ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon size={22} />
                </div>
                <h3 className="text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Coming soon (honest about what is NOT yet wired) ────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Clock size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  {L('قيد التطوير — قريباً', 'Under development — coming soon')}
                </h3>
                <span className="rounded-full bg-amber-200/70 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  {L('قريباً', 'Soon')}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {L('تكامل ZATCA المرحلة الثانية: الربط المباشر والإبلاغ اللحظي للفواتير الإلكترونية مع هيئة الزكاة والضريبة والجمارك. الأساس التقني (التوقيع والشهادات) جاهز، وربط الإبلاغ التلقائي قيد التطوير.',
                   'ZATCA Phase 2 integration: live clearance/reporting of e-invoices with ZATCA. The cryptographic foundation (signing & certificates) is in place; automatic per-invoice reporting is under development.')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust strip ─────────────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 text-sm text-slate-600 sm:px-6">
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" />{L('محاسبة وفق IFRS', 'IFRS-aligned accounting')}</span>
          <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-brand-600" />{L('ضريبة القيمة المضافة 15%', '15% VAT support')}</span>
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" />{L('رمز ZATCA QR (المرحلة 1)', 'ZATCA QR (Phase 1)')}</span>
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" />{L('عربي / English', 'Arabic / English')}</span>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="mx-auto max-w-6xl px-4 py-10 text-center sm:px-6">
        <div className="flex justify-center"><MasaratLogo size={36} variant="full" /></div>
        <p className="mt-4 text-xs text-slate-400">
          {L('نظام مسارات © 2026 — جميع الحقوق محفوظة', 'Masarat ERP © 2026 — All rights reserved')}
        </p>
      </footer>
    </div>
  );
}
