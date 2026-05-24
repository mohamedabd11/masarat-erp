import { cert, getApps, initializeApp } from 'firebase-admin/app';

export function ensureAdminApp() {
  if (getApps().length > 0) return;

  const json = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!json) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON غير موجود في متغيرات البيئة');
  }

  const serviceAccount = JSON.parse(json) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };

  initializeApp({
    credential: cert({
      projectId:   serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey:  serviceAccount.private_key,
    }),
  });
}
