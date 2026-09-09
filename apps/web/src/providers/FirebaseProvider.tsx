'use client';

import type { ReactNode } from 'react';
import { initFirebase } from '@masarat/firebase';

// Initialize Firebase synchronously at module-load time (client only).
// Module-level code runs before any React useEffect, ensuring Firebase is
// ready when useAuth's effect subscribes to onAuthStateChanged.
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const hasMissingConfig = !apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId;

// Keep the server and the first client render identical when configuration is
// absent. Previously this became true only in the browser and caused a full
// hydration failure before the useful configuration message appeared.
let _initError = hasMissingConfig;
if (typeof window !== 'undefined') {
  if (hasMissingConfig) {
    console.error('[Firebase] Missing NEXT_PUBLIC_FIREBASE_* environment variables');
  } else {
    try {
      initFirebase({ apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId });
    } catch (err) {
      console.error('[Firebase] Initialization failed:', err);
      _initError = true;
    }
  }
}

interface Props { children: ReactNode; }

export function FirebaseProvider({ children }: Props) {
  if (_initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="max-w-sm text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2 font-arabic">تعذّر الاتصال بالخدمة</h1>
          <p className="text-slate-500 text-sm font-arabic leading-relaxed">
            يتعذّر تحميل خدمة المصادقة. إذا استمرت المشكلة، تواصل مع الدعم الفني.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
