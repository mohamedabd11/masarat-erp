/**
 * admin — Super Admin Cloud Function Handlers
 *
 * عمليات مقصورة على المطور/مالك النظام فقط.
 * التحقق: بريد المستدعي يجب أن يطابق SUPER_ADMIN_EMAIL في البيئة.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgencyRow {
  id:                 string;
  nameAr:             string;
  nameEn:             string;
  contactEmail:       string;
  subscriptionStatus: string;
  plan:               string;
  trialEndDate:       string | null;
  subscriptionEndDate: string | null;
  createdAt:          string | null;
  isActive:           boolean;
  userCount:          number;
}

export interface AdminListAgenciesResult {
  agencies: AgencyRow[];
}

export type AdminAction =
  | 'activate_month'
  | 'activate_year'
  | 'suspend'
  | 'extend_trial';

export interface AdminUpdateSubscriptionRequest {
  agencyId: string;
  action:   AdminAction;
}

// ─── Guard ────────────────────────────────────────────────────────────────────

function assertSuperAdmin(callerEmail: string | undefined): void {
  const superAdminEmail = process.env['SUPER_ADMIN_EMAIL'] ?? '';
  if (!callerEmail || !superAdminEmail || callerEmail !== superAdminEmail) {
    throw new Error('SUPER_ADMIN_ONLY');
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleAdminListAgencies(
  callerEmail: string | undefined
): Promise<AdminListAgenciesResult> {
  assertSuperAdmin(callerEmail);

  const db   = getFirestore();
  const auth = getAuth();

  const agenciesSnap = await db.collection('agencies').orderBy('createdAt', 'desc').get();

  const agencies: AgencyRow[] = await Promise.all(
    agenciesSnap.docs.map(async d => {
      const data = d.data();

      // عدد المستخدمين لكل وكالة
      const usersSnap = await db
        .collection('users')
        .where('agencyId', '==', d.id)
        .count()
        .get();

      return {
        id:                  d.id,
        nameAr:              data['nameAr']             ?? '',
        nameEn:              data['nameEn']             ?? '',
        contactEmail:        data['contactEmail']       ?? '',
        subscriptionStatus:  data['subscriptionStatus'] ?? 'trial',
        plan:                data['plan']               ?? 'trial',
        trialEndDate:        data['trialEndDate']?.toDate?.()?.toISOString()        ?? null,
        subscriptionEndDate: data['subscriptionEndDate']?.toDate?.()?.toISOString() ?? null,
        createdAt:           data['createdAt']?.toDate?.()?.toISOString()           ?? null,
        isActive:            data['isActive']           ?? true,
        userCount:           usersSnap.data().count,
      };
    })
  );

  return { agencies };
}

export async function handleAdminUpdateSubscription(
  callerEmail: string | undefined,
  req: AdminUpdateSubscriptionRequest
): Promise<{ success: boolean; message: string }> {
  assertSuperAdmin(callerEmail);

  const db  = getFirestore();
  const now = Timestamp.now();
  const ref = db.collection('agencies').doc(req.agencyId);

  // تأكد أن الوكالة موجودة
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`الوكالة ${req.agencyId} غير موجودة`);

  let update: Record<string, unknown>;
  let message: string;

  switch (req.action) {
    case 'activate_month':
      update  = {
        subscriptionStatus:  'active',
        plan:                'starter',
        subscriptionEndDate: new Timestamp(Math.floor(Date.now() / 1000) + 30 * 24 * 3600, 0),
        updatedAt: now,
      };
      message = 'تم تفعيل الاشتراك لمدة شهر';
      break;

    case 'activate_year':
      update  = {
        subscriptionStatus:  'active',
        plan:                'professional',
        subscriptionEndDate: new Timestamp(Math.floor(Date.now() / 1000) + 365 * 24 * 3600, 0),
        updatedAt: now,
      };
      message = 'تم تفعيل الاشتراك لمدة سنة';
      break;

    case 'suspend':
      update  = {
        subscriptionStatus: 'past_due',
        updatedAt: now,
      };
      message = 'تم إيقاف الوكالة';
      break;

    case 'extend_trial':
      update  = {
        subscriptionStatus: 'trial',
        trialEndDate: new Timestamp(Math.floor(Date.now() / 1000) + 14 * 24 * 3600, 0),
        updatedAt: now,
      };
      message = 'تم تمديد الفترة التجريبية 14 يوماً';
      break;

    default:
      throw new Error(`إجراء غير معروف: ${req.action}`);
  }

  await ref.update(update);
  return { success: true, message };
}
