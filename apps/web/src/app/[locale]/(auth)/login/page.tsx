'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function handlePasswordReset() {
    if (!resetEmail.trim()) return;
    setResetSending(true);
    setResetError('');
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, resetEmail.trim());
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/invalid-email') {
        setResetError(isAr ? 'صيغة البريد الإلكتروني غير صحيحة' : 'Invalid email format');
        setResetSending(false);
        return;
      }
      // For all other errors (including user-not-found when protection is off),
      // show the ambiguous success message to avoid revealing registered emails.
    } finally {
      setResetSending(false);
    }
    setResetDone(true);
  }

  async function onSubmit(data: LoginForm) {
    setAuthError('');
    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, data.email, data.password);
      // AuthProvider handles redirect
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setAuthError(t('invalidCredentials'));
      } else if (code === 'auth/too-many-requests') {
        setAuthError(t('tooManyRequests'));
      } else {
        setAuthError(t('networkError'));
      }
    }
  }

  const isAr = locale === 'ar';

  return (
    <div className="w-full max-w-sm">
      {/* Mobile logo */}
      <div className="flex justify-center mb-8 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.svg" alt="مسارات" className="w-16 h-16" />
      </div>

      {resetMode ? (
        /* ── Password Reset Form ─────────────────────────────────────── */
        <div>
          <button
            type="button"
            onClick={() => { setResetMode(false); setResetDone(false); setResetError(''); }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
          >
            <ArrowRight size={14} className={isAr ? '' : 'rotate-180'} />
            {isAr ? 'العودة لتسجيل الدخول' : 'Back to login'}
          </button>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {isAr ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}
            </h2>
            <p className="text-slate-500 text-sm">
              {isAr
                ? 'أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين'
                : 'Enter your email and we\'ll send you a reset link'}
            </p>
          </div>

          {resetDone ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-4 text-sm text-emerald-700 text-center leading-relaxed">
              {isAr
                ? 'إذا كان هذا البريد الإلكتروني مسجّلاً في النظام، سيصلك رابط إعادة التعيين خلال دقائق. تحقق من صندوق الوارد والبريد المزعج.'
                : 'If this email is registered in the system, you will receive a reset link within a few minutes. Check your inbox and spam folder.'}
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label={isAr ? 'البريد الإلكتروني' : 'Email'}
                type="email"
                autoComplete="email"
                startIcon={<Mail size={16} />}
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                dir="ltr"
              />
              {resetError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {resetError}
                </div>
              )}
              <Button
                type="button"
                fullWidth
                loading={resetSending}
                disabled={!resetEmail.trim()}
                onClick={handlePasswordReset}
                size="lg"
              >
                {isAr ? 'إرسال رابط التعيين' : 'Send Reset Link'}
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* ── Login Form ──────────────────────────────────────────────── */
        <>
          <div className="mb-8">
            <h2 className={cn('text-2xl font-bold text-slate-900 mb-2', isAr ? 'font-arabic' : '')}>
              {t('welcomeBack')}
            </h2>
            <p className="text-slate-500 text-sm">{t('loginSubtitle')}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <Input
              label={t('email')}
              type="email"
              autoComplete="email"
              startIcon={<Mail size={16} />}
              error={errors.email ? t('emailInvalid') : undefined}
              {...register('email')}
            />

            <div className="space-y-1">
              <Input
                label={t('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                startIcon={<Lock size={16} />}
                endIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="pointer-events-auto text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                error={errors.password ? t('passwordRequired') : undefined}
                {...register('password')}
              />
              <div className="flex ltr:justify-end rtl:justify-start">
                <button
                  type="button"
                  onClick={() => { setResetMode(true); setResetDone(false); setResetError(''); }}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
                >
                  {t('forgotPassword')}
                </button>
              </div>
            </div>

            {authError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {authError}
              </div>
            )}

            <Button type="submit" fullWidth loading={isSubmitting} size="lg">
              {isSubmitting ? t('loggingIn') : t('loginButton')}
            </Button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        {isAr ? 'وكالة جديدة؟' : 'New agency?'}{' '}
        <a href={`/${locale}/register`} className="text-brand-600 hover:text-brand-700 font-medium">
          {isAr ? 'سجّل مجاناً' : 'Register free'}
        </a>
      </p>

      <p className="mt-4 text-center text-xs text-slate-400">
        {isAr
          ? 'نظام مسارات © 2026 — جميع الحقوق محفوظة'
          : 'Masarat ERP © 2026 — All rights reserved'}
      </p>
    </div>
  );
}
