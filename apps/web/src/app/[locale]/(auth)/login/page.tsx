'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';

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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

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

  return (
    <div className="w-full max-w-sm">
      {/* Mobile logo */}
      <div className="flex justify-center mb-8 lg:hidden">
        <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center">
          <span className="text-2xl font-bold text-white">م</span>
        </div>
      </div>

      <div className="mb-8">
        <h2 className={cn('text-2xl font-bold text-slate-900 mb-2', locale === 'ar' ? 'font-arabic' : '')}>
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
          <div className="flex justify-end">
            <button type="button" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
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

      <p className="mt-8 text-center text-xs text-slate-400">
        {locale === 'ar'
          ? 'نظام مسارات © 2026 — جميع الحقوق محفوظة'
          : 'Masarat ERP © 2026 — All rights reserved'}
      </p>
    </div>
  );
}
