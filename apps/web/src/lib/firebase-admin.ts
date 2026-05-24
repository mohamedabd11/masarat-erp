import { cert, getApps, initializeApp } from 'firebase-admin/app';

export function ensureAdminApp() {
  if (getApps().length > 0) return;

  const projectId   = process.env['FIREBASE_ADMIN_PROJECT_ID'];
  const clientEmail = process.env['FIREBASE_ADMIN_CLIENT_EMAIL'];
  const privateKey  = process.env['FIREBASE_ADMIN_PRIVATE_KEY']?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin SDK غير مُعدَّل. أضف FIREBASE_ADMIN_PROJECT_ID و FIREBASE_ADMIN_CLIENT_EMAIL و FIREBASE_ADMIN_PRIVATE_KEY في متغيرات البيئة على Vercel.'
    );
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
