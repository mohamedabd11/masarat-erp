'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { initFirebase } from '@masarat/firebase';

interface Props {
  children: ReactNode;
}

export function FirebaseProvider({ children }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initFirebase({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
    });
    setReady(true);
  }, []);

  if (!ready) return null;

  return <>{children}</>;
}
