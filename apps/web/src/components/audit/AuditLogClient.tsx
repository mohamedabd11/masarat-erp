'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Search, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  agencyId: string;
  userId: string;
  userEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
}

// ─── Action badge colour map ──────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  create:  'bg-emerald-100 text-emerald-700',
  update:  'bg-blue-100 text-blue-700',
  delete:  'bg-red-100 text-red-700',
  approve: 'bg-violet-100 text-violet-700',
  reject:  'bg-orange-100 text-orange-700',
  reverse: 'bg-amber-100 text-amber-700',
  export:  'bg-slate-100 text-slate-700',
};

const ACTION_AR: Record<string, string> = {
  create:  'إنشاء',
  update:  'تعديل',
  delete:  'حذف',
  approve: 'موافقة',
  reject:  'رفض',
  reverse: 'عكس',
  export:  'تصدير',
};

const RESOURCE_AR: Record<string, string> = {
  invoice:          'فاتورة',
  booking:          'حجز',
  payment:          'دفعة',
  credit_note:      'إشعار دائن',
  receipt_voucher:  'سند قبض',
  supplier_payment: 'سند صرف',
  pnr:              'PNR',
  customer:         'عميل',
  employee:         'موظف',
  provider_credential: 'بيانات مزود',
  journal_entry:    'قيد يومي',
  payslip:          'كشف راتب',
  salary_advance:   'سلفة',
  attendance:       'حضور',
  employee_contract: 'عقد عمل',
};

// ─── Row component ────────────────────────────────────────────────────────────

function AuditRow({ entry, isAr }: { entry: AuditEntry; isAr: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const actionLabel = isAr ? (ACTION_AR[entry.action] ?? entry.action) : entry.action;
  const resourceLabel = isAr ? (RESOURCE_AR[entry.resource] ?? entry.resource) : entry.resource;
  const actionColor = ACTION_COLORS[entry.action] ?? 'bg-slate-100 text-slate-700';

  const date = new Date(entry.createdAt);
  const dateStr = date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  const hasDetails = entry.before !== null || entry.after !== null;

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 cursor-pointer"
        onClick={() => hasDetails && setExpanded(v => !v)}
      >
        {/* Action badge */}
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${actionColor} min-w-[52px] justify-center`}>
          {actionLabel}
        </span>

        {/* Resource */}
        <span className="text-sm font-medium text-slate-800 min-w-[100px]">
          {resourceLabel}
        </span>

        {/* Resource ID (truncated) */}
        {entry.resourceId && (
          <span className="text-xs text-slate-400 font-mono hidden sm:block truncate max-w-[120px]">
            {entry.resourceId.slice(0, 8)}…
          </span>
        )}

        {/* User */}
        <span className="text-xs text-slate-500 truncate flex-1">
          {entry.userEmail ?? entry.userId}
        </span>

        {/* Date/Time */}
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {dateStr} {timeStr}
        </span>

        {/* Expand toggle */}
        {hasDetails && (
          <span className="text-slate-400 flex-shrink-0">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        )}
      </div>

      {/* Expanded detail panel */}
      {expanded && hasDetails && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {entry.before !== null && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">{isAr ? 'قبل' : 'Before'}</p>
              <pre className="text-xs text-slate-700 overflow-auto max-h-40 bg-white border border-slate-200 rounded p-2">
                {JSON.stringify(entry.before, null, 2)}
              </pre>
            </div>
          )}
          {entry.after !== null && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">{isAr ? 'بعد' : 'After'}</p>
              <pre className="text-xs text-slate-700 overflow-auto max-h-40 bg-white border border-slate-200 rounded p-2">
                {JSON.stringify(entry.after, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function AuditLogClient({ locale }: { locale: string }) {
  const isAr = locale === 'ar';

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [resource, setResource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (resource) params.set('resource', resource);
      if (from)     params.set('from', from);
      if (to)       params.set('to', to);

      const data = await apiFetch<{ auditLog: AuditEntry[] }>(`/api/audit-log?${params}`);
      setEntries(data.auditLog ?? []);
    } catch {
      setError(isAr ? 'فشل تحميل سجل المراجعة' : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [resource, from, to, isAr]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {isAr ? 'نوع السجل' : 'Resource'}
            </label>
            <select
              value={resource}
              onChange={e => setResource(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">{isAr ? 'الكل' : 'All'}</option>
              {Object.entries(RESOURCE_AR).map(([key, ar]) => (
                <option key={key} value={key}>{isAr ? ar : key}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {isAr ? 'من تاريخ' : 'From'}
            </label>
            <Input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {isAr ? 'إلى تاريخ' : 'To'}
            </label>
            <Input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="text-sm"
            />
          </div>

          <Button onClick={() => void load()} variant="outline" className="gap-2">
            <RefreshCw size={14} />
            {isAr ? 'تحديث' : 'Refresh'}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Search size={32} className="text-slate-300" />}
          title={isAr ? 'لا توجد سجلات' : 'No audit entries'}
          description={isAr ? 'لم يتم تسجيل أي عملية بعد أو تغيير فلاتر البحث.' : 'No operations recorded yet, or adjust your filters.'}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            {isAr ? `${entries.length} سجل` : `${entries.length} entries`}
          </p>
          {entries.map(e => (
            <AuditRow key={e.id} entry={e} isAr={isAr} />
          ))}
        </div>
      )}
    </div>
  );
}
