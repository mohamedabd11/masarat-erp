'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  getAuth,
  confirmPasswordReset,
  verifyPasswordResetCode,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MasaratLogo } from '@/components/ui/MasaratLogo';
import Link from 'next/link';
import { Eye, EyeOff, Lock, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

// ─── Password strength indicator ─────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  const isAr = useLocale() === 'ar';
  if (!password) return null;

  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password) || /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = {
    ar: ['ضعيفة جداً', 'ضعيفة', 'متوسطة', 'قوية', 'قوية جداً'],
    en: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'],
  };
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-400', 'bg-emerald-500'];

  return (
    <div className="space-y-1.5 mt-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i < score ? colors[score - 1] : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs ${score <= 1 ? 'text-red-500' : score <= 2 ? 'text-orange-500' : 'text-emerald-600'}`}>
        {isAr ? labels.ar[score] : labels.en[score]}
      </p>
    </div>
  );
}

// ─── Reset / Setup form ───────────────────────────────────────────────────────

function ResetPasswordForm({
  oobCode,
  isSetup,
}: {
  oobCode: string;
  isSetup: boolean;
}) {
  const locale   = useLocale();
  const isAr     = locale === 'ar';
  const router   = useRouter();

  const [email,       setEmail]       = useState('');
  const [verifying,   setVerifying]   = useState(true);
  const [verifyError, setVerifyError] = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [showConf,    setShowConf]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState(false);

  useEffect(() => {
    const auth = getAuth();
    verifyPasswordResetCode(auth, oobCode)
      .then(em => { setEmail(em); setVerifying(false); })
      .catch(() => {
        setVerifyError(
          isAr
            ? 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.'
            : 'This link is invalid or has expired. Please request a new one.',
        );
        setVerifying(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oobCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(isAr ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const auth = getAuth();
      await confirmPasswordReset(auth, oobCode, password);
      // Auto sign-in after setting password
      try {
        await signInWithEmailAndPassword(auth, email, password);
        setSuccess(true);
        setTimeout(() => router.push(`/${locale}`), 1800);
      } catch {
        setSuccess(true);
        setTimeout(() => router.push(`/${locale}/login`), 2000);
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/expired-action-code') {
        setError(isAr ? 'انتهت صلاحية الرابط. اطلب رابطاً جديداً.' : 'Link expired. Request a new one.');
      } else if (code === 'auth/weak-password') {
        setError(isAr ? 'كلمة المرور ضعيفة جداً' : 'Password is too weak');
      } else {
        setError(isAr ? 'حدث خطأ. يرجى المحاولة مجدداً.' : 'An error occurred. Please try again.');
      }
      setSubmitting(false);
    }
  }

  // ── Loading ──
  if (verifying) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="w-10 h-10 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">{isAr ? 'جارٍ التحقق من الرابط...' : 'Verifying link...'}</p>
      </div>
    );
  }

  // ── Invalid link ──
  if (verifyError) {
    return (
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle size={36} className="text-red-500" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900 mb-1">
            {isAr ? 'الرابط غير صالح' : 'Invalid Link'}
          </h3>
          <p className="text-sm text-slate-500 leading-relaxed">{verifyError}</p>
        </div>
        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          <ArrowRight size={14} className={isAr ? '' : 'rotate-180'} />
          {isAr ? 'العودة إلى تسجيل الدخول' : 'Back to Login'}
        </Link>
      </div>
    );
  }

  // ── Success ──
  if (success) {
    return (
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={36} className="text-emerald-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900 mb-1">
            {isAr ? 'تم تعيين كلمة المرور بنجاح!' : 'Password set successfully!'}
          </h3>
          <p className="text-sm text-slate-500">
            {isAr ? 'جارٍ تسجيل الدخول...' : 'Signing you in...'}
          </p>
        </div>
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="w-full max-w-sm">
      <div className="flex justify-center mb-8">
        <MasaratLogo size={120} variant="full" />
      </div>

      <div className="mb-7">
        <h2 className="text-2xl font-bold text-slate-900 mb-1.5">
          {isSetup
            ? (isAr ? 'إعداد كلمة المرور' : 'Set Up Password')
            : (isAr ? 'إعادة تعيين كلمة المرور' : 'Reset Password')}
        </h2>
        <p className="text-sm text-slate-500">
          {isAr ? `الحساب: ${email}` : `Account: ${email}`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Input
            label={isAr ? 'كلمة المرور الجديدة' : 'New Password'}
            type={showPass ? 'text' : 'password'}
            autoComplete="new-password"
            startIcon={<Lock size={16} />}
            endIcon={
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="pointer-events-auto text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <PasswordStrength password={password} />
        </div>

        <Input
          label={isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
          type={showConf ? 'text' : 'password'}
          autoComplete="new-password"
          startIcon={<Lock size={16} />}
          endIcon={
            <button
              type="button"
              onClick={() => setShowConf(v => !v)}
              className="pointer-events-auto text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          error={confirm && confirm !== password ? (isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match') : undefined}
        />

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button type="submit" fullWidth loading={submitting} size="lg">
          {isSetup
            ? (isAr ? 'تعيين كلمة المرور والدخول' : 'Set Password & Sign In')
            : (isAr ? 'تحديث كلمة المرور' : 'Update Password')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link
          href={`/${locale}/login`}
          className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          {isAr ? 'العودة إلى تسجيل الدخول' : 'Back to Login'}
        </Link>
      </p>
    </div>
  );
}

// ─── Content (reads search params) ───────────────────────────────────────────

function ActionContent() {
  const searchParams = useSearchParams();
  const locale       = useLocale();
  const isAr         = locale === 'ar';

  const mode    = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');
  const type    = searchParams.get('type');

  if (!oobCode || mode !== 'resetPassword') {
    return (
      <div className="w-full max-w-sm text-center space-y-4">
        <AlertCircle size={40} className="text-red-400 mx-auto" />
        <p className="text-slate-500 text-sm">
          {isAr ? 'رابط غير صالح' : 'Invalid or missing link parameters'}
        </p>
        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowRight size={14} className={isAr ? '' : 'rotate-180'} />
          {isAr ? 'تسجيل الدخول' : 'Back to Login'}
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm oobCode={oobCode} isSetup={type === 'setup'} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <div className="w-10 h-10 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ActionContent />
    </Suspense>
  );
}
