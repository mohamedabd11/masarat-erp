'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { HelpCircle, Mail, Phone, Clock } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface AgencyContact {
  contactEmail: string;
  contactPhone: string;
  contactHours: string;
}

export default function HelpPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const agencyId = user?.agencyId ?? null;
  const [contact, setContact] = useState<AgencyContact | null>(null);

  useEffect(() => {
    if (!agencyId) return;

    async function load() {
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const snap = await getDoc(doc(db, 'agencies', agencyId!));
      if (snap.exists()) {
        const data = snap.data();
        setContact({
          contactEmail: data.contactEmail ?? '',
          contactPhone: data.contactPhone ?? '',
          contactHours: data.contactHours ?? '',
        });
      }
    }

    void load();
  }, [agencyId]);

  const email = contact?.contactEmail || 'support@masarat.sa';
  const phone = contact?.contactPhone || '+966 11 000 0000';
  const hours = contact?.contactHours || (isAr ? 'الأحد — الخميس، 9ص — 6م' : 'Sun — Thu, 9AM — 6PM');

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'المساعدة والدعم' : 'Help & Support'}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {isAr ? 'تواصل مع الإدارة عند الحاجة للمساعدة' : 'Contact management when you need help'}
        </p>
      </div>
      <div className="grid gap-4">
        <div className="p-6 bg-white rounded-2xl border border-slate-200 flex gap-4 items-start">
          <div className="p-3 bg-brand-50 rounded-xl flex-shrink-0">
            <Mail size={20} className="text-brand-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">{isAr ? 'البريد الإلكتروني' : 'Email Support'}</h2>
            <p className="text-slate-500 text-sm mt-1 dir-ltr" dir="ltr">{email}</p>
          </div>
        </div>
        <div className="p-6 bg-white rounded-2xl border border-slate-200 flex gap-4 items-start">
          <div className="p-3 bg-emerald-50 rounded-xl flex-shrink-0">
            <Phone size={20} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">{isAr ? 'الهاتف' : 'Phone Support'}</h2>
            <p className="text-slate-500 text-sm mt-1" dir="ltr">{phone}</p>
          </div>
        </div>
        <div className="p-6 bg-white rounded-2xl border border-slate-200 flex gap-4 items-start">
          <div className="p-3 bg-purple-50 rounded-xl flex-shrink-0">
            <Clock size={20} className="text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">{isAr ? 'ساعات الدعم' : 'Support Hours'}</h2>
            <p className="text-slate-500 text-sm mt-1">{hours}</p>
          </div>
        </div>
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
          <div className="flex items-start gap-3">
            <HelpCircle size={18} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-500">
              {isAr
                ? 'يمكنك تحديث معلومات التواصل من صفحة الإعدادات ← بيانات الوكالة ← معلومات التواصل'
                : 'You can update contact info from Settings → Agency Info → Contact Information'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
