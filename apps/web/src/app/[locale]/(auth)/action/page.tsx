'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import {
  getAuth,
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
} from 'firebase/auth';
import { MasaratLogo } from '@/components/ui/MasaratLogo';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, XCircle, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

type Stage =
  | 'loading'
  | 'reset-form'    // resetPassword — ready for new password input
  | 'reset-done'    // resetPassword — success
  | 'verify-done'   // verifyEmail — success
  | 'error';

export default function AuthActionPage() {
  const locale      = useLocale();
  const isAr        = locale === 'ar';
  const params      = useSearchParams();

  const mode        = params.get('mode')       ?? '';
  const oobCode     = params.get('oobCode')    ?? '';
  const continueUrl = params.get('continueUrl') ?? `/${locale}/login`;

  const [stage,        setStage]        = useState<Stage>('loading');
  const [userEmail,    setUserEmail]    = useState('');
  const [password,     setPassword]     = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [showPw,       setShowPw]       = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [fieldError,   setFieldError]   = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');

  useEffect(() => {
    if (!oobCode) {
      setErrorMsg(isAr ? 'رابط غير صالح أو مفقود.' : 'Invalid or missing link.');
      setStage('error');
      return;
    }

    const auth = getAuth();

    if (mode === 'resetPassword') {
      verifyPasswordResetCode(auth, oobCode)
        .then(email => { setUserEmail(email); setStage('reset-form'); })
        .catch(() => {
          setErrorMsg(
            isAr
              ? 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.'
              : 'This link is invalid or has expired. Please request a new one.',
          );
          setStage('error');
        });
    } else if (mode === 'verifyEmail') {
      applyActionCode(auth, oobCode)
        .then(() => setStage('verify-done'))
        .catch(() => {
          setErrorMsg(
            isAr
              ? 'تعذّر التحقق من البريد الإلكتروني. قد يكون الرابط منتهي الصلاحية.'
              : 'Could not verify your email. The link may have expired.',
          );
          setStage('error');
        });
    } else {
      setErrorMsg(isAr ? 'إجراء غير مدعوم.' : 'Unsupported action.');
      setStage('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setFieldError('');

    if (password.length < 8) {
      setFieldError(isAr ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setFieldError(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const auth = getAuth();
      await confirmPasswordReset(auth, oobCode, password);
      setStage('reset-done');
    } catch {
      setFieldError(
        isAr
          ? 'حدث خطأ أثناء تعيين كلمة المرور. جرّب طلب رابط جديد.'
          : 'Failed to set password. Please request a new link.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 size={36} className="text-brand-600 animate-spin" />
        <p className="text-slate-500 text-sm">{isAr ? 'جارٍ التحقق من الرابط…' : 'Verifying link…'}</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (stage === 'error') {
    return (
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
          <XCircle size={32} className="text-red-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {isAr ? 'رابط غير صالح' : 'Invalid Link'}
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed">{errorMsg}</p>
        </div>
        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center justify-center w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors"
        >
          {isAr ? 'العودة لتسجيل الدخول' : 'Back to Login'}
        </Link>
      </div>
    );
  }

  // ── Password reset form ────────────────────────────────────────────────────
  if (stage === 'reset-form') {
    return (
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center mb-2">
          <MasaratLogo size={120} variant="full" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">
            {isAr ? 'تعيين كلمة مرور جديدة' : 'Set New Password'}
          </h2>
          {userEmail && (
            <p className="text-slate-500 text-sm">
              {isAr ? `الحساب: ${userEmail}` : `Account: ${userEmail}`}
            </p>
          )}
        </div>

        <form onSubmit={handleReset} className="space-y-4" noValidate>
          <Input
            label={isAr ? 'كلمة المرور الجديدة' : 'New Password'}
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            startIcon={<Lock size={16} />}
            endIcon={
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="pointer-events-auto text-slate-400 hover:text-slate-600 transition-colors">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            value={password}
            onChange={e => setPassword(e.target.value)}
            dir="ltr"
            placeholder="••••••••"
          />
          <Input
            label={isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            startIcon={<Lock size={16} />}
            endIcon={
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="pointer-events-auto text-slate-400 hover:text-slate-600 transition-colors">
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            dir="ltr"
            placeholder="••••••••"
          />

          <p className="text-[11px] text-slate-400">
            {isAr ? '• 8 أحرف على الأقل' : '• At least 8 characters'}
          </p>

          {fieldError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {fieldError}
            </div>
          )}

          <Button type="submit" fullWidth loading={submitting} size="lg">
            {isAr ? 'حفظ كلمة المرور' : 'Save Password'}
          </Button>
        </form>
      </div>
    );
  }

  // ── Reset done ─────────────────────────────────────────────────────────────
  if (stage === 'reset-done') {
    return (
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {isAr ? 'تم تعيين كلمة المرور بنجاح' : 'Password Set Successfully'}
          </h2>
          <p className="text-slate-500 text-sm">
            {isAr
              ? 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.'
              : 'You can now sign in with your new password.'}
          </p>
        </div>
        <Link
          href={continueUrl.startsWith('/') ? continueUrl : `/${locale}/login`}
          className="inline-flex items-center justify-center w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors"
        >
          {isAr ? 'تسجيل الدخول' : 'Sign In'}
        </Link>
      </div>
    );
  }

  // ── Email verified ─────────────────────────────────────────────────────────
  if (stage === 'verify-done') {
    return (
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {isAr ? 'تم التحقق من بريدك الإلكتروني' : 'Email Verified'}
          </h2>
          <p className="text-slate-500 text-sm">
            {isAr ? 'حسابك مفعّل بالكامل.' : 'Your account is fully activated.'}
          </p>
        </div>
        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center justify-center w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors"
        >
          {isAr ? 'تسجيل الدخول' : 'Sign In'}
        </Link>
      </div>
    );
  }

  return null;
}
