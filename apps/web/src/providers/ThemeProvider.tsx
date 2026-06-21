'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'masarat:theme';

interface ThemeContextValue {
  /** The user's stored preference. */
  preference: ThemePreference;
  /** The actually-applied theme after resolving `system`. */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** Convenience cycle: system → light → dark → system. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

function applyTheme(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Inline script that runs before first paint to set `data-theme` from the
 * stored preference (or the OS setting), avoiding a light-mode flash on load.
 * Mirrors the logic in this provider; keep them in sync.
 */
export const themeInitScript = `
(function () {
  try {
    var pref = localStorage.getItem('${STORAGE_KEY}') || 'system';
    var dark = pref === 'dark' || (pref === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // Hydrate the stored preference after mount (SSR renders the default).
  useEffect(() => {
    let pref: ThemePreference = 'system';
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') pref = raw;
    } catch { /* blocked storage — fall back to system */ }
    setPreferenceState(pref);
    const r = resolve(pref);
    setResolved(r);
    applyTheme(r);
  }, []);

  // When following the OS, react to live changes to its colour scheme.
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? 'dark' : 'light';
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    const r = resolve(next);
    setResolved(r);
    applyTheme(r);
  }, []);

  const cycle = useCallback(() => {
    setPreferenceState(prev => {
      const order: ThemePreference[] = ['system', 'light', 'dark'];
      const next = order[(order.indexOf(prev) + 1) % order.length]!;
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      const r = resolve(next);
      setResolved(r);
      applyTheme(r);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
