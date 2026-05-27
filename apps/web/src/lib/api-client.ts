'use client';

import { getAuth } from 'firebase/auth';

async function getToken(): Promise<string | undefined> {
  try {
    const { getApp } = await import('@masarat/firebase');
    return (await getAuth(getApp()).currentUser?.getIdToken()) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
