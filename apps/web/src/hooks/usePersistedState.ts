'use client';

import { useEffect, useState } from 'react';

/**
 * State persisted to localStorage. Starts at `initial` on the server and on
 * the first client render (so SSR markup matches), then syncs from
 * localStorage in an effect after mount — mirrors the trial-banner
 * dismiss-flag pattern, avoiding hydration mismatches.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch { /* corrupt or blocked storage — keep initial */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function update(next: T | ((prev: T) => T)) {
    setValue(prev => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;
      try {
        localStorage.setItem(key, JSON.stringify(resolved));
      } catch { /* quota or blocked storage — state still updates in-memory */ }
      return resolved;
    });
  }

  return [value, update];
}
