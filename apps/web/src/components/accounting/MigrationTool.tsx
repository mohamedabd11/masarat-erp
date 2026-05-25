'use client';

import { useState } from 'react';
import { useAuth } from '@masarat/firebase';
import { Button } from '@/components/ui/Button';
import {
  postJournalEntry,
  buildInvoiceLines,
  buildPaymentReceivedLines,
  buildSupplierPaymentLines,
} from '@/lib/postJournalEntry';
import { CheckCircle2, AlertTriangle, Search, Zap, RefreshCw } from 'lucide-react';

function computeBal(type: string, dr: number, cr: number) {
  return (type === 'asset' || type === 'expense') ? dr - cr : cr - dr;
}

interface PendingStats {
  invoices: number;
  payments: number;
  supplierPayments: number;
}

export function MigrationTool({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const agencyId = user?.agencyId ?? null;

  const [checking,    setChecking]    = useState(false);
  const [migrating,   setMigrating]   = useState(false);
  const [rebuilding,  setRebuilding]  = useState(false);
  const [stats,       setStats]       = useState<PendingStats | null>(null);
  const [progress,    setProgress]    = useState('');
  const [done,        setDone]        = useState(false);
  const [rebuildDone, setRebuildDone] = useState(false);
  const [error,       setError]       = useState('');

  async function getMigratedIds(db: unknown) {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap = await getDocs(query((collection as any)(db, 'journal_entries'), (where as any)('agencyId', '==', agencyId)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Set<string>(snap.docs.map((d: any) => d.data().referenceId as string).filter(Boolean));
  }

  async function checkPending() {
    if (!agencyId) return;
    setChecking(true);
    setStats(null);
    setError('');
    setDone(false);
    try {
      const { getFirestore, collection, query, where, getDocs } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const migratedIds = await getMigratedIds(db);

      const [invSnap, paySnap, spSnap] = await Promise.all([
        getDocs(query(collection(db, 'invoices'),          where('agencyId', '==', agencyId))),
        getDocs(query(collection(db, 'payments'),          where('agencyId', '==', agencyId))),
        getDocs(query(collection(db, 'supplier_payments'), where('agencyId', '==', agencyId))),
      ]);

      setStats({
        invoices:         invSnap.docs.filter(d => !migratedIds.has(d.id)).length,
        payments:         paySnap.docs.filter(d => !migratedIds.has(d.id)).length,
        supplierPayments: spSnap.docs.filter(d => !migratedIds.has(d.id)).length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error checking records');
    } finally {
      setChecking(false);
    }
  }

  async function runMigration() {
    if (!agencyId) return;
    setMigrating(true);
    setError('');
    setDone(false);
    try {
      const { getFirestore, collection, query, where, getDocs, doc, getDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const migratedIds = await getMigratedIds(db);

      // ── 1. Invoices ────────────────────────────────────────────────────────
      const invSnap = await getDocs(query(collection(db, 'invoices'), where('agencyId', '==', agencyId)));
      const pendingInv = invSnap.docs.filter(d => !migratedIds.has(d.id));
      let n = 0;
      for (const invDoc of pendingInv) {
        const inv    = invDoc.data() as Record<string, unknown>;
        const totals = inv.totals as Record<string, number> | undefined;
        let revenueModel = 'principal';
        let totalCost    = 0;
        let serviceFee   = 0;
        if (inv.bookingId) {
          const bkSnap = await getDoc(doc(db, 'bookings', String(inv.bookingId)));
          if (bkSnap.exists()) {
            const p = (bkSnap.data() as Record<string, unknown>).pricing as Record<string, unknown> | undefined;
            if (p) {
              revenueModel = String(p.revenueModel ?? 'principal');
              totalCost    = Number(p.totalCost    ?? 0);
              serviceFee   = Number(p.serviceFee   ?? 0);
            }
          }
        }
        try {
          await postJournalEntry({
            agencyId,
            description:   `فاتورة ${inv.invoiceNumber ?? invDoc.id} — ترحيل`,
            referenceId:   invDoc.id,
            referenceType: 'invoice',
            lines: buildInvoiceLines({
              revenueModel,
              isVatRegistered: Boolean(inv.isVatRegistered),
              grandTotal:      Number(totals?.grandTotal ?? inv.amountDue ?? 0),
              totalCost,
              serviceFee,
              vatAmount:       Number(totals?.totalVat       ?? 0),
              subtotalExclVat: Number(totals?.subtotalExclVat ?? 0),
            }),
          });
          n++;
          setProgress(isAr ? `فواتير: ${n}/${pendingInv.length}` : `Invoices: ${n}/${pendingInv.length}`);
        } catch { /* skip unbalanced/zero entries silently */ }
      }

      // ── 2. Payments ────────────────────────────────────────────────────────
      const paySnap = await getDocs(query(collection(db, 'payments'), where('agencyId', '==', agencyId)));
      const pendingPay = paySnap.docs.filter(d => !migratedIds.has(d.id));
      n = 0;
      for (const payDoc of pendingPay) {
        const pay    = payDoc.data() as Record<string, unknown>;
        const amount = Number(pay.amountHalalas ?? 0);
        if (amount <= 0) continue;
        try {
          await postJournalEntry({
            agencyId,
            description:   'استلام دفعة — ترحيل',
            referenceId:   payDoc.id,
            referenceType: 'payment',
            lines: buildPaymentReceivedLines(amount),
          });
          n++;
          setProgress(isAr ? `مدفوعات: ${n}/${pendingPay.length}` : `Payments: ${n}/${pendingPay.length}`);
        } catch { /* skip */ }
      }

      // ── 3. Supplier payments ───────────────────────────────────────────────
      const spSnap = await getDocs(query(collection(db, 'supplier_payments'), where('agencyId', '==', agencyId)));
      const pendingSP = spSnap.docs.filter(d => !migratedIds.has(d.id));
      n = 0;
      for (const spDoc of pendingSP) {
        const sp     = spDoc.data() as Record<string, unknown>;
        const amount = Number(sp.amountHalalas ?? 0);
        if (amount <= 0) continue;
        try {
          await postJournalEntry({
            agencyId,
            description:   `دفعة مورد — ${sp.supplierName ?? 'مورد'} — ترحيل`,
            referenceId:   spDoc.id,
            referenceType: 'supplier_payment',
            lines: buildSupplierPaymentLines(amount),
          });
          n++;
          setProgress(isAr ? `سندات صرف: ${n}/${pendingSP.length}` : `Supplier pmts: ${n}/${pendingSP.length}`);
        } catch { /* skip */ }
      }

      setDone(true);
      setStats(null);
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setMigrating(false);
    }
  }

  async function rebuildBalances() {
    if (!agencyId) return;
    setRebuilding(true);
    setRebuildDone(false);
    setError('');
    try {
      const { getFirestore, collection, query, where, getDocs, doc, writeBatch } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());

      // 1. Load all journal entries for this agency
      const jeSnap = await getDocs(query(collection(db, 'journal_entries'), where('agencyId', '==', agencyId)));

      // 2. Accumulate totals per account in memory
      const accountMap = new Map<string, {
        code: string; nameAr: string; nameEn: string; type: string;
        debitTotal: number; creditTotal: number;
      }>();

      for (const jeDoc of jeSnap.docs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines = (jeDoc.data() as any).lines as Array<Record<string, unknown>> ?? [];
        for (const line of lines) {
          const code = String(line['accountCode'] ?? '');
          if (!code) continue;
          const key = `${agencyId}_${code}`;
          const entry = accountMap.get(key) ?? {
            code,
            nameAr: String(line['accountNameAr'] ?? ''),
            nameEn: String(line['accountNameEn'] ?? ''),
            type:   String(line['accountType']   ?? ''),
            debitTotal:  0,
            creditTotal: 0,
          };
          entry.debitTotal  += Number(line['debitHalalas']  ?? 0);
          entry.creditTotal += Number(line['creditHalalas'] ?? 0);
          accountMap.set(key, entry);
        }
      }

      // 3. Write rebuilt balances in a single batch
      const batch = writeBatch(db);
      for (const [docId, ac] of accountMap.entries()) {
        batch.set(doc(db, 'chart_of_accounts', docId), {
          agencyId,
          code:           ac.code,
          nameAr:         ac.nameAr,
          nameEn:         ac.nameEn,
          type:           ac.type,
          side:           (ac.type === 'asset' || ac.type === 'expense') ? 'debit' : 'credit',
          debitTotal:     ac.debitTotal,
          creditTotal:    ac.creditTotal,
          balanceHalalas: computeBal(ac.type, ac.debitTotal, ac.creditTotal),
          updatedAt:      Date.now(),
        });
      }
      await batch.commit();
      setRebuildDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rebuild failed');
    } finally {
      setRebuilding(false);
    }
  }

  const total = stats ? stats.invoices + stats.payments + stats.supplierPayments : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">
            {isAr ? 'ترحيل البيانات التاريخية' : 'Historical Data Migration'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAr
              ? 'إنشاء قيود محاسبية للفواتير والمدفوعات التي أُنشئت قبل تفعيل نظام القيود التلقائي'
              : 'Generate missing journal entries for invoices and payments created before auto-posting was enabled'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={checkPending} loading={checking} disabled={checking || migrating}>
          <Search size={13} />
          {isAr ? 'فحص' : 'Scan'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      {/* Done */}
      {done && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
          <CheckCircle2 size={13} />
          {isAr ? 'اكتمل الترحيل بنجاح' : 'Migration completed successfully'}
        </div>
      )}

      {/* Rebuild balances */}
      <div className="border-t border-slate-100 pt-4 space-y-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">
            {isAr ? 'إعادة بناء أرصدة الحسابات' : 'Rebuild Account Balances'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAr
              ? 'يُعيد احتساب أرصدة دليل الحسابات من القيود المحاسبية المرحّلة. استخدمه لتصحيح أي خلل في الميزان التجريبي.'
              : 'Recomputes chart-of-accounts balances from all posted journal entries. Use this to fix any trial balance discrepancy.'}
          </p>
        </div>
        {rebuildDone && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
            <CheckCircle2 size={13} />
            {isAr ? 'تمت إعادة البناء بنجاح' : 'Balances rebuilt successfully'}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={rebuildBalances}
          loading={rebuilding}
          disabled={rebuilding || migrating || checking}
        >
          <RefreshCw size={13} />
          {rebuilding
            ? (isAr ? 'جارٍ إعادة البناء...' : 'Rebuilding...')
            : (isAr ? 'إعادة بناء الأرصدة' : 'Rebuild Balances')}
        </Button>
      </div>

      {/* Stats */}
      {stats !== null && (
        total === 0 ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
            <CheckCircle2 size={13} />
            {isAr ? 'جميع السجلات مرحّلة — لا يوجد شيء للترحيل' : 'All records are already migrated'}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: isAr ? 'فواتير' : 'Invoices',    count: stats.invoices },
                { label: isAr ? 'مدفوعات' : 'Payments',   count: stats.payments },
                { label: isAr ? 'سندات صرف' : 'Supp. Pmts', count: stats.supplierPayments },
              ].map(({ label, count }) => (
                <div key={label} className="text-center p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <p className="text-xl font-bold text-amber-700">{count}</p>
                  <p className="text-xs text-amber-600 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <Button
              fullWidth
              onClick={runMigration}
              loading={migrating}
              disabled={migrating}
            >
              <Zap size={14} />
              {migrating
                ? (progress || (isAr ? 'جارٍ الترحيل...' : 'Migrating...'))
                : (isAr ? `ترحيل ${total} سجل` : `Migrate ${total} records`)}
            </Button>
          </div>
        )
      )}
    </div>
  );
}
