/**
 * @masarat/firebase — Config
 *
 * تهيئة Firebase SDK من متغيرات البيئة.
 * يعمل في بيئتين:
 *   - Emulator (تطوير محلي) — بدون مشروع Firebase حقيقي
 *   - Production — بمشروع Firebase فعلي
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

let app: FirebaseApp;

export function initFirebase(config: FirebaseConfig): FirebaseApp {
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }

  app = initializeApp(config);

  // تفعيل Emulators في بيئة التطوير
  if (process.env['NEXT_PUBLIC_USE_FIREBASE_EMULATOR'] === 'true') {
    connectFirestoreEmulator(getFirestore(app), 'localhost', 8080);
    connectAuthEmulator(getAuth(app), 'http://localhost:9099');
    connectStorageEmulator(getStorage(app), 'localhost', 9199);
    connectFunctionsEmulator(getFunctions(app, 'me-central1'), 'localhost', 5001);
    console.info('[Masarat] Firebase Emulators connected');
  }

  return app;
}

export function getApp(): FirebaseApp {
  if (!app) throw new Error('Firebase لم يُهيَّأ. استدعِ initFirebase() أولاً.');
  return app;
}

export { getFirestore, getAuth, getStorage, getFunctions };
