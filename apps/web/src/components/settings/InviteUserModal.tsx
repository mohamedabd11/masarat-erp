'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  X, UserPlus, Mail, User, Phone, Shield,
  CheckCircle2, Copy, Check,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'agent' | 'accountant' | 'viewer';

const schema = z.object({
  nameAr:  z.string().min(2, 'الاسم العربي مطلوب'),
  nameEn:  z.string().optional(),
  email:   z.string().email('صيغة البريد الإلكتروني غير صحيحة'),
  mobile:  z.string().optional(),
  role:    z.enum(['admin', 'agent', 'accountant', 'viewer']),
});

type FormValues = z.infer<typeof schema>;

interface InviteUserModalProps {
  isAr:    boolean;
  onClose: () => void;
  onDone:  () => void;
}

// ─── Role options ─────────────────────────────────────────────────────────────

const ROLES: { value: UserRole; ar: string; en: string; desc: string }[] = [
  { value: 'admin',      ar: 'مدير',           en: 'Admin',      desc: 'صلاحيات كاملة' },
  { value: 'agent',      ar: 'موظف حجوزات',    en: 'Agent',      desc: 'إنشاء وإدارة الحجوزات' },
  { value: 'accountant', ar: 'محاسب',           en: 'Accountant', desc: 'الوصول للمالية فقط' },
  { value: 'viewer',     ar: 'مشاهد',           en: 'Viewer',     desc: 'قراءة فقط' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function InviteUserModal({ isAr, onClose, onDone }: InviteUserModalProps) {
  const [step, setStep]           = useState<'form' | 'success'>('form');
  const [setupLink, setSetupLink] = useState('');
  const [copied, setCopied]       = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'agent' },
  });

  const selectedRole = watch('role');

  async function onSubmit(values: FormValues) {
    setServerError('');
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp }                      = await import('@masarat/firebase');
      const fn = httpsCallable<FormValues, { userId: string; setupLink: string }>(
        getFunctions(getApp(), 'me-central2'),
        'inviteUser'
      );
      const result = await fn(values);
      setSetupLink(result.data.setupLink);
      setStep('success');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? '';
      if (msg.includes('already-exists') || msg.includes('مسجّل مسبقاً')) {
        setServerError(isAr ? 'هذا البريد الإلكتروني مسجّل مسبقاً في النظام' : 'This email is already registered');
      } else if (msg.includes('permission-denied') || msg.includes('PERMISSION')) {
        setServerError(isAr ? 'ليس لديك صلاحية دعوة مستخدمين' : 'You do not have permission to invite users');
      } else {
        setServerError(isAr ? 'حدث خطأ، يرجى المحاولة مجدداً' : 'An error occurred, please try again');
      }
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(setupLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 rounded-xl">
              <UserPlus size={18} className="text-brand-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {isAr ? 'دعوة موظف جديد' : 'Invite New User'}
              </h3>
              <p className="text-xs text-slate-400">
                {isAr ? 'سيصله رابط لتعيين كلمة مروره' : 'They will receive a setup link'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">

          {step === 'success' ? (
            /* ── Success ────────────────────────────────────────────────── */
            <div className="text-center space-y-5">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-emerald-600" />
                </div>
              </div>
              <div>
                <p className="font-bold text-slate-900 text-lg mb-1">
                  {isAr ? 'تم إنشاء الحساب بنجاح!' : 'Account created successfully!'}
                </p>
                <p className="text-slate-500 text-sm">
                  {isAr
                    ? 'انسخ الرابط وأرسله للموظف عبر واتساب أو البريد الإلكتروني'
                    : 'Copy the link and send it to the user via WhatsApp or email'}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-start space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  {isAr ? 'رابط تعيين كلمة المرور' : 'Password Setup Link'}
                </p>
                <p className="text-xs text-slate-700 font-mono break-all bg-white border border-slate-200 rounded-lg p-2.5">
                  {setupLink}
                </p>
                <button
                  onClick={copyLink}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    copied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-brand-600 hover:bg-brand-700 text-white',
                  )}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied
                    ? (isAr ? 'تم النسخ!' : 'Copied!')
                    : (isAr ? 'نسخ الرابط' : 'Copy Link')}
                </button>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" fullWidth onClick={onClose}>
                  {isAr ? 'إغلاق' : 'Close'}
                </Button>
                <Button fullWidth onClick={() => { setStep('form'); setSetupLink(''); setServerError(''); onDone(); }}>
                  {isAr ? 'دعوة آخر' : 'Invite Another'}
                </Button>
              </div>
            </div>
          ) : (
            /* ── Form ───────────────────────────────────────────────────── */
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

              {/* Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'}
                  startIcon={<User size={15} />}
                  dir="rtl"
                  error={errors.nameAr?.message}
                  {...register('nameAr')}
                />
                <Input
                  label={isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}
                  startIcon={<User size={15} />}
                  dir="ltr"
                  {...register('nameEn')}
                />
              </div>

              {/* Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={isAr ? 'البريد الإلكتروني *' : 'Email *'}
                  type="email"
                  startIcon={<Mail size={15} />}
                  dir="ltr"
                  error={errors.email?.message}
                  {...register('email')}
                />
                <Input
                  label={isAr ? 'رقم الجوال' : 'Mobile'}
                  type="tel"
                  startIcon={<Phone size={15} />}
                  dir="ltr"
                  placeholder="+966"
                  {...register('mobile')}
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Shield size={14} className="text-slate-400" />
                    {isAr ? 'الصلاحية *' : 'Role *'}
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setValue('role', r.value)}
                      className={cn(
                        'p-3 rounded-xl border-2 text-start transition-colors',
                        selectedRole === r.value
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <p className={cn(
                        'text-sm font-semibold',
                        selectedRole === r.value ? 'text-brand-700' : 'text-slate-700',
                      )}>
                        {isAr ? r.ar : r.en}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {serverError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {serverError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" type="button" fullWidth onClick={onClose}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" fullWidth loading={isSubmitting}>
                  {isAr ? 'إرسال الدعوة' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
