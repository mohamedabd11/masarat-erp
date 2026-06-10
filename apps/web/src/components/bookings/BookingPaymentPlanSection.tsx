'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus, Banknote, Building2, CreditCard, Globe, CheckCircle2, Clock, AlertTriangle, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PaymentPlan {
  id:                 string;
  totalAmountHalalas: number;
  numInstallments:    number;
  status:             string;
  notes:              string | null;
  createdAt:          string;
}

interface Installment {
  id:                string;
  installmentNumber: number;
  dueDate:           string;
  amountHalalas:     number;
  status:            string;   // 'pending' | 'paid' | 'overdue'
  paidAt:            string | null;
  paymentId:         string | null;
}

interface Props {
  bookingId:      string;
  bookingNumber:  string;
  hasInvoice:     boolean;
  locale:         string;
  isCancelled:    boolean;
  totalHalalas:   number;
  paidHalalas:    number;
}

// ── Payment method helpers ─────────────────────────────────────────────────────

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'online'] as const;

function methodLabel(method: string, isAr: boolean) {
  const map: Record<string, { ar: string; en: string }> = {
    cash:          { ar: 'نقداً',         en: 'Cash' },
    bank_transfer: { ar: 'تحويل بنكي',   en: 'Bank Transfer' },
    card:          { ar: 'بطاقة',         en: 'Card' },
    online:        { ar: 'دفع إلكتروني',  en: 'Online' },
  };
  const m = map[method];
  return m ? (isAr ? m.ar : m.en) : method;
}

function methodIcon(method: string) {
  if (method === 'bank_transfer') return <Building2 size={14} />;
  if (method === 'card')          return <CreditCard size={14} />;
  if (method === 'online')        return <Globe size={14} />;
  return <Banknote size={14} />;
}

// ── Status badge ───────────────────────────────────────────────────────────────

function InstallmentStatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  if (status === 'paid') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      <CheckCircle2 size={11} />
      {isAr ? 'مدفوع' : 'Paid'}
    </span>
  );
  if (status === 'overdue') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
      <AlertTriangle size={11} />
      {isAr ? 'متأخر' : 'Overdue'}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      <Clock size={11} />
      {isAr ? 'معلق' : 'Pending'}
    </span>
  );
}

// ── Create Plan Modal ──────────────────────────────────────────────────────────

interface CreatePlanModalProps {
  bookingId:    string;
  isAr:         boolean;
  onClose:      () => void;
  onCreated:    () => void;
}

function CreatePlanModal({ bookingId, isAr, onClose, onCreated }: CreatePlanModalProps) {
  const today = new Date().toISOString().split('T')[0]!;
  const [numInstallments, setNumInstallments] = useState('3');
  const [firstDueDate, setFirstDueDate]       = useState(today);
  const [notes, setNotes]                     = useState('');
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(numInstallments, 10);
    if (!n || n < 2 || n > 24) {
      setError(isAr ? 'عدد الأقساط بين 2 و 24' : 'Installments must be between 2 and 24');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/payment-plan`, {
        method: 'POST',
        body:   JSON.stringify({ numInstallments: n, firstDueDate, notes: notes || undefined }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <Card className="relative w-full max-w-md z-10">
        <CardHeader>
          <CardTitle>
            {isAr ? 'إنشاء خطة أقساط' : 'Create Payment Plan'}
          </CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isAr ? 'عدد الأقساط (2–24)' : 'Number of Installments (2–24)'}
            </label>
            <Input
              type="number"
              min="2"
              max="24"
              value={numInstallments}
              onChange={(e) => setNumInstallments(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isAr ? 'تاريخ أول قسط' : 'First Installment Due Date'}
            </label>
            <Input
              type="date"
              min={today}
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isAr ? 'ملاحظات...' : 'Notes...'}
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Spinner size="sm" /> : (isAr ? 'إنشاء' : 'Create')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Pay Installment Modal ──────────────────────────────────────────────────────

interface PayInstallmentModalProps {
  bookingId:     string;
  installment:   Installment;
  isAr:          boolean;
  onClose:       () => void;
  onPaid:        () => void;
}

function PayInstallmentModal({ bookingId, installment, isAr, onClose, onPaid }: PayInstallmentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [reference, setReference]         = useState('');
  const [notes, setNotes]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(
        `/api/bookings/${bookingId}/payment-plan/installments/${installment.id}/pay`,
        {
          method: 'POST',
          body:   JSON.stringify({
            paymentMethod,
            reference: reference || undefined,
            notes:     notes     || undefined,
          }),
        },
      );
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <Card className="relative w-full max-w-md z-10">
        <CardHeader>
          <CardTitle>
            {isAr
              ? `تسجيل دفع — القسط #${installment.installmentNumber}`
              : `Record Payment — Installment #${installment.installmentNumber}`}
          </CardTitle>
        </CardHeader>
        <div className="mb-4 p-3 bg-slate-50 rounded-lg text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">{isAr ? 'المبلغ' : 'Amount'}</span>
            <span className="font-semibold text-slate-900">
              {formatCurrency(installment.amountHalalas, isAr ? 'ar-SA' : 'en-SA')}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-slate-500">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</span>
            <span className="text-slate-700">
              {formatDate(installment.dueDate, isAr ? 'ar-SA' : 'en-SA')}
            </span>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isAr ? 'طريقة الدفع' : 'Payment Method'}
            </label>
            <Select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel(m, isAr) }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isAr ? 'المرجع (اختياري)' : 'Reference (optional)'}
            </label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={isAr ? 'رقم المرجع...' : 'Reference number...'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isAr ? 'ملاحظات...' : 'Notes...'}
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Spinner size="sm" /> : (isAr ? 'تسجيل الدفعة' : 'Record Payment')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BookingPaymentPlanSection({
  bookingId,
  bookingNumber,
  hasInvoice,
  locale,
  isCancelled,
  totalHalalas,
  paidHalalas,
}: Props) {
  const isAr = locale === 'ar';

  const [plan, setPlan]               = useState<PaymentPlan | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal]       = useState(false);
  const [payingInstallment, setPayingInstallment]   = useState<Installment | null>(null);
  const [cancellingPlan, setCancellingPlan]         = useState(false);
  const [cancelError, setCancelError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ plan: PaymentPlan | null; installments: Installment[] }>(
        `/api/bookings/${bookingId}/payment-plan`,
      );
      setPlan(data.plan);
      setInstallments(data.installments);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [bookingId, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function handleCancelPlan() {
    if (!plan) return;
    if (!confirm(isAr ? 'هل أنت متأكد من إلغاء خطة الأقساط؟' : 'Are you sure you want to cancel this payment plan?')) return;
    setCancellingPlan(true);
    setCancelError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/payment-plan`, { method: 'DELETE' });
      void load();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setCancellingPlan(false);
    }
  }

  // Don't render the section if no invoice and no plan
  if (!loading && !plan && !hasInvoice) return null;

  // ── Compute paid / remaining from installments ─────────────────────────────
  const paidInstallmentsCount = installments.filter((i) => i.status === 'paid').length;
  const totalInstallments     = installments.length;
  const paidAmountHalalas     = installments.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amountHalalas, 0);
  const remainingHalalas      = plan ? plan.totalAmountHalalas - paidAmountHalalas : 0;
  const progressPct           = plan && plan.totalAmountHalalas > 0
    ? Math.round((paidAmountHalalas / plan.totalAmountHalalas) * 100)
    : 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-brand-600" />
                {isAr ? 'خطة الأقساط' : 'Payment Plan'}
              </div>
              {!isCancelled && !plan && hasInvoice && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  {isAr ? 'إنشاء خطة' : 'Create Plan'}
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 py-2">{error}</p>
        ) : !plan ? (
          <div className="py-6 text-center text-slate-400 text-sm">
            {isCancelled
              ? (isAr ? 'الحجز ملغى' : 'Booking is cancelled')
              : !hasInvoice
                ? (isAr ? 'أصدر الفاتورة أولاً لإنشاء خطة أقساط' : 'Issue an invoice first to create a payment plan')
                : (isAr ? 'لا توجد خطة أقساط نشطة' : 'No active payment plan')}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">{isAr ? 'الإجمالي' : 'Total'}</p>
                <p className="font-semibold text-slate-900">{formatCurrency(plan.totalAmountHalalas, isAr ? 'ar-SA' : 'en-SA')}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xs text-emerald-600 mb-1">{isAr ? 'المدفوع' : 'Paid'}</p>
                <p className="font-semibold text-emerald-700">{formatCurrency(paidAmountHalalas, isAr ? 'ar-SA' : 'en-SA')}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xs text-amber-600 mb-1">{isAr ? 'المتبقي' : 'Remaining'}</p>
                <p className="font-semibold text-amber-700">{formatCurrency(remainingHalalas, isAr ? 'ar-SA' : 'en-SA')}</p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{isAr ? `${paidInstallmentsCount} من ${totalInstallments} قسط` : `${paidInstallmentsCount} of ${totalInstallments} installments`}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Installments list */}
            <div className="divide-y divide-slate-100">
              {installments.map((inst) => (
                <div key={inst.id} className="flex items-center justify-between py-2.5 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex-shrink-0 text-xs font-mono bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                      #{inst.installmentNumber}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {formatCurrency(inst.amountHalalas, isAr ? 'ar-SA' : 'en-SA')}
                      </p>
                      <p className="text-xs text-slate-400">
                        {isAr ? 'استحقاق: ' : 'Due: '}
                        {formatDate(inst.dueDate, isAr ? 'ar-SA' : 'en-SA')}
                        {inst.paidAt && (
                          <span className="ml-2">
                            · {isAr ? 'دفع: ' : 'Paid: '}
                            {formatDate(inst.paidAt, isAr ? 'ar-SA' : 'en-SA')}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <InstallmentStatusBadge status={inst.status} isAr={isAr} />
                    {inst.status !== 'paid' && !isCancelled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPayingInstallment(inst)}
                        className="flex items-center gap-1 text-xs"
                      >
                        {methodIcon('cash')}
                        {isAr ? 'دفع' : 'Pay'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Cancel plan + error */}
            {plan.status === 'active' && !isCancelled && (
              <div className="pt-2 border-t border-slate-100">
                {cancelError && (
                  <p className="text-sm text-red-600 mb-2">{cancelError}</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelPlan}
                  disabled={cancellingPlan}
                  className="flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                >
                  {cancellingPlan ? <Spinner size="sm" /> : <Trash2 size={13} />}
                  {isAr ? 'إلغاء الخطة' : 'Cancel Plan'}
                </Button>
              </div>
            )}

            {plan.status === 'completed' && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                <CheckCircle2 size={15} />
                {isAr ? 'تمت جميع الأقساط' : 'All installments completed'}
              </div>
            )}
          </div>
        )}
      </Card>

      {showCreateModal && (
        <CreatePlanModal
          bookingId={bookingId}
          isAr={isAr}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); void load(); }}
        />
      )}

      {payingInstallment && (
        <PayInstallmentModal
          bookingId={bookingId}
          installment={payingInstallment}
          isAr={isAr}
          onClose={() => setPayingInstallment(null)}
          onPaid={() => { setPayingInstallment(null); void load(); }}
        />
      )}
    </>
  );
}
