'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Pencil, Trash2, AlertTriangle, Check, X } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Passenger {
  id:             string;
  nameAr:         string;
  nameEn:         string | null;
  type:           string;
  gender:         string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  nationality:    string | null;
  dateOfBirth:    string | null;
  nationalId:     string | null;
  notes:          string | null;
}

interface PassengerFormState {
  nameAr:         string;
  nameEn:         string;
  type:           string;
  gender:         string;
  passportNumber: string;
  passportExpiry: string;
  nationality:    string;
  dateOfBirth:    string;
  nationalId:     string;
}

const EMPTY_FORM: PassengerFormState = {
  nameAr:         '',
  nameEn:         '',
  type:           'ADT',
  gender:         '',
  passportNumber: '',
  passportExpiry: '',
  nationality:    '',
  dateOfBirth:    '',
  nationalId:     '',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, { ar: string; en: string; color: string }> = {
  ADT: { ar: 'راشد',  en: 'Adult',  color: 'bg-brand-100 text-brand-700' },
  CHD: { ar: 'طفل',   en: 'Child',  color: 'bg-amber-100 text-amber-700' },
  INF: { ar: 'رضيع',  en: 'Infant', color: 'bg-rose-100  text-rose-700'  },
};

function passportExpiryWarning(expiry: string | null): 'expired' | 'soon' | null {
  if (!expiry) return null;
  const exp = new Date(expiry);
  const today = new Date();
  const diffDays = (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0)   return 'expired';
  if (diffDays < 180) return 'soon';
  return null;
}

// ── Passenger Form (shared between Add and Edit) ───────────────────────────────

function PassengerForm({
  form, setForm, isAr, onSubmit, onCancel, submitting, submitLabel,
}: {
  form:        PassengerFormState;
  setForm:     (f: PassengerFormState) => void;
  isAr:        boolean;
  onSubmit:    () => void;
  onCancel:    () => void;
  submitting:  boolean;
  submitLabel: string;
}) {
  const f = (key: keyof PassengerFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label={isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'}
          value={form.nameAr}
          onChange={f('nameAr')}
          dir="rtl"
          required
        />
        <Input
          label={isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}
          value={form.nameEn}
          onChange={f('nameEn')}
          dir="ltr"
          placeholder="AS ON PASSPORT"
        />
        <Select
          label={isAr ? 'نوع المسافر' : 'Type'}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          options={[
            { value: 'ADT', label: isAr ? 'راشد (ADT)' : 'Adult (ADT)' },
            { value: 'CHD', label: isAr ? 'طفل (CHD)'  : 'Child (CHD)' },
            { value: 'INF', label: isAr ? 'رضيع (INF)' : 'Infant (INF)' },
          ]}
        />
        <Select
          label={isAr ? 'الجنس' : 'Gender'}
          value={form.gender}
          onChange={(e) => setForm({ ...form, gender: e.target.value })}
          options={[
            { value: '',  label: isAr ? '-- اختر --' : '-- Select --' },
            { value: 'M', label: isAr ? 'ذكر' : 'Male' },
            { value: 'F', label: isAr ? 'أنثى' : 'Female' },
          ]}
        />
        <Input
          label={isAr ? 'رقم الجواز' : 'Passport Number'}
          value={form.passportNumber}
          onChange={f('passportNumber')}
          dir="ltr"
          placeholder="A1234567"
        />
        <Input
          label={isAr ? 'انتهاء الجواز' : 'Passport Expiry'}
          type="date"
          value={form.passportExpiry}
          onChange={f('passportExpiry')}
        />
        <Input
          label={isAr ? 'الجنسية' : 'Nationality'}
          value={form.nationality}
          onChange={f('nationality')}
          placeholder={isAr ? 'مثال: سعودي' : 'e.g. Saudi'}
        />
        <Input
          label={isAr ? 'تاريخ الميلاد' : 'Date of Birth'}
          type="date"
          value={form.dateOfBirth}
          onChange={f('dateOfBirth')}
        />
        <Input
          label={isAr ? 'الهوية الوطنية / الإقامة' : 'National ID / Iqama'}
          value={form.nationalId}
          onChange={f('nationalId')}
          dir="ltr"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
          <X size={14} />
          {isAr ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={submitting || !form.nameAr.trim()}>
          {submitting ? <Spinner size="sm" /> : <Check size={14} />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface BookingPassengersSectionProps {
  bookingId:  string;
  locale:     string;
  isCancelled?: boolean;
}

export function BookingPassengersSection({
  bookingId, locale, isCancelled = false,
}: BookingPassengersSectionProps) {
  const isAr = locale === 'ar';

  const [passengers,  setPassengers]  = useState<Passenger[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm,     setAddForm]     = useState<PassengerFormState>(EMPTY_FORM);
  const [addSaving,   setAddSaving]   = useState(false);
  const [addError,    setAddError]    = useState<string | null>(null);

  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState<PassengerFormState>(EMPTY_FORM);
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState<string | null>(null);

  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ passengers: Passenger[] }>(
        `/api/bookings/${bookingId}/passengers`,
      );
      setPassengers(data.passengers);
    } catch {
      setError(isAr ? 'تعذّر تحميل المسافرين' : 'Failed to load passengers');
    } finally {
      setLoading(false);
    }
  }, [bookingId, isAr]);

  useEffect(() => { void load(); }, [load]);

  // ── Add ──────────────────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!addForm.nameAr.trim()) return;
    setAddSaving(true);
    setAddError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/passengers`, {
        method: 'POST',
        body: JSON.stringify({
          nameAr:         addForm.nameAr.trim(),
          nameEn:         addForm.nameEn.trim()         || undefined,
          type:           addForm.type,
          gender:         addForm.gender                || undefined,
          passportNumber: addForm.passportNumber.trim() || undefined,
          passportExpiry: addForm.passportExpiry        || undefined,
          nationality:    addForm.nationality.trim()    || undefined,
          dateOfBirth:    addForm.dateOfBirth           || undefined,
          nationalId:     addForm.nationalId.trim()     || undefined,
        }),
      });
      setAddForm(EMPTY_FORM);
      setShowAddForm(false);
      await load();
    } catch (e: unknown) {
      setAddError(
        e instanceof Error ? e.message : (isAr ? 'فشل الحفظ' : 'Save failed'),
      );
    } finally {
      setAddSaving(false);
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  function startEdit(p: Passenger) {
    setEditingId(p.id);
    setEditForm({
      nameAr:         p.nameAr,
      nameEn:         p.nameEn         ?? '',
      type:           p.type,
      gender:         p.gender         ?? '',
      passportNumber: p.passportNumber ?? '',
      passportExpiry: p.passportExpiry ?? '',
      nationality:    p.nationality    ?? '',
      dateOfBirth:    p.dateOfBirth    ?? '',
      nationalId:     p.nationalId     ?? '',
    });
    setEditError(null);
  }

  async function handleEdit() {
    if (!editingId || !editForm.nameAr.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/passengers/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nameAr:         editForm.nameAr.trim(),
          nameEn:         editForm.nameEn.trim()         || null,
          type:           editForm.type,
          gender:         editForm.gender                || null,
          passportNumber: editForm.passportNumber.trim() || null,
          passportExpiry: editForm.passportExpiry        || null,
          nationality:    editForm.nationality.trim()    || null,
          dateOfBirth:    editForm.dateOfBirth           || null,
          nationalId:     editForm.nationalId.trim()     || null,
        }),
      });
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      setEditError(
        e instanceof Error ? e.message : (isAr ? 'فشل الحفظ' : 'Save failed'),
      );
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete(passengerId: string) {
    setDeletingId(passengerId);
    try {
      await apiFetch(`/api/bookings/${bookingId}/passengers/${passengerId}`, {
        method: 'DELETE',
      });
      await load();
    } catch {
      // reload to get consistent state even on error
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-brand-600" />
              <span>
                {isAr
                  ? `المسافرون${passengers.length > 0 ? ` (${passengers.length})` : ''}`
                  : `Passengers${passengers.length > 0 ? ` (${passengers.length})` : ''}`}
              </span>
            </div>
            {!isCancelled && !showAddForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowAddForm(true); setAddError(null); }}
              >
                <Plus size={13} />
                {isAr ? 'إضافة مسافر' : 'Add Passenger'}
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      {loading && (
        <div className="flex justify-center py-6">
          <Spinner size="sm" />
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-red-600 py-2">{error}</p>
      )}

      {!loading && !error && passengers.length === 0 && !showAddForm && (
        <p className="text-sm text-slate-400 py-2">
          {isAr ? 'لم يتم إضافة مسافرين بعد' : 'No passengers added yet'}
        </p>
      )}

      {/* Passenger rows */}
      {!loading && !error && passengers.length > 0 && (
        <div className="space-y-2">
          {passengers.map((p) => {
            const typeInfo = TYPE_LABEL[p.type] ?? TYPE_LABEL['ADT']!;
            const expiryStatus = passportExpiryWarning(p.passportExpiry);

            if (editingId === p.id) {
              return (
                <div key={p.id}>
                  {editError && (
                    <p className="text-sm text-red-600 mb-2">{editError}</p>
                  )}
                  <PassengerForm
                    form={editForm}
                    setForm={setEditForm}
                    isAr={isAr}
                    onSubmit={handleEdit}
                    onCancel={() => { setEditingId(null); setEditError(null); }}
                    submitting={editSaving}
                    submitLabel={isAr ? 'حفظ' : 'Save'}
                  />
                </div>
              );
            }

            return (
              <div
                key={p.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 group"
              >
                {/* Type badge */}
                <span
                  className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold flex-shrink-0 ${typeInfo.color}`}
                >
                  {isAr ? typeInfo.ar : typeInfo.en}
                </span>

                {/* Main info */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900 leading-tight">
                    {isAr ? (p.nameAr || p.nameEn) : (p.nameEn || p.nameAr)}
                    {p.nameEn && p.nameAr && (
                      <span className="text-xs text-slate-400 font-normal ms-2">
                        {isAr ? p.nameEn : p.nameAr}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                    {p.passportNumber && (
                      <span className="font-mono">{p.passportNumber}</span>
                    )}
                    {p.nationality && (
                      <span>{p.nationality}</span>
                    )}
                    {p.dateOfBirth && (
                      <span>{isAr ? 'م.' : 'DOB:'} {p.dateOfBirth}</span>
                    )}
                    {p.nationalId && (
                      <span className="font-mono">{isAr ? 'هوية:' : 'ID:'} {p.nationalId}</span>
                    )}
                  </div>
                  {p.passportExpiry && (
                    <div className={`flex items-center gap-1 text-xs mt-0.5 ${
                      expiryStatus === 'expired' ? 'text-red-600'   :
                      expiryStatus === 'soon'    ? 'text-amber-600' :
                                                   'text-slate-400'
                    }`}>
                      {(expiryStatus === 'expired' || expiryStatus === 'soon') && (
                        <AlertTriangle size={11} />
                      )}
                      {isAr ? 'ينتهي الجواز:' : 'Passport exp:'} {p.passportExpiry}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {!isCancelled && (
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(p)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white transition-colors"
                      title={isAr ? 'تعديل' : 'Edit'}
                      disabled={!!deletingId}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => { void handleDelete(p.id); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white transition-colors"
                      title={isAr ? 'حذف' : 'Delete'}
                      disabled={deletingId === p.id}
                    >
                      {deletingId === p.id ? <Spinner size="sm" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="mt-3">
          {addError && (
            <p className="text-sm text-red-600 mb-2">{addError}</p>
          )}
          <PassengerForm
            form={addForm}
            setForm={setAddForm}
            isAr={isAr}
            onSubmit={handleAdd}
            onCancel={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); setAddError(null); }}
            submitting={addSaving}
            submitLabel={isAr ? 'إضافة' : 'Add'}
          />
        </div>
      )}
    </Card>
  );
}
