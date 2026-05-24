'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  Building2, Mail, User, Phone, Globe, CheckCircle2,
  Copy, Check, ArrowRight,
} from 'lucide-react';

// ─── Validation ───────────────────────────────────────────────────────────────

const schema = z.object({
  agencyNameAr: z.string().min(2, 'الاسم العربي مطلوب (حرفان على الأقل)'),
  agencyNameEn: z.string().optional(),
  adminNameAr:  z.string().min(2, 'اسم المدير مطلوب'),
  adminNameEn:  z.string().optional(),
  adminEmail:   z.string().email('صيغة البريد الإلكتروني غير صحيحة'),
  adminMobile:  z.string().min(9, 'رقم الجوال مطلوب').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  const [step, setStep]           = useState<'form' | 'success'>('form');
  const [setupLink, setSetupLink] = useState('');
  const [copied, setCopied]       = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError('');
    try {
      const resp = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      });
      const data = await resp.json() as { agencyId?: string; setupLink?: string; error?: string };
      if (resp.status === 409 || data.error?.includes('مسجّل مسبقاً')) {
        setServerError(isAr
          ? 'هذا البريد الإلكتروني مسجّل مسبقاً. هل تريد تسجيل الدخول؟'
          : 'This email is already registered. Want to sign in?');
        return;
      }
      if (!resp.ok) throw new Error(data.error ?? 'خطأ');
      setSetupLink(data.setupLink ?? '');
      setStep('success');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? '';
      setServerError(msg || (isAr ? 'حدث خطأ، يرجى المحاولة مجدداً' : 'An error occurred, please try again'));
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(setupLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── Success screen ─────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 size={40} className="text-emerald-600" />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {isAr ? 'تم تسجيل وكالتك بنجاح!' : 'Agency registered successfully!'}
          </h2>
          <p className="text-slate-500 text-sm">
            {isAr
              ? 'اضغط على الزر أدناه لتعيين كلمة مرورك والدخول للنظام'
              : 'Click the button below to set your password and access the system'}
          </p>
        </div>

        {/* Direct setup button */}
        <a
          href={setupLink}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold bg-brand-600 hover:bg-brand-700 text-white transition-colors shadow-lg shadow-brand-200"
        >
          <ArrowRight size={18} className="rotate-180" />
          {isAr ? 'إعداد كلمة المرور والدخول' : 'Set Password & Sign In'}
        </a>

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-start">
          <p className="text-xs text-slate-500 leading-relaxed">
            {isAr
              ? 'إذا لم يعمل الزر، انسخ الرابط التالي وافتحه في المتصفح:'
              : 'If the button does not work, copy this link and open it in your browser:'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <p className="flex-1 text-[10px] text-slate-400 font-mono break-all">
              {setupLink}
            </p>
            <button
              onClick={copyLink}
              className="flex-shrink-0 p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors"
            >
              {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} className="text-slate-500" />}
            </button>
          </div>
        </div>

        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 text-sm font-medium"
        >
          <ArrowRight size={14} className={isAr ? '' : 'rotate-180'} />
          {isAr ? 'الذهاب إلى تسجيل الدخول' : 'Go to Login'}
        </Link>
      </div>
    );
  }

  // ── Registration form ──────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-md">
      {/* Mobile logo */}
      <div className="flex justify-center mb-8 lg:hidden">
        <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center">
          <span className="text-2xl font-bold text-white">م</span>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {isAr ? 'تسجيل وكالة جديدة' : 'Register New Agency'}
        </h2>
        <p className="text-slate-500 text-sm">
          {isAr
            ? 'أنشئ حساب وكالة سفر جديد في نظام مسارات'
            : 'Create a new travel agency account in Masarat ERP'}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

        {/* Agency info */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {isAr ? 'بيانات الوكالة' : 'Agency Info'}
          </p>
          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Input
              label={isAr ? 'اسم الوكالة (عربي) *' : 'Agency Name (Arabic) *'}
              startIcon={<Building2 size={16} />}
              dir="rtl"
              error={errors.agencyNameAr?.message}
              {...register('agencyNameAr')}
            />
            <Input
              label={isAr ? 'اسم الوكالة (إنجليزي)' : 'Agency Name (English)'}
              startIcon={<Globe size={16} />}
              dir="ltr"
              placeholder="Optional"
              error={errors.agencyNameEn?.message}
              {...register('agencyNameEn')}
            />
          </div>
        </div>

        {/* Admin info */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {isAr ? 'بيانات المدير' : 'Admin Info'}
          </p>
          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Input
              label={isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'}
              startIcon={<User size={16} />}
              dir="rtl"
              error={errors.adminNameAr?.message}
              {...register('adminNameAr')}
            />
            <Input
              label={isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}
              startIcon={<User size={16} />}
              dir="ltr"
              placeholder="Optional"
              {...register('adminNameEn')}
            />
            <Input
              label={isAr ? 'البريد الإلكتروني *' : 'Email *'}
              type="email"
              startIcon={<Mail size={16} />}
              dir="ltr"
              error={errors.adminEmail?.message}
              {...register('adminEmail')}
            />
            <Input
              label={isAr ? 'رقم الجوال' : 'Mobile'}
              type="tel"
              startIcon={<Phone size={16} />}
              dir="ltr"
              placeholder="+966"
              {...register('adminMobile')}
            />
          </div>
        </div>

        {serverError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {serverError}
            {serverError.includes('مسجّل مسبقاً') || serverError.includes('already registered') ? (
              <Link
                href={`/${locale}/login`}
                className="block mt-1 underline text-red-700 hover:text-red-900"
              >
                {isAr ? 'تسجيل الدخول' : 'Sign in'}
              </Link>
            ) : null}
          </div>
        )}

        <Button type="submit" fullWidth loading={isSubmitting} size="lg">
          {isAr ? 'إنشاء الحساب' : 'Create Account'}
        </Button>

        <p className="text-center text-sm text-slate-500">
          {isAr ? 'لديك حساب؟' : 'Already have an account?'}{' '}
          <Link href={`/${locale}/login`} className="text-brand-600 hover:text-brand-700 font-medium">
            {isAr ? 'تسجيل الدخول' : 'Sign in'}
          </Link>
        </p>
      </form>
    </div>
  );
}
