'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users, Moon, Package, Plus, ArrowRight, ArrowLeft, Pencil, Trash2,
  CheckCircle2, Clock, XCircle, CalendarDays, Phone,
  FileText, Printer, CheckSquare, Square, ListChecks,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { DocumentsSection } from '@/components/ui/DocumentsSection';
import { apiFetch } from '@/lib/api-client';
import { formatDate, formatCurrency } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GroupTrip {
  id: string; name: string; serviceType: string;
  departureDate: string | null; returnDate: string | null;
  capacity: number | null; pricePerPersonHalalas: number;
  status: string; notes: string | null; createdAt: string;
}

interface TripStats {
  total: number; confirmed: number; cancelled: number;
  visaPending: number; visaApplied: number; visaApproved: number; visaRejected: number;
}

interface Member {
  id: string; nameAr: string; nameEn: string | null; phone: string | null;
  passportNumber: string | null; passportExpiry: string | null;
  nationality: string | null; visaStatus: string; visaNumber: string | null;
  visaExpiry: string | null; roomType: string | null; notes: string | null;
  status: string; createdAt: string;
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const VISA_STATUS: Record<string, { ar: string; en: string; icon: React.ReactNode; cls: string }> = {
  pending:  { ar: 'بانتظار التقديم', en: 'Pending',   icon: <Clock size={11} />,        cls: 'bg-slate-100  text-slate-600'   },
  applied:  { ar: 'قيد المعالجة',    en: 'Applied',   icon: <Clock size={11} />,        cls: 'bg-blue-100   text-blue-700'    },
  approved: { ar: 'موافق عليها',     en: 'Approved',  icon: <CheckCircle2 size={11} />, cls: 'bg-emerald-100 text-emerald-700' },
  received: { ar: 'مستلمة',          en: 'Received',  icon: <CheckCircle2 size={11} />, cls: 'bg-green-100  text-green-700'   },
  rejected: { ar: 'مرفوضة',          en: 'Rejected',  icon: <XCircle size={11} />,      cls: 'bg-red-100    text-red-700'     },
};

const MEMBER_STATUS: Record<string, { ar: string; en: string; cls: string }> = {
  registered: { ar: 'مسجل',   en: 'Registered', cls: 'bg-slate-100  text-slate-600' },
  confirmed:  { ar: 'مؤكد',   en: 'Confirmed',  cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:  { ar: 'ملغي',   en: 'Cancelled',  cls: 'bg-red-100    text-red-600'   },
};

const TRIP_STATUS: Record<string, { ar: string; en: string; cls: string; nextStatuses: string[] }> = {
  planning:  { ar: 'تخطيط',  en: 'Planning',  cls: 'bg-slate-100  text-slate-700',   nextStatuses: ['open', 'cancelled'] },
  open:      { ar: 'مفتوح',  en: 'Open',       cls: 'bg-blue-100   text-blue-700',    nextStatuses: ['closed', 'cancelled'] },
  closed:    { ar: 'مغلق',   en: 'Closed',     cls: 'bg-amber-100  text-amber-700',   nextStatuses: ['departed', 'cancelled'] },
  departed:  { ar: 'مسافر',  en: 'Departed',   cls: 'bg-brand-100  text-brand-700',   nextStatuses: ['completed'] },
  completed: { ar: 'مكتمل',  en: 'Completed',  cls: 'bg-emerald-100 text-emerald-700', nextStatuses: [] },
  cancelled: { ar: 'ملغي',   en: 'Cancelled',  cls: 'bg-red-100    text-red-700',     nextStatuses: [] },
};

const STATUS_LABELS_AR: Record<string, string> = {
  open: 'فتح التسجيل', closed: 'إغلاق التسجيل', departed: 'تأكيد السفر',
  completed: 'إتمام الرحلة', cancelled: 'إلغاء الرحلة',
};
const STATUS_LABELS_EN: Record<string, string> = {
  open: 'Open Registration', closed: 'Close Registration', departed: 'Mark Departed',
  completed: 'Complete Trip', cancelled: 'Cancel Trip',
};

// ── Add Member Modal ───────────────────────────────────────────────────────────

interface AddMemberModalProps {
  tripId: string; isAr: boolean; onClose: () => void; onAdded: () => void;
}

function AddMemberModal({ tripId, isAr, onClose, onAdded }: AddMemberModalProps) {
  const [form, setForm] = useState({
    nameAr: '', nameEn: '', phone: '', passportNumber: '', passportExpiry: '',
    nationality: '', visaStatus: 'pending', visaNumber: '', visaExpiry: '',
    roomType: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function setField(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nameAr.trim()) { setError(isAr ? 'الاسم بالعربية مطلوب' : 'Arabic name is required'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/group-trips/${tripId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          nameAr:         form.nameAr.trim(),
          nameEn:         form.nameEn.trim()         || undefined,
          phone:          form.phone.trim()           || undefined,
          passportNumber: form.passportNumber.trim()  || undefined,
          passportExpiry: form.passportExpiry.trim()  || undefined,
          nationality:    form.nationality.trim()      || undefined,
          visaStatus:     form.visaStatus,
          visaNumber:     form.visaNumber.trim()       || undefined,
          visaExpiry:     form.visaExpiry.trim()        || undefined,
          roomType:       form.roomType                || undefined,
          notes:          form.notes.trim()            || undefined,
        }),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'Error'));
    } finally { setSaving(false); }
  }

  const visaOpts = Object.entries(VISA_STATUS).map(([k, v]) => ({ value: k, label: isAr ? v.ar : v.en }));
  const roomOpts = [
    { value: '',       label: isAr ? 'بدون تحديد' : 'Not specified' },
    { value: 'single', label: isAr ? 'فردي' : 'Single' },
    { value: 'double', label: isAr ? 'مزدوج' : 'Double' },
    { value: 'triple', label: isAr ? 'ثلاثي' : 'Triple' },
    { value: 'quad',   label: isAr ? 'رباعي' : 'Quad' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <Card className="relative w-full max-w-lg z-10 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>{isAr ? 'إضافة عضو' : 'Add Member'}</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'الاسم بالعربية *' : 'Name (Arabic) *'}</label>
              <Input value={form.nameAr} onChange={(e) => setField('nameAr', e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'الاسم بالإنجليزية' : 'Name (English)'}</label>
              <Input value={form.nameEn} onChange={(e) => setField('nameEn', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'رقم الجوال' : 'Phone'}</label>
              <Input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'الجنسية' : 'Nationality'}</label>
              <Input value={form.nationality} onChange={(e) => setField('nationality', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'رقم الجواز' : 'Passport No.'}</label>
              <Input value={form.passportNumber} onChange={(e) => setField('passportNumber', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'انتهاء الجواز' : 'Passport Expiry'}</label>
              <Input type="date" value={form.passportExpiry} onChange={(e) => setField('passportExpiry', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'حالة التأشيرة' : 'Visa Status'}</label>
              <Select value={form.visaStatus} onChange={(e) => setField('visaStatus', e.target.value)} options={visaOpts} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'رقم التأشيرة' : 'Visa No.'}</label>
              <Input value={form.visaNumber} onChange={(e) => setField('visaNumber', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'نوع الغرفة' : 'Room Type'}</label>
              <Select value={form.roomType} onChange={(e) => setField('roomType', e.target.value)} options={roomOpts} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'انتهاء التأشيرة' : 'Visa Expiry'}</label>
              <Input type="date" value={form.visaExpiry} onChange={(e) => setField('visaExpiry', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{isAr ? 'ملاحظات' : 'Notes'}</label>
            <Input value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving ? <Spinner size="sm" /> : (isAr ? 'إضافة' : 'Add')}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Edit Visa / Status Row ─────────────────────────────────────────────────────

function VisaBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const s = VISA_STATUS[status] ?? VISA_STATUS['pending']!;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.icon}
      {isAr ? s.ar : s.en}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function GroupTripDetailClient({ locale, tripId }: { locale: string; tripId: string }) {
  const isAr    = locale === 'ar';
  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  const [trip, setTrip]         = useState<GroupTrip | null>(null);
  const [stats, setStats]       = useState<TripStats | null>(null);
  const [members, setMembers]   = useState<Member[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError]       = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editVisaStatus, setEditVisaStatus]   = useState('');
  const [editMemberStatus, setEditMemberStatus] = useState('');
  const [editSaving, setEditSaving]           = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [showBulkModal,   setShowBulkModal]   = useState(false);
  const [bulkVisaStatus,  setBulkVisaStatus]  = useState('');
  const [bulkMemberStatus,setBulkMemberStatus]= useState('');
  const [bulkSaving,      setBulkSaving]      = useState(false);
  const [bulkError,       setBulkError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tripData, membersData] = await Promise.all([
        apiFetch<{ trip: GroupTrip; stats: TripStats }>(`/api/group-trips/${tripId}`),
        apiFetch<{ members: Member[] }>(`/api/group-trips/${tripId}/members`),
      ]);
      setTrip(tripData.trip);
      setStats(tripData.stats);
      setMembers(membersData.members);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { void load(); }, [load]);

  async function updateTripStatus(newStatus: string) {
    setUpdatingStatus(true); setStatusError(null);
    try {
      await apiFetch(`/api/group-trips/${tripId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      void load();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'Error'));
    } finally { setUpdatingStatus(false); }
  }

  async function saveEditMember(memberId: string) {
    setEditSaving(true);
    try {
      await apiFetch(`/api/group-trips/${tripId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ visaStatus: editVisaStatus, status: editMemberStatus }),
      });
      setEditingMemberId(null);
      void load();
    } catch { /* silently reload */ void load(); }
    finally { setEditSaving(false); }
  }

  async function deleteMember(memberId: string) {
    if (!confirm(isAr ? 'هل أنت متأكد من حذف هذا العضو؟' : 'Delete this member?')) return;
    setDeletingMemberId(memberId);
    try {
      await apiFetch(`/api/group-trips/${tripId}/members/${memberId}`, { method: 'DELETE' });
      void load();
    } catch { /* ignore */ }
    finally { setDeletingMemberId(null); }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(activeMembers: Member[]) {
    if (selectedIds.size === activeMembers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeMembers.map((m) => m.id)));
    }
  }

  async function applyBulkUpdate() {
    if (!bulkVisaStatus && !bulkMemberStatus) {
      setBulkError(isAr ? 'اختر حقلاً واحداً على الأقل' : 'Select at least one field');
      return;
    }
    setBulkSaving(true);
    setBulkError(null);
    try {
      const body: Record<string, unknown> = { memberIds: [...selectedIds] };
      if (bulkVisaStatus)   body['visaStatus'] = bulkVisaStatus;
      if (bulkMemberStatus) body['status']     = bulkMemberStatus;
      await apiFetch(`/api/group-trips/${tripId}/members/bulk-update`, {
        method: 'POST',
        body:   JSON.stringify(body),
      });
      setShowBulkModal(false);
      setSelectedIds(new Set());
      setBulkVisaStatus('');
      setBulkMemberStatus('');
      void load();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'Error'));
    } finally {
      setBulkSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (notFound || !trip) return (
    <div className="py-16 text-center space-y-4">
      <p className="text-slate-500">{isAr ? 'الرحلة غير موجودة' : 'Trip not found'}</p>
      <Link href={`/${locale}/group-trips`}>
        <Button variant="outline" size="sm">{isAr ? 'عودة' : 'Back'}</Button>
      </Link>
    </div>
  );

  const tripSt = TRIP_STATUS[trip.status] ?? TRIP_STATUS['planning']!;
  const occupancyPct = trip.capacity && stats ? Math.round((stats.total / trip.capacity) * 100) : null;
  const activeMembersCount = stats ? stats.total - stats.cancelled : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-2">
        <Link href={`/${locale}/group-trips`}>
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <BackIcon size={14} />{isAr ? 'عودة' : 'Back'}
          </Button>
        </Link>
      </div>

      <Card>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-brand-50 rounded-2xl border border-brand-100 flex-shrink-0">
            {trip.serviceType === 'umrah' || trip.serviceType === 'hajj'
              ? <Moon size={22} className="text-brand-600" />
              : <Package size={22} className="text-brand-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{trip.name}</h1>
                <p className="text-sm text-slate-500">{isAr ? 'رحلة مجموعة' : 'Group Trip'}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tripSt.cls}`}>
                {isAr ? tripSt.ar : tripSt.en}
              </span>
            </div>

            {/* Dates & Price */}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-600">
              {trip.departureDate && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={14} className="text-slate-400" />
                  {isAr ? 'السفر: ' : 'Departure: '}{formatDate(trip.departureDate, isAr ? 'ar-SA' : 'en-SA')}
                </span>
              )}
              {trip.returnDate && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={14} className="text-slate-400" />
                  {isAr ? 'العودة: ' : 'Return: '}{formatDate(trip.returnDate, isAr ? 'ar-SA' : 'en-SA')}
                </span>
              )}
              {trip.pricePerPersonHalalas > 0 && (
                <span>{formatCurrency(trip.pricePerPersonHalalas, isAr ? 'ar-SA' : 'en-SA')} / {isAr ? 'فرد' : 'person'}</span>
              )}
            </div>

            {trip.notes && <p className="mt-2 text-sm text-slate-500 italic">{trip.notes}</p>}
          </div>
        </div>

        {/* Status actions */}
        {tripSt.nextStatuses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
            {statusError && <p className="w-full text-sm text-red-600">{statusError}</p>}
            {tripSt.nextStatuses.map((ns) => (
              <Button
                key={ns}
                variant={ns === 'cancelled' ? 'outline' : 'primary'}
                size="sm"
                disabled={updatingStatus}
                onClick={() => updateTripStatus(ns)}
                className={ns === 'cancelled' ? 'text-red-600 border-red-200 hover:bg-red-50' : ''}
              >
                {updatingStatus ? <Spinner size="sm" /> : (isAr ? (STATUS_LABELS_AR[ns] ?? ns) : (STATUS_LABELS_EN[ns] ?? ns))}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { labelAr: 'الأعضاء النشطين', labelEn: 'Active Members', value: activeMembersCount, cls: 'text-slate-900' },
            { labelAr: 'مؤكدون', labelEn: 'Confirmed', value: stats.confirmed, cls: 'text-emerald-700' },
            { labelAr: 'تأشيرة معتمدة', labelEn: 'Visa Approved', value: stats.visaApproved, cls: 'text-brand-700' },
            { labelAr: 'تأشيرة مرفوضة', labelEn: 'Visa Rejected', value: stats.visaRejected, cls: 'text-red-600' },
          ].map((s) => (
            <Card key={s.labelEn} className="text-center p-3">
              <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{isAr ? s.labelAr : s.labelEn}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Capacity bar */}
      {trip.capacity !== null && occupancyPct !== null && (
        <Card>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-700">{isAr ? 'الإشغال' : 'Occupancy'}</span>
            <span className="text-slate-500">{activeMembersCount} / {trip.capacity} ({occupancyPct}%)</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${occupancyPct >= 90 ? 'bg-red-400' : occupancyPct >= 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min(100, occupancyPct)}%` }}
            />
          </div>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-brand-600" />
                {isAr ? `الأعضاء (${members.filter(m => m.status !== 'cancelled').length})` : `Members (${members.filter(m => m.status !== 'cancelled').length})`}
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setBulkError(null); setShowBulkModal(true); }}
                    className="flex items-center gap-1.5 text-brand-600 border-brand-200 hover:bg-brand-50"
                  >
                    <ListChecks size={13} />
                    {isAr ? `تحديث ${selectedIds.size} عضو` : `Update ${selectedIds.size} selected`}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5"
                >
                  <Printer size={13} />
                  {isAr ? 'طباعة' : 'Print'}
                </Button>
                {trip.status !== 'cancelled' && trip.status !== 'completed' && (
                  <Button size="sm" onClick={() => setShowAdd(true)} className="flex items-center gap-1.5">
                    <Plus size={14} />{isAr ? 'إضافة عضو' : 'Add Member'}
                  </Button>
                )}
              </div>
            </div>
          </CardTitle>
        </CardHeader>

        {members.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {isAr ? 'لا يوجد أعضاء بعد' : 'No members yet'}
          </div>
        ) : (() => {
          const activeMembers = members.filter(m => m.status !== 'cancelled');
          const allSelected   = activeMembers.length > 0 && selectedIds.size === activeMembers.length;
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="py-2 px-2 text-start font-medium">
                      <button
                        onClick={() => toggleSelectAll(activeMembers)}
                        className="text-slate-400 hover:text-brand-600 transition-colors"
                        title={isAr ? (allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل') : (allSelected ? 'Deselect all' : 'Select all')}
                      >
                        {allSelected
                          ? <CheckSquare size={14} className="text-brand-600" />
                          : <Square size={14} />}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-start font-medium">#</th>
                    <th className="py-2 px-2 text-start font-medium">{isAr ? 'الاسم' : 'Name'}</th>
                    <th className="py-2 px-2 text-start font-medium hidden sm:table-cell">{isAr ? 'الجواز' : 'Passport'}</th>
                    <th className="py-2 px-2 text-start font-medium">{isAr ? 'التأشيرة' : 'Visa'}</th>
                    <th className="py-2 px-2 text-start font-medium hidden md:table-cell">{isAr ? 'الغرفة' : 'Room'}</th>
                    <th className="py-2 px-2 text-start font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-2 px-2 text-start font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {members.map((m, idx) => {
                    const isEditing  = editingMemberId === m.id;
                    const isSelected = selectedIds.has(m.id);
                    return (
                      <tr key={m.id} className={`hover:bg-slate-50 ${m.status === 'cancelled' ? 'opacity-50' : ''} ${isSelected ? 'bg-brand-50/40' : ''}`}>
                        <td className="py-2.5 px-2">
                          {m.status !== 'cancelled' && (
                            <button
                              onClick={() => toggleSelect(m.id)}
                              className="text-slate-400 hover:text-brand-600 transition-colors"
                            >
                              {isSelected
                                ? <CheckSquare size={14} className="text-brand-600" />
                                : <Square size={14} />}
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-slate-400 font-mono text-xs">{idx + 1}</td>
                        <td className="py-2.5 px-2">
                          <p className="font-medium text-slate-900">{m.nameAr}</p>
                          {m.nameEn && <p className="text-xs text-slate-400">{m.nameEn}</p>}
                          {m.phone && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Phone size={9} />{m.phone}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-2 hidden sm:table-cell">
                          {m.passportNumber
                            ? <span className="font-mono text-xs text-slate-700">{m.passportNumber}</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                          {m.passportExpiry && (
                            <p className="text-xs text-slate-400">{formatDate(m.passportExpiry, isAr ? 'ar-SA' : 'en-SA')}</p>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          {isEditing ? (
                            <Select
                              value={editVisaStatus}
                              onChange={(e) => setEditVisaStatus(e.target.value)}
                              options={Object.entries(VISA_STATUS).map(([k, v]) => ({ value: k, label: isAr ? v.ar : v.en }))}
                              className="text-xs py-1"
                            />
                          ) : (
                            <VisaBadge status={m.visaStatus} isAr={isAr} />
                          )}
                        </td>
                        <td className="py-2.5 px-2 hidden md:table-cell">
                          {m.roomType
                            ? <span className="text-xs text-slate-600">{m.roomType}</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="py-2.5 px-2">
                          {isEditing ? (
                            <Select
                              value={editMemberStatus}
                              onChange={(e) => setEditMemberStatus(e.target.value)}
                              options={Object.entries(MEMBER_STATUS).map(([k, v]) => ({ value: k, label: isAr ? v.ar : v.en }))}
                              className="text-xs py-1"
                            />
                          ) : (
                            (() => {
                              const ms = MEMBER_STATUS[m.status] ?? MEMBER_STATUS['registered']!;
                              return <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${ms.cls}`}>{isAr ? ms.ar : ms.en}</span>;
                            })()
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" onClick={() => saveEditMember(m.id)} disabled={editSaving}>
                                {editSaving ? <Spinner size="sm" /> : '✓'}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingMemberId(null)}>✕</Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              {m.status !== 'cancelled' && (
                                <>
                                  <button
                                    className="p-1 text-slate-400 hover:text-brand-600 transition-colors"
                                    onClick={() => { setEditingMemberId(m.id); setEditVisaStatus(m.visaStatus); setEditMemberStatus(m.status); }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                    onClick={() => deleteMember(m.id)}
                                    disabled={deletingMemberId === m.id}
                                  >
                                    {deletingMemberId === m.id ? <Spinner size="sm" /> : <Trash2 size={13} />}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Card>

      {/* Visa breakdown */}
      {stats && stats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-brand-600" />
                {isAr ? 'ملخص التأشيرات' : 'Visa Summary'}
              </div>
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-sm">
            {[
              { key: 'pending',  count: stats.visaPending  },
              { key: 'applied',  count: stats.visaApplied  },
              { key: 'approved', count: stats.visaApproved },
              { key: 'received', count: stats.visaApproved }, // combined in stats
              { key: 'rejected', count: stats.visaRejected },
            ].map((item) => {
              const vs = VISA_STATUS[item.key]!;
              return (
                <div key={item.key} className={`rounded-lg p-3 ${vs.cls.replace('text-', 'bg-opacity-30 ')}`}>
                  <p className="text-lg font-bold">{item.count}</p>
                  <p className="text-xs mt-0.5">{isAr ? vs.ar : vs.en}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Documents & Attachments */}
      <DocumentsSection
        entityType="group_trip"
        entityId={tripId}
        locale={locale}
        readOnly={trip.status === 'cancelled' || trip.status === 'completed'}
      />

      {showAdd && (
        <AddMemberModal
          tripId={tripId}
          isAr={isAr}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); void load(); }}
        />
      )}

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBulkModal(false)} />
          <Card className="relative w-full max-w-sm z-10">
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <ListChecks size={16} className="text-brand-600" />
                  {isAr ? `تحديث جماعي (${selectedIds.size} عضو)` : `Bulk Update (${selectedIds.size} members)`}
                </div>
              </CardTitle>
            </CardHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'حالة التأشيرة (اختياري)' : 'Visa Status (optional)'}
                </label>
                <Select
                  value={bulkVisaStatus}
                  onChange={(e) => setBulkVisaStatus(e.target.value)}
                  options={[
                    { value: '', label: isAr ? 'بدون تغيير' : 'No change' },
                    ...Object.entries(VISA_STATUS).map(([k, v]) => ({ value: k, label: isAr ? v.ar : v.en })),
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'حالة العضو (اختياري)' : 'Member Status (optional)'}
                </label>
                <Select
                  value={bulkMemberStatus}
                  onChange={(e) => setBulkMemberStatus(e.target.value)}
                  options={[
                    { value: '', label: isAr ? 'بدون تغيير' : 'No change' },
                    ...Object.entries(MEMBER_STATUS).map(([k, v]) => ({ value: k, label: isAr ? v.ar : v.en })),
                  ]}
                />
              </div>
              {bulkError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{bulkError}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkModal(false)}
                  disabled={bulkSaving}
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={bulkSaving}
                  onClick={applyBulkUpdate}
                >
                  {bulkSaving ? <Spinner size="sm" /> : (isAr ? 'تطبيق' : 'Apply')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
