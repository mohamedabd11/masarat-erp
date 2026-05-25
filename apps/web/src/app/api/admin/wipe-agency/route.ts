import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';

const SUPER_ADMIN_EMAIL = process.env['SUPER_ADMIN_EMAIL'] ?? 'mohamedabdalazim1111@gmail.com';

// Collections that hold per-agency operational data (filtered by agencyId field)
const OPERATIONAL_COLLECTIONS = [
  'bookings',
  'customers',
  'invoices',
  'payments',
  'supplier_payments',
  'journal_entries',
  'service_types',
  'suppliers',
  'employees',
  'departments',
  'bank_accounts',
  'bank_transactions',
  'cheques',
  'exchange_rates',
  'chart_of_accounts',
] as const;

async function verifySuperAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('NO_TOKEN');

  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(token);
  if (decoded.email !== SUPER_ADMIN_EMAIL) throw new Error('FORBIDDEN');
  return decoded;
}

// Firestore batch limit is 500 — delete in chunks
async function deleteQueryInBatches(
  db: FirebaseFirestore.Firestore,
  query: FirebaseFirestore.Query,
): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await query.limit(400).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.docs.length;
  }
  return deleted;
}

// Delete all docs in a subcollection (fetched as a collection reference)
async function deleteCollection(
  db: FirebaseFirestore.Firestore,
  colRef: FirebaseFirestore.CollectionReference,
): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await colRef.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.docs.length;
  }
  return deleted;
}

export async function POST(request: Request) {
  try {
    ensureAdminApp();
    const adminUser = await verifySuperAdmin(request);

    const body = await request.json() as { agencyId: string; confirmName: string };
    const { agencyId, confirmName } = body;

    if (!agencyId || !confirmName) {
      return NextResponse.json({ error: 'agencyId و confirmName مطلوبان' }, { status: 400 });
    }

    const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
    const db = getFirestore();

    // Verify agency exists and confirmName matches
    const agencySnap = await db.collection('agencies').doc(agencyId).get();
    if (!agencySnap.exists) {
      return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });
    }

    const agencyData = agencySnap.data()!;
    if (agencyData['nameAr'] !== confirmName) {
      return NextResponse.json({ error: 'اسم الوكالة غير مطابق' }, { status: 422 });
    }

    // Only allow wipe for trial agencies
    if (agencyData['subscriptionStatus'] !== 'trial') {
      return NextResponse.json(
        { error: 'التصفير متاح فقط للوكالات في الفترة التجريبية' },
        { status: 403 },
      );
    }

    const stats: Record<string, number> = {};

    // ── 1. Delete booking payment subcollections first ───────────────────────
    const bookingsSnap = await db
      .collection('bookings')
      .where('agencyId', '==', agencyId)
      .get();

    let subPaymentsDeleted = 0;
    for (const bookingDoc of bookingsSnap.docs) {
      const payCol = bookingDoc.ref.collection('payments');
      subPaymentsDeleted += await deleteCollection(db, payCol);
    }
    if (subPaymentsDeleted) stats['bookings/payments'] = subPaymentsDeleted;

    // ── 2. Delete all operational collections ───────────────────────────────
    for (const col of OPERATIONAL_COLLECTIONS) {
      const q = db.collection(col).where('agencyId', '==', agencyId);
      const count = await deleteQueryInBatches(db, q);
      if (count) stats[col] = count;
    }

    // ── 3. Delete idempotency_keys prefixed with agencyId ───────────────────
    const idempKeys = await db
      .collection('idempotency_keys')
      .where('agencyId', '==', agencyId)
      .get();
    if (!idempKeys.empty) {
      const batch = db.batch();
      idempKeys.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      stats['idempotency_keys'] = idempKeys.size;
    }

    // ── 4. Reset agency config subcollections ───────────────────────────────
    const configRef = db.collection('agencies').doc(agencyId).collection('config');

    await configRef.doc('invoice_counters').set({ invoice: 0, receipt: 0, creditNote: 0 });

    // Restore default accounting config (keep their existing mapping if set)
    await configRef.doc('accounting').set({
      arAccountCode:      '1120',
      vatAccountCode:     '2200',
      revenueAccountCode: '4000',
      expenseAccountCode: '5000',
      cashAccountCode:    '1100',
      bankAccountCode:    '1110',
    });

    // ── 5. Write audit log ───────────────────────────────────────────────────
    await db.collection('admin_audit_log').add({
      action:        'wipe_agency_data',
      agencyId,
      agencyNameAr:  agencyData['nameAr'],
      performedBy:   adminUser.email,
      performedAt:   Timestamp.now(),
      stats,
    });

    const totalDeleted = Object.values(stats).reduce((s, n) => s + n, 0);

    return NextResponse.json({
      success: true,
      message: `تم تصفير بيانات وكالة "${agencyData['nameAr']}" — حُذف ${totalDeleted} سجل`,
      stats,
    });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error('[admin/wipe-agency]', err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
