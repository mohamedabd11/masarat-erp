'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { MasaratLogo } from '@/components/ui/MasaratLogo';
import { cn } from '@/lib/utils';
import {
  Building2, Mail, User, Phone, Globe, Lock, Eye, EyeOff,
  CheckCircle2, ChevronDown, ArrowRight,
} from 'lucide-react';

// ─── Validation ───────────────────────────────────────────────────────────────

const schema = z.object({
  agencyNameAr: z.string().min(2, 'اسم الوكالة مطلوب (حرفان على الأقل)'),
  agencyNameEn: z.string().optional(),
  adminNameAr:  z.string().min(2, 'اسم المسؤول مطلوب'),
  adminNameEn:  z.string().optional(),
  adminEmail:   z.string().email('صيغة البريد الإلكتروني غير صحيحة'),
  adminMobile:  z.string().optional(),
  password:     z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
});

type FormValues = z.infer<typeof schema>;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  const [step,        setStep]        = useState<'form' | 'success'>('form');
  const [serverError, setServerError] = useState('');
  const [showEnglish, setShowEnglish] = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [showCPw,     setShowCPw]     = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError('');
    try {
      const regToken = process.env.NEXT_PUBLIC_REGISTRATION_SECRET ?? '';
      const resp = await fetch('/api/auth/register', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(regToken ? { 'x-registration-token': regToken } : {}),
        },
        body: JSON.stringify({
          agencyNameAr: values.agencyNameAr,
          agencyNameEn: values.agencyNameEn,
          adminNameAr:  values.adminNameAr,
          adminNameEn:  values.adminNameEn,
          adminEmail:   values.adminEmail,
          adminMobile:  values.adminMobile,
          password:     values.password,
        }),
      });
      const data = await resp.json() as { agencyId?: string; error?: string };

      if (resp.status === 409 || data.error?.includes('مسجّل مسبقاً')) {
        setServerError(isAr
          ? 'هذا البريد الإلكتروني مسجّل مسبقاً. هل تريد تسجيل الدخول؟'
          : 'This email is already registered. Want to sign in?');
        return;
      }
      if (!resp.ok) throw new Error(data.error ?? 'خطأ');

      // Auto-login — takes the user straight to the dashboard
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, values.adminEmail, values.password);
      // AuthProvider will redirect to dashboard
      setStep('success');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? '';
      setServerError(msg || (isAr ? 'حدث خطأ، يرجى المحاولة مجدداً' : 'An error occurred, please try again'));
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {isAr ? 'مرحباً بك في مسارات!' : 'Welcome to Masarat!'}
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            {isAr ? 'تم إنشاء حسابك بنجاح. جارٍ توجيهك…' : 'Account created. Redirecting you now…'}
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard`}
          className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold transition-colors"
        >
          <ArrowRight size={16} className={isAr ? '' : 'rotate-180'} />
          {isAr ? 'الذهاب للوحة التحكم' : 'Go to Dashboard'}
        </Link>
      </div>
    );
  }

  // ── Registration form ──────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-md">
      <div className="flex justify-center mb-8 lg:hidden">
        <MasaratLogo size={52} variant="full" />
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">
          {isAr ? 'تسجيل وكالة جديدة' : 'Register New Agency'}
        </h2>
        <p className="text-slate-500 text-sm">
          {isAr
            ? 'أنشئ حساباً مجانياً لمدة 14 يوم — لا يلزم بطاقة ائتمان'
            : 'Start your 14-day free trial — no credit card required'}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

        {/* ── Agency info ──────────────────────────────────────────────── */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {isAr ? 'بيانات الوكالة' : 'Agency Info'}
          </p>
          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Input
              label={isAr ? 'اسم الوكالة *' : 'Agency Name *'}
              startIcon={<Building2 size={16} />}
              dir="rtl"
              error={errors.agencyNameAr?.message}
              {...register('agencyNameAr')}
            />
            {showEnglish ? (
              <Input
                label={isAr ? 'اسم الوكالة (إنجليزي)' : 'Agency Name (English)'}
                startIcon={<Globe size={16} />}
                dir="ltr"
                placeholder="Optional"
                error={errors.agencyNameEn?.message}
                {...register('agencyNameEn')}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowEnglish(true)}
                className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                <ChevronDown size={13} />
                {isAr ? '+ إضافة الاسم الإنجليزي (اختياري)' : '+ Add English name (optional)'}
              </button>
            )}
          </div>
        </div>

        {/* ── Admin info ───────────────────────────────────────────────── */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {isAr ? 'بيانات المسؤول' : 'Admin Info'}
          </p>
          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Input
              label={isAr ? 'الاسم الكامل *' : 'Full Name *'}
              startIcon={<User size={16} />}
              dir="rtl"
              error={errors.adminNameAr?.message}
              {...register('adminNameAr')}
            />
            <Input
              label={isAr ? 'البريد الإلكتروني *' : 'Email *'}
              type="email"
              autoComplete="email"
              startIcon={<Mail size={16} />}
              dir="ltr"
              error={errors.adminEmail?.message}
              {...register('adminEmail')}
            />
            <Input
              label={isAr ? 'رقم الجوال (اختياري)' : 'Mobile (optional)'}
              type="tel"
              startIcon={<Phone size={16} />}
              dir="ltr"
              placeholder="+966"
              {...register('adminMobile')}
            />
            {showEnglish && (
              <Input
                label={isAr ? 'الاسم (إنجليزي — اختياري)' : 'Name (English — optional)'}
                startIcon={<User size={16} />}
                dir="ltr"
                {...register('adminNameEn')}
              />
            )}
          </div>
        </div>

        {/* ── Password ─────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {isAr ? 'كلمة المرور' : 'Password'}
          </p>
          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Input
              label={isAr ? 'كلمة المرور *' : 'Password *'}
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              startIcon={<Lock size={16} />}
              endIcon={
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="pointer-events-auto text-slate-400 hover:text-slate-600 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              dir="ltr"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label={isAr ? 'تأكيد كلمة المرور *' : 'Confirm Password *'}
              type={showCPw ? 'text' : 'password'}
              autoComplete="new-password"
              startIcon={<Lock size={16} />}
              endIcon={
                <button type="button" onClick={() => setShowCPw(v => !v)}
                  className="pointer-events-auto text-slate-400 hover:text-slate-600 transition-colors">
                  {showCPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              dir="ltr"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            <p className={cn('text-[11px] text-slate-400')}>
              {isAr ? '• 8 أحرف على الأقل' : '• Minimum 8 characters'}
            </p>
          </div>
        </div>

        {serverError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {serverError}
            {(serverError.includes('مسجّل مسبقاً') || serverError.includes('already registered')) && (
              <Link href={`/${locale}/login`} className="block mt-1 underline text-red-700 hover:text-red-900">
                {isAr ? 'تسجيل الدخول' : 'Sign in'}
              </Link>
            )}
          </div>
        )}

        <Button type="submit" fullWidth loading={isSubmitting} size="lg">
          {isAr ? 'إنشاء الحساب مجاناً' : 'Create Free Account'}
        </Button>

        <p className="text-center text-xs text-slate-400">
          {isAr
            ? 'بالتسجيل أنت توافق على شروط الاستخدام وسياسة الخصوصية'
            : 'By registering you agree to our Terms and Privacy Policy'}
        </p>

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
