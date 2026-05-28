'use client';

import { getAuth } from 'firebase/auth';

async function getToken(forceRefresh = false): Promise<string | undefined> {
  try {
    const { getApp } = await import('@masarat/firebase');
    return (await getAuth(getApp()).currentUser?.getIdToken(forceRefresh)) ?? undefined;
  } catch {
    return undefined;
  }
}

function buildHeaders(token: string | undefined, extra?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, {
    ...options,
    headers: buildHeaders(token, options.headers),
  });

  // On 401 retry once with a force-refreshed token (handles stale custom claims on first login)
  if (res.status === 401) {
    const fresh = await getToken(true);
    if (fresh && fresh !== token) {
      const retry = await fetch(path, {
        ...options,
        headers: buildHeaders(fresh, options.headers),
      });
      if (!retry.ok) {
        const body = await retry.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? retry.statusText);
      }
      return retry.json() as Promise<T>;
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
