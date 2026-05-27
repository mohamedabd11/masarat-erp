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
import { CheckCircle2, AlertTriangle, Search, Zap, RefreshCw, RotateCcw } from 'lucide-react';

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
  const [resetting,   setResetting]   = useState(false);
  const [stats,       setStats]       = useState<PendingStats | null>(null);
  const [progress,    setProgress]    = useState('');
  const [done,        setDone]        = useState(false);
  const [rebuildDone, setRebuildDone] = useState(false);
  const [resetDone,   setResetDone]   = useState(false);
  const [error,       setError]       = useState('');

  const busy = checking || migrating || rebuilding || resetting;

  async function getMigratedIds(db: import('firebase/firestore').Firestore) {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(query(collection(db, 'journal_entries'), where('agencyId', '==', agencyId)));
    return new Set<string>(snap.docs.map(d => (d.data() as Record<string, unknown>)['referenceId'] as string).filter(Boolean));
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
            lines: buildPaymentReceivedLines(amount, String(pay.paymentMethod ?? 'bank_transfer')),
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
            lines: buildSupplierPaymentLines(amount, String(sp.paymentMethod ?? 'bank_transfer')),
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

      const jeSnap = await getDocs(query(collection(db, 'journal_entries'), where('agencyId', '==', agencyId)));

      const accountMap = new Map<string, {
        code: string; nameAr: string; nameEn: string; type: string;
        debitTotal: number; creditTotal: number;
      }>();

      for (const jeDoc of jeSnap.docs) {
        const lines = ((jeDoc.data() as Record<string, unknown>)['lines'] as Array<Record<string, unknown>>) ?? [];
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

      const batch = writeBatch(db);
      for (const [docId, ac] of Array.from(accountMap.entries())) {
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

  // Deletes ALL existing JEs then re-migrates from source documents, then rebuilds balances.
  // Use when old JEs are corrupted from partial writes.
  async function fullReset() {
    if (!agencyId) return;
    setResetting(true);
    setResetDone(false);
    setError('');
    try {
      const { getFirestore, collection, query, where, getDocs, doc, getDoc, writeBatch } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());

      // ── Phase 1: Delete all existing journal entries ───────────────────────
      setProgress(isAr ? 'حذف القيود القديمة...' : 'Deleting old entries...');
      const jeSnap = await getDocs(query(collection(db, 'journal_entries'), where('agencyId', '==', agencyId)));
      const jeDocs = jeSnap.docs;
      for (let i = 0; i < jeDocs.length; i += 499) {
        const batch = writeBatch(db);
        jeDocs.slice(i, i + 499).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // ── Phase 2: Re-migrate ALL source records (no skip check) ────────────
      const [invSnap, paySnap, spSnap] = await Promise.all([
        getDocs(query(collection(db, 'invoices'),          where('agencyId', '==', agencyId))),
        getDocs(query(collection(db, 'payments'),          where('agencyId', '==', agencyId))),
        getDocs(query(collection(db, 'supplier_payments'), where('agencyId', '==', agencyId))),
      ]);

      let n = 0;
      for (const invDoc of invSnap.docs) {
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
            description:   `فاتورة ${inv.invoiceNumber ?? invDoc.id}`,
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
        } catch { /* skip zero/unbalanced */ }
        setProgress(isAr ? `فواتير: ${n}/${invSnap.docs.length}` : `Invoices: ${n}/${invSnap.docs.length}`);
      }

      n = 0;
      for (const payDoc of paySnap.docs) {
        const pay    = payDoc.data() as Record<string, unknown>;
        const amount = Number(pay.amountHalalas ?? 0);
        if (amount <= 0) continue;
        try {
          await postJournalEntry({
            agencyId,
            description:   'استلام دفعة',
            referenceId:   payDoc.id,
            referenceType: 'payment',
            lines: buildPaymentReceivedLines(amount, String(pay.paymentMethod ?? 'bank_transfer')),
          });
          n++;
        } catch { /* skip */ }
        setProgress(isAr ? `مدفوعات: ${n}/${paySnap.docs.length}` : `Payments: ${n}/${paySnap.docs.length}`);
      }

      n = 0;
      for (const spDoc of spSnap.docs) {
        const sp     = spDoc.data() as Record<string, unknown>;
        const amount = Number(sp.amountHalalas ?? 0);
        if (amount <= 0) continue;
        try {
          await postJournalEntry({
            agencyId,
            description:   `دفعة مورد — ${sp.supplierName ?? 'مورد'}`,
            referenceId:   spDoc.id,
            referenceType: 'supplier_payment',
            lines: buildSupplierPaymentLines(amount, String(sp.paymentMethod ?? 'bank_transfer')),
          });
          n++;
        } catch { /* skip */ }
        setProgress(isAr ? `سندات صرف: ${n}/${spSnap.docs.length}` : `Supplier pmts: ${n}/${spSnap.docs.length}`);
      }

      // ── Phase 3: Rebuild account balances from the fresh JEs ──────────────
      setProgress(isAr ? 'إعادة بناء الأرصدة...' : 'Rebuilding balances...');
      const freshJeSnap = await getDocs(query(collection(db, 'journal_entries'), where('agencyId', '==', agencyId)));
      const accountMap = new Map<string, {
        code: string; nameAr: string; nameEn: string; type: string;
        debitTotal: number; creditTotal: number;
      }>();
      for (const jeDoc of freshJeSnap.docs) {
        const lines = ((jeDoc.data() as Record<string, unknown>)['lines'] as Array<Record<string, unknown>>) ?? [];
        for (const line of lines) {
          const code = String(line['accountCode'] ?? '');
          if (!code) continue;
          const key = `${agencyId}_${code}`;
          const entry = accountMap.get(key) ?? {
            code,
            nameAr: String(line['accountNameAr'] ?? ''),
            nameEn: String(line['accountNameEn'] ?? ''),
            type:   String(line['accountType']   ?? ''),
            debitTotal: 0, creditTotal: 0,
          };
          entry.debitTotal  += Number(line['debitHalalas']  ?? 0);
          entry.creditTotal += Number(line['creditHalalas'] ?? 0);
          accountMap.set(key, entry);
        }
      }
      const acBatch = writeBatch(db);
      for (const [docId, ac] of Array.from(accountMap.entries())) {
        acBatch.set(doc(db, 'chart_of_accounts', docId), {
          agencyId,
          code: ac.code, nameAr: ac.nameAr, nameEn: ac.nameEn, type: ac.type,
          side: (ac.type === 'asset' || ac.type === 'expense') ? 'debit' : 'credit',
          debitTotal: ac.debitTotal, creditTotal: ac.creditTotal,
          balanceHalalas: computeBal(ac.type, ac.debitTotal, ac.creditTotal),
          updatedAt: Date.now(),
        });
      }
      await acBatch.commit();

      setResetDone(true);
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Full reset failed');
    } finally {
      setResetting(false);
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
        <Button size="sm" variant="outline" onClick={checkPending} loading={checking} disabled={busy}>
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

      {/* Stats / migrate button */}
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
                { label: isAr ? 'فواتير' : 'Invoices',      count: stats.invoices },
                { label: isAr ? 'مدفوعات' : 'Payments',     count: stats.payments },
                { label: isAr ? 'سندات صرف' : 'Supp. Pmts', count: stats.supplierPayments },
              ].map(({ label, count }) => (
                <div key={label} className="text-center p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <p className="text-xl font-bold text-amber-700">{count}</p>
                  <p className="text-xs text-amber-600 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <Button fullWidth onClick={runMigration} loading={migrating} disabled={busy}>
              <Zap size={14} />
              {migrating
                ? (progress || (isAr ? 'جارٍ الترحيل...' : 'Migrating...'))
                : (isAr ? `ترحيل ${total} سجل` : `Migrate ${total} records`)}
            </Button>
          </div>
        )
      )}

      {/* Rebuild balances */}
      <div className="border-t border-slate-100 pt-4 space-y-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">
            {isAr ? 'إعادة بناء أرصدة الحسابات' : 'Rebuild Account Balances'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAr
              ? 'يُعيد احتساب أرصدة دليل الحسابات من القيود الحالية فقط، دون حذف أي قيود.'
              : 'Recomputes balances from existing journal entries without deleting anything.'}
          </p>
        </div>
        {rebuildDone && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
            <CheckCircle2 size={13} />
            {isAr ? 'تمت إعادة البناء بنجاح' : 'Balances rebuilt successfully'}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={rebuildBalances} loading={rebuilding} disabled={busy}>
          <RefreshCw size={13} />
          {rebuilding
            ? (isAr ? 'جارٍ إعادة البناء...' : 'Rebuilding...')
            : (isAr ? 'إعادة بناء الأرصدة' : 'Rebuild Balances')}
        </Button>
      </div>

      {/* Full reset */}
      <div className="border-t border-slate-100 pt-4 space-y-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">
            {isAr ? 'إعادة تهيئة كاملة' : 'Full Reset & Rebuild'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAr
              ? 'يحذف جميع القيود الحالية ويُعيد إنشاءها من الفواتير والمدفوعات، ثم يُعيد بناء الأرصدة. استخدمه عند ظهور خلل في الميزان التجريبي.'
              : 'Deletes all existing journal entries, re-creates them from source documents, then rebuilds account balances. Use to fix a corrupted trial balance.'}
          </p>
        </div>
        {resetDone && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
            <CheckCircle2 size={13} />
            {isAr ? 'اكتملت إعادة التهيئة — الميزان التجريبي الآن صحيح' : 'Full reset complete — trial balance should now be correct'}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={fullReset} loading={resetting} disabled={busy}>
          <RotateCcw size={13} />
          {resetting
            ? (progress || (isAr ? 'جارٍ إعادة التهيئة...' : 'Resetting...'))
            : (isAr ? 'إعادة تهيئة كاملة' : 'Full Reset & Rebuild')}
        </Button>
      </div>
    </div>
  );
}
